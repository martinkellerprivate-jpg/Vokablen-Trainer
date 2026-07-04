/* FR3-2 — ONE shared distribution bar for the practice card AND Stats.
 * 5 segments (STUFE_ORDER), each number CENTERED under its segment midpoint with
 * NO connector line; a too-narrow segment's number drops to a second tier and is
 * linked by a thin vertical line (measured in px via ResizeObserver). Legend
 * below (colour + word). Same component, same look everywhere. */
import { useRef, useState, useLayoutEffect } from "react";
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  if (!total) return null;

  // segment midpoints (fraction 0..1) + per-number collision test in px
  let cum = 0; const segs: any[] = [];
  for (const k of STUFE_ORDER) {
    const n = dist[k] || 0; if (!n) continue;
    const share = n / total; const mid = cum + share / 2; cum += share;
    const segPx = share * w;
    const needPx = String(n).length * 7 + 14;   // digits + breathing room
    segs.push({ k, n, mid, tier2: w > 0 && segPx < needPx });
  }
  const anyTier2 = segs.some((s) => s.tier2);

  return (
    <div className="mbar">
      <div className="mbar-total">{total} {total === 1 ? "Wort" : "Wörter"} insgesamt</div>
      <div className="mbar-body" ref={wrapRef}>
        <div className="mbar-band">
          {STUFE_ORDER.map((k) => dist[k] ? (
            <i key={k} className={onSegment ? "clickable" : ""} onClick={onSegment ? () => onSegment(k) : undefined}
              style={{ flex: dist[k], background: TONE[k], opacity: activeFilter && activeFilter !== k ? 0.35 : 1 }}
              title={`${LEG[k]}: ${dist[k]}`} />
          ) : null)}
        </div>
        <div className="mbar-nums" style={{ height: anyTier2 ? 34 : 18 }}>
          {segs.map((s) => (
            <div key={s.k} className={"mbar-num" + (s.tier2 ? " tier2" : "")} style={{ left: s.mid * 100 + "%", color: TONE[s.k] }}>
              {s.tier2 && <span className="mbar-conn" />}
              <b>{s.n}</b>
            </div>
          ))}
        </div>
      </div>
      {showLegend && (
        <div className="mbar-legend">
          {STUFE_ORDER.map((k) => <span key={k} className="mbar-leg"><span className="dot" style={{ background: TONE[k] }} />{LEG[k]}</span>)}
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
