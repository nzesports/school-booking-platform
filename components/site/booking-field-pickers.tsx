"use client";

import { addDays, addMonths, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

import {
  BOOKING_WINDOW_END_MINUTES,
  BOOKING_WINDOW_START_MINUTES,
  SESSION_LENGTH_MINUTES,
  formatDisplayDate,
  formatTimeLabel,
  minutesToStartTime,
  resolveTypedTimeInWindow
} from "@/lib/services/time-slots";
import { cn } from "@/lib/utils";

const triggerClasses =
  "w-full rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 text-sm text-[color:var(--text-dark)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55)] outline-none transition focus:border-[color:rgba(24,168,59,0.34)] focus:ring-4 focus:ring-[rgba(24,168,59,0.1)]";

const popoverClasses =
  "fixed z-[90] rounded-[20px] border border-[color:var(--border-soft)] bg-white shadow-[0_24px_54px_rgba(11,24,77,0.18)]";

type PopoverPosition = { top: number; left: number; width: number };

function useAnchoredPopover(anchorRef: RefObject<HTMLElement | null>, fixedWidth?: number) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const open = position !== null;

  const measurePosition = () => {
    const anchor = anchorRef.current;

    if (!anchor || !anchor.isConnected) {
      return null;
    }

    const rect = anchor.getBoundingClientRect();
    const width = fixedWidth ?? rect.width;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));

    return { top: rect.bottom + 8, left, width };
  };

  const openPopover = () => setPosition(measurePosition());

  const closePopover = () => setPosition(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (anchorRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }

      setPosition(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setPosition(null);
      }
    };

    // Keep the popover glued to its trigger while the page scrolls or resizes.
    const reposition = () => {
      const anchor = anchorRef.current;

      if (!anchor || !anchor.isConnected) {
        setPosition(null);
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const width = fixedWidth ?? rect.width;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      setPosition({ top: rect.bottom + 8, left, width });
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, anchorRef, fixedWidth]);

  return { open, position, popoverRef, openPopover, closePopover };
}

