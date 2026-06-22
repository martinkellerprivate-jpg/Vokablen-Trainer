/* V8 — in-run scheduler: shuffle-bag + mastery loop. Pure logic, framework-free.
 * Replaces the old weighted-random pickNext. The run owns the session-internal
 * repetition; FSRS is graded exactly once per word per session (at graduation
 * in mastery mode, at first resolution in review mode) — see Practice.tsx.
 *
 * Two scope modes:
 *  - "mastery"  (a concrete lesson): each word must reach its criterion
 *    (2× correct with spacing; 1× for already-solid words; solid & not-due words
 *    are skipped). Wrong answers come back with a gap. No back-to-back repeats.
 *  - "review"   (a smart pool like "Fällige Wörter"): each word is shown once and
 *    graded once, ordered fragile-first.
 */
import type { SessionOutcome } from "./fsrs";

export type RunMode = "mastery" | "review";

export interface RunWord {
  id: string;
  criterion: number;       // correct answers needed this run
  correct: number;
  attempts: number;
  usedHint: boolean;
  failedOnce: boolean;
  firstAnswerMs?: number;
  mastered: boolean;       // reached criterion (mastery) / resolved once (review)
  graded: boolean;         // FSRS grade already fired this run (once-only)
  mode?: string;           // answer mode at resolution time (for deriveRating)
}

export interface RunState {
  mode: RunMode;
  words: Record<string, RunWord>;
  order: string[];         // remaining queue, fragile-first at start
  current: string | null;  // id currently in hand (popped from order)
  lastId: string | null;   // last shown id (back-to-back guard)
  total: number;           // words actually in the run (after skips)
}

export interface WordMeta { retrievability: number; due: boolean; solid: boolean; }

const GAP = 2;          // min other cards before a missed word repeats
export const SOLID_R = 0.9;  // retrievability above which a word counts as "solid"

/* Build a run from a frozen word-id snapshot + per-word FSRS meta. */
export function buildRun(ids: string[], meta: Record<string, WordMeta>, mode: RunMode): RunState {
  const words: Record<string, RunWord> = {};
  const order: string[] = [];
  for (const id of ids) {
    const m = meta[id] || { retrievability: 0, due: true, solid: false };
    if (mode === "mastery" && m.solid && !m.due) continue;        // already solid & not due → skip
    const criterion = mode === "review" ? 1 : (m.solid ? 1 : 2);  // solid → single confirmation touch
    words[id] = { id, criterion, correct: 0, attempts: 0, usedHint: false, failedOnce: false, mastered: false, graded: false };
    order.push(id);
  }
  // fragile first (lowest retrievability leads)
  order.sort((a, b) => (meta[a]?.retrievability ?? 0) - (meta[b]?.retrievability ?? 0));
  return { mode, words, order, current: null, lastId: null, total: order.length };
}

/* Pick the next id (pops it from the queue), avoiding back-to-back repeats. */
export function pick(st: RunState): string | null {
  if (!st.order.length) { st.current = null; return null; }
  let idx = 0;
  if (st.order[0] === st.lastId && st.order.length > 1) idx = 1;   // no back-to-back
  st.current = st.order.splice(idx, 1)[0];
  return st.current;
}

export interface AttemptResult { correct: boolean; usedHint?: boolean; elapsedMs?: number; }

/* Record the resolution of the current word. Returns whether it just graduated
 * (→ caller fires a single FSRS grade). Re-queues unmastered words with a gap. */
export function record(st: RunState, res: AttemptResult): { id: string; graduated: boolean } {
  const id = st.current as string;
  const w = st.words[id];
  w.attempts++;
  if (res.usedHint) w.usedHint = true;
  if (w.firstAnswerMs == null) w.firstAnswerMs = res.elapsedMs;
  if (res.correct) w.correct++; else w.failedOnce = true;

  let graduated = false;
  if (st.mode === "review") {
    w.mastered = true;            // one shot per word in a review pool
    graduated = true;
  } else if (w.correct >= w.criterion) {
    w.mastered = true;
    graduated = true;
  } else {
    const pos = Math.min(GAP, st.order.length);   // reinsert with spacing
    st.order.splice(pos, 0, id);
  }
  st.lastId = id;
  st.current = null;
  return { id, graduated };
}

/* Session outcome → feeds deriveRating. */
export function outcomeOf(w: RunWord): SessionOutcome {
  return {
    failed: w.correct === 0,
    usedHint: w.usedHint,
    retries: w.failedOnce || w.attempts > w.correct,
    elapsedMs: w.firstAnswerMs,
  };
}

export function progress(st: RunState): { mastered: number; total: number } {
  let mastered = 0;
  for (const id in st.words) if (st.words[id].mastered) mastered++;
  return { mastered, total: st.total };
}

/* Words that were touched but never graded — flushed at session end. */
export function pendingGrades(st: RunState): RunWord[] {
  const out: RunWord[] = [];
  for (const id in st.words) { const w = st.words[id]; if (w.attempts > 0 && !w.graded) out.push(w); }
  return out;
}
