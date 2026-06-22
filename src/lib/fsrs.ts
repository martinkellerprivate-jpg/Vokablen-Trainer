/* V8 — FSRS scheduler wrapper (successive relearning).
 * All ts-fsrs usage is contained here. Cards are stored on each Stat as a
 * serialized plain-JSON object (dates as ms) so they sync through P3 like the
 * rest of the stats doc. No server, no LLM — pure local computation.
 *
 * Key design points (per CR-V8 + Freigabe-Fixes):
 *  - enable_short_term:false → a freshly-learned word gets day-scale intervals,
 *    no intra-day churn (we grade once per word per session, not per attempt).
 *  - deriveRating is mode-aware: Memorize → no grade; Choose caps at Good.
 *  - an absurdly long answer time is treated as Good, never Hard (distraction).
 *  - warmStart re-initialises legacy streak/ema into a coherent Review card so
 *    existing progress is preserved and words don't all become due at once.
 */
import { fsrs, generatorParameters, createEmptyCard, Rating, State } from "ts-fsrs";
import type { Stat } from "./types";

export { Rating } from "ts-fsrs";

export type Intensity = "locker" | "normal" | "intensiv";
export const RETENTION: Record<Intensity, number> = { locker: 0.85, normal: 0.9, intensiv: 0.95 };
export function retentionFor(intensity?: string): number {
  return RETENTION[(intensity as Intensity)] ?? RETENTION.normal;
}

/* scheduler is memoised per retention target */
const _sched: Record<string, any> = {};
function scheduler(retention: number): any {
  const key = retention.toFixed(2);
  if (!_sched[key]) _sched[key] = fsrs(generatorParameters({ request_retention: retention, enable_fuzz: true, enable_short_term: false }));
  return _sched[key];
}

/* ---- serialization: ts-fsrs uses Date objects; we persist ms numbers ---- */
export interface SerializedCard {
  due: number; stability: number; difficulty: number;
  elapsed_days: number; scheduled_days: number; reps: number; lapses: number;
  learning_steps?: number; state: number; last_review?: number;
}
function toCard(s: SerializedCard): any {
  return {
    due: new Date(s.due),
    stability: s.stability, difficulty: s.difficulty,
    elapsed_days: s.elapsed_days, scheduled_days: s.scheduled_days,
    reps: s.reps, lapses: s.lapses, learning_steps: s.learning_steps ?? 0,
    state: s.state,
    last_review: s.last_review != null ? new Date(s.last_review) : undefined,
  };
}
function fromCard(c: any): SerializedCard {
  return {
    due: +new Date(c.due),
    stability: c.stability, difficulty: c.difficulty,
    elapsed_days: c.elapsed_days, scheduled_days: c.scheduled_days,
    reps: c.reps, lapses: c.lapses, learning_steps: c.learning_steps ?? 0,
    state: c.state,
    last_review: c.last_review != null ? +new Date(c.last_review) : undefined,
  };
}

/* ---- rating derivation from a per-session outcome (FIX 1/2/3) ---- */
export interface SessionOutcome {
  failed?: boolean;     // never answered correctly this session
  usedHint?: boolean;
  retries?: boolean;    // needed more than one attempt to get it right
  elapsedMs?: number;   // time to the first answer of the word this session
}
export type RatingOrNoGrade = number | "no-grade";

const FAST_MS = 3500;     // clean + faster than this → Easy
const SLOW_MS = 12000;    // clean but slower than this → Hard
const ABSURD_MS = 60000;  // longer than this → treat as distraction, not Hard

export function deriveRating(o: SessionOutcome, mode: string): RatingOrNoGrade {
  if (mode === "memorize") return "no-grade";          // FIX 2: pure exposition
  if (o.failed) return Rating.Again;
  if (o.usedHint || o.retries) return Rating.Hard;     // got it, but it was a struggle
  const e = o.elapsedMs ?? SLOW_MS;                     // clean first try, no hint
  let rating: number;
  if (e >= ABSURD_MS) rating = Rating.Good;             // FIX 3: absurdly long ≠ Hard
  else if (e < FAST_MS) rating = Rating.Easy;
  else if (e >= SLOW_MS) rating = Rating.Hard;
  else rating = Rating.Good;
  if (mode === "choice" && rating === Rating.Easy) rating = Rating.Good; // FIX 2: recognition caps at Good
  return rating;
}

/* ---- warm-start migration: legacy streak/ema → a coherent Review card ---- */
const LEITNER = [1, 2, 4, 7, 14];
export function warmStart(legacy?: Stat): SerializedCard {
  const now = Date.now();
  if (!legacy || !legacy.seen) return fromCard(createEmptyCard(new Date(now)));
  const streak = legacy.streak || 0;
  const ema = legacy.ema ?? 0.5;
  const intervalDays = streak <= 0 ? 0.5 : (LEITNER[Math.min(streak, LEITNER.length) - 1] || 14);
  const lastReview = legacy.lastTs || now;
  return {
    due: lastReview + intervalDays * 86400000,
    stability: Math.max(0.1, intervalDays),
    difficulty: Math.min(10, Math.max(1, 1 + (1 - ema) * 9)),
    elapsed_days: Math.max(0, Math.round((now - lastReview) / 86400000)),
    scheduled_days: Math.round(intervalDays),
    reps: legacy.correctCount || streak || 1,
    lapses: legacy.wrongCount || 0,
    learning_steps: 0,
    state: State.Review,
    last_review: lastReview,
  };
}

/* A fresh, never-reviewed FSRS card (state New). */
export function emptyCard(now: number = Date.now()): SerializedCard {
  return fromCard(createEmptyCard(new Date(now)));
}

/* The card a word HAS, captured at run start. Used as the grading baseline so a
 * single session-end grade increments reps by exactly one (FIX 1). A genuinely
 * new word (no prior card, never seen) starts empty; a pre-V8 word warm-starts
 * from its legacy progress. Must be read from the PRE-session stat. */
export function initialCard(stat: Stat | undefined): SerializedCard {
  if (stat && (stat as any).fsrs) return (stat as any).fsrs;
  return (stat && stat.seen > 0) ? warmStart(stat) : emptyCard();
}

/* Grade from an explicit baseline card → next serialized card. */
export function gradeFromCard(base: SerializedCard, rating: number, retention: number, now: number = Date.now()): SerializedCard {
  return fromCard(scheduler(retention).next(toCard(base), new Date(now), rating).card);
}

/* Retrievability 0..1 — lower = more fragile (used for ordering). */
export function retrievabilityOf(stat: Stat | undefined, retention: number, now: number = Date.now()): number {
  const r = scheduler(retention).get_retrievability(toCard(initialCard(stat)), new Date(now), false);
  return typeof r === "number" ? r : parseFloat(r) / 100 || 0;
}

/* Due test — only graded cards (not fresh New) with a reached due date count. */
export function isDueCard(stat: Stat | undefined, now: number = Date.now()): boolean {
  const c = stat && (stat as any).fsrs;
  if (!c || c.state === 0) return false;   // New / never-graded → not "due for review"
  return c.due <= now;
}
