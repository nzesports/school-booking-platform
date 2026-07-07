"use client";

import { CalendarRange, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function DashboardRangePicker({
  label,
  options,
  activeRange
}: {
  label: string;
  options: Array<{ href: string; label: string; value: string }>;
  activeRange?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl border border-[color:var(--border-soft)] bg-white/94 px-5 py-4 text-sm font-semibold text-[color:var(--navy)] shadow-[0_10px_25px_rgba(11,24,77,0.06)]"
        aria-expanded={open}
      >
        <CalendarRange className="h-5 w-5 text-[color:var(--green)]" />
        {label}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[color:var(--text-soft)] transition",
            open ? "rotate-180" : ""
          )}
        />
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-[18px] border border-[color:var(--border-soft)] bg-white/98 p-2 shadow-[0_18px_42px_rgba(11,24,77,0.14)]">
          {options.map((option) => (
            <Link
              key={option.value}
              href={option.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex rounded-[14px] px-3 py-2 text-sm font-semibold text-[color:var(--navy)] transition hover:bg-[color:var(--blue-soft)]",
                option.value === activeRange
                  ? "bg-[color:var(--green-soft)] text-[color:var(--green)]"
                  : ""
              )}
            >
              {option.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
