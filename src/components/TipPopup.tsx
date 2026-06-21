/* A single, dismissible study tip shown at a natural pause in Practice
 * (Phase 6). Never appears mid-answer — Practice only sets it after a card
 * has been scored. */
import { Icon } from "../ui/Icon";

export function TipPopup({ tip, onClose }: { tip: { h: string; b: string } | null; onClose: () => void }) {
  if (!tip) return null;
  return (
    <div className="tip-pop">
      <div className="tip-pop-num"><Icon name="hint" size={16} /></div>
      <div className="grow">
        <div className="tip-h">{tip.h}</div>
        <div className="tip-b">{tip.b}</div>
      </div>
      <button className="icon-btn" style={{ width: 30, height: 30 }} title="Schließen" onClick={onClose}><Icon name="x" size={14} /></button>
    </div>
  );
}
