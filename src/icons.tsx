//! Stand-ins for the SF Symbols the Swift view uses. Same optical weight and size —
//! the point sizes come straight from BoardView.swift.

type IconProps = { size: number };

/** `person.fill` */
export function PersonFill({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="12" cy="6.9" r="4.6" />
      <path d="M12 12.9c-4.8 0-8.4 2.9-8.4 6.2 0 1.5 1 2.3 3 2.3h10.8c2 0 3-.8 3-2.3 0-3.3-3.6-6.2-8.4-6.2Z" />
    </svg>
  );
}

/** `person.slash` */
export function PersonSlash({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="6.9" r="4.6" fill="currentColor" />
      <path
        d="M12 12.9c-4.8 0-8.4 2.9-8.4 6.2 0 1.5 1 2.3 3 2.3h10.8c2 0 3-.8 3-2.3 0-3.3-3.6-6.2-8.4-6.2Z"
        fill="currentColor"
      />
      <path d="M3 2.6 21.4 21" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M3 2.6 21.4 21" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

/** `chevron.down`, bold */
export function ChevronDown({ size }: IconProps) {
  return (
    <svg
      width={size}
      height={size * 0.62}
      viewBox="0 0 16 10"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M1.6 1.9 8 8.1l6.4-6.2"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** `plus`, bold */
export function Plus({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">
      <path d="M7 1.6v10.8M1.6 7h10.8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

/** `arrow.uturn.backward` — the takeback button */
export function UturnBackward({ size }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M13.1 13.2V9.5a3.7 3.7 0 0 0-3.7-3.7H4.7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.7 2.4 4 5.8l3.7 3.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
