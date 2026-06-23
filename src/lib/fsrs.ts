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
export const DEFAULT_RETENTION = 0.9;

/* Retention comes from ONE source: settings.targetRetention (the "Lernintensität"
 * preset is just its UI shell). Accepts a Settings object (preferred) or a legacy
 * intensity string for back-compat. */
export function retentionFor(s?: any): number {
  if (s && typeof s === "object") {
    if (typeof s.targetRetention === "number") return s.targetRetention;
    if (s.lernIntensity) return RETENTION[s.lernIntensity as Intensity] ?? RETENTION.normal;
    return RETENTION.normal;
  }
  return RETENTION[(s as Intensity)] ?? RETENTION.normal;
}
/* V13/FIX 4: THE single effective-retention source. V13 baseline = the global
 * target; V15 raises it per active lesson deadline (highest wins). Every derivation
 * (card, stats, popup, today, due-list) must call this — never settings.targetRetention
 * directly — so the same word shows identical due everywhere. */
export function effectiveRetentionFor(word: any, settings: any, lessons?: any[], now: number = Date.now()): number {
  const base = retentionFor(settings);
  if (!word || !lessons || !lessons.length) return base;
  // V15 auto-densification: a word in a lesson whose deadline is within the window
  // gets a higher target → shorter intervals / earlier due. Highest wins; after the
  // deadline the override is gone (snap-back). Window/target read from CFG (settings).
  let target = base;
  for (const l of lessons) {
    if (!l.dueDate || !(l.members || []).includes(word.id)) continue;
    const daysLeft = (l.dueDate - now) / 86400000;
    if (daysLeft >= 0 && daysLeft <= CFG.examWindowDays) target = Math.max(target, CFG.examRetention);
  }
  return target;
}

/* ---- V13/F-V13: the FIVE mastery levels (S-axis). The ONLY colour/label source.
 * 'neu' (blue) is a distinct neutral level for freshly-learned words so that a
 * first-correct word is NOT shown red. 'noch_nicht_geuebt' (grey, never practised)
 * and 'neu' are two different things. ---- */
export const STUFE: Record<string, { key: string; label: string; tone: string }> = {
  sitzt:             { key: "sitzt",             label: "sitzt",            tone: "green" },
  sitzt_fast:        { key: "sitzt_fast",        label: "sitzt fast",       tone: "amber" },
  sitzt_schlecht:    { key: "sitzt_schlecht",    label: "wackelt noch",     tone: "red" },
  neu:               { key: "neu",               label: "neu / frisch",     tone: "blue" },
  noch_nicht_geuebt: { key: "noch_nicht_geuebt", label: "noch nicht geübt", tone: "slate" },
};
/* The ONE canonical order for every distribution/legend/band (FIX B: 5 disjoint). */
export const STUFE_ORDER = ["sitzt", "sitzt_fast", "sitzt_schlecht", "neu", "noch_nicht_geuebt"];

/* ---- F-SETTINGS-ADVANCED: thresholds/params have ONE source. DEFAULTS = named
 * constants; configure(settings) overrides per user; deriveProfile / effective-
 * RetentionFor / the grade path read CFG → effective value, instantly. ---- */
