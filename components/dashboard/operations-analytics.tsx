import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Bell,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleX,
  CircleDollarSign,
  ClipboardList,
  FilePlus2,
  FileText,
  FolderOpen,
  Globe2,
  Home,
  Hourglass,
  Download,
  Eye,
  Mail,
  MapPinned,
  School2,
  ShieldCheck,
  UserCheck,
  UsersRound
} from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StarRating } from "@/components/ui/star-rating";
import type {
  AmbassadorProfile,
  BookingRequestView,
  BookingSessionView,
  PaymentRecord,
  PresentationType,
  ReportSummary,
  School,
  SchoolFeedbackSummary
} from "@/lib/domain/types";
import {
  bookingInRange,
  buildYearGroupCoverage,
  isCancelledSession,
  isCompletedBooking,
  isDeliveredSession,
  isFutureSession,
  reportInRange,
  reviewInRange,
  sessionInRange,
  type DashboardCustomRange,
  type DashboardRange
} from "@/lib/services/dashboard-insights";
import type { ResourceRecord } from "@/lib/services/portal";
import { cn, formatCurrency, formatTime, formatWeekdayDate } from "@/lib/utils";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const BOOKING_REVIEW_STATUSES = new Set([
  "requested",
  "tentative",
  "applied",
  "withdrawal_requested",
  "reschedule_requested"
]);
const BOOKING_PENDING_STATUSES = new Set([
  "requested",
  "tentative",
  "applied",
  "reschedule_requested"
]);
const BOOKING_CONFIRMED_STATUSES = new Set(["ambassador_assigned", "confirmed"]);
const BOOKING_COMPLETED_STATUSES = new Set([
  "completed_pending_report",
  "report_submitted",
  "payment_pending",
  "paid",
  "closed"
]);
const BOOKING_CANCELLED_STATUSES = new Set(["cancelled", "declined"]);

type RegionSummary = { id: string; name: string; slug: string; isActive: boolean };

