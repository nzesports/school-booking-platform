"use client";

import {
  CalendarDays,
  CheckCircle2,
  MapPin,
  Presentation,
  Send,
  UsersRound
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { AmbassadorApplicationWithdrawDialog } from "@/components/dashboard/ambassador-application-withdraw-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { BookingSessionView } from "@/lib/domain/types";
import { formatTime, formatWeekdayDate } from "@/lib/utils";

export function AmbassadorOpenSessionDialog({
  session,
  action,
  withdrawAction,
  returnTo,
  className
}: {
  session: BookingSessionView;
  action: (formData: FormData) => void | Promise<void>;
  withdrawAction?: (formData: FormData) => void | Promise<void>;
  returnTo: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className={className}
      >
        View details
      </Button>

      {open
        ? createPortal(
            <BookingDialogShell
              title={session.presentationTitle}
              kicker="Open opportunity"
              description="Review the privacy-safe session details before applying. School contact details stay hidden until staff confirm an assignment."
              onClose={() => setOpen(false)}
              compact
              maxWidthClassName="max-w-[860px]"
            >
              <div className="mt-7 grid gap-4 md:grid-cols-2">
                <DetailTile
                  icon={<CalendarDays className="h-4 w-4" />}
                  label="Schedule"
                  value={`${formatWeekdayDate(session.startsAt)} at ${formatTime(session.startsAt)}`}
                />
                <DetailTile
                  icon={<MapPin className="h-4 w-4" />}
                  label="Region"
                  value={session.regionName ?? session.regionSlug}
                />
                <DetailTile
                  icon={<Presentation className="h-4 w-4" />}
                  label="Year levels"
                  value={session.yearLevels}
                />
                <DetailTile
                  icon={<UsersRound className="h-4 w-4" />}
                  label="Expected students"
                  value={`${session.expectedStudentCount} students`}
                />
              </div>

              {session.myApplicationStatus === "applied" ? (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <p className="inline-flex min-h-[46px] items-center gap-2 rounded-[18px] border border-[rgba(24,168,59,0.28)] bg-[color:var(--green-soft)] px-5 py-3 text-sm font-semibold text-[#1d6f35]">
                    <CheckCircle2 className="h-4 w-4" />
                    You&apos;ve applied for this session. Staff are reviewing applications now.
                  </p>
                  {withdrawAction ? (
                    <AmbassadorApplicationWithdrawDialog
                      sessionId={session.id}
                      action={withdrawAction}
                      returnTo={returnTo}
                      className="min-h-[46px]"
                    />
                  ) : null}
                </div>
              ) : (
                <form action={action} className="mt-6 grid gap-4">
                  <input type="hidden" name="bookingSessionId" value={session.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <Textarea
                    name="message"
                    placeholder="Share why you're a strong fit for this presentation."
                    required
                  />
                  <div className="flex flex-wrap justify-end gap-3">
                    <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-[#18a83b] text-white hover:bg-[#12852f]">
                      <Send className="h-4 w-4" />
                      Apply for session
                    </Button>
                  </div>
                </form>
              )}
            </BookingDialogShell>,
            document.body
          )
        : null}
    </>
  );
}

function DetailTile({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-[color:var(--border-soft)] bg-white/90 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
        <span className="flex h-8 w-8 items-center justify-center rounded-[12px] bg-[color:var(--blue-soft)] text-[#2563eb]">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-3 text-base font-semibold text-[color:var(--navy)]">{value}</p>
    </div>
  );
}
