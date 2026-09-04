"use client";

import { CalendarRange, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function DashboardRangePicker({
  label,
  options,
  activeRange,
  customRange
}: {
  label: string;
  options: Array<{ href: string; label: string; value: string }>;
  activeRange?: string;
  customRange?: { from: string; to: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(activeRange === "custom");
  const [from, setFrom] = useState(customRange?.from ?? "");
  const [to, setTo] = useState(customRange?.to ?? "");
  const ref = useRef<HTMLDivElement>(null);
  const customOption = options.find((option) => option.value === "custom");
  const standardOptions = options.filter((option) => option.value !== "custom");
  const customDatesValid = Boolean(from && to && from <= to);

  const applyCustomRange = () => {
    if (!customOption || !customDatesValid) {
      return;
    }

    const url = new URL(customOption.href, window.location.origin);
    url.searchParams.set("range", "custom");
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    window.location.assign(`${url.pathname}${url.search}`);
  };

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
        <div
          className={cn(
            "absolute right-0 z-20 mt-2 overflow-hidden rounded-[18px] border border-[color:var(--border-soft)] bg-white/98 p-2 shadow-[0_18px_42px_rgba(11,24,77,0.14)]",
            customOpen ? "w-[310px]" : "w-52"
          )}
        >
          {standardOptions.map((option) => (
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
          {customOption ? (
            <>
              <button
                type="button"
                onClick={() => setCustomOpen((current) => !current)}
                aria-expanded={customOpen}
                className={cn(
                  "flex w-full items-center justify-between rounded-[14px] px-3 py-2 text-left text-sm font-semibold text-[color:var(--navy)] transition hover:bg-[color:var(--blue-soft)]",
                  activeRange === "custom"
                    ? "bg-[color:var(--green-soft)] text-[color:var(--green)]"
                    : ""
                )}
              >
                Custom range
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition",
                    customOpen ? "rotate-180" : ""
                  )}
                />
              </button>
              {customOpen ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    applyCustomRange();
                  }}
                  className="mt-1 grid gap-3 rounded-[14px] bg-[#f6f9fd] p-3"
                >
                  <label className="grid gap-1.5 text-xs font-semibold text-[color:var(--navy)]">
                    From
                    <input
                      type="date"
                      value={from}
                      max={to || undefined}
                      onChange={(event) => setFrom(event.target.value)}
                      className="min-h-[40px] rounded-[10px] border border-[color:var(--border-soft)] bg-white px-3 text-sm font-medium outline-none focus:border-[rgba(24,168,59,0.4)]"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-semibold text-[color:var(--navy)]">
                    To
                    <input
                      type="date"
                      value={to}
                      min={from || undefined}
                      onChange={(event) => setTo(event.target.value)}
                      className="min-h-[40px] rounded-[10px] border border-[color:var(--border-soft)] bg-white px-3 text-sm font-medium outline-none focus:border-[rgba(24,168,59,0.4)]"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={!customDatesValid}
                    className="inline-flex min-h-[40px] items-center justify-center rounded-[11px] bg-[color:var(--navy)] px-4 text-sm font-semibold text-white transition hover:bg-[#101c56] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Apply date range
                  </button>
                  {from && to && from > to ? (
                    <p className="text-xs font-medium text-[#b3372e]">
                      The end date must be after the start date.
                    </p>
                  ) : null}
                </form>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