export function OperationsAnalytics({
  basePath,
  range,
  customRange,
  analyticsYear,
  periodLabel,
  bookings,
  reports,
  schoolReviews,
  ambassadors,
  payments,
  schools,
  presentations,
  resources,
  regions,
  resourcesLiveCount,
  unreadActivityCount,
  emailTemplatesCount,
  activeSuperAdminsCount,
  presentationsHref,
  regionsHref,
  calendarHref
}: {
  basePath: string;
  range: DashboardRange;
  customRange?: DashboardCustomRange | null;
  analyticsYear?: number;
  periodLabel: string;
  bookings: BookingRequestView[];
  reports: ReportSummary[];
  schoolReviews: SchoolFeedbackSummary[];
  ambassadors: AmbassadorProfile[];
  payments: PaymentRecord[];
  schools: School[];
  presentations: PresentationType[];
  resources: ResourceRecord[];
  regions: RegionSummary[];
  resourcesLiveCount: number;
  unreadActivityCount: number;
  emailTemplatesCount?: number;
  activeSuperAdminsCount?: number;
  presentationsHref: string;
  regionsHref?: string;
  calendarHref?: string;
}) {
  const now = new Date();
  const year = now.getFullYear();
  const allSessions = bookings.flatMap((booking) => booking.sessions);
  const availableAnalyticsYears = Array.from(
    new Set([
      year,
      ...bookings.map((booking) => new Date(booking.createdAt).getFullYear()),
      ...allSessions.map((session) => new Date(session.startsAt).getFullYear()),
      ...reports.map((report) =>
        new Date(report.sessionStartsAt ?? report.submittedAt).getFullYear()
      )
    ])
  )
    .filter((value) => Number.isFinite(value) && value >= 2000 && value <= year)
    .sort((left, right) => left - right);
  const selectedAnalyticsYear = availableAnalyticsYears.includes(analyticsYear ?? year)
    ? (analyticsYear ?? year)
    : (availableAnalyticsYears.at(-1) ?? year);
  const selectedYearIndex = availableAnalyticsYears.indexOf(selectedAnalyticsYear);
  const olderAnalyticsYear =
    selectedYearIndex > 0 ? availableAnalyticsYears[selectedYearIndex - 1] : undefined;
  const newerAnalyticsYear =
    selectedYearIndex >= 0 && selectedYearIndex < availableAnalyticsYears.length - 1
      ? availableAnalyticsYears[selectedYearIndex + 1]
      : undefined;
  const analyticsYearHref = (value: number) => {
    const searchParams = new URLSearchParams({
      range,
      analyticsYear: String(value)
    });

    if (customRange) {
      searchParams.set("from", customRange.from);
      searchParams.set("to", customRange.to);
    }

    return `${basePath}?${searchParams.toString()}`;
  };

  // Range-scoped data drives the glance strip and pipeline; yearly data drives the charts.
  const rangeBookings = bookings.filter((booking) =>
    bookingInRange(booking, range, now, customRange)
  );
  const rangeSessions = rangeBookings.flatMap((booking) =>
    booking.sessions.filter((session) => sessionInRange(session, range, now, customRange))
  );
  const rangeReports = reports.filter((report) =>
    reportInRange(report, range, now, customRange)
  );
  const rangeReviews = schoolReviews.filter((review) =>
    reviewInRange(review, range, now, customRange)
  );
  const deliveredRangeSessions = rangeSessions.filter((session) => isDeliveredSession(session, now));
  const approvedAmbassadors = ambassadors.filter((ambassador) => ambassador.status === "approved");
  const pendingApplications = ambassadors.filter((ambassador) => ambassador.status === "applied");
  const publicPresentations = presentations.filter(
    (presentation) =>
      presentation.active && presentation.public && presentation.slug !== "careers"
  );

  const pipeline = buildBookingPipeline(rangeBookings, rangeSessions, now);
  const studentsReachedRange = countStudentsReached(rangeReports, deliveredRangeSessions);

  const analyticsYearBookings = bookings.filter(
    (booking) => new Date(booking.createdAt).getFullYear() === selectedAnalyticsYear
  );
  const currentYearBookings = bookings.filter(
    (booking) => new Date(booking.createdAt).getFullYear() === year
  );
  const activity = buildYearlyActivity(bookings, allSessions, selectedAnalyticsYear);
  const sources = buildSourceBreakdown(analyticsYearBookings);
  const bookingStatuses = buildBookingStatusBreakdown(analyticsYearBookings);
  const previousYearSources = buildSourceBreakdown(
    bookings.filter(
      (booking) => new Date(booking.createdAt).getFullYear() === selectedAnalyticsYear - 1
    )
  );
  const studentSeries = buildYearlyStudentSeries(reports, allSessions, selectedAnalyticsYear);
  const yearStudentsTotal = studentSeries.reduce((total, point) => total + point.value, 0);
  const lastYearStudentsTotal = buildYearlyStudentSeries(
    reports,
    allSessions,
    selectedAnalyticsYear - 1
  ).reduce((total, point) => total + point.value, 0);
  const yearSchoolsReached = new Set(
    allSessions
      .filter(
        (session) =>
          new Date(session.startsAt).getFullYear() === selectedAnalyticsYear &&
          isDeliveredSession(session, now)
      )
      .map((session) => session.schoolName)
  ).size;

  const paymentSummary = buildPaymentSummary(payments, year);
  const regionCoverage = buildRegionCoverage(approvedAmbassadors, regions);
  const ambassadorFunnel = buildAmbassadorFunnel(currentYearBookings, now);
  const sessionsAssignedThisYear = allSessions.filter(
    (session) =>
      new Date(session.startsAt).getFullYear() === year &&
      session.assignedAmbassadorName &&
      !isCancelledSession(session)
  ).length;

  const impact = buildMonthlyImpact(reports, allSessions, now);
  const feedback = buildFeedbackSummary(rangeReports, rangeReviews);
  const coverage = buildYearGroupCoverage(
    allSessions.filter((session) => new Date(session.startsAt).getFullYear() === year)
  );
  const upcomingSessions = allSessions
    .filter((session) => isFutureSession(session, now))
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());

  const bookingsHref = (view: string) => {
    const searchParams = new URLSearchParams({ status: view, range });

    if (customRange) {
      searchParams.set("from", customRange.from);
      searchParams.set("to", customRange.to);
    }

    return `${basePath}/bookings?${searchParams.toString()}`;
  };

  return (
    <div className="grid gap-6">
      <GlanceStrip
        items={[
          {
            icon: <ClipboardList className="h-5 w-5 text-[#c07a12]" />,
            value: pipeline.needsReview,
            label: pipeline.needsReview === 1 ? "booking needs review" : "bookings need review",
            href: bookingsHref("current")
          },
          {
            icon: <CheckCircle2 className="h-5 w-5 text-[color:var(--green)]" />,
            value: deliveredRangeSessions.length,
            label: deliveredRangeSessions.length === 1 ? "session completed" : "sessions completed",
            href: bookingsHref("past")
          },
          {
            icon: <UsersRound className="h-5 w-5 text-[#246bff]" />,
            value: studentsReachedRange,
            label: "students reached",
            href: `${basePath}/reports`
          },
          {
            icon: <UserCheck className="h-5 w-5 text-[color:var(--green)]" />,
            value: approvedAmbassadors.length,
            label: approvedAmbassadors.length === 1 ? "ambassador available" : "ambassadors available",
            href: `${basePath}/ambassadors`
          }
        ]}
      />

      <Card className="rounded-[32px] border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,251,255,0.9))]">
        <SectionKicker label="Bookings overview" />
        <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          <PipelineCard
            icon={<FilePlus2 className="h-5 w-5 text-[#246bff]" />}
            label="New bookings"
            value={pipeline.newBookings}
            href={bookingsHref("all")}
            withArrow
          />
          <PipelineCard
            icon={<ClipboardList className="h-5 w-5 text-[#c07a12]" />}
            label="Needs review"
            value={pipeline.needsReview}
            href={bookingsHref("current")}
            withArrow
          />
          <PipelineCard
            icon={<ShieldCheck className="h-5 w-5 text-[color:var(--green)]" />}
            label="Confirmed bookings"
            value={pipeline.confirmed}
            href={bookingsHref("future")}
            withArrow
          />
          <PipelineCard
            icon={<CalendarDays className="h-5 w-5 text-[#246bff]" />}
            label="Confirmed upcoming"
            value={pipeline.upcomingSessions}
            href={calendarHref ?? bookingsHref("future")}
            withArrow
          />
          <PipelineCard
            icon={<Hourglass className="h-5 w-5 text-[#c07a12]" />}
            label="Pending bookings"
            value={pipeline.pending}
            href={bookingsHref("current")}
            withArrow
          />
          <PipelineCard
            icon={<Home className="h-5 w-5 text-[color:var(--green)]" />}
            label="Completed bookings"
            value={pipeline.completed}
            href={bookingsHref("past")}
          />
          <PipelineCard
            icon={<CircleX className="h-5 w-5 text-[#b3372e]" />}
            label="Cancelled bookings"
            value={pipeline.cancelled}
            href={bookingsHref("cancelled")}
          />
        </div>
        <PipelineTimeline />
      </Card>

      <Card className="rounded-[32px] border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,251,255,0.9))]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionKicker label="Key analytics" />
          <YearNavigator
            year={selectedAnalyticsYear}
            olderHref={
              olderAnalyticsYear ? analyticsYearHref(olderAnalyticsYear) : undefined
            }
            newerHref={
              newerAnalyticsYear ? analyticsYearHref(newerAnalyticsYear) : undefined
            }
          />
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(250px,0.775fr)_minmax(250px,0.775fr)]">
          <ChartPanel title={`Bookings and sessions over time (${selectedAnalyticsYear})`}>
            <div className="flex flex-wrap items-center gap-5 text-xs font-semibold text-[color:var(--text-soft)]">
              <LegendDot color="#18a83b" label="Bookings" />
              <LegendDot color="#246bff" label="Sessions" />
            </div>
            <DualLineChart series={activity.series} />
            <ChartFootnote icon={<ArrowRight className="h-4 w-4 text-[color:var(--green)]" />}>
              {activity.trendNote}
            </ChartFootnote>
          </ChartPanel>

          <ChartPanel title={`Where bookings come from (${selectedAnalyticsYear})`}>
            <div className="grid gap-4">
              <DonutChart total={sources.total} segments={sources.segments} />
              <div className="grid gap-2.5 border-t border-[color:rgba(4,15,75,0.07)] pt-4">
                {sources.segments.map((segment) => (
                  <div key={segment.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-medium text-[color:var(--navy)]">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                      {segment.label}
                    </span>
                    <span className="font-semibold text-[color:var(--navy)]">
                      {segment.value}{" "}
                      <span className="font-medium text-[color:var(--text-soft)]">({segment.percent}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <ChartFootnote icon={<CheckCircle2 className="h-4 w-4 text-[color:var(--green)]" />}>
              {previousYearSources.total > 0
                ? `${formatSignedDelta(sources.total - previousYearSources.total)} bookings vs ${selectedAnalyticsYear - 1}`
                : `All booking data for Jan – Dec ${selectedAnalyticsYear}`}
            </ChartFootnote>
          </ChartPanel>

          <ChartPanel title={`Booking status (${selectedAnalyticsYear})`} tone="green">
            <div className="grid gap-4">
              <DonutChart total={bookingStatuses.total} segments={bookingStatuses.segments} />
              <div className="grid gap-2.5 border-t border-[color:rgba(4,15,75,0.07)] pt-4">
                {bookingStatuses.segments.map((segment) => (
                  <div key={segment.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-medium text-[color:var(--navy)]">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: segment.color }}
                      />
                      {segment.label}
                    </span>
                    <span className="font-semibold text-[color:var(--navy)]">
                      {segment.value}{" "}
                      <span className="font-medium text-[color:var(--text-soft)]">
                        ({segment.percent}%)
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <ChartFootnote icon={<CheckCircle2 className="h-4 w-4 text-[color:var(--green)]" />}>
              {bookingStatuses.total > 0
                ? `${bookingStatuses.completionRate}% of bookings completed`
                : `No bookings recorded in ${selectedAnalyticsYear}`}
            </ChartFootnote>
          </ChartPanel>
        </div>
      </Card>

      <Card className="rounded-[32px] border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,251,255,0.9))]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionKicker label={`Students reached (${selectedAnalyticsYear})`} />
          <YearNavigator
            year={selectedAnalyticsYear}
            olderHref={
              olderAnalyticsYear ? analyticsYearHref(olderAnalyticsYear) : undefined
            }
            newerHref={
              newerAnalyticsYear ? analyticsYearHref(newerAnalyticsYear) : undefined
            }
          />
        </div>
        <div className="mt-5 grid gap-6 xl:grid-cols-[0.32fr_0.68fr] xl:items-center">
          <div>
            <p className="text-6xl font-semibold tracking-[-0.06em] text-[color:var(--navy)]">
              {yearStudentsTotal.toLocaleString("en-NZ")}
            </p>
            <p className="mt-2 text-lg font-semibold text-[color:var(--navy)]">Students reached</p>
            <div className="mt-4 grid gap-2">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#eaf8ee] px-3 py-1.5 text-xs font-semibold text-[#1d6f35]">
                <UsersRound className="h-3.5 w-3.5" />
                {yearStudentsTotal.toLocaleString("en-NZ")} students across {yearSchoolsReached}{" "}
                {yearSchoolsReached === 1 ? "school" : "schools"}
              </span>
              {yearStudentsTotal > 0 || lastYearStudentsTotal > 0 ? (
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#eef4ff] px-3 py-1.5 text-xs font-semibold text-[#1d4dbb]">
                  <ArrowRight className="h-3.5 w-3.5" />
                  {formatSignedDelta(yearStudentsTotal - lastYearStudentsTotal)} vs last year
                </span>
              ) : null}
            </div>
          </div>
          <div>
            <MonthlyBarChart series={studentSeries} />
            <ChartFootnote icon={<UsersRound className="h-4 w-4 text-[#246bff]" />}>
              Yearly trend (Jan – Dec {selectedAnalyticsYear})
            </ChartFootnote>
          </div>
        </div>
      </Card>

      <Card className="rounded-[32px] border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,251,255,0.9))]">
        <SectionKicker label="Ambassador operations" />
        <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <OpsTile
            icon={<CircleDollarSign className="h-5 w-5 text-[color:var(--green)]" />}
            label="Commission payments"
            value={formatCurrency(paymentSummary.paidThisYearCents)}
            detail={`${paymentSummary.paidThisYearCount} paid this year`}
            href={`${basePath}/payments`}
          />
          <OpsTile
            icon={<Hourglass className="h-5 w-5 text-[#c07a12]" />}
            label="Outstanding payments"
            value={formatCurrency(paymentSummary.outstandingCents)}
            detail={`${paymentSummary.outstandingCount} awaiting payout`}
            href={`${basePath}/payments`}
          />
          <OpsTile
            icon={<UserCheck className="h-5 w-5 text-[color:var(--green)]" />}
            label="Active ambassadors"
            value={String(approvedAmbassadors.length)}
            detail="Approved and available"
            href={`${basePath}/ambassadors`}
          />
          <OpsTile
            icon={<Bell className="h-5 w-5 text-[#c07a12]" />}
            label="Pending approvals"
            value={String(pendingApplications.length)}
            detail="Awaiting review"
            href={`${basePath}/ambassadors`}
          />
          <OpsTile
            icon={<CalendarCheck2 className="h-5 w-5 text-[#246bff]" />}
            label="Sessions assigned"
            value={String(sessionsAssignedThisYear)}
            detail="Year to date"
            href={calendarHref ?? bookingsHref("future")}
          />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.08fr_0.92fr] xl:grid-rows-[auto_auto]">
          <ChartPanel title="Ambassador coverage by region" tone="green" className="xl:row-span-2">
            {regionCoverage.length > 0 ? (
              <AmbassadorCoverageMap regions={regionCoverage} />
            ) : (
              <EmptyStateCopy copy="No approved ambassadors are assigned to a region yet." />
            )}
          </ChartPanel>

          <ChartPanel title="Ambassador-sourced bookings" tone="green">
            <StageBarChart
              stages={[
                { label: "Submitted", value: ambassadorFunnel.submitted },
                { label: "Confirmed", value: ambassadorFunnel.confirmed },
                { label: "Completed", value: ambassadorFunnel.completed }
              ]}
            />
            <ChartFootnote icon={<UsersRound className="h-4 w-4 text-[color:var(--green)]" />}>
              {ambassadorFunnel.completed > 0
                ? `${ambassadorFunnel.completed} ${
                    ambassadorFunnel.completed === 1 ? "booking" : "bookings"
                  } completed via ambassador referral`
                : "No ambassador-referred bookings completed yet this year"}
            </ChartFootnote>
          </ChartPanel>

        <div className="rounded-[26px] border border-[color:rgba(4,15,75,0.08)] bg-white/92 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[color:var(--navy)]">
              Outstanding payment submissions
            </p>
            <ButtonLink href={`${basePath}/payments`} variant="ghost" className="min-h-[40px] px-3 py-2">
              Open payments
              <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
          <div className="mt-4 grid gap-3">
            {paymentSummary.outstanding.slice(0, 4).map((payment) => (
              <div
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-[linear-gradient(135deg,#fffaf2,#fdfdf6)] px-4 py-3.5 shadow-[inset_0_0_0_1px_rgba(192,122,18,0.14)]"
              >
                <div>
                  <p className="font-semibold text-[color:var(--navy)]">{payment.ambassadorName}</p>
                  <p className="mt-0.5 text-sm text-[color:var(--text-soft)]">
                    {payment.invoiceNumber
                      ? `Invoice ${payment.invoiceNumber} · ${payment.eligibilityReason}`
                      : payment.eligibilityReason}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                    {formatCurrency(payment.amountCents)}
                  </p>
                  <span className="rounded-full bg-[#fff3dd] px-3 py-1 text-xs font-semibold text-[#c07a12]">
                    {outstandingPaymentLabels[payment.status] ?? "Outstanding"}
                  </span>
                </div>
              </div>
            ))}
            {paymentSummary.outstanding.length === 0 ? (
              <EmptyStateCopy copy="No outstanding ambassador payments — every eligible submission has been paid." />
            ) : null}
            {paymentSummary.outstanding.length > 4 ? (
              <p className="text-sm text-[color:var(--text-soft)]">
                +{paymentSummary.outstanding.length - 4} more in the payment queue.
              </p>
            ) : null}
          </div>
        </div>
        </div>
      </Card>

      <Card className="rounded-[32px] border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,251,255,0.9))]">
        <SectionKicker label="Delivery and impact" />
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <ImpactCard title="Upcoming presentations">
            {upcomingSessions.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {upcomingSessions.slice(0, 2).map((session) => (
                  <div key={session.id} className="rounded-[16px] bg-[color:var(--blue-soft)] px-3 py-2.5">
                    <p className="text-sm font-semibold text-[color:var(--navy)]">
                      {session.presentationTitle}
                    </p>
                    <p className="mt-0.5 text-xs text-[color:var(--text-soft)]">
                      {formatWeekdayDate(session.startsAt, true)} · {formatTime(session.startsAt)} ·{" "}
                      {session.schoolName}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 grid justify-items-center gap-2 rounded-[16px] border border-dashed border-[color:rgba(4,15,75,0.1)] px-3 py-5 text-center">
                <CalendarDays className="h-6 w-6 text-[color:var(--text-soft)]" />
                <p className="text-sm text-[color:var(--text-soft)]">
                  No upcoming presentations are scheduled yet.
                </p>
              </div>
            )}
          </ImpactCard>

          <ImpactCard title="Presentations delivered this month">
            <p className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">
              {impact.deliveredThisMonth}
            </p>
            <span className="mt-3 inline-flex w-fit rounded-full bg-[#eaf8ee] px-3 py-1 text-xs font-semibold text-[#1d6f35]">
              {formatSignedDelta(impact.deliveredThisMonth - impact.deliveredLastMonth)} vs last month
            </span>
            <p className="mt-2 text-sm text-[color:var(--text-soft)]">
              Across {impact.schoolsThisMonth} {impact.schoolsThisMonth === 1 ? "school" : "schools"}
            </p>
          </ImpactCard>

          <ImpactCard title="How we're performing">
            <div className="mt-3 grid gap-4">
              <Link href={`${basePath}/feedback`} className="group grid gap-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)] group-hover:text-[color:var(--navy)]">
                  School feedback
                </p>
                <RatingStars rating={feedback.schoolRating} />
                <p className="text-sm text-[color:var(--text-soft)]">
                  {feedback.schoolCount > 0
                    ? `${feedback.schoolRating.toFixed(1)}/5 from ${feedback.schoolCount} ${feedback.schoolCount === 1 ? "review" : "reviews"}`
                    : "No school reviews yet"}
                </p>
              </Link>
              <Link href={`${basePath}/reports`} className="group grid gap-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)] group-hover:text-[color:var(--navy)]">
                  Ambassador sessions
                </p>
                <RatingStars rating={feedback.ambassadorRating} />
                <p className="text-sm text-[color:var(--text-soft)]">
                  {feedback.ambassadorCount > 0
                    ? `${feedback.ambassadorRating.toFixed(1)}/5 from ${feedback.ambassadorCount} ${feedback.ambassadorCount === 1 ? "report" : "reports"}`
                    : "No session reports yet"}
                </p>
              </Link>
            </div>
          </ImpactCard>

          <ImpactCard title="Year groups reached">
            <p className="mt-3 text-lg font-semibold tracking-[-0.02em] text-[color:var(--navy)]">
              {coverage.reachedLabel}
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
              Coverage gaps
            </p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--navy)]">{coverage.gapLabel}</p>
          </ImpactCard>

          <ImpactCard title={`Student reach — ${periodLabel.toLowerCase()}`} tone="green">
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-4xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">
                {studentsReachedRange.toLocaleString("en-NZ")}
              </p>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf8ee] text-[color:var(--green)]">
                <UsersRound className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-sm text-[color:var(--text-soft)]">
              Students across {new Set(deliveredRangeSessions.map((session) => session.schoolName)).size || 0}{" "}
              {new Set(deliveredRangeSessions.map((session) => session.schoolName)).size === 1
                ? "school"
                : "schools"}
            </p>
          </ImpactCard>
        </div>
      </Card>

      <Card className="rounded-[32px] border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,251,255,0.9))]">
        <SectionKicker label="Platform and content health" />
        <div className="mt-5 grid gap-5 xl:grid-cols-3">
          <div className="rounded-[26px] border border-[color:rgba(4,15,75,0.08)] bg-white/92 p-5">
            <div className="grid gap-2.5">
              {publicPresentations.slice(0, 4).map((presentation) => {
                const presentationResource = resources.find(
                  (resource) =>
                    resource.category === "presentation_material" &&
                    resource.presentationTypeId === presentation.id &&
                    resource.isActive &&
                    resource.isCurrent
                );
                const viewHref = presentationResource
                  ? presentationResource.youtubeUrl ??
                    (presentationResource.storagePath
                      ? `/portal/download/${encodeURIComponent(presentationResource.id)}`
                      : presentationResource.externalUrl ?? presentationResource.downloadUrl)
                  : presentation.public
                    ? `/presentations/${presentation.slug}`
                    : undefined;
                const downloadHref = presentationResource?.storagePath
                  ? `/portal/download/${encodeURIComponent(presentationResource.id)}?download=1`
                  : presentationResource?.externalUrl ?? presentationResource?.downloadUrl;

                return <div key={presentation.id} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2.5 text-sm font-semibold text-[color:var(--navy)]">
                    <FileText className="h-4 w-4 text-[#246bff]" />
                    {presentation.title}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <PresentationFileAction href={viewHref} label={`View ${presentation.title}`} icon={<Eye className="h-4 w-4" />} />
                    <PresentationFileAction href={downloadHref} label={`Download ${presentation.title}`} icon={<Download className="h-4 w-4" />} />
                  </span>
                </div>;
              })}
              {publicPresentations.length === 0 ? (
                <EmptyStateCopy copy="No presentations have been published yet." />
              ) : null}
            </div>
            <FooterLink href={presentationsHref} label="View all presentations" />
          </div>

          <div className="rounded-[26px] border border-[color:rgba(4,15,75,0.08)] bg-white/92 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
              Platform footprint
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <FootprintStat
                icon={<School2 className="h-4 w-4 text-[color:var(--green)]" />}
                label="Schools in system"
                value={schools.length}
              />
              <FootprintStat
                icon={<FolderOpen className="h-4 w-4 text-[#246bff]" />}
                label="Resources live"
                value={resourcesLiveCount}
              />
              {typeof emailTemplatesCount === "number" ? (
                <FootprintStat
                  icon={<Mail className="h-4 w-4 text-[#246bff]" />}
                  label="Email templates"
                  value={emailTemplatesCount}
                />
              ) : (
                <FootprintStat
                  icon={<UserCheck className="h-4 w-4 text-[color:var(--green)]" />}
                  label="Approved ambassadors"
                  value={approvedAmbassadors.length}
                />
              )}
              <FootprintStat
                icon={<Globe2 className="h-4 w-4 text-[color:var(--green)]" />}
                label="Active regions"
                value={regions.filter((region) => region.isActive).length}
              />
            </div>
            <FooterLink
              href={regionsHref ?? `${basePath}/schools`}
              label={regionsHref ? "View regions" : "View schools"}
            />
          </div>

          <div className="rounded-[26px] border border-[color:rgba(4,15,75,0.08)] bg-white/92 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
              Operational actions
            </p>
            <div className="mt-4 grid gap-3">
              <ActionStat
                icon={<Bell className="h-4 w-4 text-[#246bff]" />}
                label="Unread activity"
                value={unreadActivityCount}
              />
              {typeof activeSuperAdminsCount === "number" ? (
                <ActionStat
                  icon={<ShieldCheck className="h-4 w-4 text-[color:var(--green)]" />}
                  label="Active super admins"
                  value={activeSuperAdminsCount}
                />
              ) : (
                <ActionStat
                  icon={<FileText className="h-4 w-4 text-[color:var(--green)]" />}
                  label="Reports awaiting review"
                  value={reports.filter((report) => report.status === "submitted").length}
                />
              )}
              <ActionStat
                icon={<MapPinned className="h-4 w-4 text-[#c07a12]" />}
                label="Pending ambassador approvals"
                value={pendingApplications.length}
              />
            </div>
            <FooterLink href={`${basePath}/activity`} label="View operational activity" />
          </div>
        </div>
      </Card>
    </div>
  );
}

function SectionKicker({ label }: { label: string }) {
  return (
    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--navy)]">
      {label}
    </p>
  );
}

function YearNavigator({
  year,
  olderHref,
  newerHref
}: {
  year: number;
  olderHref?: string;
  newerHref?: string;
}) {
  const arrowClassName =
    "inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[color:var(--border-soft)] bg-white text-[color:var(--navy)] transition hover:border-[rgba(24,168,59,0.35)] hover:bg-[color:var(--green-soft)] hover:text-[color:var(--green)]";

  return (
    <div className="inline-flex items-center gap-1.5 rounded-[13px] border border-[color:var(--border-soft)] bg-white/90 p-1.5 shadow-[0_8px_20px_rgba(11,24,77,0.05)]">
      {olderHref ? (
        <Link
          href={olderHref}
          scroll={false}
          aria-label="Show older analytics year"
          className={arrowClassName}
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
      ) : (
        <span className={cn(arrowClassName, "cursor-not-allowed opacity-30")} aria-hidden="true">
          <ChevronLeft className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-[64px] text-center text-sm font-semibold text-[color:var(--navy)]">
        {year}
      </span>
      {newerHref ? (
        <Link
          href={newerHref}
          scroll={false}
          aria-label="Show newer analytics year"
          className={arrowClassName}
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span className={cn(arrowClassName, "cursor-not-allowed opacity-30")} aria-hidden="true">
          <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}

function GlanceStrip({
  items
}: {
  items: Array<{ icon: ReactNode; value: number; label: string; href: string }>;
}) {
  return (
    <Card className="rounded-[28px] border-[#d7efdd] bg-[linear-gradient(135deg,#f1faf3,#f8fdf9)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--green)]">
        At a glance
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-[color:rgba(4,15,75,0.08)]">
        {items.map((item) => (
          <Link key={item.label} href={item.href} className="group flex items-center gap-3 xl:px-4 xl:first:pl-0">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-[inset_0_0_0_1px_rgba(4,15,75,0.06)]">
              {item.icon}
            </div>
            <div>
              <p className="text-2xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
                {item.value.toLocaleString("en-NZ")}
              </p>
              <p className="text-sm text-[color:var(--text-soft)] group-hover:text-[color:var(--navy)]">
                {item.label}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function PipelineCard({
  icon,
  label,
  value,
  href,
  withArrow
}: {
  icon: ReactNode;
  label: string;
  value: number;
  href: string;
  withArrow?: boolean;
}) {
  return (
    <div className="relative">
      <Link
        href={href}
        className="grid h-full justify-items-center gap-3 rounded-[24px] border border-[color:rgba(4,15,75,0.08)] bg-white/94 px-4 py-5 text-center shadow-[0_14px_32px_rgba(11,24,77,0.05)] transition hover:border-[color:rgba(4,15,75,0.16)]"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#f6fbff,#edf7ff)]">
          {icon}
        </div>
        <p className="text-sm font-medium text-[color:var(--text-soft)]">{label}</p>
        <p className="text-3xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">{value}</p>
      </Link>
      {withArrow ? (
        <ChevronRight className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-[color:var(--text-soft)] xl:block" />
      ) : null}
    </div>
  );
}

const PIPELINE_STAGES = [
  { label: "Submitted", color: "#246bff" },
  { label: "Needs review", color: "#f5a623" },
  { label: "Confirmed", color: "#18a83b" },
  { label: "Upcoming", color: "#246bff" },
  { label: "Completed", color: "#18a83b" }
];

function PipelineTimeline() {
  return (
    <div className="mt-6 hidden grid-cols-5 gap-3 xl:grid">
      {PIPELINE_STAGES.map((stage, index) => (
        <div key={stage.label} className="relative grid justify-items-center gap-2 text-center">
          {index > 0 ? (
            <span className="absolute right-1/2 top-2 h-px w-[calc(100%+0.75rem)] border-t border-dashed border-[color:rgba(4,15,75,0.16)]" />
          ) : null}
          <span
            className="relative z-10 h-4 w-4 rounded-full border-4 bg-white"
            style={{ borderColor: stage.color }}
          />
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
            {stage.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChartPanel({
  title,
  tone = "blue",
  className,
  children
}: {
  title: string;
  tone?: "blue" | "green";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "h-full rounded-[26px] border border-[color:rgba(4,15,75,0.08)] p-5",
        tone === "green"
          ? "bg-[linear-gradient(180deg,rgba(241,250,243,0.7),rgba(255,255,255,0.95))]"
          : "bg-[linear-gradient(180deg,rgba(244,249,255,0.75),rgba(255,255,255,0.95))]",
        className
      )}
    >
      <p className="text-sm font-semibold text-[color:var(--navy)]">{title}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function PresentationFileAction({
  href,
  label,
  icon
}: {
  href?: string;
  label: string;
  icon: ReactNode;
}) {
  const className =
    "inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[color:var(--border-soft)] bg-white text-[#246bff] transition hover:border-[#9bbcff] hover:bg-[#eef4ff]";

  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className={className}
    >
      {icon}
    </a>
  ) : (
    <span aria-label={`${label} unavailable`} title={`${label} unavailable`} className={cn(className, "cursor-not-allowed opacity-35")}>
      {icon}
    </span>
  );
}

function ChartFootnote({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-4 flex items-center gap-2 rounded-[16px] bg-white/85 px-3.5 py-2.5 text-sm text-[color:var(--text-soft)] shadow-[inset_0_0_0_1px_rgba(4,15,75,0.05)]">
      {icon}
      {children}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1 w-5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function DualLineChart({
  series
}: {
  series: Array<{ label: string; bookings: number; sessions: number }>;
}) {
  const width = 560;
  const height = 240;
  const paddingX = 18;
  const paddingY = 20;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const maxValue = Math.max(
    ...series.map((point) => Math.max(point.bookings, point.sessions)),
    1
  );

  const pointX = (index: number) =>
    paddingX + (series.length === 1 ? chartWidth / 2 : (chartWidth / (series.length - 1)) * index);
  const pointY = (value: number) => height - paddingY - (value / maxValue) * chartHeight;
  const linePoints = (key: "bookings" | "sessions") =>
    series.map((point, index) => `${pointX(index)},${pointY(point[key])}`).join(" ");

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[240px] w-full">
        {[0.25, 0.5, 0.75, 1].map((marker) => (
          <line
            key={marker}
            x1={paddingX}
            x2={width - paddingX}
            y1={height - paddingY - chartHeight * marker}
            y2={height - paddingY - chartHeight * marker}
            stroke="rgba(4,15,75,0.07)"
            strokeDasharray="5 7"
          />
        ))}
        <polyline
          fill="none"
          stroke="#18a83b"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.5"
          points={linePoints("bookings")}
        />
        <polyline
          fill="none"
          stroke="#246bff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.5"
          points={linePoints("sessions")}
        />
        {series.map((point, index) => (
          <g key={point.label}>
            <circle cx={pointX(index)} cy={pointY(point.bookings)} r="4" fill="#18a83b" stroke="white" strokeWidth="2.5" />
            <circle cx={pointX(index)} cy={pointY(point.sessions)} r="4" fill="#246bff" stroke="white" strokeWidth="2.5" />
          </g>
        ))}
      </svg>
      <div className="mt-2 grid grid-cols-12 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--text-soft)]">
        {series.map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </div>
    </div>
  );
}

function DonutChart({
  total,
  segments
}: {
  total: number;
  segments: Array<{ label: string; value: number; color: string; percent: number }>;
}) {
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const visibleSegments = segments.filter((segment) => segment.value > 0);
  const arcs = visibleSegments.map((segment, index) => {
    const precedingValue = visibleSegments
      .slice(0, index)
      .reduce((sum, preceding) => sum + preceding.value, 0);

    return {
      ...segment,
      length: total > 0 ? (segment.value / total) * circumference : 0,
      offset: total > 0 ? (precedingValue / total) * circumference : 0
    };
  });

  return (
    <div className="relative mx-auto h-44 w-44">
      <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
        <circle cx="90" cy="90" r={radius} fill="none" stroke="#edf2f9" strokeWidth="26" />
        {arcs.map((arc) => (
          <circle
            key={arc.label}
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth="26"
            strokeDasharray={`${arc.length} ${circumference - arc.length}`}
            strokeDashoffset={-arc.offset}
          />
        ))}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <p className="text-3xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">
          {total.toLocaleString("en-NZ")}
        </p>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
          Total
        </p>
      </div>
    </div>
  );
}

function MonthlyBarChart({ series }: { series: Array<{ label: string; value: number }> }) {
  const maxValue = Math.max(...series.map((point) => point.value), 1);

  return (
    <div className="rounded-[24px] border border-[color:rgba(4,15,75,0.08)] bg-[linear-gradient(180deg,rgba(244,249,255,0.7),rgba(255,255,255,0.95))] px-4 py-5">
      <div className="flex h-[170px] items-end gap-2 md:gap-3">
        {series.map((point) => {
          const barHeight = point.value > 0 ? Math.max(8, (point.value / maxValue) * 100) : 2;
          return (
            <div key={point.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              {point.value > 0 ? (
                <span className="text-[10px] font-semibold text-[color:var(--navy)]">
                  {point.value}
                </span>
              ) : null}
              <div
                className="w-full max-w-7 rounded-t-[6px] bg-[linear-gradient(180deg,#4d8bff,#246bff)]"
                style={{ height: `${barHeight}%` }}
              />
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--text-soft)]">
                {point.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AmbassadorCoverageMap({
  regions
}: {
  regions: Array<{ slug: string; name: string; count: number }>;
}) {
  const aucklandRegions = regions.filter((region) => isAucklandRegion(region));
  const otherRegions = regions.filter((region) => !isAucklandRegion(region));
  const points = [
    ...(aucklandRegions.length > 0
      ? [{
          slug: "auckland",
          name: "Auckland",
          count: aucklandRegions.reduce((total, region) => total + region.count, 0),
          breakdown: aucklandRegions,
          position: { x: 69, y: 19 }
        }]
      : []),
    ...otherRegions.map((region) => ({
      ...region,
      breakdown: [region],
      position: regionMapPosition(region)
    }))
  ];
  const locatedPoints = points.filter((point) => point.position);
  const orderedRegions = [...regions].sort((left, right) => {
    const rankDifference = regionNorthToSouthRank(left) - regionNorthToSouthRank(right);
    return rankDifference || left.name.localeCompare(right.name);
  });

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(300px,1.15fr)_minmax(0,0.85fr)] md:items-start">
      <div className="relative mx-auto h-[520px] w-full max-w-[440px]" aria-label="Map of ambassador coverage across New Zealand">
        <Image
          src="/media/new-zealand-regions.svg"
          alt="Regional map of mainland New Zealand"
          width={520}
          height={645}
          unoptimized
          className="h-full w-full object-contain"
        />

        {locatedPoints.map((point) => (
          <button
            key={point.slug}
            type="button"
            style={{ left: `${point.position?.x}%`, top: `${point.position?.y}%` }}
            className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(24,168,59,0.2)]"
            aria-label={`${point.name}: ${point.count} active ambassador${point.count === 1 ? "" : "s"}`}
          >
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-white bg-[#18a83b] text-xs font-bold text-white shadow-[0_7px_18px_rgba(17,122,46,0.3)] transition group-hover:scale-110 group-focus-visible:scale-110">
              {point.count}
              <span className="absolute inset-0 -z-10 animate-pulse rounded-full bg-[#18a83b]/25" />
            </span>
            <span
              className={cn(
                "pointer-events-none absolute z-20 w-48 rounded-[14px] border border-[#cce8d3] bg-white p-3 text-left opacity-0 shadow-[0_14px_34px_rgba(4,15,75,0.16)] transition group-hover:opacity-100 group-focus-visible:opacity-100",
                (point.position?.x ?? 0) > 58 ? "right-10 top-0" : "left-10 top-0"
              )}
            >
              <span className="block text-sm font-semibold text-[color:var(--navy)]">{point.name}</span>
              <span className="mt-1.5 grid gap-1">
                {point.breakdown.map((region) => (
                  <span key={region.slug} className="flex items-center justify-between gap-3 text-xs text-[color:var(--text-soft)]">
                    <span>{region.name}</span>
                    <span className="font-semibold text-[#117a2e]">{region.count}</span>
                  </span>
                ))}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-[20px] border border-[#d7efdd] bg-white/85 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#117a2e]">Active coverage</p>
            <p className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
              {regions.length} {regions.length === 1 ? "area" : "areas"}
            </p>
          </div>
          <MapPinned className="h-6 w-6 text-[#18a83b]" />
        </div>
        <ol className="mt-4 overflow-hidden rounded-[14px] border border-[#d7efdd] bg-[#f8fcf9]">
          {orderedRegions.map((region, index) => (
            <li
              key={region.slug}
              className={cn(
                "flex items-center justify-between gap-4 px-3 py-2.5",
                index > 0 && "border-t border-[#dfeee3]"
              )}
            >
              <span className="min-w-0 truncate text-sm font-semibold text-[color:var(--navy)]">
                {region.name}
              </span>
              <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-[#e5f6e9] px-2 text-xs font-bold text-[#117a2e]">
                {region.count}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function isAucklandRegion(region: { slug: string; name: string }) {
  const value = `${region.slug} ${region.name}`.toLowerCase();
  return value.includes("auckland") || value.includes("north shore");
}

function regionNorthToSouthRank(region: { slug: string; name: string }) {
  const value = `${region.slug} ${region.name}`.toLowerCase();
  const regionsNorthToSouth: Array<{ terms: string[]; rank: number }> = [
    { terms: ["northland", "whangarei"], rank: 10 },
    { terms: ["north shore"], rank: 20 },
    { terms: ["auckland central", "central auckland", "auckland city"], rank: 30 },
    { terms: ["south auckland"], rank: 40 },
    { terms: ["auckland"], rank: 35 },
    { terms: ["waikato", "hamilton"], rank: 50 },
    { terms: ["bay of plenty", "tauranga", "rotorua"], rank: 60 },
    { terms: ["gisborne"], rank: 70 },
    { terms: ["taranaki", "new plymouth"], rank: 80 },
    { terms: ["hawke", "napier", "hastings"], rank: 90 },
    { terms: ["manawat", "palmerston"], rank: 100 },
    { terms: ["wellington"], rank: 110 },
    { terms: ["nelson"], rank: 120 },
    { terms: ["tasman"], rank: 130 },
    { terms: ["marlborough"], rank: 140 },
    { terms: ["west coast"], rank: 150 },
    { terms: ["canterbury", "christchurch"], rank: 160 },
    { terms: ["otago", "dunedin", "queenstown"], rank: 170 },
    { terms: ["southland", "invercargill"], rank: 180 }
  ];
  const match = regionsNorthToSouth.find(({ terms }) => terms.some((term) => value.includes(term)));
  return match?.rank ?? Number.MAX_SAFE_INTEGER;
}

function regionMapPosition(region: { slug: string; name: string }) {
  const value = `${region.slug} ${region.name}`.toLowerCase();
  const positions: Array<{ terms: string[]; x: number; y: number }> = [
    { terms: ["northland", "whangarei"], x: 59, y: 9 },
    { terms: ["waikato", "hamilton"], x: 73, y: 27 },
    { terms: ["bay of plenty", "tauranga", "rotorua"], x: 83, y: 29 },
    { terms: ["gisborne"], x: 91, y: 29 },
    { terms: ["taranaki", "new plymouth"], x: 64, y: 36 },
    { terms: ["hawke", "napier", "hastings"], x: 84, y: 39 },
    { terms: ["manawat", "palmerston"], x: 74, y: 40 },
    { terms: ["wellington"], x: 72, y: 53 },
    { terms: ["nelson", "tasman", "marlborough"], x: 57, y: 54 },
    { terms: ["west coast"], x: 36, y: 66 },
    { terms: ["canterbury", "christchurch"], x: 47, y: 72 },
    { terms: ["otago", "dunedin", "queenstown"], x: 30, y: 88 },
    { terms: ["southland", "invercargill"], x: 17, y: 90 }
  ];
  const match = positions.find(({ terms }) => terms.some((term) => value.includes(term)));
  return match ? { x: match.x, y: match.y } : null;
}

function StageBarChart({ stages }: { stages: Array<{ label: string; value: number }> }) {
  const maxValue = Math.max(...stages.map((stage) => stage.value), 1);

  return (
    <div className="flex h-[170px] items-end gap-8 px-4">
      {stages.map((stage) => {
        const barHeight = stage.value > 0 ? Math.max(10, (stage.value / maxValue) * 100) : 2;
        return (
          <div key={stage.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className="text-sm font-semibold text-[color:var(--navy)]">{stage.value}</span>
            <div
              className="w-full max-w-16 rounded-t-[8px] bg-[linear-gradient(180deg,#3fbf68,#18a83b)]"
              style={{ height: `${barHeight}%` }}
            />
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[color:var(--text-soft)]">
              {stage.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function OpsTile({
  icon,
  label,
  value,
  detail,
  href
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="grid gap-2 rounded-[24px] border border-[color:rgba(4,15,75,0.08)] bg-white/94 px-4 py-4 shadow-[0_14px_32px_rgba(11,24,77,0.05)] transition hover:border-[color:rgba(4,15,75,0.16)]"
    >
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(180deg,#f6fbff,#edf7ff)]">
          {icon}
        </div>
        <p className="text-sm font-medium text-[color:var(--text-soft)]">{label}</p>
      </div>
      <p className="text-2xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">{value}</p>
      <p className="text-xs text-[color:var(--text-soft)]">{detail}</p>
    </Link>
  );
}

function ImpactCard({
  title,
  tone = "white",
  children
}: {
  title: string;
  tone?: "white" | "green";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-[24px] border border-[color:rgba(4,15,75,0.08)] px-4 py-4 shadow-[0_14px_32px_rgba(11,24,77,0.05)]",
        tone === "green" ? "bg-[linear-gradient(135deg,#f1faf3,#f8fdf9)]" : "bg-white/94"
      )}
    >
      <p className="text-sm font-semibold text-[color:var(--navy)]">{title}</p>
      {children}
    </div>
  );
}

function FootprintStat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-[18px] bg-[color:var(--blue-soft)] px-3.5 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-[inset_0_0_0_1px_rgba(4,15,75,0.06)]">
        {icon}
      </div>
      <div>
        <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
          {value.toLocaleString("en-NZ")}
        </p>
        <p className="text-xs text-[color:var(--text-soft)]">{label}</p>
      </div>
    </div>
  );
}

function ActionStat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] bg-[color:var(--blue-soft)] px-3.5 py-3">
      <span className="flex items-center gap-2.5 text-sm font-medium text-[color:var(--navy)]">
        {icon}
        {label}
      </span>
      <span className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
        {value.toLocaleString("en-NZ")}
      </span>
    </div>
  );
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#246bff] hover:text-[color:var(--navy)]"
    >
      {label}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function EmptyStateCopy({ copy }: { copy: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[color:rgba(4,15,75,0.1)] bg-white/70 px-4 py-6 text-sm text-[color:var(--text-soft)]">
      {copy}
    </div>
  );
}

function buildBookingPipeline(
  rangeBookings: BookingRequestView[],
  rangeSessions: BookingSessionView[],
  now: Date
) {
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const rangeSessionIds = new Set(rangeSessions.map((session) => session.id));
  const cancelled = rangeBookings.filter((booking) =>
    BOOKING_CANCELLED_STATUSES.has(booking.status)
  );
  const completed = rangeBookings.filter((booking) =>
    BOOKING_COMPLETED_STATUSES.has(booking.status)
  );
  const needsReview = rangeBookings.filter(
    (booking) =>
      BOOKING_REVIEW_STATUSES.has(booking.status) ||
      booking.sessions.some((session) => BOOKING_REVIEW_STATUSES.has(session.status))
  );
  const confirmed = rangeBookings.filter((booking) =>
    BOOKING_CONFIRMED_STATUSES.has(booking.status)
  );
  const confirmedUpcoming = confirmed.flatMap((booking) =>
    booking.sessions.filter(
      (session) => rangeSessionIds.has(session.id) && isFutureSession(session, now)
    )
  );

  return {
    newBookings: rangeBookings.filter((booking) => {
      const createdAt = new Date(booking.createdAt).getTime();
      return createdAt >= sevenDaysAgo && createdAt <= now.getTime();
    }).length,
    needsReview: needsReview.length,
    confirmed: confirmed.length,
    upcomingSessions: confirmedUpcoming.length,
    pending: rangeBookings.filter((booking) => BOOKING_PENDING_STATUSES.has(booking.status)).length,
    completed: completed.length,
    cancelled: cancelled.length
  };
}

function monthOf(value: string, year: number) {
  const date = new Date(value);
  return date.getFullYear() === year ? date.getMonth() : null;
}

function buildYearlyActivity(
  bookings: BookingRequestView[],
  sessions: BookingSessionView[],
  year: number
) {
  const bookingCounts = Array.from({ length: 12 }, () => 0);
  const sessionCounts = Array.from({ length: 12 }, () => 0);
  let lastYearActivity = 0;

  for (const booking of bookings) {
    const month = monthOf(booking.createdAt, year);
    if (month !== null) {
      bookingCounts[month] += 1;
    } else if (new Date(booking.createdAt).getFullYear() === year - 1) {
      lastYearActivity += 1;
    }
  }

  for (const session of sessions) {
    if (isCancelledSession(session)) {
      continue;
    }

    const month = monthOf(session.startsAt, year);
    if (month !== null) {
      sessionCounts[month] += 1;
    } else if (new Date(session.startsAt).getFullYear() === year - 1) {
      lastYearActivity += 1;
    }
  }

  const thisYearActivity =
    bookingCounts.reduce((total, count) => total + count, 0) +
    sessionCounts.reduce((total, count) => total + count, 0);
  const trendNote =
    lastYearActivity > 0
      ? `Activity ${thisYearActivity >= lastYearActivity ? "increased" : "decreased"} ${Math.abs(
          Math.round(((thisYearActivity - lastYearActivity) / lastYearActivity) * 100)
        )}% vs last year`
      : thisYearActivity > 0
        ? `${thisYearActivity} bookings and sessions recorded this year`
        : "No booking activity recorded yet this year";

  return {
    series: MONTH_LABELS.map((label, index) => ({
      label,
      bookings: bookingCounts[index],
      sessions: sessionCounts[index]
    })),
    trendNote
  };
}

function buildSourceBreakdown(yearBookings: BookingRequestView[]) {
  const total = yearBookings.length;
  const count = (source: BookingRequestView["source"]) =>
    yearBookings.filter((booking) => booking.source === source).length;
  const percent = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

  const segments = [
    { label: "School-sourced", value: count("public"), color: "#18a83b" },
    { label: "Staff", value: count("staff"), color: "#246bff" },
    { label: "Ambassador-referred", value: count("ambassador"), color: "#f5a623" }
  ].map((segment) => ({ ...segment, percent: percent(segment.value) }));

  return { total, segments };
}

function buildBookingStatusBreakdown(yearBookings: BookingRequestView[]) {
  const cancelled = yearBookings.filter((booking) =>
    BOOKING_CANCELLED_STATUSES.has(booking.status)
  );
  const cancelledIds = new Set(cancelled.map((booking) => booking.id));
  const completed = yearBookings.filter(
    (booking) =>
      !cancelledIds.has(booking.id) && BOOKING_COMPLETED_STATUSES.has(booking.status)
  );
  const completedIds = new Set(completed.map((booking) => booking.id));
  const pending = yearBookings.filter(
    (booking) => !completedIds.has(booking.id) && !cancelledIds.has(booking.id)
  );
  const total = yearBookings.length;
  const percent = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);
  const segments = [
    { label: "Completed", value: completed.length, color: "#18a83b" },
    { label: "Pending", value: pending.length, color: "#98a2b3" },
    { label: "Cancelled", value: cancelled.length, color: "#d75b52" }
  ].map((segment) => ({ ...segment, percent: percent(segment.value) }));

  return {
    total,
    segments,
    completionRate: percent(completed.length)
  };
}

function buildYearlyStudentSeries(
  reports: ReportSummary[],
  sessions: BookingSessionView[],
  year: number
) {
  const counts = Array.from({ length: 12 }, () => 0);
  // Reports carry verified attendance; sessions without a report fall back to their own counts.
  const reportedSessionIds = new Set<string>();

  for (const report of reports) {
    const month = monthOf(report.sessionStartsAt ?? report.submittedAt, year);
    if (month !== null) {
      counts[month] += Number(report.attendeeCount ?? 0);
    }
  }

  for (const report of reports) {
    if (report.sessionStartsAt) {
      reportedSessionIds.add(`${report.schoolName}|${report.sessionStartsAt}`);
    }
  }

  for (const session of sessions) {
    if (!isDeliveredSession(session)) {
      continue;
    }

    if (reportedSessionIds.has(`${session.schoolName}|${session.startsAt}`)) {
      continue;
    }

    const month = monthOf(session.startsAt, year);
    if (month !== null) {
      counts[month] += Number(session.actualStudentCount ?? session.expectedStudentCount ?? 0);
    }
  }

  return MONTH_LABELS.map((label, index) => ({ label, value: counts[index] }));
}

const outstandingPaymentLabels: Record<string, string> = {
  pending: "Report received",
  eligible: "Eligible",
  approved: "Approved"
};

function buildPaymentSummary(payments: PaymentRecord[], year: number) {
  const paidThisYear = payments.filter(
    (payment) =>
      payment.status === "paid" &&
      new Date(payment.paidAt ?? payment.createdAt).getFullYear() === year
  );
  const outstanding = payments.filter((payment) =>
    ["pending", "eligible", "approved"].includes(payment.status)
  );

  return {
    paidThisYearCents: paidThisYear.reduce((total, payment) => total + payment.amountCents, 0),
    paidThisYearCount: paidThisYear.length,
    outstandingCents: outstanding.reduce((total, payment) => total + payment.amountCents, 0),
    outstandingCount: outstanding.length,
    outstanding
  };
}

function buildRegionCoverage(approvedAmbassadors: AmbassadorProfile[], regions: RegionSummary[]) {
  const regionNamesBySlug = new Map(regions.map((region) => [region.slug, region.name]));
  const counts = new Map<string, number>();

  for (const ambassador of approvedAmbassadors) {
    const slugs = new Set([ambassador.regionSlug, ...ambassador.travelRegions]);
    for (const slug of slugs) {
      if (!regionNamesBySlug.has(slug)) {
        continue;
      }
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([slug, count]) => ({ slug, name: regionNamesBySlug.get(slug) ?? slug, count }))
    .sort((left, right) => right.count - left.count);
}

function buildAmbassadorFunnel(yearBookings: BookingRequestView[], now: Date) {
  const referred = yearBookings.filter((booking) => booking.source === "ambassador");
  const completed = referred.filter(isCompletedBooking);
  const confirmed = referred.filter(
    (booking) =>
      ["confirmed", "ambassador_assigned"].includes(booking.status) ||
      booking.sessions.some(
        (session) =>
          ["confirmed", "ambassador_assigned"].includes(session.status) &&
          isFutureSession(session, now)
      )
  );

  return {
    submitted: referred.length,
    confirmed: confirmed.length,
    completed: completed.length
  };
}

function buildMonthlyImpact(reports: ReportSummary[], sessions: BookingSessionView[], now: Date) {
  const inMonth = (value: string, monthsBack: number) => {
    const date = new Date(value);
    const target = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth();
  };
  const deliveredIn = (monthsBack: number) =>
    sessions.filter((session) => isDeliveredSession(session, now) && inMonth(session.startsAt, monthsBack));
  const deliveredThisMonth = deliveredIn(0);

  return {
    deliveredThisMonth: deliveredThisMonth.length,
    deliveredLastMonth: deliveredIn(1).length,
    schoolsThisMonth: new Set(deliveredThisMonth.map((session) => session.schoolName)).size
  };
}

function buildFeedbackSummary(reports: ReportSummary[], reviews: SchoolFeedbackSummary[]) {
  // School side: the overall rating each school gave in its feedback form.
  const schoolRatings = reviews
    .map((review) => review.rating)
    .filter((rating): rating is number => typeof rating === "number" && Number.isFinite(rating));
  // Ambassador side: the mean of each report's category ratings.
  const ambassadorRatings = reports
    .map((report) => {
      const values = [
        report.attendanceRating,
        report.studentEngagementRating,
        report.teacherResponseRating,
        report.presentationEnergyRating
      ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

      return values.length > 0
        ? values.reduce((total, value) => total + value, 0) / values.length
        : null;
    })
    .filter((value): value is number => value !== null);
  const average = (values: number[]) =>
    values.length > 0
      ? Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10
      : 0;
  const allRatings = [...schoolRatings, ...ambassadorRatings];

  return {
    rating: average(allRatings),
    reviewCount: allRatings.length,
    schoolRating: average(schoolRatings),
    schoolCount: schoolRatings.length,
    ambassadorRating: average(ambassadorRatings),
    ambassadorCount: ambassadorRatings.length
  };
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <StarRating
      rating={rating}
      starClassName="h-5 w-5"
      fillClassName="text-[#f5b319]"
    />
  );
}

function formatSignedDelta(delta: number) {
  return `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toLocaleString("en-NZ")}`;
}

function countStudentsReached(reports: ReportSummary[], deliveredSessions: BookingSessionView[]) {
  if (reports.length > 0) {
    return reports.reduce((total, report) => total + Number(report.attendeeCount ?? 0), 0);
  }

  return deliveredSessions.reduce(
    (total, session) => total + Number(session.actualStudentCount ?? session.expectedStudentCount ?? 0),
    0
  );
}
