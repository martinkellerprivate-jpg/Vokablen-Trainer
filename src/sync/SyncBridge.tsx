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
  backupLocal, pushDoc, pullAll,
} from "./sync";

export type SyncStatus = "local" | "synced" | "syncing" | "offline" | "error";

const SyncCtx = React.createContext<{ status: SyncStatus }>({ status: "local" });
export const useSync = () => React.useContext(SyncCtx);

// docs whose pushes are deferred to a session pause (large / very frequent)
const DEFERRED: DocKey[] = ["stats", "meta"];
const EAGER: DocKey[] = ["vocab", "lists", "settings"];
const SYNC_UID_KEY = "vt_v1_sync_uid";

export function SyncBridge({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const auth = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<SyncStatus>("local");

  // latest docs, readable from timers/event handlers
  const docsRef = useRef<Record<string, any>>({});
  docsRef.current = {
    vocab: store.vocab, lists: store.lists, stats: store.stats, meta: store.meta, settings: store.settings,
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
      // If a different account logs in, treat docs with data as local
      // changes to protect (so the backup/merge guards apply).
      const prevUid = localStorage.getItem(SYNC_UID_KEY);
      const s = loadSyncState();
      if (prevUid !== uid) {
        for (const k of DOC_KEYS) s[k] = { serverUpdatedAt: null, dirty: true };
        saveSyncState(s);
        localStorage.setItem(SYNC_UID_KEY, uid);
      }

      const cloud = await pullAll(uid);
      const cloudEmpty = DOC_KEYS.every((k) => !cloud[k]);
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
