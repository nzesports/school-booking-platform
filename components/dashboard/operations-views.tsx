import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarCheck2, CalendarX2, Clock3, CheckCircle2, UsersRound } from "lucide-react";

import {
  assignAmbassadorAction,
  bulkUpdateBookingStatusAction,
  bulkDeleteBookingsAction,
  mergeSchoolAction,
  resolveSessionRescheduleAction,
  resolveSessionWithdrawalAction,
  updateBookingStatusAction
} from "@/app/portal/actions";
import { BookingsExplorer } from "@/components/dashboard/bookings-explorer";
import { SchoolsExplorer } from "@/components/dashboard/schools-explorer";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type {
  AmbassadorProfile,
  BookingRequestView,
  PresentationType,
  School
} from "@/lib/domain/types";
import {
  buildSchoolDeliverySummaries,
  filterBookingsByLifecycle,
  sessionInRange,
  type BookingLifecycleView,
  type DashboardCustomRange,
  type DashboardRange
} from "@/lib/services/dashboard-insights";
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
  const isCompleted = (status: string) => ["completed_pending_report", "report_submitted", "payment_pending", "paid", "closed"].includes(status);
  const isCancelled = (status: string) => ["cancelled", "declined"].includes(status);
  const isConfirmed = (status: string) => status === "confirmed";
  const isPending = (status: string) => !isCompleted(status) && !isCancelled(status) && !isConfirmed(status);
  const hasReport = (status: string) => ["submitted", "reviewed"].includes(status);
  const metricBookings = metric === "all" ? periodBookings : periodBookings.map(booking => ({
    ...booking,
    sessions: booking.sessions.filter(session => {
      if (metric === "completed") return isCompleted(session.status);
      if (metric === "cancelled") return isCancelled(session.status);
      if (metric === "pending") return isPending(session.status);
      if (metric === "confirmed") return isConfirmed(session.status);
      if (metric === "reports") return hasReport(session.reportStatus);
      if (metric === "missing-reports") return isCompleted(session.status) && !hasReport(session.reportStatus);
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
  const completedCount = sessions.filter(session => isCompleted(session.status)).length;
  const cancelledCount = sessions.filter(session => isCancelled(session.status)).length;
  const confirmedCount = sessions.filter(session => isConfirmed(session.status)).length;
  const pendingCount = sessions.filter(session => isPending(session.status)).length;

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <LifecycleStatTile
          accentClassName="border-l-[3px] border-l-[#2563eb]"
          icon={<UsersRound className="h-5 w-5" />}
          iconClassName="bg-[#e8f1fd] text-[#1e4fae]"
          href={metricHref("all")}
          active={metric === "all"}
          activeClassName="bg-[#eef4fd] hover:bg-[#e8f1fd]"
          label="Sessions"
          value={String(sessions.length)}
          hint="Total in selected period"
        />
        <LifecycleStatTile
          accentClassName="border-l-[3px] border-l-[#18a83b]"
          icon={<CalendarCheck2 className="h-5 w-5" />}
          iconClassName="bg-[#eaf8ee] text-[#117a2e]"
          href={metricHref("completed")}
          active={metric === "completed"}
          activeClassName="bg-[#eef8f1] hover:bg-[#eaf8ee]"
          label="Completed"
          value={String(completedCount)}
          hint="Marked as completed"
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
          hint="Confirmed, not yet completed"
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
          hint="Awaiting confirmation or resolution"
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
          hint="Cancelled or declined"
        />
      </div>

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
  hint,
  href,
  active,
  activeClassName
}: {
  accentClassName: string;
  icon: ReactNode;
  iconClassName: string;
  label: string;
  value: string;
  hint: string;
  href: string;
  active: boolean;
  activeClassName: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-4 rounded-[20px] border border-[color:var(--border-soft)] p-5",
        "transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600",
        active ? activeClassName : "bg-white/92 hover:bg-slate-50",
        accentClassName
      )}
    >
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", iconClassName)}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-[color:var(--text-soft)]">{label}</span>
        <span className="block text-2xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
          {value}
        </span>
        <span className="block text-xs text-[color:var(--text-soft)]">{hint}</span>
      </span>
    </Link>
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
