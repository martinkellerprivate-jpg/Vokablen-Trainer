/* PLANUNGS-RUNDE 2 — V-ENGINE: ONE queue builder for every entry point.
 * The only difference between entries is the SCOPE (which word ids) and the
 * effective retention (exam densification). No per-entry special mode.
 *
 * Pool (who is in the round), by the 5 deriveProfile stufen + due:
 *   sitzt_schlecht (rot)        → pot "rot",     goal ZIEL_WACKELT (3)
 *   neu (blau)                  → pot "blau",    goal ZIEL_NEU     (2)
 *   noch_nicht_geuebt (grau)    → pot "grau",    goal ZIEL_NEU_NIE (2)
 *   sitzt_fast (orange)         → pot "orange",  goal ZIEL_FAST    (1)
 *   sitzt (grün) & due          → pot "faellig", goal ZIEL_FAELLIG (1)
 *   sitzt (grün) & NOT due      → EXCLUDED (FSRS plant sie ohnehin)
 * Exam context needs no special path: a stricter examRetention makes more green
 * words `due`, so they enter via the "faellig" pot automatically.
 *
 * Selection per card: weighted-random pot (W_*), then the most-urgent open word
 * in that pot (debt bonus → no starvation), never the same word twice in a row,
 * lapsed words requeued with a gap, endgame switch to "only the open ones" so
 * the round always terminates.
 *
 * FIX A: each word's round GOAL is frozen at build time from its stufe THEN, and
 *        never changes if deriveProfile reports a different stufe mid-round → the
 *        progress denominator (sum of goals) is a stable start snapshot.
 * FIX B: a lapse resets that word's fulfilled counter to LAPSE_RESET (0); the
 *        word reopens (debt applies again) and the overall % drops; the
 *        denominator is untouched.
 *
 * Priority/fälligkeit come from deriveProfile/ts-fsrs (literature-optimised) — the
 * engine only adds the named mechanics; no invented scoring formula.
 */
import type { SessionOutcome } from "./fsrs";

export type Pot = "rot" | "faellig" | "grau" | "blau" | "orange";
export type Rng = () => number;

const GAP = 2;             // min other cards before a lapsed word repeats
const ENDGAME_OPEN = 3;    // ≤ this many open words → drop pot-weighting, just cycle the open
const LAPSE_RESET = 0;     // FIX B: fulfilled counter a lapse resets to

export interface QueueCfg {
  W_ROT: number; W_FAELLIG: number; W_GRAU: number; W_BLAU: number; W_ORANGE: number;
  ZIEL_WACKELT: number; ZIEL_NEU: number; ZIEL_NEU_NIE: number; ZIEL_FAST: number; ZIEL_FAELLIG: number;
}

export interface WordMeta { stufe: string; retrievability: number; due: boolean; }

export interface RunWord {
  id: string;
  pot: Pot;
  goal: number;            // FIX A: frozen at build, constant for the round
  done: number;            // fulfilled counting recalls toward goal (FIX B: reset on lapse)
  correct: number;         // cumulative corrects (for rating — never reset)
  attempts: number;
  usedHint: boolean;
  failedOnce: boolean;
  firstAnswerMs?: number;
  mastered: boolean;       // done >= goal
  graded: boolean;         // FSRS grade already fired this run (once-only)
  sinceShown: number;      // debt: cards since last shown while open
  block: number;           // lapse cooldown: cards remaining before eligible again
  mode?: string;
}

export interface RunState {
  words: Record<string, RunWord>;
  current: string | null;
  lastId: string | null;
  total: number;           // words in the run
  goalTotal: number;       // FIX A: denominator snapshot (Σ goals at start)
  cards: number;           // cards shown this run (for "genug für heute")
  rng: Rng;
}

/* stufe (+due) → pot, or null if excluded (green & not due). */
function potOf(stufe: string, due: boolean): Pot | null {
  switch (stufe) {
    case "sitzt_schlecht": return "rot";
    case "neu": return "blau";
    case "noch_nicht_geuebt": return "grau";
    case "sitzt_fast": return "orange";
    case "sitzt": return due ? "faellig" : null;
    default: return due ? "faellig" : null;
  }
}
function goalFor(pot: Pot, cfg: QueueCfg): number {
  switch (pot) {
    case "rot": return cfg.ZIEL_WACKELT;
    case "blau": return cfg.ZIEL_NEU;
    case "grau": return cfg.ZIEL_NEU_NIE;
    case "orange": return cfg.ZIEL_FAST;
    case "faellig": return cfg.ZIEL_FAELLIG;
  }
}
function weightOf(pot: Pot, cfg: QueueCfg): number {
  switch (pot) {
    case "rot": return cfg.W_ROT;
    case "faellig": return cfg.W_FAELLIG;
    case "grau": return cfg.W_GRAU;
    case "blau": return cfg.W_BLAU;
    case "orange": return cfg.W_ORANGE;
  }
}

