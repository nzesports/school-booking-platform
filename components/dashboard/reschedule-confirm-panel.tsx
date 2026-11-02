"use client";

import { useActionState } from "react";

import type { SessionDialogAction } from "@/components/dashboard/session-update-notices";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { BookingSessionView } from "@/lib/domain/types";
import { cn, formatShortDate, formatTime } from "@/lib/utils";

// The school moved this session through its manage-booking link. The new
// time is already saved; staff confirm it to take it out of "Rescheduling".
export function RescheduleConfirmPanel({
  session,
  action
}: {
  session: BookingSessionView;
  action: SessionDialogAction;
}) {
  const [state, formAction] = useActionState(action, null);
  // History is newest first.
  const previous = session.rescheduleHistory?.[0]?.previousStartsAt;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-[#f7c9a4] bg-[#fff5ec] p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#b54708]">The school moved this session</p>
        <p className="mt-1 text-sm leading-6 text-[#9a4a12]">
          {previous ? `From ${formatShortDate(previous)} ${formatTime(previous)} to ` : "Now "}
          {formatShortDate(session.startsAt)} {formatTime(session.startsAt)}. Check the ambassador
          can still make it, then confirm the new date.
        </p>
        {state ? (
          <p className={cn("mt-1 text-xs font-semibold", state.tone === "error" ? "text-[#9d2424]" : "text-[#1d6f35]")}>
            {state.message}
          </p>
        ) : null}
      </div>
      <form action={formAction}>
        <input type="hidden" name="sessionId" value={session.id} />
        {/* What staff saw; a later school change makes the confirm refuse. */}
        <input type="hidden" name="expectedStartsAt" value={session.startsAt} />
        <input type="hidden" name="expectedFlaggedAt" value={session.rescheduleConfirmationNeededAt ?? ""} />
        <PendingSubmitButton type="submit" pendingLabel="Confirming...">
          Confirm new date
        </PendingSubmitButton>
      </form>
    </div>
  );
}
