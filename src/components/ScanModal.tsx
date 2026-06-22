import { useState, useEffect, useRef } from "react";
import Tesseract from "tesseract.js";
import { Icon } from "../ui/Icon";
import { Ring } from "../ui/Ring";
import { PAIRS } from "../lib/pairs";
import { extractJson, heuristicPairs } from "../lib/parse";
import { llmFeaturesEnabled } from "../lib/premium";

/* ===================================================================
 * scan.jsx — scan a printed vocab list from a photo.
 * Photo -> on-device OCR (Tesseract) -> smart parse (Claude, with a
 * heuristic fallback) -> editable review -> import.
 * Scoped to the active language pair via the `pair` prop.
 * =================================================================== */

async function structurePairs(rawText, P) {
  const fname = P.foreignLabel;
  try {
    const prompt =
      `Below is raw OCR text from a photo of a school ${fname}\u2013German vocabulary list. ` +
      "Extract the vocabulary pairs.\n" +
      'Return ONLY a JSON array, no prose, like: [{"foreign":"dog","de":"der Hund"}].\n' +
      `Rules:\n- "foreign" is the ${fname} word; "de" is the German word.\n` +
      "- German nouns must include their article (der/die/das).\n" +
      "- If a row shows only one language, translate and fill the other.\n" +
      "- Skip headings, page numbers, dates and OCR noise.\n" +
      'OCR text:\n"""' + rawText + '"""';
    if (!llmFeaturesEnabled()) throw new Error("no-llm");
    const claude = (window as any).claude;
    const res = await claude.complete(prompt);
    const json = extractJson(res);
    if (json && json.length)
      return json.map((p: any) => ({ fgn: (p.foreign || p.fgn || p.en || p.fr || "").trim(), de: (p.de || "").trim() })).filter((p: any) => p.fgn || p.de);
  } catch (e) { /* fall through */ }
  return heuristicPairs(rawText);
}

export function ScanModal({ open, onClose, onImport, onScanned, pair }) {
  const P = PAIRS[pair] || PAIRS["en-de"];
  const [stage, setStage] = useState("capture");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { if (open) { setStage("capture"); setProgress(0); setPreview(null); setStatus(""); } }, [open]);
  if (!open) return null;

  // OCR + structure, then hand the rows to the shared ReviewModal (via onImport).
  // Latin rows keep grundform (from the scanned word); lernform/wortart are
  // filled in the review. On OCR failure we open the review with one empty row.
  const run = async (file) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setStage("processing");
    setStatus("Reading the page…"); setProgress(0.03);
    let text = "";
    try {
      if (typeof Tesseract === "undefined") throw new Error("ocr-unavailable");
      const logger = (m) => { if (m.status === "recognizing text") setProgress(0.05 + m.progress * 0.7); };
      let r;
      try { r = await Tesseract.recognize(file, P.ocr, { logger }); }
      catch (e) { r = await Tesseract.recognize(file, P.ocr.split("+")[0], { logger }); }
      text = (r && r.data && r.data.text) || "";
    } catch (e) {
      // OCR unavailable → open the paste flow empty so the user can paste/KI-route
      if (onScanned) { onScanned(""); return; }
      onImport([{ fgn: "", de: "" }]); return;
    }
    setProgress(1); setStatus("");
    // V12: hand the raw OCR text to the paste / KI-prompt flow (one tap), labelled
    // as a rough draft. Falls back to heuristic auto-parse if no onScanned handler.
    if (onScanned) { onScanned(text); return; }
    setStatus("Sorting into word pairs…"); setProgress(0.82);
    const result = await structurePairs(text, P);
    onImport(result.length ? result : [{ fgn: "", de: "" }]);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620, width: "92vw" }}>
        <div className="modal-head">
          <div className="modal-title"><Icon name="camera" size={18} style={{ verticalAlign: "-3px", marginRight: 8 }} />Scan a vocab list <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>· {P.foreignLabel} ⇄ Deutsch</span></div>
          <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        {stage === "capture" && (
          <div style={{ padding: "8px 4px 4px" }}>
            <button className="scan-drop" onClick={() => fileRef.current.click()}>
              <div className="scan-cam"><Icon name="camera" size={26} /></div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Take or choose a photo</div>
              <div className="muted" style={{ fontSize: 13.5, marginTop: 4, textAlign: "center", maxWidth: 360 }}>
                Point your camera at a printed vocabulary list. Clear, well-lit, two-column lists work best.
              </div>
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
              onChange={(e) => { run(e.target.files[0]); e.target.value = ""; }} />
            <div className="faint" style={{ fontSize: 12, marginTop: 12, display: "flex", gap: 7, alignItems: "center", justifyContent: "center" }}>
              <Icon name="sparkle" size={13} /> Text recognition runs privately on your device. You'll review everything before it's added.
            </div>
          </div>
        )}

        {stage === "processing" && (
          <div style={{ padding: "26px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            {preview && <img src={preview} alt="" style={{ maxHeight: 180, borderRadius: 12, boxShadow: "var(--shadow)" }} />}
            <Ring value={progress} size={56} stroke={6} />
            <div style={{ fontWeight: 600 }}>{status}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>This can take a moment the first time.</div>
          </div>
        )}
      </div>
    </div>
  );
}
