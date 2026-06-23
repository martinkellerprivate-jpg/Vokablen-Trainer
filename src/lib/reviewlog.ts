/* F-SETTINGS-ADVANCED — append-only review log for a future FSRS fit.
 *
 * One compact entry per FSRS grade: the word, when, the rating, and the card
 * state BEFORE the review (so a fitter can replay history). FIX A:
 *  - append-only: we never rewrite an existing entry,
 *  - bounded growth: at most MAX_PER_WORD per word, oldest-first eviction,
 *  - batched writes: callers buffer entries and flush in one go (not per answer).
 *
 * Entry keys are short to keep the JSON small: {w,t,g,s,st,d}
 *  w  = wordId
 *  t  = timestamp (ms)
 *  g  = rating 1..4 (Again/Hard/Good/Easy)
 *  s  = stability BEFORE the review
 *  st = state BEFORE the review (0..3)
 *  d  = difficulty BEFORE the review
 */
export const MAX_PER_WORD = 50;      // keep the most recent N reviews per word
export const MIN_REVIEWS = 300;      // gate: total reviews needed before a fit is attempted

export interface ReviewEntry { w: string; t: number; g: number; s: number; st: number; d: number; }
export type ReviewLog = Record<string, ReviewEntry[]>;

/* Append a batch of entries to the log, keeping ≤ MAX_PER_WORD per word
 * (oldest dropped first). Returns a NEW object (callers store it as state). */
export function appendReviews(log: ReviewLog, batch: ReviewEntry[]): ReviewLog {
  if (!batch || !batch.length) return log;
  const next: ReviewLog = { ...log };
  for (const e of batch) {
    if (!e || !e.w) continue;
    const arr = next[e.w] ? next[e.w].slice() : [];
    arr.push(e);                                   // append-only
    if (arr.length > MAX_PER_WORD) arr.splice(0, arr.length - MAX_PER_WORD); // oldest-first eviction
    next[e.w] = arr;
  }
  return next;
}

export function totalReviews(log: ReviewLog): number {
  let n = 0; for (const k in log) n += log[k].length; return n;
}

/* Status line for the gating UI (no real fit yet — WASM deferred). */
export function fitStatus(log: ReviewLog, autoFit: boolean, fitActive = false): { kind: string; text: string } {
  const n = totalReviews(log);
  if (!autoFit) return { kind: "off", text: "Aus — die App nutzt die Standard-FSRS-Werte." };
  if (fitActive) return { kind: "active", text: "Angepasst — die App lernt aus deinen Antworten." };
  if (n < MIN_REVIEWS) return { kind: "collecting", text: `Sammelt noch (${n}/${MIN_REVIEWS} Antworten) — bis dahin Standardwerte.` };
  return { kind: "ready", text: `Genug Daten (${n}) — Feinanpassung folgt in einem Update.` };
}