function parseDateString(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const CALENDAR_WIDTH = 312;

export function BookingDatePicker({
  value,
  onChange,
  isDateBookable,
  minDate,
  maxDate,
  className
}: {
  value: string;
  onChange: (date: string) => void;
  isDateBookable: (date: string) => boolean;
  minDate: string;
  maxDate: string;
  className?: string;
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const { open, position, popoverRef, openPopover, closePopover } = useAnchoredPopover(
    anchorRef,
    CALENDAR_WIDTH
  );
  const [viewMonth, setViewMonth] = useState(() =>
    startOfMonth(parseDateString(value) ?? new Date())
  );

  const selectedDate = parseDateString(value);
  const minMonth = startOfMonth(parseDateString(minDate) ?? new Date());
  const maxMonth = startOfMonth(parseDateString(maxDate) ?? new Date());
  const canGoPrev = viewMonth > minMonth;
  const canGoNext = viewMonth < maxMonth;
  const gridStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));

  const handleToggle = () => {
    if (open) {
      closePopover();
      return;
    }

    setViewMonth(startOfMonth(parseDateString(value) ?? parseDateString(minDate) ?? new Date()));
    openPopover();
  };

  return (
    <div ref={anchorRef}>
      <button
        type="button"
        onClick={handleToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(triggerClasses, "flex items-center justify-between gap-2 text-left", className)}
      >
        <span className={value ? undefined : "text-[color:var(--text-soft)]"}>
          {value ? formatDisplayDate(value) : "Select a date"}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-[color:var(--text-soft)]" />
      </button>

      {open && position
        ? createPortal(
            <div
              ref={popoverRef}
              role="dialog"
              aria-label="Choose a date"
              style={{ top: position.top, left: position.left, width: CALENDAR_WIDTH }}
              className={cn(popoverClasses, "p-4")}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Previous month"
                  disabled={!canGoPrev}
                  onClick={() => setViewMonth((current) => addMonths(current, -1))}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--navy)] transition hover:bg-[rgba(24,168,59,0.1)] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <p className="text-sm font-semibold text-[color:var(--navy)]">
                  {format(viewMonth, "MMMM yyyy")}
                </p>
                <button
                  type="button"
                  aria-label="Next month"
                  disabled={!canGoNext}
                  onClick={() => setViewMonth((current) => addMonths(current, 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--navy)] transition hover:bg-[rgba(24,168,59,0.1)] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1">
                {WEEKDAY_LABELS.map((label) => (
                  <p
                    key={label}
                    className="flex h-8 items-center justify-center text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--text-soft)]"
                  >
                    {label}
                  </p>
                ))}
                {days.map((day) => {
                  const iso = format(day, "yyyy-MM-dd");
                  const inMonth = isSameMonth(day, viewMonth);
                  const bookable = iso >= minDate && iso <= maxDate && isDateBookable(iso);
                  const selected = selectedDate ? isSameDay(day, selectedDate) : false;

                  return (
                    <button
                      key={iso}
                      type="button"
                      disabled={!bookable}
                      onClick={() => {
                        onChange(iso);
                        closePopover();
                      }}
                      className={cn(
                        "flex h-9 w-full items-center justify-center rounded-full text-sm transition",
                        inMonth ? "text-[color:var(--text-dark)]" : "text-[color:var(--text-soft)]",
                        bookable
                          ? "hover:bg-[rgba(24,168,59,0.12)]"
                          : "cursor-not-allowed opacity-30",
                        selected &&
                          "bg-[color:var(--green)] font-semibold text-white hover:bg-[color:var(--green)]"
                      )}
                    >
                      {format(day, "d")}
                    </button>
                  );
                })}
              </div>

              <p className="mt-3 text-xs text-[color:var(--text-soft)]">
                Weekends and public holidays are unavailable.
              </p>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

type TimeOption = { startTime: string; label: string };

function buildTimeSuggestions(): TimeOption[] {
  const latestStart = BOOKING_WINDOW_END_MINUTES - SESSION_LENGTH_MINUTES;
  const options: TimeOption[] = [];

  for (
    let minutes = BOOKING_WINDOW_START_MINUTES;
    minutes < BOOKING_WINDOW_END_MINUTES;
    minutes += 30
  ) {
    const startTime = minutesToStartTime(minutes);
    options.push({ startTime, label: formatTimeLabel(startTime) });
  }

  const lastStartTime = minutesToStartTime(latestStart);

  if (!options.some((option) => option.startTime === lastStartTime)) {
    options.push({ startTime: lastStartTime, label: formatTimeLabel(lastStartTime) });
  }

  return options;
}

const TIME_SUGGESTIONS = buildTimeSuggestions();

function filterTimeOptions(query: string): TimeOption[] {
  const cleaned = query.trim().toLowerCase().replace(/\s+/g, "");

  if (!cleaned) {
    return TIME_SUGGESTIONS;
  }

  const compact = cleaned.replace(/[.:]/g, "");
  const matches = TIME_SUGGESTIONS.filter((option) => {
    const label = option.label.toLowerCase().replace(/\s+/g, "");

    return (
      label.startsWith(cleaned) ||
      label.replace(/[.:]/g, "").startsWith(compact) ||
      option.startTime.startsWith(cleaned) ||
      option.startTime.replace(":", "").startsWith(compact)
    );
  });

  // Surface the exact typed time (locked to the window) when it isn't one of
  // the half-hour suggestions, e.g. "9:47" offers "9:47 am".
  const typed = resolveTypedTimeInWindow(query);

  if (typed && !matches.some((option) => option.startTime === typed.startTime)) {
    return [typed, ...matches];
  }

  return matches;
}

export function BookingTimeCombobox({
  startTime,
  timeText,
  onChange,
  disabled,
  placeholder = "Select or type a time",
  className
}: {
  startTime: string;
  timeText: string;
  onChange: (next: { startTime: string; timeText: string }) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const { open, position, popoverRef, openPopover, closePopover } = useAnchoredPopover(anchorRef);
  const [text, setText] = useState(timeText);
  const [lastTimeText, setLastTimeText] = useState(timeText);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  if (timeText !== lastTimeText) {
    setLastTimeText(timeText);
    setText(timeText);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    popoverRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, popoverRef]);

  const filteredOptions = filterTimeOptions(query);

  const selectOption = (option: TimeOption) => {
    onChange({ startTime: option.startTime, timeText: option.label });
    setText(option.label);
    setQuery("");
    closePopover();
  };

  const commitText = (value: string) => {
    const trimmed = value.trim();

    if (!trimmed) {
      onChange({ startTime: "", timeText: "" });
      setText("");
      return;
    }

    const resolved = resolveTypedTimeInWindow(trimmed);

    if (!resolved) {
      setText(startTime ? formatTimeLabel(startTime) : "");
      return;
    }

    onChange({ startTime: resolved.startTime, timeText: resolved.label });
    setText(resolved.label);
  };

  const openWithAllOptions = () => {
    if (!open) {
      setQuery("");
      setActiveIndex(-1);
      openPopover();
    }
  };

  return (
    <div ref={anchorRef}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={openWithAllOptions}
        onClick={openWithAllOptions}
        onChange={(event) => {
          setText(event.target.value);
          setQuery(event.target.value);
          setActiveIndex(0);

          if (!open) {
            openPopover();
          }
        }}
        onBlur={() => {
          commitText(text);
          setQuery("");
          closePopover();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();

            if (!open) {
              openWithAllOptions();
              return;
            }

            setActiveIndex((current) => {
              const count = filteredOptions.length;

              if (count === 0) {
                return -1;
              }

              const delta = event.key === "ArrowDown" ? 1 : -1;
              return (current + delta + count) % count;
            });
          } else if (event.key === "Enter") {
            event.preventDefault();
            const active = open ? filteredOptions[activeIndex] : undefined;

            if (active) {
              selectOption(active);
            } else {
              commitText(text);
              setQuery("");
              closePopover();
            }
          }
        }}
        className={cn(triggerClasses, "placeholder:text-[color:var(--text-soft)] disabled:cursor-not-allowed disabled:opacity-60", className)}
      />

      {open && position
        ? createPortal(
            <div
              ref={popoverRef}
              id={listboxId}
              role="listbox"
              style={{ top: position.top, left: position.left, width: position.width }}
              className={cn(popoverClasses, "max-h-[280px] overflow-y-auto p-2")}
            >
              {filteredOptions.length === 0 ? (
                <p className="px-3 py-2 text-sm text-[color:var(--text-soft)]">
                  Enter a time between 8:00am and 4:00pm.
                </p>
              ) : (
                filteredOptions.map((option, index) => (
                  <button
                    key={option.startTime}
                    type="button"
                    role="option"
                    aria-selected={option.startTime === startTime}
                    data-active={index === activeIndex || undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectOption(option)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      "flex w-full items-center rounded-[12px] px-3 py-2 text-left text-sm transition",
                      index === activeIndex
                        ? "bg-[rgba(24,168,59,0.1)] text-[color:var(--navy)]"
                        : "text-[color:var(--text-dark)]",
                      option.startTime === startTime && "font-semibold text-[color:var(--green)]"
                    )}
                  >
                    {option.label}
                  </button>
                ))
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
