/* localStorage layer — the `vt_v1_*` schema is the local store and stays
 * unchanged (it becomes the Phase-3 cloud-sync basis). */
export const LS = {
  vocab: "vt_v1_vocab",
  stats: "vt_v1_stats",
  meta: "vt_v1_meta",
  settings: "vt_v1_settings",
  lists: "vt_v1_lists",
};

export const load = (key: string, fallback: any) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
};

export const save = (key: string, val: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {}
};
