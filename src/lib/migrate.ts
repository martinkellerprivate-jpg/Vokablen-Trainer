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
