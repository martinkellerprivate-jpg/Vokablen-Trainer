/* Classification, smart categories and the spaced-repetition selection
 * weighting. Pure logic — no React. */
import type { Stat, Word } from "./types";
import { practiceable } from "./pairs";
import { isDueCard, retrievabilityOf, deriveProfile, retrievabilityAt, effectiveRetentionFor, getCfg } from "./fsrs";

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
export function isDue(s: Stat | undefined, now: number, retention?: number) {
  if (s && (s as any).fsrs) return isDueCard(s, now, retention);   // V13: deriveProfile.istFaellig
  // legacy Leitner fallback, until the word is lazy-migrated on its next review
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
export function wordsForSelection(vocab: Word[], stats: Record<string, Stat>, selected: string[], mc?: number, lessons?: any[]) {
  if (!selected || !selected.length) return vocab;
  const set = new Set(selected);
  const smartActive = SMART_KEYS.filter((k) => set.has(SMART[k].id));
  // F-NAV: lesson membership for any "lesson:<id>" selections
  const lessonMembers = new Set<string>();
  for (const l of (lessons || [])) { if (set.has("lesson:" + l.id)) for (const id of (l.members || [])) lessonMembers.add(id); }
  const now = Date.now();
  const out: Word[] = [];
  for (const w of vocab) {
    let inc = (w.lists || []).some((l) => set.has(l));
    if (!inc && w.topic && set.has("t:" + w.topic)) inc = true;
    if (!inc && lessonMembers.has(w.id)) inc = true;
    if (!inc) { for (const k of smartActive) { if (SMART[k].test(w, stats[w.id], mc, now)) { inc = true; break; } } }
    if (inc) out.push(w);
  }
  return out;
}

export function trickyCount(vocab: Word[], stats: Record<string, Stat>, mc?: number) {
  return vocab.filter((w) => practiceable(w) && classifyWord(stats[w.id], mc) === "tricky").length;
}

/* V17 — rolling "Heute dran": fresh each call, NO stored plan. Candidates =
 * due ∪ deadline-at-risk (lessons with a near dueDate, words not yet sitting) ∪
 * a small new-word quota. Ordered by retrievability (most fragile first),
 * capped to the daily goal. */
const DAY_MS = 86400000;
export function resolveToday(pairVocab: Word[], stats: Record<string, any>, lessons: any[], retention: number, dailyGoal: number, newPerDay: number, now: number = Date.now()): Word[] {
  const seen = new Set<string>();
  const out: Word[] = [];
  const add = (w: Word) => { if (!seen.has(w.id) && practiceable(w)) { seen.add(w.id); out.push(w); } };
  // V15: per-word effective retention (deadline densification raises it near a due date)
  const effFor = (w: Word) => effectiveRetentionFor(w, { targetRetention: retention }, lessons, now);
  pairVocab.filter((w) => isDue(stats[w.id], now, effFor(w))).forEach(add);   // 1) due (override-aware)
  const pair = pairVocab[0]?.pair;
  for (const l of (lessons || [])) {                                          // 2) deadline-at-risk
    if (l.pair !== pair || !l.dueDate) continue;
    const daysLeft = (l.dueDate - now) / DAY_MS;
    if (daysLeft < 0 || daysLeft > 7) continue;
    const set = new Set(l.members || []);
    pairVocab.filter((w) => set.has(w.id) && deriveProfile(stats[w.id]?.fsrs, effFor(w), now).stufe !== "sitzt").forEach(add);
  }
  out.sort((a, b) => retrievabilityOf(stats[a.id], effFor(a), now) - retrievabilityOf(stats[b.id], effFor(b), now));
  const news = pairVocab.filter((w) => practiceable(w) && !(stats[w.id]?.fsrs)).slice(0, Math.max(0, newPerDay || 0));
  for (const w of news) { if (out.length >= dailyGoal) break; add(w); }       // 3) new quota toward goal
  return dailyGoal ? out.slice(0, Math.max(dailyGoal, 1)) : out;
}

/* V17 — 7-day outlook: words coming due per day (from deriveProfile.due) + lesson deadlines. */
export function sevenDayOutlook(pairVocab: Word[], stats: Record<string, any>, lessons: any[], retention: number, now: number = Date.now()) {
  const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const today0 = startOfDay(now);
  const days = Array.from({ length: 7 }, (_, i) => ({ day: today0 + i * DAY_MS, count: 0, deadlines: [] as string[] }));
  for (const w of pairVocab) {
    const p = deriveProfile(stats[w.id]?.fsrs, retention, now);
    if (p.due == null) continue;
    const idx = Math.round((startOfDay(Math.max(p.due, now)) - today0) / DAY_MS);
    if (idx >= 0 && idx < 7) days[idx].count++;
  }
  const pair = pairVocab[0]?.pair;
  for (const l of (lessons || [])) {
    if (l.pair !== pair || !l.dueDate) continue;
    const idx = Math.round((startOfDay(l.dueDate) - today0) / DAY_MS);
    if (idx >= 0 && idx < 7) days[idx].deadlines.push(l.name);
  }
  return days;
}

/* V15 — exam prognosis: for a lesson with a deadline, estimate each word's
 * retrievability AT the exam day and bucket it. Honest "Schätzung". */
export function examPrognosis(lesson: any, vocab: Word[], stats: Record<string, any>, now: number = Date.now()) {
  if (!lesson?.dueDate) return null;
  const words = resolveLesson(lesson, vocab);
  const buckets: Record<string, Word[]> = { sicher: [], wackelig: [], vergessen: [] };
  for (const w of words) {
    const r = retrievabilityAt(stats[w.id]?.fsrs, lesson.dueDate);   // null = never practised
    const b = r == null ? "vergessen" : r >= 0.9 ? "sicher" : r >= 0.7 ? "wackelig" : "vergessen";
    buckets[b].push(w);
  }
  const daysLeft = Math.ceil((lesson.dueDate - now) / DAY_MS);
  const need = buckets.wackelig.length + buckets.vergessen.length;
  const perDay = daysLeft > 0 ? Math.ceil(need / daysLeft) : need;
  // unreachable if even at a heavy pace some words can't be pulled to "sicher"
  const unreachable = daysLeft <= 0 ? buckets.vergessen.length : Math.max(0, need - daysLeft * Math.max(perDay, 8));
  return { due: lesson.dueDate, daysLeft, total: words.length, buckets, need, perDay, unreachable };
}

/* V9: resolve a (static) lesson to its words. Dead member ids skipped silently.
 * Legacy dynamic lessons (pre-migration) still resolve via their source. */
export function resolveLesson(lesson: any, vocab: Word[]): Word[] {
  if (!lesson) return [];
  const pairVocab = vocab.filter((w) => w.pair === lesson.pair);
  if (lesson.members) {
    const set = new Set(lesson.members);
    return pairVocab.filter((w) => set.has(w.id));
  }
  const src = lesson.source || {};   // legacy fallback until lessonsStaticV9 migrates it
  if (src.type === "list") return pairVocab.filter((w) => (w.lists || []).includes(src.ref));
  if (src.type === "topic") return pairVocab.filter((w) => w.topic === src.ref);
  return [];
}

/* V9: snapshot the current words of a list or topic into a member-id array. */
export function snapshotMembers(vocab: Word[], pair: string, src: { type: "list" | "topic"; ref: string }): string[] {
  const pv = vocab.filter((w) => w.pair === pair);
  const ws = src.type === "list" ? pv.filter((w) => (w.lists || []).includes(src.ref)) : pv.filter((w) => w.topic === src.ref);
  return Array.from(new Set(ws.map((w) => w.id)));
}

/* V9/V14: lesson mastery aggregate from deriveProfile (the ONE source). Returns
 * the count per Stufe, % "sitzt", the dominant colour, and last_review. */
export function lessonProfile(lesson: any, vocab: Word[], stats: Record<string, any>, effRetention: number, now: number = Date.now()) {
  const words = resolveLesson(lesson, vocab);
  const dist: Record<string, number> = { noch_nicht_geuebt: 0, sitzt_schlecht: 0, sitzt_fast: 0, sitzt: 0 };
  let lastReview = 0;
  for (const w of words) {
    const f = stats[w.id]?.fsrs;
    const p = deriveProfile(f, effRetention, now);
    dist[p.stufe] = (dist[p.stufe] || 0) + 1;
    if (f?.last_review && f.last_review > lastReview) lastReview = f.last_review;
  }
  const total = words.length;
  const pctSitzt = total ? dist.sitzt / total : 0;
  const tone = total === 0 || dist.noch_nicht_geuebt === total ? "slate" : pctSitzt > 0.8 ? "green" : pctSitzt < 0.33 ? "red" : "amber";
  return { total, dist, pctSitzt, tone, lastReview };
}

/* Resolve a built-in smart quick-access ("due" | "tricky") for one pair.
 * V8: "due" is ordered by retrievability (most fragile first) and capped to the
 * daily target when opts are supplied (for the run; chip counts pass no opts). */
export function resolveSmart(
  key: string, pairVocab: Word[], stats: Record<string, Stat>, mc?: number,
  opts?: { retention?: number; cap?: number },
): Word[] {
  const now = Date.now();
  const retention = (opts && opts.retention) || 0.9;
  // V13/V14: FSRS-based smart scopes via deriveProfile (the one source).
  //  due = istFaellig (R) · wackeln = stufe 'sitzt_schlecht' (S) · baldfaellig (R, !faellig)
  //  leech = istLeech (D) · frischfragil = graded & S<S1 · kurzvorsitzt = S2*0.7..S2
  const profOf = (id: string) => deriveProfile(stats[id]?.fsrs, retention, now);
  let words: Word[];
  if (key === "due") {
    words = pairVocab.filter((w) => practiceable(w) && isDue(stats[w.id], now, retention))
      .sort((a, b) => retrievabilityOf(stats[a.id], retention, now) - retrievabilityOf(stats[b.id], retention, now));
    if (opts && opts.cap && words.length > opts.cap) words = words.slice(0, opts.cap);
    return words;
  }
  if (key === "wackeln") return pairVocab.filter((w) => practiceable(w) && profOf(w.id).stufe === "sitzt_schlecht");
  if (key === "baldfaellig") return pairVocab.filter((w) => practiceable(w) && profOf(w.id).baldFaellig);
  if (key === "leech") return pairVocab.filter((w) => practiceable(w) && profOf(w.id).istLeech);
  if (key === "frischfragil") { const c = getCfg(); return pairVocab.filter((w) => { const f = stats[w.id]?.fsrs; return practiceable(w) && f && f.state !== 0 && f.stability < c.S1; }); }
  if (key === "kurzvorsitzt") { const c = getCfg(); return pairVocab.filter((w) => { const s = stats[w.id]?.fsrs?.stability || 0; return practiceable(w) && s >= c.S2 * 0.7 && s < c.S2; }); }
  const sc = SMART[key]; if (!sc) return [];
  return pairVocab.filter((w) => sc.test(w, stats[w.id], mc, now));
}
