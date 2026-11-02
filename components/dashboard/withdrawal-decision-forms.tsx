import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { BookingSessionView, WithdrawalReasonType } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export const WITHDRAWAL_REASON_LABELS: Record<WithdrawalReasonType, string> = {
  school_rescheduled: "School rescheduled",
  unavailable: "Ambassador unavailable",
  other: "Other reason"
};

const primaryClassName =
  "inline-flex w-full items-center justify-center border border-[#18a83b] bg-[#18a83b] text-white shadow-[0_3px_10px_rgba(24,168,59,0.2)] transition hover:bg-[#12852f]";
const secondaryClassName =
  "inline-flex w-full items-center justify-center border border-[#f2ddb0] bg-white text-[#9a5a00] transition hover:bg-[#fff2d8]";

// The three ways staff can settle an ambassador's withdrawal request. Shared
// by the bookings list and the booking details dialog so both read the same.
export function WithdrawalDecisionForms({
  session,
  action,
  returnTo
}: {
  session: BookingSessionView;
  action: (formData: FormData) => void | Promise<void>;
  returnTo: string;
}) {
  const name = session.assignedAmbassadorName?.split(" ")[0] ?? "the ambassador";
  const schoolRescheduled = session.withdrawalReasonType === "school_rescheduled";
  const decisions = [
    {
      decision: "cancel_rebooked",
      label: "Cancel this session (rebooked)",
      hint: "The school is already booked on a new date. Cancels this session; the school isn't emailed.",
      primary: schoolRescheduled
    },
    {
      decision: "reopen",
      label: "Reopen for another ambassador",
      hint: `Removes ${name} and puts the session back in the open pool.`,
      primary: !schoolRescheduled
    },
    {
      decision: "keep",
      label: `Keep ${name} assigned`,
      hint: `${name} still delivers this session. Add a note to explain why.`,
      primary: false
    }
  ];
  // The most likely action for the stated reason comes first.
  const ordered = schoolRescheduled ? decisions : [decisions[1], decisions[0], decisions[2]];

  return (
    <div className="grid gap-3">
      {ordered.map((item) => (
        <form
          key={item.decision}
          action={action}
          className={cn(
            "grid gap-2",
            item.decision === "keep" && "sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
          )}
        >
          <input type="hidden" name="bookingSessionId" value={session.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="decision" value={item.decision} />
          {item.decision === "keep" ? (
            <input
              name="note"
              placeholder={`Note to ${name} (optional)`}
              className="min-h-[36px] rounded-[8px] border border-[#f2ddb0] bg-white px-3 text-[12px] text-[color:var(--navy)] outline-none"
            />
          ) : null}
          <div className="grid gap-1">
            <PendingSubmitButton
              unstyled
              type="submit"
              className={item.primary ? primaryClassName : secondaryClassName}
            >
              {item.label}
            </PendingSubmitButton>
            <p className="text-[11px] leading-4 text-[#8f680f]">{item.hint}</p>
          </div>
        </form>
      ))}
    </div>
  );
}
