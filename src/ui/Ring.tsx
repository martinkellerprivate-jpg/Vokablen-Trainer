/* SVG progress ring + small tone/percentage helpers. */
export function Ring({ value = 0, size = 30, stroke = 4, color = "var(--amber)", track = "var(--bg-2)" }: any) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset .5s ease" }} />
    </svg>
  );
}

export const toneColor = (tone: string) => (({ green: "var(--green)", amber: "var(--amber)", red: "var(--red)", blue: "var(--blue)", slate: "var(--ink-faint)" } as any)[tone] || "var(--ink)");
export const pct = (n: number) => Math.round(n * 100);
