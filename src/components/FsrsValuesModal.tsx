/* F-SETTINGS-ADVANCED — read-only FSRS values modal.
 * Shows the 19 model weights w[0..18] (user vs. literature), the retention
 * target, the derived thresholds, and a state-aware status line. No fitting
 * happens here (WASM deferred); user weights == literature until a real fit
 * lands, so the two columns are equal by design today. */
import { Icon } from "../ui/Icon";
import { defaultWeights, getCfg, RETENTION } from "../lib/fsrs";
import { fitStatus, totalReviews } from "../lib/reviewlog";

const W_HINT: Record<number, string> = {
  0: "Start-Stabilität (Again)", 1: "Start-Stabilität (Hard)", 2: "Start-Stabilität (Good)", 3: "Start-Stabilität (Easy)",
  4: "Start-Schwierigkeit", 5: "Schwierigkeits-Abfall", 6: "Schwierigkeits-Anstieg",
};

export function FsrsValuesModal({ open, onClose, settings, reviews }: any) {
  if (!open) return null;
  const lit = defaultWeights();
  const user = lit;                       // no custom fit yet (fitActive = false)
  const ret = settings.targetRetention ?? RETENTION;
  const cfg = getCfg();
  const status = fitStatus(reviews || {}, !!settings.autoFit, false);
  const n = totalReviews(reviews || {});

  const Row = ({ k, u, l, hint }: any) => (
    <div className="row" style={{ justifyContent: "space-between", gap: 10, padding: "4px 0", borderBottom: "1px solid var(--line-soft)" }}>
      <span className="faint" style={{ fontSize: 12, flex: "0 0 70px" }}>{k}</span>
      <span className="grow faint" style={{ fontSize: 11.5 }}>{hint || ""}</span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, width: 64, textAlign: "right" }}>{typeof u === "number" ? u.toFixed(3) : u}</span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, width: 64, textAlign: "right", color: "var(--ink-faint)" }}>{typeof l === "number" ? l.toFixed(3) : l}</span>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, maxHeight: "84vh", overflowY: "auto" } as any}>
        <div className="modal-head">
          <div>
            <div className="modal-title">FSRS-Werte</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Nur-Lese-Einblick in das Gedächtnis-Modell.</div>
          </div>
          <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <div className="panel" style={{ padding: "10px 12px", marginBottom: 12 }}>
          <div className={"badge " + (status.kind === "active" ? "green" : status.kind === "ready" ? "amber" : "slate")} style={{ marginBottom: 6 }}>
            <span className="dot" /> Auto-Anpassung: {status.kind === "off" ? "aus" : status.kind === "active" ? "aktiv" : "sammelt"}
          </div>
          <div style={{ fontSize: 13 }}>{status.text}</div>
          <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>Gesammelte Antworten im Verlauf: <b>{n}</b></div>
        </div>

        <div className="panel" style={{ padding: "10px 12px", marginBottom: 12 }}>
          <div className="section-title" style={{ fontSize: 12.5, marginBottom: 6 }}>Abgeleitete Schwellen (aktuell)</div>
          <Row k="Retention" u={`${Math.round(ret * 100)} %`} l="90 %" hint="Behaltensziel" />
          <Row k="S1" u={cfg.S1} l={3} hint="Tage: wackelt→sitzt fast" />
          <Row k="S2" u={cfg.S2} l={14} hint="Tage: sitzt fast→sitzt" />
          <Row k="MIN_REPS" u={cfg.MIN_REPS} l={2} hint="Reps bis nicht mehr „neu“" />
          <Row k="Tempo" u={cfg.learningSpeed} l={1} hint="Lerntempo-Faktor" />
        </div>

        <div className="panel" style={{ padding: "10px 12px" }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <div className="section-title" style={{ fontSize: 12.5 }}>Modell-Gewichte w[0..18]</div>
            <div className="faint" style={{ fontSize: 11 }}>deine · Literatur</div>
          </div>
          {user.map((u: number, i: number) => <Row key={i} k={`w[${i}]`} u={u} l={lit[i]} hint={W_HINT[i]} />)}
          <div className="faint" style={{ fontSize: 11.5, marginTop: 8 }}>
            Solange die Auto-Anpassung keine eigene Feinjustierung gelernt hat, sind „deine“ Werte gleich den
            Literatur-Standardwerten. Das ist normal und gut.
          </div>
        </div>

        <div className="modal-foot" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={onClose}>Schliessen</button>
        </div>
      </div>
    </div>
  );
}
