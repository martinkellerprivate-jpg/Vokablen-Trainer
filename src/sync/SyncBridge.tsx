/* Sync orchestration (Phase 3). Glues the local store to Supabase:
 *  - login → pull + merge (server-vs-server LWW, backup before risky overwrite)
 *  - local change → mark dirty; debounced write-through (stats/meta deferred)
 *  - reconnect / session pause → flush dirty docs
 *  - focus → pull, but never overwrite a dirty doc
 * When unconfigured or logged out it is inert and the app stays local-first. */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "../store/StoreProvider";
import { useAuth } from "./auth";
import { useToast } from "../ui/Toast";
import { DOC_KEYS, type DocKey } from "../lib/supabase";
import {
  loadSyncState, saveSyncState, patchDocSync,
  backupLocal, clearLocalDocs, pushDoc, pullAll,
} from "./sync";
import { DEFAULT_VOCAB } from "../data/seed";

export type SyncStatus = "local" | "synced" | "syncing" | "offline" | "error";

const SyncCtx = React.createContext<{ status: SyncStatus }>({ status: "local" });
export const useSync = () => React.useContext(SyncCtx);

// docs whose pushes are deferred to a session pause (large / very frequent)
const DEFERRED: DocKey[] = ["stats", "meta"];
const EAGER: DocKey[] = ["vocab", "lists", "settings"];
const SYNC_UID_KEY = "vt_v1_sync_uid";
const SWITCH_NOTICE_KEY = "vt_v1_switch_notice";

/* Does this device hold anything the user made, beyond the shipped starter set?
 * initData() always seeds DEFAULT_VOCAB into exactly one list, so that alone is
 * not "own content" and must not trigger the adoption question. */
export function hasOwnContent(docs: Record<string, any>): boolean {
  const lists = docs.lists || [];
  const lessons = docs.lessons || [];
  const stats = docs.stats || {};
  const vocab = docs.vocab || [];
  return lists.length > 1 || lessons.length > 0
    || Object.keys(stats).length > 0
    || vocab.length > DEFAULT_VOCAB.length;
}

