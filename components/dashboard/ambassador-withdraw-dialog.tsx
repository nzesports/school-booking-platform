"use client";

import { AlertTriangle, Clock3, Send } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { BookingSessionView } from "@/lib/domain/types";
import { formatTime, formatWeekdayDate } from "@/lib/utils";

const WITHDRAWAL_REASON_OPTIONS = [
  ["school_rescheduled", "The school rescheduled", "e.g. they moved the date and you've rebooked them."],
  ["unavailable", "I'm no longer available", "You can't make this session yourself."],
  ["other", "Something else", "Explain below."]
] as const;

export function AmbassadorWithdrawDialog({
  session,
  action,
  returnTo,
  className
}: {
  session: BookingSessionView;
  action: (formData: FormData) => void | Promise<void>;
  returnTo: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (session.status === "withdrawal_requested") {
    return (
      <span className="inline-flex min-h-[38px] items-center gap-2 rounded-[14px] border border-[#f2ddb0] bg-[#fff5df] px-3.5 py-1.5 text-xs font-semibold text-[#9a5a00]">
        <Clock3 className="h-3.5 w-3.5" />
        Withdrawal requested
      </span>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
        className={className ?? ""}
      >
        Request withdrawal
      </Button>

      {open
        ? createPortal(
            <BookingDialogShell
              title="Request withdrawal"
              description="Tell the team why you need to withdraw. Staff must approve this before you are released from the session."
              onClose={() => setOpen(false)}
              compact
              maxWidthClassName="max-w-[640px]"
            >
              <div className="mt-6 rounded-[22px] border border-[#f2ddb0] bg-[#fff8e8] p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-[#9a5a00]">
                  <AlertTriangle className="h-4 w-4" />
                  You remain assigned until staff approve this request.
                </p>
                <p className="mt-2 text-sm leading-6 text-[#8f680f]">
                  {session.presentationTitle} at {session.schoolName} on{" "}
                  {formatWeekdayDate(session.startsAt, true)} at {formatTime(session.startsAt)}.
                </p>
              </div>

              <form action={action} className="mt-6 grid gap-4">
                <input type="hidden" name="bookingSessionId" value={session.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <fieldset className="grid gap-2">
                  <legend className="mb-2 text-sm font-semibold text-[color:var(--navy)]">
                    Why are you withdrawing? *
                  </legend>
                  {WITHDRAWAL_REASON_OPTIONS.map(([value, label, hint]) => (
                    <label
                      key={value}
                      className="flex items-start gap-3 rounded-[14px] border border-[color:var(--border-soft)] bg-white px-4 py-3 text-sm text-[color:var(--navy)] has-[:checked]:border-[#18a83b] has-[:checked]:bg-[#f4fbf6]"
                    >
                      <input type="radio" name="reasonType" value={value} required className="mt-1" />
                      <span>
                        <span className="block font-semibold">{label}</span>
                        <span className="block text-xs text-[color:var(--text-soft)]">{hint}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <label className="grid gap-2 text-sm font-semibold text-[color:var(--navy)]">
                  Details *
                  <Textarea
                    name="reason"
                    required
                    minLength={5}
                    placeholder="Share enough context for staff to make a clear decision."
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-3">
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-[#18a83b] text-white hover:bg-[#12852f]">
                    <Send className="h-4 w-4" />
                    Send request
                  </Button>
                </div>
              </form>
            </BookingDialogShell>,
            document.body
          )
        : null}
    </>
  );
}
