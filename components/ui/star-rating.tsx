import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

// Read-only star display with fractional fill: 4.5 renders four and a half
// gold stars. A gold copy of the star row sits on top of a grey one, clipped
// to the rating percentage.
export function StarRating({
  rating,
  className,
  starClassName = "h-4 w-4",
  emptyClassName = "text-[#dbe2ee]",
  fillClassName = "text-[#f4b63f]"
}: {
  rating: number;
  className?: string;
  starClassName?: string;
  emptyClassName?: string;
  fillClassName?: string;
}) {
  const clamped = Math.max(0, Math.min(5, rating));

  return (
    <span
      className={cn("relative inline-flex", className)}
      role="img"
      aria-label={`${clamped} out of 5 stars`}
    >
      <span className={cn("flex gap-0.5", emptyClassName)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star key={star} className={cn(starClassName, "shrink-0 fill-current")} />
        ))}
      </span>
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 flex gap-0.5 overflow-hidden", fillClassName)}
        style={{ width: `${(clamped / 5) * 100}%` }}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <Star key={star} className={cn(starClassName, "shrink-0 fill-current")} />
        ))}
      </span>
    </span>
  );
}
