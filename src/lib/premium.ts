/* Monetisation seam (Phase 7) — architecture only, nothing is gated yet.
 *
 * The paywall cut (for when it's introduced, without a rebuild):
 *   FREE    : manual entry · paste · CSV/Excel import · photo-scan OCR · cloud sync
 *   PREMIUM : LLM auto-translation + LLM scan structuring (the features that
 *             actually cost the operator money)
 *
 * In v1 isPremium() is always false AND no LLM endpoint is wired (constraint
 * C2), so the premium paths stay inert. The single check point below is where
 * the entitlement would later be turned on. */
export function isPremium(): boolean {
  return false;
}

/* True only when the premium LLM features are BOTH entitled and available. */
export function llmFeaturesEnabled(): boolean {
  return isPremium() && typeof (window as any).claude?.complete === "function";
}
