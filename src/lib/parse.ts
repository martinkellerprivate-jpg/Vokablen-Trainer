/* Heuristic parsing of raw text into {fgn, de} pairs — shared by the photo
 * scan (Tesseract fallback) and, in Phase 5, the paste/clipboard flow. */
export function extractJson(text: string): any[] | null {
  if (!text) return null;
  let t = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = t.indexOf("["), b = t.lastIndexOf("]");
  if (a === -1 || b === -1) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}

export function heuristicPairs(raw: string) {
  const out: { fgn: string; de: string }[] = [];
  (raw || "").split(/\r?\n/).forEach((line) => {
    const s = line.trim();
    if (!s || s.length < 2) return;
    if (/^(unit|lesson|page|seite|vokabel|words?|english|deutsch|german|fran)\b/i.test(s) && !/[-–—:|\t]/.test(s)) return;
    const parts = s.split(/\s*[\t:|–—-]\s*|\s{2,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) out.push({ fgn: parts[0], de: parts.slice(1).join(" ") });
    else if (parts.length === 1) out.push({ fgn: parts[0], de: "" });
  });
  return out;
}
