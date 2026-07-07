"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AmbassadorApplicationWithdrawDialog({
  sessionId,
  action,
  returnTo,
  className
}: {
  sessionId: string;
  action: (formData: FormData) => void | Promise<void>;
  returnTo: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
        className={className ?? "min-h-[40px] rounded-[14px] px-3 py-1.5 text-xs"}
      >
        Withdraw application
      </Button>

      {open
        ? createPortal(
            <BookingDialogShell
              title="Withdraw application"
              kicker="Open booking"
              description="Let the NZ Esports team know why you are stepping back from this application."
              onClose={() => setOpen(false)}
              compact
              maxWidthClassName="max-w-[680px]"
            >
              <form action={action} className="mt-6 grid gap-5">
                <input type="hidden" name="bookingSessionId" value={sessionId} />
                <input type="hidden" name="returnTo" value={returnTo} />

                <div className="rounded-[20px] border border-[#ffd9a8] bg-[#fff8ed] p-4 text-sm leading-6 text-[#7a4a05]">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                    <p>
                      This removes your application immediately. If no other ambassadors are
                      waiting, the session will move back to needing an ambassador.
                    </p>
                  </div>
                </div>

                <label className="grid gap-2 text-sm font-semibold text-[color:var(--navy)]">
                  Reason for withdrawing
                  <Textarea
                    name="reason"
                    placeholder="Share a short reason so the team can plan the replacement."
                    required
                    minLength={5}
                  />
                </label>

                <div className="flex flex-wrap justify-end gap-3">
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    Keep application
                  </Button>
                  <Button type="submit" className="bg-[#18a83b] text-white hover:bg-[#12852f]">
                    Withdraw application
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
