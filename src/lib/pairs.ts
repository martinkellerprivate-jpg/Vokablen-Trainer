/* Language pairs. Native side is always German; the foreign side is
 * stored on the word under its own key (en / fr).
 *
 * `tts`/`ocr` are capability flags so Phase 1/2 (e.g. Latin: no TTS) can
 * dock without a refactor. In Phase 0 they cause NO visible change — only
 * the existing EN-DE / FR-DE pairs ship, both fully capable. */
import type { Pair, PairId, Word } from "./types";

export const SMART_TRICKY = "__tricky";
export const NATIVE = "de";

export const PAIRS: Record<string, Pair> = {
  "en-de": { id: "en-de", foreign: "en", foreignLabel: "English",  nativeLabel: "Deutsch", short: "EN", ocr: "eng+deu", tts: true },
  "fr-de": { id: "fr-de", foreign: "fr", foreignLabel: "Français", nativeLabel: "Deutsch", short: "FR", ocr: "fra+deu", tts: true },
  "la-de": { id: "la-de", foreign: "la", foreignLabel: "Latein",   nativeLabel: "Deutsch", short: "LA", ocr: "lat",     tts: false },
};

export const fk = (pair: PairId | string) => (PAIRS[pair] || PAIRS["en-de"]).foreign; // foreign field key
export const isLatinPair = (pair: PairId | string) => pair === "la-de";

// A word is practiceable when both sides are present. Latin uses learning
// forms (grundform/lernform) instead of a plain foreign string.
export const practiceable = (w: Word) =>
  !!(w && w.de && (isLatinPair(w.pair) ? (w.grundform || w.lernform) : w[fk(w.pair)]));

/* Per-language capability: which languages have a Web-Speech voice.
 * Latin has none → callers hide/disable the audio control silently. */
const LANG_TTS: Record<string, boolean> = { de: true, en: true, fr: true, la: false };
export const hasTTS = (lang: string) => LANG_TTS[lang] !== false;
