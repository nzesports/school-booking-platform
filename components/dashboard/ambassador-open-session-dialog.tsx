"use client";

import {
  ArrowUpRight,
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
import { sessionGroupSummary } from "@/lib/same-day-sessions";
import { formatTime, formatWeekdayDate } from "@/lib/utils";

export function AmbassadorOpenSessionDialog({
  session,
  daySessions,
  action,
  withdrawAction,
  returnTo,
  className,
  label,
  unstyled = false
}: {
  session: BookingSessionView;
  // The booking's sessions that day, including `session`.
  // Applying or withdrawing on `session` carries across all of them.
  daySessions?: BookingSessionView[];
  action: (formData: FormData) => void | Promise<void>;
  withdrawAction?: (formData: FormData) => void | Promise<void>;
  returnTo: string;
  className?: string;
  label?: ReactNode;
  unstyled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const group = daySessions && daySessions.length > 0 ? daySessions : [session];
  const isMultiSession = group.length > 1;
  const { presentationTitles, yearLevels, studentCount } = sessionGroupSummary(group);

  return (
    <>
      {unstyled ? (
        <button type="button" onClick={() => setOpen(true)} className={className}>
          {label ?? session.schoolName}
        </button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(true)}
          className={
            className ??
            "border-transparent bg-[#e8f1fd] text-[#1e4fae] shadow-none hover:bg-[#dceafe]"
          }
        >
          {label ?? (session.myApplicationStatus === "applied" ? "Review application" : "View & apply")}
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      )}

      {open
        ? createPortal(
            <BookingDialogShell
              kicker={presentationTitles.join(" + ")}
              title={session.schoolName}
              description="School contact details stay private until you are assigned to the session."
              onClose={() => setOpen(false)}
              compact
              maxWidthClassName="max-w-[860px]"
            >
              <div className="mt-7 grid gap-4 md:grid-cols-2">
                <DetailTile
                  icon={<CalendarDays className="h-4 w-4" />}
                  label="Schedule"
                  value={`${formatWeekdayDate(session.startsAt, true)} at ${group
                    .map((item) => formatTime(item.startsAt))
                    .join(" & ")}`}
                />
                <DetailTile
                  icon={<MapPin className="h-4 w-4" />}
                  label="Region"
                  value={session.regionName ?? session.regionSlug}
                />
                <DetailTile
                  icon={<Presentation className="h-4 w-4" />}
                  label="Year levels"
                  value={yearLevels.join(" / ")}
                />
                <DetailTile
                  icon={<UsersRound className="h-4 w-4" />}
                  label="Expected students"
                  value={`${studentCount} students${isMultiSession ? " in total" : ""}`}
                />
              </div>

              {isMultiSession ? (
                <div className="mt-4 rounded-[18px] border border-[#c8dcfb] bg-[#f5f9ff] px-4 py-3 text-sm text-[#1e4fae]">
                  <p className="font-semibold">
                    {group.length} sessions · one booking, one report. Applying or withdrawing
                    covers all of them.
                  </p>
                  <ul className="mt-2 grid gap-1">
                    {group.map((item) => (
                      <li key={item.id}>
                        {formatTime(item.startsAt)} · {item.presentationTitle} · {item.expectedStudentCount}{" "}
                        students · {item.yearLevels}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

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
                    />
                  ) : null}
                </div>
              ) : (
                <form action={action} className="mt-6 grid gap-4">
                  <input type="hidden" name="bookingSessionId" value={session.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-[color:var(--navy)]">
                      Anything we should know?{" "}
                      <span className="font-normal text-[color:var(--text-soft)]">(optional)</span>
                    </span>
                    <Textarea
                      name="message"
                      maxLength={2000}
                      placeholder="e.g. your availability on the day, travel plans, or experience with this presentation."
                    />
                  </label>
                  <div className="flex flex-wrap justify-end gap-3">
                    <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-[#18a83b] text-white hover:bg-[#12852f]">
                      <Send className="h-4 w-4" />
                      {isMultiSession ? `Apply for all ${group.length} sessions` : "Apply for session"}
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
