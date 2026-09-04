"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type SecondaryTabItem<T extends string> = {
  value: T;
  label: string;
  icon: LucideIcon;
  count?: number;
  tone?: "green" | "violet";
};

/**
 * Platform default for “secondary tab style”: icon + compact label with a
 * small underline marking the active section.
 */
export function SecondaryTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className
}: {
  items: Array<SecondaryTabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto border-b border-[color:var(--border-soft)]", className)}>
      <div role="tablist" aria-label={ariaLabel} className="flex min-w-max gap-5 px-1 sm:gap-7">
        {items.map((item) => {
          const active = item.value === value;
          const Icon = item.icon;
          const activeTextClassName =
            item.tone === "violet" ? "text-[#6941c6]" : "text-[#117a2e]";
          const activeBadgeClassName =
            item.tone === "violet"
              ? "bg-[#f1edfd] text-[#6941c6]"
              : "bg-[#e6f6eb] text-[#117a2e]";
          const activeUnderlineClassName =
            item.tone === "violet" ? "bg-[#7c3aed]" : "bg-[#18a83b]";

          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.value)}
              className={cn(
                "relative inline-flex min-h-[48px] items-center gap-1.5 px-1 text-[11px] font-semibold transition",
                active
                  ? activeTextClassName
                  : "text-[color:var(--text-soft)] hover:text-[color:var(--navy)]"
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", active && activeTextClassName)} aria-hidden="true" />
              <span>{item.label}</span>
              {typeof item.count === "number" ? (
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", active ? activeBadgeClassName : "bg-[#f0f3f7]")}>
                  {item.count}
                </span>
              ) : null}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-1 bottom-0 h-0.5 rounded-full transition",
                  active ? activeUnderlineClassName : "bg-transparent"
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
