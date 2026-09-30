"use client";

import { CircleHelp } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// A "?" next to a heading that reveals a short explanation. Opens on hover or
// keyboard focus; a click (or tap) pins it open, since touch screens have no
// hover and Safari doesn't focus buttons on click. Escape or a click outside
// closes it.
export function InfoTooltip({ label, children }: { label: string; children: ReactNode }) {
  const tooltipId = useId();
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;

  useEffect(() => {
    if (!pinned) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setPinned(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPinned(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pinned]);

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex align-middle normal-case tracking-normal"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={(event) => {
          // Inside a <label>, don't let the click also focus the field.
          event.preventDefault();
          setPinned((current) => !current);
        }}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setHovered(false);
            setPinned(false);
          }
        }}
        className="flex h-5 w-5 items-center justify-center rounded-full text-[color:var(--text-soft)] transition hover:text-[color:var(--navy)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[rgba(24,168,59,0.45)]"
      >
        <CircleHelp className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-[12px] border border-[color:var(--border-soft)] bg-white px-3.5 py-2.5 text-left text-xs font-normal leading-5 text-[color:var(--text-dark)] shadow-[0_14px_34px_rgba(11,24,77,0.14)]"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