export const DEFAULTS = { S1: 3, S2: 14, MIN_REPS: 2, PUFFER: 2, D_LEECH: 7, LAPSE_LEECH: 3, examRetention: 0.95, examWindowDays: 3, learningSpeed: 1.0 };
let CFG = { ...DEFAULTS };
export function configure(settings: any) {
  const n = (v: any, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
  CFG = {
    S1: n(settings?.S1, DEFAULTS.S1), S2: n(settings?.S2, DEFAULTS.S2),
    MIN_REPS: n(settings?.MIN_REPS, DEFAULTS.MIN_REPS), PUFFER: n(settings?.PUFFER, DEFAULTS.PUFFER),
    D_LEECH: n(settings?.D_LEECH, DEFAULTS.D_LEECH), LAPSE_LEECH: n(settings?.LAPSE_LEECH, DEFAULTS.LAPSE_LEECH),
    examRetention: n(settings?.examRetention, DEFAULTS.examRetention), examWindowDays: n(settings?.examWindowDays, DEFAULTS.examWindowDays),
    learningSpeed: n(settings?.learningSpeed, DEFAULTS.learningSpeed),
  };
}
export function getCfg() { return CFG; }
// back-compat exports (read the live CFG)
export const S1 = DEFAULTS.S1, S2 = DEFAULTS.S2, PUFFER = DEFAULTS.PUFFER, D_LEECH = DEFAULTS.D_LEECH, LAPSE_LEECH = DEFAULTS.LAPSE_LEECH;
const DAY = 86400000;

/* FIX C: ONE scaling source for learningSpeed — used by both the real grade path
 * and the settings live-preview. speed 1.0 = exact FSRS. */
export function applyLearningSpeed(sOld: number, sFsrs: number, speed: number): number {
  if (!(speed > 0) || speed === 1) return sFsrs;
  return Math.max(0.1, sOld + (sFsrs - sOld) * speed);
}

export interface Profile {
  stufe: string; tone: string;
  istFaellig: boolean; baldFaellig: boolean;
  R_now: number | null; interval: number | null; due: number | null;
  haeltTage: number; istLeech: boolean;
}
/* deriveProfile — DIE einzige Ableitung. FIX 1: guard New/S<=0 BEFORE any R-formula. */
export function deriveProfile(card: SerializedCard | undefined, effRetention: number, now: number = Date.now()): Profile {
  const S = card ? card.stability : 0;
  if (!card || card.state === 0 || !(S > 0)) {
    return { stufe: "noch_nicht_geuebt", tone: STUFE.noch_nicht_geuebt.tone, istFaellig: false, baldFaellig: false, R_now: null, interval: null, due: null, haeltTage: 0, istLeech: false };
  }
  const last = card.last_review ?? now;
  const interval = 9 * S * (1 / effRetention - 1);            // days
  const due = last + interval * DAY;
  const R_now = Math.pow(1 + ((now - last) / DAY) / (9 * S), -0.5);
  const istFaellig = now >= due;
  const baldFaellig = (now >= due - CFG.PUFFER * DAY) && !istFaellig;   // FIX 2: excludes due
  // F-V13: freshly learned (few reps, never lapsed) → neutral 'neu', not red.
  const stufe = ((card.reps || 0) < CFG.MIN_REPS && (card.lapses || 0) === 0) ? "neu"
    : S < CFG.S1 ? "sitzt_schlecht" : S < CFG.S2 ? "sitzt_fast" : "sitzt";
  const istLeech = card.difficulty >= CFG.D_LEECH && (card.lapses || 0) >= CFG.LAPSE_LEECH;
  return { stufe, tone: STUFE[stufe].tone, istFaellig, baldFaellig, R_now, interval, due, haeltTage: S, istLeech };
}
/* Retrievability at a FUTURE moment (for V15 exam prognosis). New/S<=0 → null. */
export function retrievabilityAt(card: SerializedCard | undefined, at: number): number | null {
  const S = card ? card.stability : 0;
  if (!card || card.state === 0 || !(S > 0)) return null;
  const last = card.last_review ?? at;
  return Math.pow(1 + (Math.max(0, at - last) / DAY) / (9 * S), -0.5);
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
  due?: number;            // V13: NOT persisted — derived via deriveProfile (kept optional for old data)
  stability: number; difficulty: number;
  elapsed_days: number; scheduled_days: number; reps: number; lapses: number;
  learning_steps?: number; state: number; last_review?: number;
}
function toCard(s: SerializedCard): any {
  return {
    due: new Date(s.due ?? s.last_review ?? Date.now()),   // placeholder; computations use last_review, not due
    stability: s.stability, difficulty: s.difficulty,
    elapsed_days: s.elapsed_days, scheduled_days: s.scheduled_days,
    reps: s.reps, lapses: s.lapses, learning_steps: s.learning_steps ?? 0,
    state: s.state,
    last_review: s.last_review != null ? new Date(s.last_review) : undefined,
  };
}
function fromCard(c: any): SerializedCard {
  return {
    // V13: due deliberately NOT stored (derived); only raw FSRS values persist + sync
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

/* Grade from an explicit baseline card → next serialized card. F-SETTINGS-ADVANCED:
 * on a successful review (not Again) the stability gain is scaled by learningSpeed
 * (one source: applyLearningSpeed). Lapse handling untouched, w[] untouched. */
export function gradeFromCard(base: SerializedCard, rating: number, retention: number, now: number = Date.now()): SerializedCard {
  const next = fromCard(scheduler(retention).next(toCard(base), new Date(now), rating).card);
  if (rating !== Rating.Again && CFG.learningSpeed !== 1) {
    next.stability = applyLearningSpeed(base.stability || 0, next.stability, CFG.learningSpeed);
  }
  return next;
}

/* F-SETTINGS-ADVANCED (FIX C): preview the stability after `steps` successful
 * (Good) reviews at a given learningSpeed, using the SAME scheduler + the SAME
 * applyLearningSpeed scaling as the real grade path — one calculation source, no
 * separate estimate. Returns the resulting stability (≈ "hält ~X Tage"). */
export function previewStabilityGood(speed: number, retention: number, steps = 3, now = 0): number {
  let base = emptyCard(now);
  let when = now;
  for (let i = 0; i < steps; i++) {
    const next = fromCard(scheduler(retention).next(toCard(base), new Date(when), Rating.Good).card);
    next.stability = applyLearningSpeed(base.stability || 0, next.stability, speed);
    base = next;
    when = (base.last_review || when) + Math.max(1, Math.round(next.stability)) * DAY;
  }
  return base.stability;
}

/* The literature default FSRS weights w[0..18] (read-only reference for the modal). */
export function defaultWeights(): number[] { return generatorParameters().w.slice(); }

/* Retrievability 0..1 — lower = more fragile (used for ordering). */
export function retrievabilityOf(stat: Stat | undefined, retention: number, now: number = Date.now()): number {
  const r = scheduler(retention).get_retrievability(toCard(initialCard(stat)), new Date(now), false);
  return typeof r === "number" ? r : parseFloat(r) / 100 || 0;
}

/* Due test via deriveProfile (V13). Retention defaults to the global target; pass
 * the word's effectiveRetention for override-correct results. */
export function isDueCard(stat: Stat | undefined, now: number = Date.now(), retention: number = DEFAULT_RETENTION): boolean {
  const c = stat && (stat as any).fsrs;
  if (!c) return false;
  return deriveProfile(c, retention, now).istFaellig;
}
