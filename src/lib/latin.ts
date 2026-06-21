/* Latin learning forms (Phase 2).
 *
 * Latin is learned via Stammformen, not a single foreign string:
 *   Nomen:     grundform = Nominativ;        lernform = "canis, canis, m."
 *   Verb:      grundform = 1. Pers. Sg.;     lernform = "video, videre, vidi, visum"
 *   Adjektiv:  grundform = m-Form;           lernform = "ruber, rubra, rubrum"
 *
 * Modes (runtime setting `latinMode`, applies to the la-de pair):
 *   L2 (default): card shows the full lernform; only the grundform is asked.
 *   L3:           the full lernform is asked (order/spacing-tolerant scoring).
 */
import type { LatinMode, ScoreOpts, ScoreResult, Word } from "./types";
import { scoreAnswer } from "./scoring";

export const latinHeadword = (w: Word) => (w.grundform || w.lernform || "").trim();
export const latinReveal = (w: Word) => (w.lernform || w.grundform || "").trim();
export const latinAnswerTarget = (w: Word, mode: LatinMode) =>
  (mode === "L3" ? (w.lernform || w.grundform || "") : (w.grundform || "")).trim();

const tokenize = (s: string) => (s || "").split(/[,;]+/).map((t) => t.trim()).filter(Boolean);

/* L3 scoring: compare the typed Stammformen against the lernform,
 * tolerant of order and spacing, with per-token near-miss/accent credit.
 * The diff arrays are rendered against the canonical lernform. */
export function scoreLatinForm(user: string, lernform: string, opts?: ScoreOpts): ScoreResult {
  opts = opts || {};
  const lenient = opts.lenientCase !== false;
  const norm = (t: string) => { const x = t.trim().replace(/\s+/g, " "); return lenient ? x.toLowerCase() : x; };

  // Base result carries the character diff against the canonical form.
  // articleMode optional → Latin never triggers the der/die/das branch.
  const base = scoreAnswer(user, lernform, { ...opts, articleMode: "optional" });
  const u = (user || "").trim();
  if (!u) return { ...base, score: 0, verdict: "wrong", note: "No answer", errorType: null };

  const ut = tokenize(user).map(norm);
  const ct = tokenize(lernform).map(norm);
  if (!ct.length) return base;

  const sortKey = (a: string[]) => [...a].sort().join("");
  if (ut.length === ct.length && sortKey(ut) === sortKey(ct)) {
    return { ...base, score: 1, verdict: "correct", note: "", errorType: null };
  }

  // Greedy per-token match (accent/typo tolerant) for partial credit.
  const remaining = [...ct];
  let matched = 0;
  for (const tok of ut) {
    const idx = remaining.findIndex((c) => {
      const r = scoreAnswer(tok, c, { ...opts, articleMode: "optional" });
      return r.verdict === "correct" || r.verdict === "almost";
    });
    if (idx >= 0) { matched++; remaining.splice(idx, 1); }
  }
  const frac = matched / ct.length;
  if (opts.acceptPartial !== false && frac >= 0.5) {
    const missing = ct.length - matched;
    const note = missing > 0
      ? `Fast — ${missing} Stammform${missing === 1 ? "" : "en"} fehlt oder stimmt nicht`
      : "Fast — Schreibweise der Stammformen prüfen";
    return { ...base, score: Math.max(0.35, Math.min(0.8, frac)), verdict: "almost", note, errorType: "typo" };
  }
  return { ...base, score: 0, verdict: "wrong", note: "Stammformen nochmal prüfen", errorType: "wrong" };
}
