import Link from "next/link";
import type { ReactNode } from "react";
import {
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  CheckCircle2,
  Clock3,
  UserMinus,
  UsersRound
} from "lucide-react";

import {
  assignAmbassadorAction,
  confirmRescheduledSessionAction,
  bulkUpdateBookingStatusAction,
  bulkDeleteBookingsAction,
  createSessionTeamsLinkAction,
  mergeSchoolAction,
  resolveSessionRescheduleAction,
  resolveSessionWithdrawalAction,
  updateBookingStatusAction,
  updateBookingStatusInPlaceAction,
  updateSessionMeetingLinkAction,
  updateSessionStudentCountsAction
} from "@/app/portal/actions";
import { BookingsExplorer } from "@/components/dashboard/bookings-explorer";
import { SchoolsExplorer } from "@/components/dashboard/schools-explorer";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type {
  AmbassadorProfile,
  BookingRequestView,
  BookingSessionView,
  PresentationType,
  School
} from "@/lib/domain/types";
import {
  buildSchoolDeliverySummaries,
  filterBookingsByLifecycle,
  isCancelledSession,
  isCompletedBooking,
  isDeliveredSession,
  sessionInRange,
  type BookingLifecycleView,
  type DashboardCustomRange,
  type DashboardRange
} from "@/lib/services/dashboard-insights";
import { isReschedulingSession, isWithdrawalSession } from "@/lib/session-status";
import { cn } from "@/lib/utils";