/* Build the round from a frozen id snapshot + per-word meta (stufe/retr/due). */
export function buildQueue(ids: string[], meta: Record<string, WordMeta>, cfg: QueueCfg, rng: Rng = Math.random): RunState {
  const words: Record<string, RunWord> = {};
  let goalTotal = 0;
  for (const id of ids) {
    if (words[id]) continue;                  // dedup (multiselect unions may repeat ids)
    const m = meta[id] || { stufe: "noch_nicht_geuebt", retrievability: 0, due: true };
    const pot = potOf(m.stufe, m.due);
    if (!pot) continue;                       // green & not due → excluded
    const goal = Math.max(1, Math.round(goalFor(pot, cfg)));
    words[id] = { id, pot, goal, done: 0, correct: 0, attempts: 0, usedHint: false, failedOnce: false,
      mastered: false, graded: false, sinceShown: 0, block: 0, mode: undefined };
    goalTotal += goal;
  }
  return { words, current: null, lastId: null, total: Object.keys(words).length, goalTotal, cards: 0, rng };
}

const openIds = (st: RunState): string[] => Object.keys(st.words).filter((id) => !st.words[id].mastered);

/* How many words still have their round goal open. */
export function remaining(st: RunState): number { return openIds(st).length; }

/* Most-urgent open word: highest debt, neediest (lowest done/goal) as tie-break. */
function neediest(ids: string[], st: RunState): string {
  let best = ids[0];
  for (const id of ids) {
    const a = st.words[id], b = st.words[best];
    if (a.sinceShown > b.sinceShown) best = id;
    else if (a.sinceShown === b.sinceShown && (a.done / a.goal) < (b.done / b.goal)) best = id;
  }
  return best;
}

function weightedPick(ids: string[], st: RunState, cfg: QueueCfg): string {
  const byPot: Record<string, string[]> = {};
  for (const id of ids) { const p = st.words[id].pot; (byPot[p] || (byPot[p] = [])).push(id); }
  const pots = Object.keys(byPot) as Pot[];
  const weights = pots.map((p) => Math.max(0, weightOf(p, cfg)));
  const sum = weights.reduce((a, b) => a + b, 0);
  let pot = pots[0];
  if (sum > 0) {
    let r = st.rng() * sum;
    for (let i = 0; i < pots.length; i++) { r -= weights[i]; if (r <= 0) { pot = pots[i]; break; } }
  }
  return neediest(byPot[pot], st);
}

/* Pick the next id (sets st.current). Returns null when the round is complete. */
export function pick(st: RunState, cfg: QueueCfg): string | null {
  const open = openIds(st);
  if (!open.length) { st.current = null; return null; }

  // candidates: avoid back-to-back + respect lapse cooldown, with graceful fallbacks
  let cands = open.filter((id) => id !== st.lastId && st.words[id].block <= 0);
  if (!cands.length) cands = open.filter((id) => id !== st.lastId);
  if (!cands.length) cands = open;

  const chosen = open.length <= ENDGAME_OPEN ? neediest(cands, st) : weightedPick(cands, st, cfg);

  // debt bookkeeping: every other OPEN word ages by one card; cooldowns tick down
  for (const id of open) { if (id !== chosen) st.words[id].sinceShown++; if (st.words[id].block > 0) st.words[id].block--; }
  st.words[chosen].sinceShown = 0;
  st.current = chosen;
  st.cards++;
  return chosen;
}

export interface AttemptResult { correct: boolean; usedHint?: boolean; elapsedMs?: number; }

/* Record the current word's resolution. Returns whether it just graduated. */
export function record(st: RunState, res: AttemptResult): { id: string; graduated: boolean } {
  const id = st.current as string;
  const w = st.words[id];
  w.attempts++;
  if (res.usedHint) w.usedHint = true;
  if (w.firstAnswerMs == null) w.firstAnswerMs = res.elapsedMs;

  let graduated = false;
  if (res.correct) {
    w.correct++;
    w.done++;                                // counting recall (spaced by anti-repeat)
    if (w.done >= w.goal && !w.mastered) { w.mastered = true; graduated = true; }
  } else {
    w.failedOnce = true;
    w.done = LAPSE_RESET;                     // FIX B: reset → % drops, word reopens
    w.mastered = false;
    w.block = GAP;                            // lapse-requeue with a min gap
  }
  st.lastId = id;
  st.current = null;
  return { id, graduated };
}

/* Session outcome → feeds deriveRating (cumulative correct, not the round counter). */
export function outcomeOf(w: RunWord): SessionOutcome {
  return {
    failed: w.correct === 0,
    usedHint: w.usedHint,
    retries: w.failedOnce || w.attempts > w.correct,
    elapsedMs: w.firstAnswerMs,
  };
}

/* Round progress — FIX A/B: numerator = Σ clamp(done,0,goal); denominator = frozen goalTotal. */
export function progress(st: RunState): { done: number; total: number; pct: number; mastered: number } {
  let done = 0, mastered = 0;
  for (const id in st.words) {
    const w = st.words[id];
    done += Math.max(0, Math.min(w.done, w.goal));
    if (w.mastered) mastered++;
  }
  const total = st.goalTotal || 1;
  return { done, total: st.goalTotal, pct: Math.round((done / total) * 100), mastered };
}

/* Words touched but never graded — flushed at session end (graded once). */
export function pendingGrades(st: RunState): RunWord[] {
  const out: RunWord[] = [];
  for (const id in st.words) { const w = st.words[id]; if (w.attempts > 0 && !w.graded) out.push(w); }
  return out;
}
