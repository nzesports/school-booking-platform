"use client";

import { CheckCircle2, ChevronDown, CircleX, Clock3 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { cn } from "@/lib/utils";

// Booking status dropdown shared by the bookings list and the booking details
// dialog. It submits its form on change (the form asks whether to email).

export const BOOKING_STATUS_OPTIONS = [
  ["requested", "Pending"],
  ["tentative", "Tentative"],
  ["applied", "Applied"],
  ["ambassador_assigned", "Ambassador assigned"],
  ["confirmed", "Confirmed"],
  ["reschedule_requested", "Reschedule requested"],
  ["closed", "Completed"],
  ["cancelled", "Cancelled"],
  ["declined", "Declined"]
] as const;

// Statuses that mean "this booking has been delivered" — not selectable while
// any of the booking's sessions are still in the future.
export const COMPLETION_STATUSES = new Set([
  "completed_pending_report",
  "report_submitted",
  "payment_pending",
  "paid",
  "closed"
]);

export function schoolBookingStatus(status: string) {
  return COMPLETION_STATUSES.has(status) ? "closed" : status;
}

const bookingStatusControlStyles: Record<string, string> = {
  requested: "border-[#f2ddb0] bg-[#fff5df] text-[#9a5a00]",
  tentative: "border-[#d7dce4] bg-[#f1f3f6] text-[#667085]",
  applied: "border-[#c4dbfb] bg-[#e8f1fd] text-[#1e4fae]",
  ambassador_assigned: "border-[#d9cef7] bg-[#f1edfd] text-[#6941c6]",
  confirmed: "border-[#bfe6ca] bg-[#eaf8ee] text-[#117a2e]",
  reschedule_requested: "border-[#f2cfb3] bg-[#fff0e4] text-[#b54708]",
  withdrawal_requested: "border-[#eadb91] bg-[#fff8d9] text-[#8a6500]",
  cancelled: "border-[#f0c3c0] bg-[#fdecec] text-[#a8322b]",
  declined: "border-[#e6c5d5] bg-[#f5eaf0] text-[#8b2c58]",
  completed_pending_report: "border-[#ced3fa] bg-[#eef0ff] text-[#4c5bd4]",
  report_submitted: "border-[#bee6ed] bg-[#e6f7fb] text-[#087f8c]",
  payment_pending: "border-[#efd9aa] bg-[#fff7e6] text-[#9b6100]",
  paid: "border-[#b9e5ce] bg-[#e4f7ed] text-[#087443]",
  closed: "border-[#b9e4dd] bg-[#e6f7f4] text-[#087f6a]"
};

const bookingStatusIconStyles: Record<string, string> = {
  requested: "text-[#9a5a00]",
  tentative: "text-[#667085]",
  applied: "text-[#1e4fae]",
  ambassador_assigned: "text-[#6941c6]",
  confirmed: "text-[#117a2e]",
  reschedule_requested: "text-[#b54708]",
  closed: "text-[#087f6a]",
  cancelled: "text-[#b3372e]",
  declined: "text-[#8b2c58]"
};

export function AutoSaveBookingStatus({
  currentStatus,
  options,
  compact = false,
  saving = false
}: {
  currentStatus: string;
  options: ReadonlyArray<readonly [string, string]>;
  compact?: boolean;
  // For forms whose action doesn't report through useFormStatus (e.g. a
  // useActionState dispatcher), the caller says when a save is running.
  saving?: boolean;
}) {
  const { pending: formPending } = useFormStatus();
  const pending = formPending || saving;
  const displayStatus = schoolBookingStatus(currentStatus);
  const isCancelled = ["cancelled", "declined"].includes(displayStatus);
  const isCompleted = [
    "ambassador_assigned",
    "confirmed",
    "closed"
  ].includes(displayStatus);

  return (
    <label className="grid w-full min-w-0 justify-items-start gap-1">
      <span
        className={cn(
          "text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-soft)]",
          compact && "sr-only"
        )}
      >
        Booking status
      </span>
      <span className="relative block w-full min-w-0">
        <span
          className={cn(
            "pointer-events-none absolute inset-y-0 left-2.5 z-10 flex items-center",
            bookingStatusIconStyles[displayStatus] ?? "text-[#667085]"
          )}
        >
          {isCancelled ? (
            <CircleX className="h-3.5 w-3.5" />
          ) : isCompleted ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <Clock3 className="h-3.5 w-3.5" />
          )}
        </span>
        <select
          name="status"
          defaultValue={displayStatus}
          disabled={pending}
          aria-busy={pending}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className={cn(
            "w-full min-w-0 appearance-none rounded-[8px] border pl-8 pr-7 font-semibold outline-none transition-colors",
            compact ? "min-h-[36px] py-2.5 text-[12px] leading-[16px]" : "min-h-[40px] text-sm",
            bookingStatusControlStyles[displayStatus] ??
              "border-[color:var(--border-soft)] bg-white text-[color:var(--navy)]",
            pending && "cursor-wait opacity-60"
          )}
        >
          {options.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
      </span>
      <span className="sr-only" aria-live="polite">
        {pending ? "Saving booking status" : ""}
      </span>
    </label>
  );
}
