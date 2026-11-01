//! Board colours and piece sets. The window chrome's themes are CSS (`[data-theme]` in
//! styles.css); these are the board's, applied as custom properties on the board itself
//! so a theme preview can render beside the live board without touching it.

import { shade } from "./oklch";

export type BoardTheme = {
  id: string;
  name: string;
  light: string;
  dark: string;
  /** Legal-move dots and capture rings. */
  hint?: string;
};

export const BOARD_THEMES: BoardTheme[] = [
  { id: "tournament", name: "Tournament", light: "#ecedd0", dark: "#6f8f50" },
  { id: "walnut", name: "Walnut", light: "#efd9b6", dark: "#b0835a" },
  { id: "harbor", name: "Harbor", light: "#dfe5e8", dark: "#86a0ae" },
  { id: "slate", name: "Slate", light: "#d9dde3", dark: "#6f7b8b" },
  { id: "lagoon", name: "Lagoon", light: "#dcebe5", dark: "#4f8a80" },
  { id: "amethyst", name: "Amethyst", light: "#e7e0ef", dark: "#8d76b0" },
  { id: "coral", name: "Coral", light: "#f4e4d6", dark: "#d18a6a" },
  { id: "rosewood", name: "Rosewood", light: "#efdcd6", dark: "#a8625a" },
  { id: "sand", name: "Sand", light: "#f2e8cf", dark: "#c6a874" },
  { id: "olive", name: "Olive", light: "#e5e3c8", dark: "#959456" },
  { id: "ice", name: "Ice", light: "#eef4f8", dark: "#a9bfcf" },
  {
    id: "night",
    name: "Night",
    light: "#59647a",
    dark: "#343c4d",
    hint: "rgba(255, 255, 255, 0.22)",
  },
];

export type PieceSet = { id: string; name: string; credit: string; license: string };

/** Only sets whose licence lets them ship inside an Apache-2.0 app. */
export const PIECE_SETS: PieceSet[] = [
  { id: "cburnett", name: "Cburnett", credit: "Colin M.L. Burnett", license: "GPLv2+" },
  { id: "merida", name: "Merida", credit: "Armando Hernandez Marroquin", license: "GPLv2+" },
  { id: "chessnut", name: "Chessnut", credit: "Alexis Luengas", license: "Apache-2.0" },
  { id: "mpchess", name: "MPChess", credit: "Maxime Chupin", license: "GPLv3+" },
  { id: "celtic", name: "Celtic", credit: "Maurizio Monge", license: "MIT" },
  { id: "fantasy", name: "Fantasy", credit: "Maurizio Monge", license: "MIT" },
  { id: "spatial", name: "Spatial", credit: "Maurizio Monge", license: "MIT" },
  { id: "papercut", name: "Papercut", credit: "Nikolay Anzarov", license: "CC BY 4.0" },
  { id: "rhosgfx", name: "RhosGFX", credit: "RhosGFX", license: "CC0 1.0" },
  { id: "totoy", name: "Totoy", credit: "Kosal Sen", license: "CC BY 4.0" },
  { id: "kiwen-suwi", name: "Kiwen Suwi", credit: "neverRare", license: "CC BY 4.0" },
  { id: "shapes", name: "Shapes", credit: "flugsio", license: "CC BY-SA 4.0" },
];

/**
 * The frame a board sits in: its own dark square, taken down in lightness, with the
 * coordinates printed in its light square — so every board brings a frame that belongs
 * to it, the way a club board's border is the board's own material.
 */
export function frameOf(t: BoardTheme): { frame: string; ink: string } {
  const night = t.id === "night";
  return { frame: shade(t.dark, night ? -0.07 : -0.13, 0.9), ink: shade(t.light, night ? 0.05 : 0, 0.8, 0.9) };
}

export const boardTheme = (id: string) => BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
export const pieceSet = (id: string) => PIECE_SETS.find((p) => p.id === id) ?? PIECE_SETS[0];
export const pieceUrl = (set: string, code: string) => `/pieces/${pieceSet(set).id}/${code}.svg`;
