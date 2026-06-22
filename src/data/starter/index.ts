/* Bundled starter wordlists (CR). JSON files under <pair>/stufe<N>.json are
 * auto-discovered at build time, so dropping new levels later needs no code
 * change — the UI shows whatever the manifest contains. Everything is bundled
 * → works offline; activation creates normal user data (syncs via Phase 3). */
import { fk, isLatinPair, PAIRS } from "../../lib/pairs";

const mods = import.meta.glob("./*/stufe*.json", { eager: true }) as Record<string, any>;

export interface StarterEntry {
  pair: string; stufe: number; count: number; label: string; key: string; words: any[];
}

const shortOf = (pair: string) => PAIRS[pair]?.short || pair.split("-")[0].toUpperCase();

export const STARTERS: StarterEntry[] = Object.entries(mods).map(([path, mod]) => {
  const data = (mod as any).default || mod;
  const m = path.match(/\.\/([^/]+)\/stufe(\d+)\.json$/);
  const pair = data.pair || (m ? m[1] : "");
  const stufe = data.stufe || (m ? parseInt(m[2], 10) : 1);
  const words = data.words || [];
  return { pair, stufe, count: words.length, label: `Grundwortschatz ${shortOf(pair)} · Stufe ${stufe}`, key: `${pair}:${stufe}`, words };
}).sort((a, b) => a.pair.localeCompare(b.pair) || a.stufe - b.stufe);

export const starterKey = (pair: string, stufe: number) => `${pair}:${stufe}`;
export const getStarter = (pair: string, stufe: number) => STARTERS.find((s) => s.pair === pair && s.stufe === stufe);
export const isStarterActivated = (settings: any, pair: string, stufe: number) =>
  (settings.activatedStarters || []).includes(starterKey(pair, stufe));

/* Idempotent activation: maps the bundled words onto the internal model,
 * dedupes against the user's existing vocab (foreign|de, or grundform|de for
 * Latin), creates the list only when there is something new, and records the
 * activation flag so it isn't offered again. Re-activating duplicates nothing. */
export function activateStarter(store: any, pair: string, stufe: number) {
  const entry = getStarter(pair, stufe);
  if (!entry) return { added: 0, already: false, label: "" };
  const activated: string[] = store.settings.activatedStarters || [];
  const already = activated.includes(entry.key);
  const isLat = isLatinPair(pair);
  const foreign = fk(pair);

  const mapped = entry.words.map((w: any) => isLat
    ? { grundform: w.grundform || "", lernform: w.lernform || "", wortart: w.wortart || "", de: w.german || "", topic: w.topic || "", pair }
    : { [foreign]: w.foreign || "", de: w.german || "", topic: w.topic || "", pair });

  const keyOf = (w: any) => (isLat ? ((w.grundform || "") + "|" + (w.de || "")) : ((w[foreign] || "") + "|" + (w.de || ""))).toLowerCase();
  const existing = new Set(store.vocab.filter((w: any) => w.pair === pair).map(keyOf));
  const fresh = mapped.filter((w: any) => !existing.has(keyOf(w)));

  if (fresh.length) {
    const listId = store.addList(entry.label, pair);
    store.addWords(fresh.map((w: any) => ({ ...w, lists: [listId], source: "seed", review: false })));
  }
  if (!already) store.setSettings({ activatedStarters: [...activated, entry.key] });

  return { added: fresh.length, already, label: entry.label };
}
