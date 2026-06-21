/* Auto-translation: offline bundled dictionary first, then an optional
 * online translator. v1 has NO LLM (constraint C2) — the online branch is
 * the monetisation seam (Premium); when `window.claude` is absent it is
 * simply skipped and we degrade to "none" for unknown words. */
import { BUNDLED_DICT } from "../data/seed";
import { ARTICLE_RE } from "./scoring";
import { llmFeaturesEnabled } from "./premium";

export async function translateWord(text: string, from: string, to: string) {
  const key = (text || "").toLowerCase().trim();
  if (!key) return { text: "", source: "none" };
  // offline dictionary first (instant for known words)
  if (from === "en" && to === "de" && BUNDLED_DICT.en2de[key])
    return { text: BUNDLED_DICT.en2de[key], source: "dict" };
  if (from === "de" && to === "en") {
    const bare = key.replace(ARTICLE_RE, "");
    if (BUNDLED_DICT.de2en[bare])
      return { text: BUNDLED_DICT.de2en[bare], source: "dict" };
  }
  // online translator (Premium seam — gated off in v1)
  try {
    if (!llmFeaturesEnabled()) throw new Error("no-llm");
    const claude = (window as any).claude;
    const langName = ({ en: "English", fr: "French", de: "German" } as any)[to] || "German";
    const prompt =
      `Translate this single school-vocabulary word or short phrase into ${langName}. ` +
      `Reply with ONLY the translation — no quotes, no notes, no alternatives. ` +
      `If it is a German noun, include the article (der/die/das). ` +
      `Word: "${text}"`;
    const res = await claude.complete(prompt);
    const cleaned = (res || "").trim().split("\n")[0].replace(/^["'“”]+|["'“”.]+$/g, "").trim();
    if (cleaned) return { text: cleaned, source: "online" };
  } catch (e) { /* offline / unavailable */ }
  return { text: "", source: "none" };
}
