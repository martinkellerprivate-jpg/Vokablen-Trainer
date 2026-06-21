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
  missWeight: number;
  spacingGap: number;
  masteryCorrect: number;
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
  [key: string]: any;
}
