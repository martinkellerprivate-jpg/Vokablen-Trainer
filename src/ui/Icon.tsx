/* Shared icon set — inline stroke SVG, currentColor, viewBox 0 0 24 24. */
const ICONS: Record<string, string> = {
  volume: "M11 5 6 9H2v6h4l5 4V5z M15.5 8.5a5 5 0 0 1 0 7 M18.5 5.5a9 9 0 0 1 0 13",
  hint: "M9 18h6 M10 22h4 M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z",
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18 M6 6l12 12",
  arrowRight: "M5 12h14 M13 6l6 6-6 6",
  swap: "M16 3l4 4-4 4 M20 7H8 M8 21l-4-4 4-4 M4 17h12",
  flame: "M12 2c1 4-2 5-2 8a4 4 0 0 0 8 0c0-1-1-3-2-4 0 2-1 2.5-2 2 .5-2-1-5-2-6z M12 22a6 6 0 0 1-6-6c0-2 1-4 2-5 0 2 1 3 2 3-1-3 1-6 4-8-1 5 4 6 4 10a6 6 0 0 1-6 6z",
  target: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0 M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0",
  search: "M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M21 21l-4.3-4.3",
  plus: "M12 5v14 M5 12h14",
  trash: "M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6",
  edit: "M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  upload: "M12 16V4 M7 9l5-5 5 5 M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  download: "M12 4v12 M7 11l5 5 5-5 M4 18v0a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2",
  sparkle: "M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z M19 14l.7 1.8 1.8.7-1.8.7L19 19l-.7-1.8L16.5 16.5l1.8-.7z",
  cards: "M3 8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M8 6V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-1",
  camera: "M4 8a2 2 0 0 1 2-2h2l1-2h6l1 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M12 11m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  expand: "M8 3H5a2 2 0 0 0-2 2v3 M21 8V5a2 2 0 0 0-2-2h-3 M16 21h3a2 2 0 0 0 2-2v-3 M3 16v3a2 2 0 0 0 2 2h3",
  help: "M12 17h.01 M9.1 9a3 3 0 1 1 4.6 3c-.8.6-1.7 1.2-1.7 2.5 M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z",
  chart: "M3 3v18h18 M7 14v4 M12 9v9 M17 5v13",
  clock: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M12 7v5l3 2",
  calendar: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M4 9h16 M8 3v4 M16 3v4",
  refresh: "M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15 6.7L3 16 M3 21v-5h5",
  filter: "M3 5h18 M6 12h12 M10 19h4",
  swatch: "M2 12h20 M12 2v20",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .34 1.88l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.7 1.7 0 0 0-2.88 1.2V21a2 2 0 1 1-4 0v-.08a1.7 1.7 0 0 0-2.88-1.2l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05A1.7 1.7 0 0 0 4.6 15H4.5a2 2 0 1 1 0-4h.08a1.7 1.7 0 0 0 1.2-2.88l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05A1.7 1.7 0 0 0 11 4.6V4.5a2 2 0 1 1 4 0v.08a1.7 1.7 0 0 0 2.88 1.2l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05A1.7 1.7 0 0 0 19.4 9v.1a1.7 1.7 0 0 0 1.5 1.4h.1a2 2 0 1 1 0 4h-.08a1.7 1.7 0 0 0-1.62 1z",
};

export function Icon({ name, size = 18, fill = false, stroke = 1.8, style }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
      strokeLinejoin="round" style={style} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}
