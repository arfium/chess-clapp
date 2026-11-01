//! The small controls the sheet and the dialogs share.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Close } from "../icons";

/** A checkbox, ticked in ballpoint. */
export function Check({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="check"
      onClick={() => onChange(!checked)}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.2 6.4 4.8 9 9.8 3.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          className="segmented__opt"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  disabled,
  className,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={"iconbtn" + (className ? " " + className : "")}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Dialog({
  title,
  onClose,
  children,
  wide,
  className,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // The parent re-renders with every engine update and hands a fresh onClose each time;
  // focus is taken once, on open, so a running analysis never pulls it out of a field.
  const close = useRef(onClose);
  close.current = onClose;
  // Read while rendering, before a field inside takes focus with autoFocus.
  const [prev] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => {
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      prev?.focus?.();
    };
  }, [prev]);
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"dialog" + (wide ? " dialog--wide" : "") + (className ? " " + className : "")} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
        <header className="dialog__head">
          <h2>{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <Close size={16} />
          </IconButton>
        </header>
        <div className="dialog__body">{children}</div>
      </div>
    </div>
  );
}
