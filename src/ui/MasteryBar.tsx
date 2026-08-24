/* FR3-2 — ONE shared distribution bar for the practice card AND Stats.
 * 5 segments (STUFE_ORDER); underneath, a colour-coded legend listing ONLY the
 * levels that actually occur, each as "● count label" in the segment's colour.
 * Labelling segments in place fails on real data — the narrow segments (the
 * interesting ones) collide — so count and label live together in the legend,
 * where colour + order + number make the mapping unambiguous at any width. */
import { STUFE_ORDER } from "../lib/fsrs";

const TONE: Record<string, string> = {
  sitzt: "var(--green)", sitzt_fast: "var(--amber)", sitzt_schlecht: "var(--red)",
  neu: "var(--blue)", noch_nicht_geuebt: "var(--ink-faint)",
};
const LEG: Record<string, string> = {
  sitzt: "sitzt sicher", sitzt_fast: "fast", sitzt_schlecht: "wackelt",
  neu: "neu", noch_nicht_geuebt: "noch nie geübt",
};

export function MasteryBar({ dist, total, onSegment, activeFilter, showLegend = true }:
  { dist: Record<string, number>; total: number; onSegment?: (k: string) => void; activeFilter?: string; showLegend?: boolean }) {
  if (!total) return null;
  const present = STUFE_ORDER.filter((k) => dist[k]);

  return (
    <div className="mbar">
      <div className="mbar-total">{total} {total === 1 ? "Wort" : "Wörter"} insgesamt</div>
      <div className="mbar-band">
        {present.map((k) => (
          <i key={k} className={onSegment ? "clickable" : ""} onClick={onSegment ? () => onSegment(k) : undefined}
            style={{ flex: dist[k], background: TONE[k], opacity: activeFilter && activeFilter !== k ? 0.35 : 1 }}
            title={`${LEG[k]}: ${dist[k]}`} />
        ))}
      </div>
      {showLegend && (
        <div className="mbar-legend">
          {present.map((k) => (
            <span key={k} className={"mbar-leg" + (onSegment ? " clickable" : "")} style={{ color: TONE[k], opacity: activeFilter && activeFilter !== k ? 0.45 : 1 }}
              onClick={onSegment ? () => onSegment(k) : undefined}>
              <span className="mbar-leg-dot" style={{ background: TONE[k] }} />
              <b>{dist[k]}</b> {LEG[k]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* FR3-2 — Stats trend: stacked daily snapshots (honest "baut sich auf"). */
export function MasteryTrend({ days }: { days: { d: string; c: number[] }[] }) {
  const recent = days.slice(-21);
  return (
    <div className="mtrend">
      <div className="mtrend-head">Verlauf <span className="faint">· baut sich auf — füllt sich ab jetzt</span></div>
      {recent.length === 0 ? (
        <div className="muted" style={{ fontSize: 12.5 }}>Noch keine Verlaufsdaten. Ab heute wird täglich ein Schnappschuss gespeichert.</div>
      ) : (
        <div className="mtrend-cols">
          {recent.map((day) => {
            const tot = day.c.reduce((a, b) => a + b, 0) || 1;
            return (
              <div key={day.d} className="mtrend-col" title={day.d}>
                {STUFE_ORDER.map((k, i) => day.c[i] ? <i key={k} style={{ height: (day.c[i] / tot) * 100 + "%", background: TONE[k] }} /> : null)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
