import type { ReactNode } from "react";
import { CalendarCheck2, FileText, UserRound, UsersRound } from "lucide-react";

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
  initialBookingId
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
}) {
  const filteredBookings = filterBookingsByLifecycle(bookings, activeView);
  const sessions = bookings.flatMap((booking) => booking.sessions);
  const approvedAmbassadors = ambassadors.filter((ambassador) => ambassador.status === "approved");
  const assignedCount = sessions.filter((session) => session.assignedAmbassadorName).length;
  const reportsCount = sessions.filter(
    (session) => session.reportStatus === "submitted" || session.reportStatus === "reviewed"
  ).length;

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <LifecycleStatTile
          accentClassName="border-l-[3px] border-l-[#18a83b]"
          icon={<CalendarCheck2 className="h-5 w-5" />}
          iconClassName="bg-[#eaf8ee] text-[#117a2e]"
          label="Booking requests"
          value={String(bookings.length)}
          hint="Total requests received"
        />
        <LifecycleStatTile
          accentClassName="border-l-[3px] border-l-[#18a83b]"
          icon={<UsersRound className="h-5 w-5" />}
          iconClassName="bg-[#eaf8ee] text-[#117a2e]"
          label="Sessions"
          value={String(sessions.length)}
          hint="Total sessions requested"
        />
        <LifecycleStatTile
          accentClassName="border-l-[3px] border-l-[#2563eb]"
          icon={<UserRound className="h-5 w-5" />}
          iconClassName="bg-[#e8f1fd] text-[#1e4fae]"
          label="Assigned sessions"
          value={String(assignedCount)}
          hint="Sessions with ambassadors"
        />
        <LifecycleStatTile
          accentClassName="border-l-[3px] border-l-[#7c3aed]"
          icon={<FileText className="h-5 w-5" />}
          iconClassName="bg-[#f1edfd] text-[#7c3aed]"
          label="Reports submitted"
          value={String(reportsCount)}
          hint="Reports submitted this period"
        />
      </div>

      {activeView !== "all" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--text-soft)]">
          <p>Showing {activeView === "current" ? "bookings needing attention" : `${activeView} bookings`} in both views.</p>
          <ButtonLink href={`${basePath}/bookings?status=all&range=${range}`} variant="secondary">
            Show all bookings
          </ButtonLink>
        </div>
      ) : null}
      <BookingsExplorer
        key={`${activeView}:${initialBookingId || ""}`}
        bookings={filteredBookings}
        allBookings={bookings}
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
  hint
}: {
  accentClassName: string;
  icon: ReactNode;
  iconClassName: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-[20px] border border-[color:var(--border-soft)] bg-white/92 p-5",
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
