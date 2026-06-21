/* Pronunciation via the Web Speech API. Capability-aware callers should
 * check for a voice before showing the audio control (Phase 1/2). */
export function speak(text: string, lang: string) {
  try {
    const clean = (text || "").replace(/^(der|die|das)\s+/i, (m) => m); // keep article
    const u = new SpeechSynthesisUtterance(clean);
    const locale = ({ de: "de-DE", fr: "fr-FR", en: "en-US" } as any)[lang] || "en-US";
    u.lang = locale;
    u.rate = 0.92;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((vo) => vo.lang && vo.lang.toLowerCase().startsWith(locale.slice(0, 2)));
    if (v) u.voice = v;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return u;
  } catch (e) { return null; }
}
