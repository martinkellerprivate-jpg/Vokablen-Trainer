/* Shows the share code + link after a list has been published. */
import { useState } from "react";
import { Icon } from "../ui/Icon";
import { shareLink, shareCode } from "../sync/share";

export function ShareModal({ open, token, listName, onClose }: { open: boolean; token: string | null; listName: string; onClose: () => void }) {
  const [copied, setCopied] = useState("");
  if (!open || !token) return null;
  const code = shareCode(token);
  const link = shareLink(token);
  const copy = (text: string, which: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(which); setTimeout(() => setCopied(""), 1600); });
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-head">
          <div className="modal-title">„{listName}" teilen</div>
          <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="muted" style={{ fontSize: 13.5, marginBottom: 14, lineHeight: 1.45 }}>
          Wer den Code oder Link öffnet, bekommt eine <b>eigene Kopie</b> der Liste — Änderungen daran wirken sich nicht auf deine Liste aus.
        </div>
        <div className="col" style={{ gap: 12 }}>
          <div>
            <div className="diff-label" style={{ textAlign: "left", marginBottom: 6 }}>Code</div>
            <div className="row" style={{ gap: 8 }}>
              <input className="field" readOnly value={code} onFocus={(e) => e.target.select()} style={{ fontFamily: "var(--mono)" }} />
              <button className="btn" onClick={() => copy(code, "code")}><Icon name={copied === "code" ? "check" : "download"} size={15} /> {copied === "code" ? "Kopiert" : "Kopieren"}</button>
            </div>
          </div>
          <div>
            <div className="diff-label" style={{ textAlign: "left", marginBottom: 6 }}>Link</div>
            <div className="row" style={{ gap: 8 }}>
              <input className="field" readOnly value={link} onFocus={(e) => e.target.select()} />
              <button className="btn" onClick={() => copy(link, "link")}><Icon name={copied === "link" ? "check" : "download"} size={15} /> {copied === "link" ? "Kopiert" : "Kopieren"}</button>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={onClose}>Fertig</button>
        </div>
      </div>
    </div>
  );
}
