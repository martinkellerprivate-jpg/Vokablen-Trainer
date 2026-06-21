/* Sync engine helpers (Phase 3).
 *
 * Design (per review):
 *  - The SERVER is the sole timestamp source. The client never sends
 *    updated_at; push/pull read it back from the server and store it.
 *  - Per doc we keep { serverUpdatedAt, dirty } in localStorage. Merge
 *    decisions compare server-stamp vs stored-server-stamp (never the
 *    device clock), and the dirty flag marks local changes since last sync.
 *  - Offline "queue" = the dirty flags: a failed push leaves the doc dirty
 *    and it retries on the next flush (reconnect / focus / session pause).
 */
import { supabase, DOC_KEYS, type DocKey } from "../lib/supabase";

const SYNC_KEY = "vt_v1_sync";

export interface DocSync { serverUpdatedAt: string | null; dirty: boolean; }
export type SyncState = Record<string, DocSync>;

export function loadSyncState(): SyncState {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const out: SyncState = {};
    for (const k of DOC_KEYS) out[k] = parsed[k] || { serverUpdatedAt: null, dirty: false };
    return out;
  } catch {
    const out: SyncState = {};
    for (const k of DOC_KEYS) out[k] = { serverUpdatedAt: null, dirty: false };
    return out;
  }
}
export function saveSyncState(s: SyncState) {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(s)); } catch {}
}
export function patchDocSync(key: DocKey, patch: Partial<DocSync>) {
  const s = loadSyncState();
  s[key] = { ...s[key], ...patch };
  saveSyncState(s);
}

/* Snapshot all five local docs before a destructive first-login merge. */
export function backupLocal(docs: Record<string, any>): number {
  const ts = Date.now();
  try { localStorage.setItem("vt_v1_backup_" + ts, JSON.stringify(docs)); } catch {}
  return ts;
}

/* Push one doc. Server stamps updated_at via trigger and returns it. */
export async function pushDoc(userId: string, key: DocKey, data: any): Promise<string> {
  if (!supabase) throw new Error("not-configured");
  const { data: row, error } = await supabase
    .from("user_documents")
    .upsert({ user_id: userId, doc_key: key, data }, { onConflict: "user_id,doc_key" })
    .select("updated_at")
    .single();
  if (error) throw error;
  return row!.updated_at as string;
}

export interface CloudDoc { data: any; updatedAt: string; }

/* Pull every doc for the user → { [docKey]: { data, updatedAt } }. */
export async function pullAll(userId: string): Promise<Record<string, CloudDoc>> {
  if (!supabase) throw new Error("not-configured");
  const { data, error } = await supabase
    .from("user_documents")
    .select("doc_key,data,updated_at")
    .eq("user_id", userId);
  if (error) throw error;
  const map: Record<string, CloudDoc> = {};
  for (const r of data || []) map[r.doc_key] = { data: r.data, updatedAt: r.updated_at };
  return map;
}
