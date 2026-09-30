"use client";

import { CircleHelp } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const TOOLTIP_WIDTH = 288;
const VIEWPORT_GUTTER = 16;

// A "?" next to a heading that reveals a short explanation. Opens on hover or
// keyboard focus; a click (or tap) pins it open, since touch screens have no
// hover and Safari doesn't focus buttons on click. Escape or a click outside
// closes it. The bubble is portalled and fixed-positioned so cards with
// overflow clipping can't cut it off, and it stays inside the viewport.
export function InfoTooltip({
  label,
  children,
  className
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const open = hovered || pinned;

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      const width = Math.min(TOOLTIP_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2);
      const left = Math.max(
        VIEWPORT_GUTTER,
        Math.min(rect.left, window.innerWidth - width - VIEWPORT_GUTTER)
      );
      setPosition({ top: rect.bottom + 8, left });
    };

    place();
    window.addEventListener("scroll", place, { capture: true, passive: true });
    window.addEventListener("resize", place);

    return () => {
      window.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!pinned) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (!buttonRef.current?.contains(target) && !bubbleRef.current?.contains(target)) {
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
    <span className={`inline-flex shrink-0 align-middle normal-case tracking-normal ${className ?? ""}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(event) => {
          // Inside a <label> or clickable card, don't also trigger the parent.
          event.preventDefault();
          event.stopPropagation();
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
      {open && position
        ? createPortal(
            <span
              ref={bubbleRef}
              id={tooltipId}
              role="tooltip"
              style={{ top: position.top, left: position.left, width: Math.min(TOOLTIP_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2) }}
              className="fixed z-[120] rounded-[12px] border border-[color:var(--border-soft)] bg-white px-3.5 py-2.5 text-left text-xs font-normal normal-case leading-5 tracking-normal text-[color:var(--text-dark)] shadow-[0_14px_34px_rgba(11,24,77,0.14)]"
            >
              {children}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}
