/* Classification, smart categories and the spaced-repetition selection
 * weighting. Pure logic — no React. */
import type { Stat, Word } from "./types";
import { practiceable } from "./pairs";

/* ---- classification & smart repetition --------------------------- */
export const CATEGORY = {
  effortless: { key: "effortless", label: "Effortless", tone: "green",
    blurb: "Right from the very first try, every time." },
  learned:    { key: "learned", label: "Learned", tone: "amber",
    blurb: "Tripped you up early, but you cracked it through practice." },
  tricky:     { key: "tricky", label: "Tricky", tone: "red",
    blurb: "Still slips away — these come back more often." },
  new:        { key: "new", label: "New", tone: "slate",
    blurb: "Not practised yet." },
};

export function classifyWord(stat: Stat | undefined, mc?: number) {
  mc = mc || 3;
  if (!stat || !stat.seen) return "new";
  const ema = stat.ema ?? 0;
  const streak = stat.streak || 0;
  const wrongRate = stat.wrongCount / stat.seen;
  if (stat.wrongCount === 0 && stat.firstTry && streak >= mc) return "effortless";
  if (streak >= mc || (ema >= 0.7 && wrongRate < 0.5)) return "learned";
  return "tricky";
}

/* Selection weight — wrong / unseen words surface more often.
 * opts: { missWeight, newWeight, masteryCorrect } */
export function weightForWord(stat: Stat | undefined, opts?: any) {
  opts = opts || {};
  const missWeight = opts.missWeight ?? 4;
  const newWeight = opts.newWeight ?? 2.6;
  const mc = opts.masteryCorrect || 3;
  if (!stat || !stat.seen) return newWeight;        // new words: introduce steadily
  if ((stat.streak || 0) >= mc) return 0.4;          // mastered: surface rarely
  const ema = stat.ema ?? 0.5;
  return Math.max(0.25, 1 + missWeight * (1 - ema)); // 1 (good) .. 1+missWeight (failing)
}

/* Smart categories — auto-maintained virtual lists. */
export function isDue(s: Stat | undefined, now: number) {
  if (!s || !s.seen || !s.lastTs || (s.streak || 0) < 1) return false;
  const days = [1, 2, 4, 7, 14][Math.min(s.streak || 0, 4)] || 14;
  return (now - s.lastTs) >= days * 86400000;
}

export const SMART: Record<string, any> = {
  tricky:   { id: "__tricky",   label: "Tricky words", icon: "flame",   tone: "red",
              help: "Words you keep getting wrong, from every list",
              test: (w: Word, s: Stat, mc: number) => practiceable(w) && classifyWord(s, mc) === "tricky" },
  new:      { id: "__new",      label: "New",          icon: "sparkle", tone: "slate",
              help: "Words you haven't practised yet",
              test: (w: Word, s: Stat) => practiceable(w) && (!s || !s.seen) },
  progress: { id: "__progress", label: "In progress",  icon: "refresh", tone: "amber",
              help: "Seen, but not yet mastered",
              test: (w: Word, s: Stat, mc: number) => practiceable(w) && !!s && s.seen > 0 && (s.streak || 0) < (mc || 3) },
  hardwon:  { id: "__hardwon",  label: "Hard-won",     icon: "check",   tone: "green",
              help: "Mastered now — but they were tricky to learn",
              test: (w: Word, s: Stat, mc: number) => practiceable(w) && classifyWord(s, mc) === "learned" },
  due:      { id: "__due",      label: "Needs review", icon: "target",  tone: "amber",
              help: "Known a while ago — time for a refresh",
              test: (w: Word, s: Stat, mc: number, now: number) => practiceable(w) && isDue(s, now) },
};
export const SMART_KEYS = ["tricky", "new", "progress", "hardwon", "due"];

export function smartCount(vocab: Word[], stats: Record<string, Stat>, key: string, mc?: number) {
  const now = Date.now(); const sc = SMART[key];
  return sc ? vocab.filter((w) => sc.test(w, stats[w.id], mc, now)).length : 0;
}

/* Resolve a selection (array of list ids; [] = everything) into words. */
export function wordsForSelection(vocab: Word[], stats: Record<string, Stat>, selected: string[], mc?: number) {
  if (!selected || !selected.length) return vocab;
  const set = new Set(selected);
  const smartActive = SMART_KEYS.filter((k) => set.has(SMART[k].id));
  const now = Date.now();
  const out: Word[] = [];
  for (const w of vocab) {
    let inc = (w.lists || []).some((l) => set.has(l));
    if (!inc && w.topic && set.has("t:" + w.topic)) inc = true;
    if (!inc) { for (const k of smartActive) { if (SMART[k].test(w, stats[w.id], mc, now)) { inc = true; break; } } }
    if (inc) out.push(w);
  }
  return out;
}

export function trickyCount(vocab: Word[], stats: Record<string, Stat>, mc?: number) {
  return vocab.filter((w) => practiceable(w) && classifyWord(stats[w.id], mc) === "tricky").length;
}
