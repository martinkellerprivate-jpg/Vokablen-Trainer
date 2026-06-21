/* Scoring engine: text normalisation, Levenshtein, char-diff alignment,
 * and scoreAnswer (article 3-way, accent/near-miss partial credit, diff). */
import type { ScoreOpts, ScoreResult } from "./types";

/* ---- text helpers ------------------------------------------------ */
export const ARTICLE_RE = /^(der|die|das|le|la|les|un|une|des)\s+/i;
export const normExact = (s: string) => (s || "").toLowerCase().trim().replace(/\s+/g, " ");
export const stripArticle = (s: string) => (s || "").replace(ARTICLE_RE, "").trim();
export const hasArticle = (s: string) => ARTICLE_RE.test((s || "").trim());

export function levenshtein(a: string, b: string) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return dp[m][n];
}

/* Align two strings (lowercased) and return ops referencing indices. */
export function align(a: string, b: string) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  const ops: { type: string; ai: number; bi: number }[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      ops.push({ type: a[i - 1] === b[j - 1] ? "eq" : "sub", ai: i - 1, bi: j - 1 });
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ type: "del", ai: i - 1, bi: -1 }); i--;
    } else {
      ops.push({ type: "ins", ai: -1, bi: j - 1 }); j--;
    }
  }
  return ops.reverse();
}

/* Score a user answer against the correct one.
 * opts: { lenientCase, strictAccents, articleMode, acceptPartial }
 * Returns { score 0..1, verdict, note, targetDiff[], userDiff[] } */
export function scoreAnswer(user: string, correct: string, opts?: ScoreOpts): ScoreResult {
  opts = opts || {};
  const lenientCase = opts.lenientCase !== false;
  const strictAccents = !!opts.strictAccents;
  const articleMode = opts.articleMode || "required-partial";
  const acceptPartial = opts.acceptPartial !== false;

  const userOrig = (user || "").trim();
  const corrOrig = (correct || "").trim();
  const norm = (s: string) => { const x = (s || "").trim().replace(/\s+/g, " "); return lenientCase ? x.toLowerCase() : x; };
  const fold = (s: string) => norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const ue = norm(userOrig);
  const ce = norm(corrOrig);

  // Character diff for display (always computed, on lowercased strings)
  const ops = align(ce.toLowerCase(), ue.toLowerCase());
  const targetDiff: any[] = [];
  const userDiff: any[] = [];
  for (const op of ops) {
    if (op.type !== "ins") {
      targetDiff.push({
        ch: corrOrig[op.ai],
        status: op.type === "eq" ? "ok" : op.type === "sub" ? "wrong" : "missing",
      });
    }
    if (op.type !== "del") {
      userDiff.push({
        ch: userOrig[op.bi],
        status: op.type === "eq" ? "ok" : op.type === "sub" ? "wrong" : "extra",
      });
    }
  }
  const finalize = (r: ScoreResult): ScoreResult => (!acceptPartial && r.verdict === "almost") ? { ...r, score: 0, verdict: "wrong" } : r;

  if (!ue) return { score: 0, verdict: "wrong", note: "No answer", targetDiff, userDiff, errorType: null };

  // Exact
  if (ue === ce) return { score: 1, verdict: "correct", note: "", targetDiff, userDiff, errorType: null };

  // Article (der/die/das …): exact already handled above
  const cNoArt = norm(stripArticle(corrOrig));
  const uNoArt = norm(stripArticle(userOrig));
  if (hasArticle(corrOrig) && cNoArt && uNoArt === cNoArt) {
    if (articleMode === "optional")
      return { score: 1, verdict: "correct", note: "", targetDiff, userDiff, errorType: null };
    if (articleMode === "required-full")
      return { score: 0, verdict: "wrong", note: hasArticle(userOrig) ? "Wrong article" : "The article is missing", targetDiff, userDiff, errorType: "article" };
    const note = hasArticle(userOrig) ? "Wrong article — the rest is right" : "Almost! The article is missing";
    return { score: 0.8, verdict: "almost", note, targetDiff, userDiff, errorType: "article" }; // required-partial
  }

  // Umlauts / accents only
  if (!strictAccents && fold(userOrig) === fold(corrOrig)) {
    return finalize({ score: 0.8, verdict: "almost", note: "Mind the umlauts / accents", targetDiff, userDiff, errorType: "accent" });
  }

  // Near miss (typos)
  const dist = levenshtein(ce, ue);
  const maxLen = Math.max(ce.length, ue.length) || 1;
  const sim = 1 - dist / maxLen;
  const tol = Math.max(1, Math.round(ce.length * 0.34));
  if (dist <= tol && sim >= 0.5) {
    const score = Math.max(0.35, Math.min(0.8, sim));
    return finalize({ score, verdict: "almost", note: "So close — check the spelling", targetDiff, userDiff, errorType: "typo" });
  }

  return { score: 0, verdict: "wrong", note: "Not quite", targetDiff, userDiff, errorType: "wrong" };
}
