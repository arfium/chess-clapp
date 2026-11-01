// Draws the review's verdict marks into src/assets/verdict/*.svg.
// One family: a flat disc standing on a darker lip, a white glyph casting a short shadow
// in the disc's own darker shade. Every shape is built here, on a 64-unit grid.
// usage: node scripts/build-verdicts.mjs

import { writeFileSync } from "node:fs";

const OUT = new URL("../src/assets/verdict/", import.meta.url);

/** A colour mixed toward black by `k` (0–1). */
const shade = (hex, k) =>
  "#" +
  [1, 3, 5]
    .map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k)).toString(16).padStart(2, "0"))
    .join("");

// Each glyph is drawn around (0, 0), about 38 units tall, then placed with at().
const at = (x, y, s, body) => `<g transform="translate(${x} ${y}) scale(${s})">${body}</g>`;

const bang = (c) =>
  `<rect x="-4.6" y="-18.8" width="9.2" height="25" rx="2.6" fill="${c}"/>` +
  `<rect x="-4.6" y="10.2" width="9.2" height="8.6" rx="2.4" fill="${c}"/>`;

const query = (c) =>
  `<path d="M-9 -8.5C-9 -15 -4.5 -18.5 .5 -18.5C6.5 -18.5 10 -14.5 10 -9.5C10 -4.5 6.5 -2.5 3.5 -.5C1 1 .3 2.5 .3 5.5" ` +
  `fill="none" stroke="${c}" stroke-width="8.6" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<rect x="-4" y="10.2" width="8.6" height="8.6" rx="2.4" fill="${c}"/>`;

function star(c) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 8.4 : 19;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`);
  }
  return `<path d="M${pts.join("L")}Z" fill="${c}" stroke="${c}" stroke-width="3" stroke-linejoin="round"/>`;
}

const check = (c) =>
  `<path d="M-12.5 1L-4 9.5L13 -9" fill="none" stroke="${c}" stroke-width="8.6" stroke-linecap="round" stroke-linejoin="round"/>`;

const thumb = (c) =>
  `<rect x="-18" y="-3" width="8" height="20" rx="2" fill="${c}"/>` +
  `<path d="M-7 -3L-1 -15C.5 -19 3 -20 5 -19C7.5 -18 8 -15 7 -11L5.5 -5H13.5C17 -5 18 -2 17.5 1L15.5 13C15 16 13 17 10.5 17H-7Z" ` +
  `fill="${c}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>`;

const book = (c) =>
  `<path d="M-1.6 -11.5C-6 -15 -12 -15.6 -18.5 -13.6V13.4C-12 11.4 -6 12 -1.6 15Z" fill="${c}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>` +
  `<path d="M1.6 -11.5C6 -15 12 -15.6 18.5 -13.6V13.4C12 11.4 6 12 1.6 15Z" fill="${c}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>`;

// [disc colour, glyph placed on the 64 grid]
const MARKS = {
  brilliant: ["#21B3A4", (c) => at(24.6, 32, 1, bang(c)) + at(39.4, 32, 1, bang(c))],
  great: ["#5A8FCB", (c) => at(32, 32, 1, bang(c))],
  best: ["#6FAE3F", (c) => at(32, 33.4, 1, star(c))],
  excellent: ["#8CBA48", (c) => at(31, 32, 1, thumb(c))],
  good: ["#93AE87", (c) => at(32, 32.5, 1, check(c))],
  book: ["#A98762", (c) => at(32, 31.5, 1, book(c))],
  inaccuracy: ["#EFB937", (c) => at(24, 33.2, 0.8, query(c)) + at(42, 32, 0.8, bang(c))],
  mistake: ["#EC8C35", (c) => at(32, 33.6, 1, query(c))],
  blunder: ["#D8433C", (c) => at(21.4, 33.2, 0.72, query(c)) + at(42.6, 33.2, 0.72, query(c))],
};

for (const [name, [disc, glyph]] of Object.entries(MARKS)) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
    `<circle cx="32" cy="33.6" r="29" fill="${shade(disc, 0.24)}"/>` +
    `<circle cx="32" cy="31.4" r="29" fill="${disc}"/>` +
    `<g transform="translate(0 2.4)">${glyph(shade(disc, 0.3))}</g>` +
    glyph("#FFFFFF") +
    `</svg>\n`;
  writeFileSync(new URL(name + ".svg", OUT), svg);
}
console.log("wrote", Object.keys(MARKS).length, "marks to src/assets/verdict/");
