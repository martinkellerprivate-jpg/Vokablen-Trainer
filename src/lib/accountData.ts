/* Account data portability + erasure (Phase 7, GDPR / store requirement). */
import { LS, load } from "./storage";

/* Full account export: the five vt_v1_* documents as a JSON download. */
export function exportAllData(stamp: string) {
  const data = {
    app: "Lilly-Anne's Vokabeltrainer",
    schema: "vt_v1",
    exportedAt: stamp,
    vocab: load(LS.vocab, []),
    lists: load(LS.lists, []),
    stats: load(LS.stats, {}),
    meta: load(LS.meta, {}),
    settings: load(LS.settings, {}),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vokabeltrainer-export-${stamp.slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Remove all local data (vt_v1_* + backups + sync bookkeeping). The app
 * re-seeds on the next load. Does NOT touch the Supabase auth session. */
export function deleteLocalData() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith("vt_v1_"))
    .forEach((k) => localStorage.removeItem(k));
}
