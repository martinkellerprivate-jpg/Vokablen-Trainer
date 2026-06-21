/* Rule-based insight layer (Phase 6, NO AI). Turns the existing stats into
 * plain-language strengths + next steps. Wording is growth-oriented and
 * actionable (never deficit-labelling) — the learner is a child.
 *
 * Volume gates prevent premature/discouraging statements on thin data.
 * NOTE: errorType is forward-only, so the error-focus insight stays empty
 * until ~ERROR_GATE freshly error-typed attempts have accumulated. */
import type { Stat, Word } from "./types";
import { practiceable, isLatinPair } from "./pairs";
import { isDue, classifyWord } from "./engine";

const TOPIC_GATE = 8;   // min total "seen" within a topic before judging it
const ERROR_GATE = 10;  // min error-typed attempts before naming an error focus
const PAIR_GATE = 12;   // min total "seen" before showing anything at all

export interface Insight { kind: "strength" | "focus" | "step"; tone: "green" | "amber" | "red" | "slate"; text: string; }
export interface InsightReport { enoughData: boolean; items: Insight[]; }

export function buildInsights(vocab: Word[], stats: Record<string, Stat>, pair: string, mc: number): InsightReport {
  const words = vocab.filter((w) => w.pair === pair && practiceable(w));
  const seenTotal = words.reduce((n, w) => n + (stats[w.id]?.seen || 0), 0);
  if (seenTotal < PAIR_GATE) {
    return { enoughData: false, items: [{ kind: "step", tone: "slate",
      text: "Übe noch ein bisschen weiter – dann zeige ich dir hier deine Stärken und woran sich das Üben besonders lohnt." }] };
  }

  const items: Insight[] = [];

  // ---- by topic (strength + gentle focus) ----
  const byTopic: Record<string, { seen: number; score: number }> = {};
  for (const w of words) {
    const s = stats[w.id]; if (!s || !s.seen) continue;
    const t = w.topic || "Sonstiges";
    (byTopic[t] ||= { seen: 0, score: 0 });
    byTopic[t].seen += s.seen; byTopic[t].score += s.scoreSum;
  }
  const topics = Object.entries(byTopic)
    .filter(([, v]) => v.seen >= TOPIC_GATE)
    .map(([t, v]) => ({ t, acc: v.score / v.seen }))
    .sort((a, b) => b.acc - a.acc);
  if (topics.length) {
    const best = topics[0];
    if (best.acc >= 0.7) items.push({ kind: "strength", tone: "green", text: `Stark in „${best.t}" – diese Wörter sitzen schon richtig gut!` });
    const worst = topics[topics.length - 1];
    if (topics.length >= 2 && worst.t !== best.t && worst.acc < 0.6) {
      items.push({ kind: "focus", tone: "amber", text: `Die Wörter aus „${worst.t}" lohnen sich noch zum Wiederholen – mit ein paar Runden klappt das auch.` });
    }
  }

  // ---- by error type (the vocabulary-specific, most useful axis) ----
  const err = { article: 0, accent: 0, typo: 0 };
  let errTotal = 0;
  for (const w of words) {
    for (const h of stats[w.id]?.history || []) {
      if (!h.errorType) continue;
      errTotal++;
      if (h.errorType === "article") err.article++;
      else if (h.errorType === "accent") err.accent++;
      else if (h.errorType === "typo") err.typo++;
    }
  }
  if (errTotal >= ERROR_GATE) {
    const top = (["article", "accent", "typo"] as ("article" | "accent" | "typo")[]).sort((a, b) => err[b] - err[a])[0];
    if (err[top] >= 3) {
      const msg = {
        article: "Die Artikel (der/die/das) sind oft knapp daneben – die lohnen sich zum gezielten Üben, dann hast du sie sicher.",
        accent: isLatinPair(pair) ? "Achte auf die genaue Schreibweise – oft fehlt nur eine Kleinigkeit." : "Achte auf die Umlaute und Akzente – das ist fast richtig, nur ein kleiner Schliff fehlt.",
        typo: "Es schleichen sich Tippfehler ein – schau ruhig nochmal in Ruhe hin, du kannst die Wörter eigentlich.",
      }[top];
      items.push({ kind: "focus", tone: "amber", text: msg });
    }
  }

  // ---- next steps: due refresh + tricky drill ----
  const now = Date.now();
  const due = words.filter((w) => isDue(stats[w.id], now)).length;
  if (due >= 1) items.push({ kind: "step", tone: "amber", text: `${due} ${due === 1 ? "Wort ist" : "Wörter sind"} zum Auffrischen dran – eine kurze Runde hält sie frisch.` });
  const tricky = words.filter((w) => classifyWord(stats[w.id], mc) === "tricky").length;
  if (tricky >= 3) items.push({ kind: "step", tone: "red", text: `Übe gezielt die „Tricky words" (${tricky}) – genau da bringt Üben am meisten.` });

  if (!items.length) items.push({ kind: "strength", tone: "green", text: "Sieht rundum gut aus – mach einfach weiter so!" });

  return { enoughData: true, items };
}
