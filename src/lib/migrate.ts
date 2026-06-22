/* One-time, versioned data migrations (run once per user on load).
 * Each migration is recorded in meta.migrations so it never repeats and
 * never loses words. */
import type { Word, ListT } from "./types";

/* V4 — rewrite the old English seed topic labels to German. Counts merge
 * automatically because words simply share the new topic string. */
export const TOPIC_DE: Record<string, string> = {
  Animals: "Tiere",
  Body: "Körper",
  Colours: "Farben",
  Family: "Menschen & Familie",
  Food: "Essen & Trinken",
  Home: "Haus",
  School: "Schule",
  Time: "Zeit",
  Words: "Kleine Wörter",
  Numbers: "Zahlen",
};

export function migrateTopics(vocab: Word[]): Word[] {
  return vocab.map((w) => (w.topic && TOPIC_DE[w.topic]) ? { ...w, topic: TOPIC_DE[w.topic] } : w);
}

/* V6 — give every existing list a dynamic "whole list" lesson so the Practice
 * screen is never empty after the lessons rebuild. Idempotent: skips lists that
 * already have a list-lesson (source.ref === list.id). */
/* V3 — Swiss orthography: rewrite ß → ss in stored German text so existing
 * users (whose vocab was seeded before this change) also see the Swiss spelling.
 * Touches the native German field and the Latin learning-form fields; the
 * foreign EN/FR side is left untouched. Idempotent (no ß left to convert). */
const ssText = (s?: string) => (s && s.indexOf("ß") >= 0) ? s.replace(/ß/g, "ss") : s;
export function swissifyVocab(vocab: Word[]): Word[] {
  return vocab.map((w) => {
    const de = ssText(w.de);
    const grundform = ssText((w as any).grundform);
    const lernform = ssText((w as any).lernform);
    if (de === w.de && grundform === (w as any).grundform && lernform === (w as any).lernform) return w;
    return { ...w, de, ...(grundform !== undefined ? { grundform } : {}), ...(lernform !== undefined ? { lernform } : {}) };
  });
}

export function lessonsForLists(lists: ListT[], existingLessons: any[], newId: () => string) {
  const covered = new Set(existingLessons.filter((l) => l.kind === "dynamic" && l.source?.type === "list").map((l) => l.source.ref));
  const added: any[] = [];
  for (const l of lists) {
    if (covered.has(l.id)) continue;
    added.push({ id: newId(), name: l.name, pair: l.pair, kind: "dynamic", source: { type: "list", ref: l.id } });
  }
  return added;
}

/* V9 — convert ALL lessons to static snapshots (kind/source removed). Runs exactly
 * once. FIX 3: the "list without a lesson → snapshot" fill happens ONLY in this
 * single pass, never as a standing rule, so a deliberately-deleted list-lesson is
 * not recreated on the next load. Empty FR/LA snapshots are skipped (no empties). */
function snap(vocab: Word[], pair: string, src: { type: string; ref: string }): string[] {
  const pv = vocab.filter((w) => w.pair === pair);
  const ws = src.type === "list" ? pv.filter((w) => (w.lists || []).includes(src.ref)) : pv.filter((w) => w.topic === src.ref);
  return Array.from(new Set(ws.map((w) => w.id)));
}
export function migrateLessonsStatic(lessons: any[], lists: ListT[], vocab: Word[], newId: () => string): any[] {
  const now = Date.now();
  const coveredLists = new Set<string>();
  const out = lessons.map((l) => {
    if (l.members && !l.source) return l;                 // already static
    const src = l.source || {};
    let members: string[] = l.members || [];
    let origin = l.origin;
    if (src.type === "list") { members = snap(vocab, l.pair, src); coveredLists.add(src.ref); origin = "Liste"; }
    else if (src.type === "topic") { members = snap(vocab, l.pair, src); origin = "Thema: " + src.ref; }
    const { kind, source, ...rest } = l;
    return { ...rest, members: Array.from(new Set(members)), createdAt: l.createdAt || now, updatedAt: now, origin };
  });
  const added: any[] = [];
  for (const list of lists) {                             // FIX 3: only in this one pass
    if (coveredLists.has(list.id)) continue;
    const members = snap(vocab, list.pair, { type: "list", ref: list.id });
    if (!members.length) continue;                        // no empty lessons (FR/LA)
    added.push({ id: newId(), name: list.name, pair: list.pair, members, createdAt: now, updatedAt: now, origin: "Liste" });
  }
  return [...out, ...added];
}
