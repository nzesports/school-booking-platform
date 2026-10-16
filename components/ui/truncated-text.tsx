"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type TruncatedTextProps = {
  /** Full text, shown in the tooltip when the rendered text is cut off. */
  title: string;
  children?: ReactNode;
  className?: string;
  /** Render as an inline-flex row instead of a block, for icon + text cells. */
  inline?: boolean;
};

/**
 * Single-line text that reports when it has actually been cut off.
 *
 * CSS can truncate but cannot tell you that it did, so a `title` set
 * unconditionally makes every cell look hoverable even when nothing is hidden.
 * This measures the element and only then shows the tooltip and switches the
 * cursor, so the affordance appears exactly where there is more to read.
 */
export function TruncatedText({ title, children, className, inline = false }: TruncatedTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    // Sub-pixel layout can leave scrollWidth a fraction over clientWidth on
    // text that visually fits, so require a whole pixel of overflow.
    const measure = () => setClipped(element.scrollWidth - element.clientWidth > 1);

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [children, title]);

  return (
    <span
      ref={ref}
      title={clipped ? title : undefined}
      className={cn(
        inline ? "inline-flex min-w-0 items-center" : "block",
        "truncate",
        clipped && "cursor-help",
        className
      )}
    >
      {children ?? title}
    </span>
  );
}
