//! A move in algebraic notation. With figurines on, the piece letter is drawn as the
//! piece itself, from the board's own set. Like printed figurine notation, the glyph does
//! not change with the side to move — the outlined (white) piece reads on any paper.

import type { Side } from "../bridge";
import { pieceUrl } from "../lib/themes";

export function San({ san, figurines, set }: { san: string; color?: Side; figurines: boolean; set: string }) {
  if (!figurines) return <>{san}</>;
  const parts = san.split(/([KQRBN])/);
  return (
    <span className="san">
      {parts.map((p, i) =>
        /^[KQRBN]$/.test(p) ? <img key={i} className="san__fig" src={pieceUrl(set, "w" + p)} alt={p} draggable={false} /> : p,
      )}
    </span>
  );
}
