/* Generates PWA icons from the brand "L" mark. Run: node scripts/gen-icons.mjs */
import sharp from "sharp";
import { mkdirSync } from "node:fs";

mkdirSync("public/icons", { recursive: true });

// Full-bleed dark-ink tile with a cream serif "L" (maskable-safe: art centred).
const svg = (rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 96 : 0}" fill="#322d26"/>
  <text x="256" y="368" font-family="Georgia, 'Times New Roman', serif" font-size="330" font-weight="700" fill="#fffdf8" text-anchor="middle">L</text>
</svg>`;

const jobs = [
  { file: "icon-192.png", size: 192, rounded: true },
  { file: "icon-512.png", size: 512, rounded: true },
  { file: "icon-maskable-512.png", size: 512, rounded: false },
  { file: "apple-touch-icon.png", size: 180, rounded: true },
];

for (const j of jobs) {
  await sharp(Buffer.from(svg(j.rounded))).resize(j.size, j.size).png().toFile("public/icons/" + j.file);
  console.log("wrote public/icons/" + j.file);
}