export function BookingLifecyclePanel({
  basePath,
  bookings,
  presentations,
  ambassadors,
  activeView,
  range,
  customRange,
  initialQuery,
  initialBookingId,
  metric = "all"
}: {
  basePath: string;
  bookings: BookingRequestView[];
  presentations: PresentationType[];
  ambassadors: AmbassadorProfile[];
  activeView: BookingLifecycleView;
  range: DashboardRange;
  customRange?: DashboardCustomRange | null;
  initialQuery?: string;
  initialBookingId?: string;
  metric?: string;
}) {
  const now = new Date();
  const periodBookings = range === "all" ? bookings : bookings.map(booking => ({
    ...booking,
    sessions: booking.sessions.filter(session => sessionInRange(session, range, now, customRange))
  })).filter(booking => booking.sessions.length > 0);
  // Same delivered rule as the dashboard: a delivered-capable status whose
  // session has ended. Confirmed means confirmed/assigned and still to come.
  const isCompleted = (session: BookingSessionView) => isDeliveredSession(session, now);
  const isCancelled = (session: BookingSessionView) => isCancelledSession(session);
  // Sessions waiting on a reschedule (requested, or a date the school moved
  // that staff haven't confirmed) or an ambassador withdrawal get their own
  // groups so they never hide inside Confirmed or Pending.
  const isRescheduling = (session: BookingSessionView) =>
    isReschedulingSession(session) && !isCompleted(session) && !isCancelled(session);
  const isWithdrawal = (session: BookingSessionView) =>
    isWithdrawalSession(session) && !isCompleted(session);
  const isConfirmed = (session: BookingSessionView) =>
    ["confirmed", "ambassador_assigned"].includes(session.status) &&
    !isCompleted(session) &&
    !isRescheduling(session);
  const isPending = (session: BookingSessionView) =>
    !isCompleted(session) &&
    !isCancelled(session) &&
    !isConfirmed(session) &&
    !isRescheduling(session) &&
    !isWithdrawal(session);
  const hasReport = (status: string) => ["submitted", "reviewed"].includes(status);
  // Same rule as the dashboard's "no student number" flag.
  const isMissingStudents = (session: BookingSessionView) =>
    isCompleted(session) &&
    !(Number(session.actualStudentCount ?? session.expectedStudentCount ?? 0) > 0);
  // Completed counts bookings by their own status, the same as the dashboard's
  // completed bookings; the other tiles count sessions.
  const completedBookings = periodBookings.filter(isCompletedBooking);
  const metricBookings = metric === "all" ? periodBookings : metric === "completed" ? completedBookings : periodBookings.map(booking => ({
    ...booking,
    sessions: booking.sessions.filter(session => {
      if (metric === "cancelled") return isCancelled(session);
      if (metric === "pending") return isPending(session);
      if (metric === "confirmed") return isConfirmed(session);
      if (metric === "rescheduling") return isRescheduling(session);
      if (metric === "withdrawal") return isWithdrawal(session);
      if (metric === "reports") return hasReport(session.reportStatus);
      if (metric === "missing-reports") return isCompleted(session) && !hasReport(session.reportStatus);
      if (metric === "missing-students") return isMissingStudents(session);
      return true;
    })
  })).filter(booking => booking.sessions.length);
  const filteredBookings = filterBookingsByLifecycle(metricBookings, activeView);
  const metricHref = (value: string) => {
    const query = new URLSearchParams({ range, status: "all", metric: value });
    if (customRange) { query.set("from", customRange.from); query.set("to", customRange.to); }
    return `${basePath}/bookings?${query}`;
  };
  const sessions = periodBookings.flatMap((booking) => booking.sessions);
  const approvedAmbassadors = ambassadors.filter((ambassador) => ambassador.status === "approved");
  const completedCount = completedBookings.length;
  const cancelledCount = sessions.filter(isCancelled).length;
  const confirmedCount = sessions.filter(isConfirmed).length;
  const pendingCount = sessions.filter(isPending).length;
  const reschedulingCount = sessions.filter(isRescheduling).length;
  const withdrawalCount = sessions.filter(isWithdrawal).length;

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        <LifecycleStatTile
          accentClassName="border-l-[3px] border-l-[#18a83b]"
          icon={<CalendarCheck2 className="h-5 w-5" />}
          iconClassName="bg-[#eaf8ee] text-[#117a2e]"
          href={metricHref("completed")}
          active={metric === "completed"}
          activeClassName="bg-[#eef8f1] hover:bg-[#eaf8ee]"
          label="Completed"
          value={String(completedCount)}
          info="Bookings whose status is completed: report due, reported, payment pending, paid or closed"
        />
        <LifecycleStatTile
          accentClassName="border-l-[3px] border-l-[#7c3aed]"
          icon={<CheckCircle2 className="h-5 w-5" />}
          iconClassName="bg-[#f1edfd] text-[#7c3aed]"
          href={metricHref("confirmed")}
          active={metric === "confirmed"}
          activeClassName="bg-[#f5f1fd] hover:bg-[#f1edfd]"
          label="Confirmed"
          value={String(confirmedCount)}
          info="Confirmed or ambassador assigned, still to come"
        />
        <LifecycleStatTile
          accentClassName="border-l-[3px] border-l-[#ea580c]"
          icon={<CalendarClock className="h-5 w-5" />}
          iconClassName="bg-[#fff1e6] text-[#c2410c]"
          href={metricHref("rescheduling")}
          active={metric === "rescheduling"}
          activeClassName="bg-[#fff5ec] hover:bg-[#fff1e6]"
          label="Rescheduling"
          value={String(reschedulingCount)}
          info="A school asked to move the date, or moved it themselves and the new date needs confirming"
        />
        <LifecycleStatTile
          accentClassName="border-l-[3px] border-l-[#db2777]"
          icon={<UserMinus className="h-5 w-5" />}
          iconClassName="bg-[#fdf0f6] text-[#be185d]"
          href={metricHref("withdrawal")}
          active={metric === "withdrawal"}
          activeClassName="bg-[#fdf2f8] hover:bg-[#fdf0f6]"
          label="Withdrawal"
          value={String(withdrawalCount)}
          info="The assigned ambassador asked to withdraw and staff need to decide"
        />
        <LifecycleStatTile
          accentClassName="border-l-[3px] border-l-[#d97706]"
          icon={<Clock3 className="h-5 w-5" />}
          iconClassName="bg-[#fff5df] text-[#9a5a00]"
          href={metricHref("pending")}
          active={metric === "pending"}
          activeClassName="bg-[#fff9eb] hover:bg-[#fff5df]"
          label="Pending"
          value={String(pendingCount)}
          info="Requested, tentative or applied: not confirmed with the school yet"
        />
        <LifecycleStatTile
          accentClassName="border-l-[3px] border-l-[#dc2626]"
          icon={<CalendarX2 className="h-5 w-5" />}
          iconClassName="bg-[#fef2f2] text-[#b91c1c]"
          href={metricHref("cancelled")}
          active={metric === "cancelled"}
          activeClassName="bg-[#fef2f2] hover:bg-[#feecec]"
          label="Cancelled"
          value={String(cancelledCount)}
          info="Cancelled or declined"
        />
        <LifecycleStatTile
          accentClassName="border-l-[3px] border-l-[#2563eb]"
          icon={<UsersRound className="h-5 w-5" />}
          iconClassName="bg-[#e8f1fd] text-[#1e4fae]"
          href={metricHref("all")}
          active={metric === "all"}
          activeClassName="bg-[#eef4fd] hover:bg-[#e8f1fd]"
          label="All sessions"
          value={String(sessions.length)}
          info="Every session in the selected period, whatever its status"
        />
      </div>

      {metric === "missing-students" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#f3dcae] bg-[#fff8ea] px-4 py-3 text-sm text-[#7a4a00]">
          <p>
            Showing {sessions.filter(isMissingStudents).length} completed{" "}
            {sessions.filter(isMissingStudents).length === 1 ? "session" : "sessions"} with no
            student number. Open Details to add it.
          </p>
          <ButtonLink href={metricHref("all")} variant="secondary">
            Show all bookings
          </ButtonLink>
        </div>
      ) : null}
      {activeView !== "all" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--text-soft)]">
          <p>Showing {activeView === "current" ? "bookings needing attention" : `${activeView} bookings`} in both views.</p>
          <ButtonLink href={`${basePath}/bookings?status=all&range=${range}${customRange ? `&from=${customRange.from}&to=${customRange.to}` : ""}`} variant="secondary">
            Show all bookings
          </ButtonLink>
        </div>
      ) : null}
      <BookingsExplorer
        key={`${metric}:${activeView}:${range}:${customRange?.from ?? ""}:${customRange?.to ?? ""}:${initialBookingId || ""}`}
        metric={metric}
        bookings={filteredBookings}
        allBookings={periodBookings}
        basePath={basePath}
        activeView={activeView}
        range={range}
        customRange={customRange}
        ambassadors={approvedAmbassadors.map((ambassador) => ({
          id: ambassador.id,
          name: ambassador.name
        }))}
        presentationTitles={presentations.map((presentation) => presentation.title)}
        updateStatusAction={updateBookingStatusAction}
        bulkUpdateStatusAction={bulkUpdateBookingStatusAction}
        bulkDeleteAction={bulkDeleteBookingsAction}
        assignAmbassadorAction={assignAmbassadorAction}
        resolveWithdrawalAction={resolveSessionWithdrawalAction}
        resolveRescheduleAction={resolveSessionRescheduleAction}
        updateStudentCountsAction={updateSessionStudentCountsAction}
        confirmRescheduleAction={confirmRescheduledSessionAction}
        updateMeetingLinkAction={updateSessionMeetingLinkAction}
        createTeamsLinkAction={createSessionTeamsLinkAction}
        updateStatusInPlaceAction={updateBookingStatusInPlaceAction}
        initialQuery={initialQuery}
        initialBookingId={initialBookingId}
      />
    </div>
  );
}

