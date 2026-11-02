import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";

// "1 of 5" with up/down buttons, for a dialog header beside its close button
// (BookingDialogShell's headerActions).
export function FeedbackDialogNavigation({
  current,
  total,
  onPrevious,
  onNext
}: {
  current: number;
  total: number;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  if (total <= 1) {
    return null;
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="whitespace-nowrap px-1 text-xs font-semibold text-[color:var(--text-soft)]">
        {current} of {total}
      </span>
      <Button
        type="button"
        variant="ghost"
        onClick={onPrevious}
        disabled={!onPrevious}
        aria-label="Previous"
        className="shrink-0 border border-[rgba(4,15,75,0.08)] bg-white disabled:opacity-35"
      >
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={onNext}
        disabled={!onNext}
        aria-label="Next"
        className="shrink-0 border border-[rgba(4,15,75,0.08)] bg-white disabled:opacity-35"
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
    </div>
  );
}
