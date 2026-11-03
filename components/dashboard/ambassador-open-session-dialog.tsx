"use client";

import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  MapPin,
  Presentation,
  Send,
  TriangleAlert,
  UsersRound
} from "lucide-react";
import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { BookingDialogShell } from "@/components/site/booking-dialog-shell";
import { AmbassadorApplicationWithdrawDialog } from "@/components/dashboard/ambassador-application-withdraw-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { BookingSessionView } from "@/lib/domain/types";
import {
  additionalAmountLabel,
  additionalCentsForTier,
  classifyReportGroup
} from "@/lib/payment-breakdown";
import { sessionGroupSummary } from "@/lib/same-day-sessions";
import { formatCurrency, formatTime, formatWeekdayDate } from "@/lib/utils";

// The live payment settings, provided once by the ambassador portal so every
// apply dialog can show what the session would pay.
export type AmbassadorPayRates = { deliveryCents: number; eligibleThreshold: number };

const AmbassadorPayRatesContext = createContext<AmbassadorPayRates | null>(null);

export function AmbassadorPayRatesProvider({
  rates,
  children
}: {
  rates: AmbassadorPayRates;
  children: ReactNode;
}) {
  return (
    <AmbassadorPayRatesContext.Provider value={rates}>{children}</AmbassadorPayRatesContext.Provider>
  );
}

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
  const payRates = useContext(AmbassadorPayRatesContext);

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

              {payRates ? (
                <PayEstimate group={group} studentCount={studentCount} rates={payRates} />
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

// What the day would pay, using the same tier rules as the report payment. The
// second-session amount is preselected for staff, who confirm it at approval.
export function PayEstimate({
  group,
  studentCount,
  rates
}: {
  group: BookingSessionView[];
  studentCount: number;
  rates: AmbassadorPayRates;
}) {
  const { tier } = classifyReportGroup(group);
  const extraCents = additionalCentsForTier(tier);
  const staffSetsExtra = tier === "custom_review";
  const belowThreshold = studentCount < rates.eligibleThreshold;

  return (
    <div className="mt-4 rounded-[18px] border border-[rgba(24,168,59,0.28)] bg-[color:var(--green-soft)] px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#1d6f35]">
          <CircleDollarSign className="h-4 w-4" />
          Estimated pay
        </p>
        <p className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
          {staffSetsExtra ? "From " : ""}
          {formatCurrency(rates.deliveryCents + extraCents)}
        </p>
      </div>
      <p className="mt-1 text-sm text-[color:var(--navy)]">
        {formatCurrency(rates.deliveryCents)} delivery fee
        {extraCents > 0
          ? ` + ${formatCurrency(extraCents)} for the ${additionalAmountLabel(tier)}`
          : ""}
        {staffSetsExtra ? ". Staff set any extra for this schedule when they approve your report." : ""}
      </p>
      <p className="mt-2 text-xs leading-5 text-[color:var(--text-soft)]">
        This is an estimate. You&apos;re paid once your report shows at least {rates.eligibleThreshold}{" "}
        students attended, and staff confirm the final amount.
      </p>
      {belowThreshold ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold leading-5 text-[#9a5a00]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This booking expects {studentCount} students, fewer than the {rates.eligibleThreshold} needed
          for payment.
        </p>
      ) : null}
    </div>
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
