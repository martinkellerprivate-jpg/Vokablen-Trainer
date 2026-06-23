/* Light shared types for Phase 0. Kept pragmatic (strict off) so the
 * extraction stays parity-focused; tighten in a later pass. */

export type PairId = "en-de" | "fr-de" | "la-de";
export type Verdict = "correct" | "almost" | "wrong";
export type Wortart = "Nomen" | "Verb" | "Adjektiv" | "Zahlwort" | "Adverb";
export type LatinMode = "L2" | "L3";
export type ErrorType = "article" | "accent" | "typo" | "wrong" | null;
export type TipsFrequency = "off" | "occasional" | "frequent";
export type Skin = "paper" | "dark" | "fresh";
export type CardStyle = "ruled" | "plain" | "indexcard";
export type CardFont = "serif" | "arial" | "handwriting";

export interface Pair {
  id: PairId;
  foreign: string;        // word field key for the foreign side (en / fr)
  foreignLabel: string;
  nativeLabel: string;
  short: string;
  ocr: string;            // Tesseract language pack
  tts?: boolean;          // capability flag (Phase 1/2 seam — unused in P0)
}

export interface Word {
  id: string;
  pair: PairId;
  de: string;             // native side is always German
  en?: string;
  fr?: string;
  la?: string;            // generic Latin string (rarely used; forms below preferred)
  // Latin learning forms (only on la-de words)
  grundform?: string;     // Nominativ / 1. Pers. Sg. / m-Form
  lernform?: string;      // full stammformen, e.g. "video, videre, vidi, visum"
  wortart?: Wortart;
  topic?: string;
  lists?: string[];
  review?: boolean;
  source?: "seed" | "manual" | "import" | "none" | string;
  [key: string]: any;     // allows w[fk(pair)] and future form fields
}

export interface HistoryEntry { score: number; verdict: Verdict; ts: number; errorType?: ErrorType; }

export interface Stat {
  seen: number;
  scoreSum: number;
  correctCount: number;
  almostCount: number;
  wrongCount: number;
  firstTry: boolean;
  ema: number;
  streak: number;
  lastTs?: number;
  history: HistoryEntry[];
  fsrs?: import("./fsrs").SerializedCard;   // V8 — FSRS scheduler state (lazy warm-start)
}

export interface Meta {
  lastDate: string | null;
  streak: number;
  todayCount: number;
  newToday?: number;
  dailyGoal?: number;
  totalReviews: number;
}

export interface ListT {
  id: string;
  name: string;
  pair: PairId;
  createdAt: number;
}

// V9: lessons are ALWAYS static snapshots (a fixed set of word ids).
export interface Lesson {
  id: string;
  name: string;
  pair: PairId;
  members: string[];                  // the fixed snapshot of word ids
  createdAt?: number;
  updatedAt?: number;
  dueDate?: number;                   // optional exam deadline (V15)
  origin?: string;                    // provenance label only (e.g. "Liste: Tiere"), no auto-sync
  // legacy (pre-V9) — tolerated on read, migrated to members on load:
  kind?: string;
  source?: { type: "list" | "topic"; ref: string };
}

export interface DiffChar {
  ch: string;
  status: "ok" | "wrong" | "missing" | "extra";
}

export interface ScoreResult {
  score: number;
  verdict: Verdict;
  note: string;
  targetDiff: DiffChar[];
  userDiff: DiffChar[];
  errorType?: ErrorType;
}

export interface ScoreOpts {
  lenientCase?: boolean;
  strictAccents?: boolean;
  articleMode?: "optional" | "required-full" | "required-partial";
  acceptPartial?: boolean;
}

export interface Settings {
  mode: string;
  choicesCount: number;
  autoAudio: boolean;
  dailyGoal: number;
  newPerDay: number;
  targetRetention?: number;                            // V13 — THE retention source (0.85/0.90/0.95)
  lernIntensity?: "locker" | "normal" | "intensiv";   // V8 — UI shell that writes targetRetention
  missWeight?: number;       // V8: deprecated (FSRS internal), kept optional for old data
  spacingGap?: number;       // V8: deprecated
  masteryCorrect?: number;   // V8: deprecated
  lenientCase: boolean;
  strictAccents: boolean;
  articleMode: "optional" | "required-full" | "required-partial";
  acceptPartial: boolean;
  latinMode: LatinMode;   // L2 (ask Grundform) | L3 (ask full Lernform)
  tipsFrequency: TipsFrequency;
  skin: Skin;
  cardStyle: CardStyle;
  cardFont: CardFont;
  direction: "f2n" | "n2f";
  pair: PairId;
  selectedLists: string[];
  statLists: string[];
  practiceSel: string;     // "lesson:<id>" | "smart:due" | "smart:tricky" | ""
  // F-SETTINGS-ADVANCED: per-user CFG overrides (read by fsrs.configure). All optional;
  // undefined falls back to the named DEFAULTS in fsrs.ts.
  S1?: number; S2?: number; MIN_REPS?: number; D_LEECH?: number; LAPSE_LEECH?: number; PUFFER?: number;
  examRetention?: number; examWindowDays?: number; learningSpeed?: number;
  autoFit?: boolean;       // Auto-Anpassung (Default false; WASM-Fit deferred)
  [key: string]: any;
}
