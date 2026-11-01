//! sRGB hex ⇄ OKLCH, just enough to derive a board's frame from its own squares: the
//! frame is the dark square taken down in lightness, so every board theme gets a frame
//! that belongs to it without a second hand-picked colour per theme.

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function hexToOklch(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = lin(((n >> 16) & 255) / 255);
  const g = lin(((n >> 8) & 255) / 255);
  const b = lin((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180) / Math.PI];
}

export function oklchCss([L, C, H]: [number, number, number], alpha = 1): string {
  const a = alpha < 1 ? ` / ${alpha}` : "";
  return `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${((H + 360) % 360).toFixed(1)}${a})`;
}

/** The colour `dl` lighter (negative: darker), chroma scaled by `kc`. */
export function shade(hex: string, dl: number, kc = 1, alpha = 1): string {
  const [L, C, H] = hexToOklch(hex);
  return oklchCss([Math.min(0.99, Math.max(0.05, L + dl)), C * kc, H], alpha);
}

