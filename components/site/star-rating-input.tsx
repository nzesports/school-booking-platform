"use client";

import { Star } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

const CAPTIONS = ["", "Poor", "Fair", "Average", "Good", "Excellent"];

// Form-friendly 1–5 star rating: real radio inputs underneath (so required
// validation and plain FormData submission keep working), stars on top.
export function StarRatingInput({ name, label }: { name: string; label?: string }) {
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState(0);
  const active = hover || value;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Anchors the direction before anyone interacts. Without them the row
          reads as five identical stars, and a reviewer can pick the leftmost
          believing it is the best score. */}
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--text-soft)]">
        Poor
      </span>
      <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <label
            key={rating}
            className="cursor-pointer p-0.5"
            onMouseEnter={() => setHover(rating)}
          >
            <input
              type="radio"
              name={name}
              value={rating}
              required
              checked={value === rating}
              onChange={() => setValue(rating)}
              className="sr-only"
              aria-label={`${label ? `${label}: ` : ""}${rating} out of 5 (${CAPTIONS[rating]})`}
            />
            <Star
              className={cn(
                "h-7 w-7 transition-colors",
                rating <= active
                  ? "fill-[#f5b301] text-[#f5b301]"
                  : "fill-transparent text-[#cbd5e1]"
              )}
            />
          </label>
        ))}
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--text-soft)]">
        Excellent
      </span>
      <span
        className={cn(
          "min-w-[108px] text-sm font-semibold",
          active > 0 ? "text-[color:var(--navy)]" : "text-[color:var(--text-soft)]"
        )}
      >
        {active > 0 ? `${active} of 5 · ${CAPTIONS[active]}` : "Select a rating"}
      </span>
    </div>
  );
}
