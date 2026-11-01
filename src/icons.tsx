//! The window's icons: one stroke family (1.7 px on a 20 px grid, round caps), drawn here
//! so they inherit `currentColor` and need no icon font.

type IconProps = { size?: number; className?: string };

function Svg({ size = 18, className, children, fill = "none" }: IconProps & { children: React.ReactNode; fill?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill={fill}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export const PersonFill = ({ size = 16, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <circle cx="12" cy="6.9" r="4.6" />
    <path d="M12 12.9c-4.8 0-8.4 2.9-8.4 6.2 0 1.5 1 2.3 3 2.3h10.8c2 0 3-.8 3-2.3 0-3.3-3.6-6.2-8.4-6.2Z" />
  </svg>
);

export const ChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5.5 8 4.5 4.5L14.5 8" />
  </Svg>
);

export const ChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12.5 4.5 7 10l5.5 5.5" />
  </Svg>
);

export const ChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.5 4.5 13 10l-5.5 5.5" />
  </Svg>
);

export const ToStart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4.5v11M14.5 4.5 9 10l5.5 5.5" />
  </Svg>
);

export const ToEnd = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 4.5v11M5.5 4.5 11 10l-5.5 5.5" />
  </Svg>
);

export const Flip = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 3.5v13M3.5 6.5l3-3 3 3M13.5 16.5v-13M16.5 13.5l-3 3-3-3" />
  </Svg>
);

export const Undo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.5 4.5 4 8l3.5 3.5" />
    <path d="M4.5 8H12a4 4 0 0 1 0 8H9" />
  </Svg>
);

export const Flag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 17V3.5M5 4h9l-2 3.5 2 3.5H5" />
  </Svg>
);

export const Stop = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="5" width="10" height="10" rx="2" />
  </Svg>
);

export const Play = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 4.5v11l9-5.5z" />
  </Svg>
);

export const Gear = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" />
  </Svg>
);

export const Import = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 13.5V16h12v-2.5" />
  </Svg>
);

export const Copy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="7" y="7" width="9.5" height="9.5" rx="2" />
    <path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 0 4 5v6.5A1.5 1.5 0 0 0 5.5 13H7" />
  </Svg>
);

export const Check = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </Svg>
);

export const Close = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5l10 10M15 5 5 15" />
  </Svg>
);

export const Swap = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h11.5M12.5 4l3 3-3 3M16 13H4.5M7.5 10l-3 3 3 3" />
  </Svg>
);

export const Plus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4.5v11M4.5 10h11" />
  </Svg>
);

export const Sparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3c.5 3.6 1.4 4.5 5 5-3.6.5-4.5 1.4-5 5-.5-3.6-1.4-4.5-5-5 3.6-.5 4.5-1.4 5-5Z" />
    <path d="M15.5 13.5c.2 1.3.6 1.8 2 2-1.4.2-1.8.6-2 2-.2-1.4-.6-1.8-2-2 1.4-.2 1.8-.7 2-2Z" />
  </Svg>
);

export const Chip = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="5" width="10" height="10" rx="2" />
    <path d="M8 2.5V5M12 2.5V5M8 15v2.5M12 15v2.5M2.5 8H5M2.5 12H5M15 8h2.5M15 12h2.5" />
  </Svg>
);

export const Sound = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 8v4h3l4 3.5v-11l-4 3.5z" />
    <path d="M13.5 7.5a3.5 3.5 0 0 1 0 5M15.5 5.5a6.4 6.4 0 0 1 0 9" />
  </Svg>
);

export const Board = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="13" height="13" rx="1.5" />
    <path d="M3.5 10h13M10 3.5v13" />
    <path d="M3.5 3.5h6.5v6.5H3.5zM10 10h6.5v6.5H10z" fill="currentColor" stroke="none" opacity=".35" />
  </Svg>
);

export const Spark = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 13.5 7 9l3 3 7-7.5" />
    <path d="M12.5 4.5H17V9" />
  </Svg>
);

/** A stylised fish — the Stockfish seat's mark. */
export const Fish = ({ size = 18, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <path d="M7 12c2.2-3.3 5.2-5 8.4-5 2.8 0 5 1.5 6.6 4.3a1.4 1.4 0 0 1 0 1.4C20.4 15.5 18.2 17 15.4 17 12.2 17 9.2 15.3 7 12Z" />
    <path d="M8.2 12 2.4 7.6c-.3-.2-.7 0-.6.4l.9 4-.9 4c-.1.4.3.6.6.4z" />
    <circle cx="17.6" cy="11.2" r="1.2" fill="var(--fish-eye, #fff)" />
  </svg>
);

/** Play — a pawn. */
export const Pawn = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="5.6" r="2.4" />
    <path d="M7.6 9.6h4.8M8.4 9.6c0 2.4-.7 4.2-2.1 5.4h7.4c-1.4-1.2-2.1-3-2.1-5.4" />
    <path d="M5.5 17h9" />
  </Svg>
);

/** Analysis — a board with a line through it. */
export const Analysis = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="14" height="14" rx="2" />
    <path d="M6 13.5 8.8 10l2.4 2.2L14.5 7" />
  </Svg>
);

/** Board editor — a square with a pencil. */
export const Editor = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 3.5H5A1.5 1.5 0 0 0 3.5 5v10A1.5 1.5 0 0 0 5 16.5h10a1.5 1.5 0 0 0 1.5-1.5v-4" />
    <path d="M3.5 10h6.5V3.5" />
    <path d="m11.5 11 .6-2.7 4.8-4.8a1.4 1.4 0 0 1 2 2l-4.8 4.8z" />
  </Svg>
);

/** Review — a star in a circle. */
export const Star = (p: IconProps) => (
  <Svg {...p}>
    <path d="m10 3.2 2 4.2 4.6.6-3.4 3.2.9 4.6L10 13.6 5.9 15.8l.9-4.6L3.4 8l4.6-.6z" />
  </Svg>
);

export const Bulb = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.5 14.5h5M8.2 17h3.6" />
    <path d="M10 2.8a5 5 0 0 0-3 9c.6.5.9 1.1.9 1.8V14h4.2v-.4c0-.7.3-1.3.9-1.8a5 5 0 0 0-3-9z" />
  </Svg>
);

export const Hand = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 10.5V4.8a1.2 1.2 0 0 1 2.4 0V10M9.4 9.5V3.6a1.2 1.2 0 0 1 2.4 0V9.6M11.8 9.6V4.8a1.2 1.2 0 0 1 2.4 0v6.4c0 3.1-2.1 5.6-5 5.6-2 0-3.2-1-4.3-2.7L3.3 11a1.2 1.2 0 0 1 2-1.3L7 12" />
  </Svg>
);

export const Eraser = (p: IconProps) => (
  <Svg {...p}>
    <path d="m8.5 16.5-4.3-4.3a1.5 1.5 0 0 1 0-2.1l6.6-6.6a1.5 1.5 0 0 1 2.1 0l3.4 3.4a1.5 1.5 0 0 1 0 2.1l-7.2 7.5H16" />
    <path d="m7 8 5 5" />
  </Svg>
);

export const Engine = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10h2.5l2-5 3 10 2-5H17" />
  </Svg>
);

export const ArrowBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 5 3.5 10l5 5M4 10h12.5" />
  </Svg>
);


export const Clock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 6v4.2l2.6 1.6" />
  </Svg>
);

export const Window = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="15" height="12" rx="2" />
    <path d="M2.5 7.5h15M8 7.5V16" />
  </Svg>
);

export const Info = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 9v4.5M10 6.5v.01" />
  </Svg>
);