export function SyncBridge({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const auth = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<SyncStatus>("local");

  // latest docs, readable from timers/event handlers
  const docsRef = useRef<Record<string, any>>({});
  docsRef.current = {
    vocab: store.vocab, lists: store.lists, lessons: store.lessons, stats: store.stats, meta: store.meta, settings: store.settings,
    reviews: store.reviews,   // F-SETTINGS-ADVANCED: 7th synced doc
  };
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = auth.user?.id ?? null;

  const eagerTimer = useRef<any>(null);
  const deferredTimer = useRef<any>(null);
  const merging = useRef(false);

  const active = () => auth.configured && !!userIdRef.current;

  const pushOne = useCallback(async (key: DocKey) => {
    const uid = userIdRef.current;
    if (!uid) return;
    try {
      const ts = await pushDoc(uid, key, docsRef.current[key]);
      patchDocSync(key, { serverUpdatedAt: ts, dirty: false });
      setStatus("synced");
    } catch {
      setStatus(navigator.onLine ? "error" : "offline"); // stays dirty → retried later
    }
  }, []);

  const flushDirty = useCallback(async (keys: DocKey[] = [...DOC_KEYS]) => {
    if (!active() || !navigator.onLine) return;
    const s = loadSyncState();
    const dirty = keys.filter((k) => s[k].dirty);
    if (!dirty.length) return;
    setStatus("syncing");
    for (const k of dirty) await pushOne(k);
  }, [pushOne]);

  // ---- login: pull + merge -----------------------------------------
  const mergeOnLogin = useCallback(async (uid: string) => {
    if (merging.current) return;
    merging.current = true;
    setStatus("syncing");
    try {
      const prevUid = localStorage.getItem(SYNC_UID_KEY);

      // ---- account switch on this device ----------------------------
      // The local documents belong to the PREVIOUS account. Never push them
      // into this one (a new account has no cloud docs, so the "cloud missing
      // → push local" branch below would otherwise hand it the other user's
      // whole library). Snapshot, wipe the device, reload: this account then
      // starts from its own cloud — empty for a fresh account.
      if (prevUid && prevUid !== uid) {
        backupLocal(docsRef.current);
        clearLocalDocs();
        localStorage.setItem(SYNC_UID_KEY, uid);
        localStorage.setItem(SWITCH_NOTICE_KEY, "1");
        location.reload();
        return;
      }

      const cloud = await pullAll(uid);
      const cloudEmpty = DOC_KEYS.every((k) => !cloud[k]);

      // ---- first sign-in on this device ------------------------------
      // Taking the local library into an account is a real ownership decision
      // (a shared device may hold someone else's words), so ask rather than
      // assume. Order of sign-ups is no proof of ownership.
      if (!prevUid) {
        if (cloudEmpty && hasOwnContent(docsRef.current)) {
          const adopt = window.confirm(
            "Auf diesem Gerät liegen bereits Wörter und Listen.\n\n" +
            "OK – in diesen Account übernehmen\n" +
            "Abbrechen – leer starten (die Daten bleiben als Backup auf dem Gerät)"
          );
          if (!adopt) {
            backupLocal(docsRef.current);
            clearLocalDocs();
            localStorage.setItem(SYNC_UID_KEY, uid);
            localStorage.setItem(SWITCH_NOTICE_KEY, "1");
            location.reload();
            return;
          }
        }
        // Nothing on this device has ever been synced → everything counts as a
        // local change, so the merge guards below apply.
        const s = loadSyncState();
        for (const k of DOC_KEYS) s[k] = { serverUpdatedAt: null, dirty: true };
        saveSyncState(s);
      }
      localStorage.setItem(SYNC_UID_KEY, uid);

      const sync = loadSyncState();
      const anyDirty = DOC_KEYS.some((k) => sync[k].dirty);

      // Fix #2: before a risky overwrite of unsynced local data, snapshot it.
      if (!cloudEmpty && anyDirty) {
        backupLocal(docsRef.current);
        toast("Lokale Daten als Backup gesichert", "download");
      }

      for (const k of DOC_KEYS) {
        const c = cloud[k];
        const ds = sync[k];
        if (!c) {
          await pushOne(k);                                   // cloud missing → push local
        } else {
          const cloudNewer = !ds.serverUpdatedAt || c.updatedAt > ds.serverUpdatedAt;
          if (ds.dirty && !cloudNewer) {
            await pushOne(k);                                  // local changed, cloud unchanged
          } else if (cloudNewer) {
            store.applyRemote(k, c.data);                      // cloud wins (conflict already backed up)
            patchDocSync(k, { serverUpdatedAt: c.updatedAt, dirty: false });
          } else {
            patchDocSync(k, { serverUpdatedAt: c.updatedAt }); // in sync; just record stamp
          }
        }
      }
      setStatus("synced");
      // The device was wiped for this account just before the reload that led
      // here — say so, otherwise the app silently shows different data.
      if (localStorage.getItem(SWITCH_NOTICE_KEY)) {
        localStorage.removeItem(SWITCH_NOTICE_KEY);
        toast("Gerät auf diesen Account umgestellt — die vorherigen Daten liegen als Backup auf dem Gerät.", "download");
      }
    } catch {
      setStatus(navigator.onLine ? "error" : "offline");
    } finally {
      merging.current = false;
    }
  }, [pushOne, store, toast]);

  // ---- focus pull: apply remote only to NON-dirty docs --------------
  const pullFresh = useCallback(async () => {
    const uid = userIdRef.current;
    if (!active() || !uid || !navigator.onLine || merging.current) return;
    try {
      const cloud = await pullAll(uid);
      const sync = loadSyncState();
      for (const k of DOC_KEYS) {
        const c = cloud[k]; const ds = sync[k];
        if (!c) continue;
        if (ds.dirty) { await pushOne(k); continue; }         // never overwrite local edits
        const cloudNewer = !ds.serverUpdatedAt || c.updatedAt > ds.serverUpdatedAt;
        if (cloudNewer) {
          store.applyRemote(k, c.data);
          patchDocSync(k, { serverUpdatedAt: c.updatedAt, dirty: false });
        }
      }
      setStatus("synced");
    } catch {
      setStatus(navigator.onLine ? "error" : "offline");
    }
  }, [pushOne, store]);

  // ---- local change listener ---------------------------------------
  useEffect(() => {
    store.registerSync((key: string) => {
      patchDocSync(key as DocKey, { dirty: true });
      if (!active()) return;
      if (EAGER.includes(key as DocKey)) {
        clearTimeout(eagerTimer.current);
        eagerTimer.current = setTimeout(() => flushDirty(EAGER), 1500);
      } else {
        // stats/meta: long idle fallback; main flush is at session pause
        clearTimeout(deferredTimer.current);
        deferredTimer.current = setTimeout(() => flushDirty(DEFERRED), 20000);
      }
    });
    return () => store.registerSync(null);
  }, [flushDirty]); // active() reads refs

  // ---- login transition --------------------------------------------
  useEffect(() => {
    if (auth.configured && auth.user?.id) mergeOnLogin(auth.user.id);
    else setStatus("local");
  }, [auth.configured, auth.user?.id, mergeOnLogin]);

  // ---- session-pause / reconnect / focus ---------------------------
  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === "hidden") flushDirty(); else pullFresh(); };
    const onOnline = () => flushDirty();
    const onOffline = () => setStatus("offline");
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeunload", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeunload", onHidden);
    };
  }, [flushDirty, pullFresh]);

  return <SyncCtx.Provider value={{ status }}>{children}</SyncCtx.Provider>;
}
