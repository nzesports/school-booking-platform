import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export function FeedbackDialogNavigation({
  current,
  total,
  onPrevious,
  onNext,
  className
}: {
  current: number;
  total: number;
  onPrevious?: () => void;
  onNext?: () => void;
  className?: string;
}) {
  if (total <= 1) {
    return null;
  }

  return (
    <div
      className={cn(
        "sticky top-3 z-10 mt-4 flex items-center justify-between gap-3 rounded-[14px] border border-[color:var(--border-soft)] bg-white/95 px-3 py-2 shadow-[0_10px_24px_rgba(11,24,77,0.1)] backdrop-blur",
        className
      )}
    >
      <button
        type="button"
        onClick={onPrevious}
        disabled={!onPrevious}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold text-[color:var(--navy)] transition hover:bg-[#f1f5f9] disabled:cursor-not-allowed disabled:opacity-35"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </button>
      <span className="text-xs font-semibold text-[color:var(--text-soft)]">
        {current} of {total}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={!onNext}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold text-[color:var(--navy)] transition hover:bg-[#f1f5f9] disabled:cursor-not-allowed disabled:opacity-35"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