function LifecycleStatTile({
  accentClassName,
  icon,
  iconClassName,
  label,
  value,
  info,
  href,
  active,
  activeClassName
}: {
  accentClassName: string;
  icon: ReactNode;
  iconClassName: string;
  label: string;
  value: string;
  info: string;
  href: string;
  active: boolean;
  activeClassName: string;
}) {
  // The whole tile is clickable through the link's stretched ::after, while
  // the "?" sits beside the link (a button can't be nested inside an <a>).
  return (
    <div
      className={cn(
        "relative flex items-center gap-4 rounded-[20px] border border-[color:var(--border-soft)] p-5",
        "transition has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-blue-600",
        active ? activeClassName : "bg-white/92 hover:bg-slate-50",
        accentClassName
      )}
    >
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", iconClassName)}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm text-[color:var(--text-soft)]">
          <Link
            href={href}
            aria-current={active ? "page" : undefined}
            aria-label={`${label}: ${value}`}
            className="after:absolute after:inset-0 after:rounded-[20px] after:content-[''] focus-visible:outline-none"
          >
            {label}
          </Link>
          <span className="relative z-10">
            <InfoTooltip label={label}>{info}</InfoTooltip>
          </span>
        </span>
        <span className="block text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
          {value}
        </span>
      </span>
    </div>
  );
}

export function SchoolDeliveryDatabase({
  schools,
  bookings,
  regions,
  basePath
}: {
  schools: School[];
  bookings: BookingRequestView[];
  regions: Array<{ id: string; name: string; slug: string; isActive: boolean }>;
  basePath: string;
}) {
  const summaries = buildSchoolDeliverySummaries(schools, bookings);
  const pendingReviewSchools = schools.filter((school) => school.status === "pending_review");
  const mergeTargetSchools = schools.filter((school) => school.status === "active");
  // Latest booking contact per school, used as the "teacher" line in the table.
  const contactBySchoolId = new Map<string, string>();

  for (const booking of [...bookings].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )) {
    const schoolId = booking.sessions[0]?.schoolId;

    if (schoolId && booking.primaryContactName) {
      contactBySchoolId.set(schoolId, booking.primaryContactName);
    }
  }

  return (
    <div className="grid gap-5">
      <Card className="rounded-[28px]">
        <SchoolsExplorer
          summaries={summaries.map((summary) => ({
            school: summary.school,
            contactName:
              summary.school.contactName ?? contactBySchoolId.get(summary.school.id) ?? null,
            deliveredCount: summary.deliveredCount,
            upcomingCount: summary.upcomingCount,
            presentationsDelivered: summary.presentationsDelivered,
            yearGroupsReached: summary.yearGroupsReached,
            lastDeliveredLabel: summary.lastDeliveredLabel,
            nextSessionLabel: summary.nextSessionLabel,
            lastDeliveredAt: summary.lastDeliveredAt,
            nextSessionAt: summary.nextSessionAt
          }))}
          regions={regions.map((region) => ({ slug: region.slug, name: region.name }))}
          bookings={bookings}
          basePath={basePath}
          pendingReviewSchools={pendingReviewSchools}
          mergeTargetSchools={mergeTargetSchools}
          mergeSchoolAction={mergeSchoolAction}
        />
      </Card>
    </div>
  );
}
