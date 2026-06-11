"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type TagOption = {
  label: string;
  value: string;
};

export function TagMultiSelect({
  name,
  options,
  placeholder,
  emptyLabel = "No options available.",
  defaultValue = []
}: {
  name: string;
  options: TagOption[];
  placeholder: string;
  emptyLabel?: string;
  defaultValue?: string[];
}) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedValues, setSelectedValues] = useState<string[]>(defaultValue);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const selectedOptions = options.filter((option) => selectedValues.includes(option.value));

  function toggleValue(value: string) {
    setSelectedValues((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value]
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={selectedValues.join(",")} />
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((current) => !current);
          }

          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className={cn(
          "flex min-h-[56px] w-full cursor-pointer items-center justify-between gap-3 rounded-[18px] border border-[color:var(--border-soft)] bg-white/92 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55)] outline-none transition focus-visible:border-[color:rgba(24,168,59,0.34)] focus-visible:ring-4 focus-visible:ring-[rgba(24,168,59,0.1)]",
          open && "border-[color:rgba(24,168,59,0.34)] ring-4 ring-[rgba(24,168,59,0.1)]"
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {selectedOptions.length > 0 ? (
            selectedOptions.map((option) => (
              <span
                key={option.value}
                className="inline-flex items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,rgba(175,213,237,0.32),rgba(234,248,238,0.88))] px-3 py-1 text-sm font-medium text-[color:var(--navy)]"
              >
                {option.label}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleValue(option.value);
                  }}
                  className="inline-flex items-center justify-center rounded-full text-[color:var(--text-soft)] transition hover:text-[color:var(--navy)]"
                  aria-label={`Remove ${option.label}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))
          ) : (
            <span className="text-sm text-[color:var(--text-soft)]">{placeholder}</span>
          )}
        </div>

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[color:var(--text-soft)] transition",
            open && "rotate-180"
          )}
        />
      </div>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 right-0 top-[calc(100%+0.6rem)] z-20 overflow-hidden rounded-[22px] border border-[color:var(--border-soft)] bg-white shadow-[0_18px_42px_rgba(11,24,77,0.14)]"
        >
          <div className="max-h-64 overflow-y-auto p-2">
            {options.length > 0 ? (
              options.map((option) => {
                const active = selectedValues.includes(option.value);

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => toggleValue(option.value)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-[16px] px-3 py-3 text-left text-sm transition",
                      active
                        ? "bg-[linear-gradient(135deg,rgba(175,213,237,0.28),rgba(234,248,238,0.9))] text-[color:var(--navy)]"
                        : "text-[color:var(--text-dark)] hover:bg-[rgba(238,247,252,0.8)]"
                    )}
                  >
                    <span>{option.label}</span>
                    <span
                      className={cn(
                        "inline-flex h-5 w-5 items-center justify-center rounded-full border",
                        active
                          ? "border-[color:var(--green)] bg-[color:var(--green)] text-white"
                          : "border-[color:var(--border-soft)] text-transparent"
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-4 text-sm text-[color:var(--text-soft)]">{emptyLabel}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
