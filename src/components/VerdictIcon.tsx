//! A move's verdict mark: a coloured disc with !!, !, ★, 👍, ✓, a book, ?!, ? or ??.
//! The SVGs are drawn by scripts/build-verdicts.mjs.

import { CLASS_META, type Classification } from "../engine/review";
import best from "../assets/verdict/best.svg";
import blunder from "../assets/verdict/blunder.svg";
import book from "../assets/verdict/book.svg";
import brilliant from "../assets/verdict/brilliant.svg";
import excellent from "../assets/verdict/excellent.svg";
import good from "../assets/verdict/good.svg";
import great from "../assets/verdict/great.svg";
import inaccuracy from "../assets/verdict/inaccuracy.svg";
import mistake from "../assets/verdict/mistake.svg";

const SRC: Record<Classification, string> = { brilliant, great, best, excellent, good, book, inaccuracy, mistake, blunder };

export function VerdictIcon({ cls, size = 18, className }: { cls: Classification; size?: number; className?: string }) {
  return (
    <img
      className={"verdict-icon" + (className ? " " + className : "")}
      src={SRC[cls]}
      width={size}
      height={size}
      alt={CLASS_META[cls].label}
      title={CLASS_META[cls].label}
      draggable={false}
    />
  );
}
