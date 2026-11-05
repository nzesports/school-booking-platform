import type { ReactNode } from "react";
import Form from "next/form";
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
  Presentation,
  School2,
  ShieldCheck,
  UserCheck,
  UsersRound
} from "lucide-react";

import { PagedList } from "@/components/dashboard/list-pagination";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
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
  averageReportRating,
  bookingActivityDate,
  bookingInRange,
  bookingStatusGroup,
  buildYearGroupCoverage,
  isCancelledSession,
  isCompletedBooking,
  isCountedPresentation,
  isFutureSession,
  nzYearMonth,
  reportActivityDate,
  reportInRange,
  reviewInRange,
  sessionInRange,
  studentsReachedBySession,
  summarizeStudentReach,
  type BookingStatusGroup,
  type DashboardCustomRange,
  type DashboardRange
} from "@/lib/services/dashboard-insights";
import type { ResourceRecord } from "@/lib/services/portal";
import { isAwaitingCustomReview } from "@/lib/payment-breakdown";
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
const BOOKING_CANCELLED_STATUSES = new Set(["cancelled", "declined"]);

type RegionSummary = { id: string; name: string; slug: string; isActive: boolean };

function nzYear(value: string | Date) {
  return nzYearMonth(value).year;
}

export function OperationsAnalytics({
  basePath,
  range,
  customRange,
  analyticsYear,
  compareFrom,
  compareTo,
  studentsFrom,
  studentsTo,
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
  // The two years the presentations chart compares, typed in on the chart.
  compareFrom?: number;
  compareTo?: number;
  // The same for the students reached chart.
  studentsFrom?: number;
  studentsTo?: number;
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
  const year = nzYear(now);
  const allSessions = bookings.flatMap((booking) => booking.sessions);
  const availableAnalyticsYears = Array.from(
    new Set([
      year,
      ...bookings.map((booking) => nzYear(bookingActivityDate(booking))),
      ...allSessions.map((session) => nzYear(session.startsAt)),
      ...reports.map((report) => nzYear(reportActivityDate(report)))
    ])
  )
    .filter((value) => Number.isFinite(value) && value >= 2000 && value <= year)
    .sort((left, right) => left - right);
  // The charts follow the period picked at the top (last year, a past year, a
  // custom range's end year); the year arrows can still browse other years.
  const rangeYear =
    range === "lastyear"
      ? year - 1
      : range.startsWith("year:")
        ? Number(range.slice(5))
        : range === "custom" && customRange
          ? nzYear(`${customRange.to}T12:00:00+13:00`)
          : year;
  const preferredAnalyticsYear = analyticsYear ?? rangeYear;
  const selectedAnalyticsYear = availableAnalyticsYears.includes(preferredAnalyticsYear)
    ? preferredAnalyticsYear
    : (availableAnalyticsYears.at(-1) ?? year);
  // A year still in progress is compared with the same point last year.
  const comparisonCutoffFor = (value: number) =>
    value === year ? new Date(new Date(now).setFullYear(now.getFullYear() - 1)) : now;
  // The presentations chart compares any two years typed in on it; it starts
  // on the period's year against the one before.
  const presentationsToYear = compareTo ?? selectedAnalyticsYear;
  const presentationsFromYear = compareFrom ?? presentationsToYear - 1;
  // A year in progress is compared with the same point in the other year.
  const presentationsCutoff =
    presentationsToYear === year
      ? new Date(new Date(now).setFullYear(presentationsFromYear))
      : now;
  const studentsToYear = studentsTo ?? selectedAnalyticsYear;
  const studentsFromYear = studentsFrom ?? studentsToYear - 1;
  const studentsCutoff =
    studentsToYear === year ? new Date(new Date(now).setFullYear(studentsFromYear)) : now;
  // Everything on the page address that a chart's own year form must keep.
  const pageParams: Record<string, string | undefined> = {
    range,
    analyticsYear: analyticsYear ? String(analyticsYear) : undefined,
    from: customRange?.from,
    to: customRange?.to,
    compareFrom: compareFrom ? String(compareFrom) : undefined,
    compareTo: compareTo ? String(compareTo) : undefined,
    studentsFrom: studentsFrom ? String(studentsFrom) : undefined,
    studentsTo: studentsTo ? String(studentsTo) : undefined
  };
  const keptParams = (...ownNames: string[]) =>
    Object.fromEntries(
      Object.entries(pageParams).filter(
        (entry): entry is [string, string] => entry[1] !== undefined && !ownNames.includes(entry[0])
      )
    );
  const studentsYearsHref = (fromValue: number, toValue: number) =>
    `${basePath}?${new URLSearchParams({
      ...keptParams("studentsFrom", "studentsTo"),
      studentsFrom: String(fromValue),
      studentsTo: String(toValue)
    }).toString()}`;
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
  const deliveredRangeSessions = rangeSessions.filter(isCountedPresentation);
  const approvedAmbassadors = ambassadors.filter((ambassador) => ambassador.status === "approved");
  const pendingApplications = ambassadors.filter((ambassador) => ambassador.status === "applied");
  const publicPresentations = presentations.filter(
    (presentation) =>
      presentation.active && presentation.public && presentation.slug !== "careers"
  );

  const pipeline = buildBookingPipeline(rangeBookings, rangeSessions, now);
  const studentReachRange = summarizeStudentReach(rangeReports, deliveredRangeSessions);

  // A year's bookings are those with a session in it, keeping only those
  // sessions: the same population as the Bookings page for that year, so the
  // charts' totals match its tiles.
  const bookingsInYear = (value: number) =>
    bookings
      .map((booking) => ({
        ...booking,
        sessions: booking.sessions.filter((session) => nzYear(session.startsAt) === value)
      }))
      .filter((booking) => booking.sessions.length > 0);
  const analyticsYearBookings = bookingsInYear(selectedAnalyticsYear);
  const currentYearBookings = bookings.filter(
    (booking) => nzYear(bookingActivityDate(booking)) === year
  );
  const activity = buildPresentationsComparison(
    bookings,
    presentationsFromYear,
    presentationsToYear,
    presentationsCutoff
  );
  const sources = buildSourceBreakdown(analyticsYearBookings);
  const bookingStatuses = buildBookingStatusBreakdown(analyticsYearBookings);
  const previousYearSources = buildSourceBreakdown(bookingsInYear(selectedAnalyticsYear - 1));
  const yearStudents = buildYearlyStudentSeries(allSessions, studentsToYear, now);
  const studentSeries = yearStudents.series;
  const yearStudentsTotal = yearStudents.total;
  const lastYearStudents = buildYearlyStudentSeries(allSessions, studentsFromYear, now);
  const lastYearStudentsTotal = buildYearlyStudentSeries(
    allSessions,
    studentsFromYear,
    studentsCutoff
  ).total;
  const comparisonLabel =
    studentsToYear === year ? `vs the same point in ${studentsFromYear}` : `vs ${studentsFromYear}`;
  // Every year's total, newest first, each against the year before it.
  const studentsByYear = [...availableAnalyticsYears].reverse().map((value) => ({
    year: value,
    total: buildYearlyStudentSeries(allSessions, value, now).total,
    previousTotal: availableAnalyticsYears.includes(value - 1)
      ? buildYearlyStudentSeries(allSessions, value - 1, comparisonCutoffFor(value)).total
      : null
  }));
  const yearSchoolsReached = yearStudents.schoolsReached;

  const paymentSummary = buildPaymentSummary(payments, year);
  const regionCoverage = buildRegionCoverage(deliveredRangeSessions, approvedAmbassadors, regions);
  const ambassadorFunnel = buildAmbassadorFunnel(currentYearBookings, now);
  const sessionsAssignedThisYear = allSessions.filter(
    (session) =>
      nzYear(session.startsAt) === year &&
      session.assignedAmbassadorName &&
      !isCancelledSession(session)
  ).length;

  const impact = buildMonthlyImpact(reports, allSessions, now);
  const feedback = buildFeedbackSummary(rangeReports, rangeReviews);
  const coverage = buildYearGroupCoverage(
    allSessions.filter((session) => nzYear(session.startsAt) === year)
  );
  const upcomingSessions = allSessions
    .filter((session) => isFutureSession(session, now))
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());

  const bookingsHref = (view: string, metric?: string) => {
    const searchParams = new URLSearchParams({ status: view, range });

    if (metric) {
      searchParams.set("metric", metric);
    }

    if (customRange) {
      searchParams.set("from", customRange.from);
      searchParams.set("to", customRange.to);
    }

    return `${basePath}/bookings?${searchParams.toString()}`;
  };
  // Carry the selected period through so the feedback page shows the same numbers.
  const feedbackHref = (tab: "school" | "ambassador") => {
    const searchParams = new URLSearchParams({ tab, range });

    if (customRange) {
      searchParams.set("from", customRange.from);
      searchParams.set("to", customRange.to);
    }

    return `${basePath}/feedback?${searchParams.toString()}`;
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
            value: pipeline.schoolsVisited,
            label: pipeline.schoolsVisited === 1 ? "school visited" : "schools visited",
            info: "Unique schools visited in this period. Completed bookings only.",
            href: bookingsHref("past")
          },
          {
            icon: <Presentation className="h-5 w-5 text-[#246bff]" />,
            value: pipeline.presentationsDelivered,
            label:
              pipeline.presentationsDelivered === 1
                ? "presentation delivered"
                : "presentations delivered",
            info: "Includes single or multiple bookings from the same school. Only completed bookings are counted.",
            href: bookingsHref("past")
          },
          {
            icon: <UsersRound className="h-5 w-5 text-[#246bff]" />,
            value: studentReachRange.reached,
            label: "students reached",
            href: bookingsHref("past")
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
            info="This includes schools visited once and schools visited multiple times on separate occasions (not back-to-back sessions)."
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
          <ChartPanel
            title={`Presentations delivered (${presentationsFromYear} vs ${presentationsToYear})`}
            action={
              <YearCompareForm
                action={basePath}
                keep={keptParams("compareFrom", "compareTo")}
                fromName="compareFrom"
                toName="compareTo"
                fromYear={presentationsFromYear}
                toYear={presentationsToYear}
              />
            }
          >
            <div className="flex flex-wrap items-center gap-5 text-xs font-semibold text-[color:var(--text-soft)]">
              <LegendDot color="#8fadf2" dashed label={String(presentationsFromYear)} />
              <LegendDot color="#18a83b" label={String(presentationsToYear)} />
            </div>
            <ComparisonLineChart
              series={activity.series}
              fromYear={presentationsFromYear}
              toYear={presentationsToYear}
            />
            <ChartFootnote icon={<ArrowRight className="h-4 w-4 text-[color:var(--green)]" />}>
              {activity.total.toLocaleString("en-NZ")}{" "}
              {activity.total === 1 ? "presentation" : "presentations"} on completed bookings in{" "}
              {presentationsToYear}
              {activity.previousTotal > 0
                ? ` · ${formatSignedDelta(activity.total - activity.previousTotal)} vs ${
                    presentationsToYear === year ? "the same point in " : ""
                  }${presentationsFromYear}`
                : ""}
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
          <SectionKicker label={`Students reached (${studentsFromYear} vs ${studentsToYear})`} />
          <YearCompareForm
            action={basePath}
            keep={keptParams("studentsFrom", "studentsTo")}
            fromName="studentsFrom"
            toName="studentsTo"
            fromYear={studentsFromYear}
            toYear={studentsToYear}
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
                  {formatSignedDelta(yearStudentsTotal - lastYearStudentsTotal)} {comparisonLabel}
                </span>
              ) : null}
            </div>
            {studentsByYear.length > 1 ? (
              <div className="mt-6 border-t border-[color:rgba(4,15,75,0.08)] pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
                  By year
                </p>
                <div className="mt-2 grid gap-1">
                  {studentsByYear.map((entry) => (
                    <Link
                      key={entry.year}
                      href={studentsYearsHref(entry.year - 1, entry.year)}
                      scroll={false}
                      aria-current={entry.year === studentsToYear ? "true" : undefined}
                      className={cn(
                        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-3 rounded-[10px] px-2.5 py-1.5 text-sm transition hover:bg-[#f3f7fd]",
                        entry.year === studentsToYear && "bg-[#eef4ff]"
                      )}
                    >
                      <span className="font-semibold text-[color:var(--navy)]">
                        {entry.year}
                        {entry.year === year ? (
                          <span className="ml-1 text-xs font-normal text-[color:var(--text-soft)]">so far</span>
                        ) : null}
                      </span>
                      <span className="text-right font-semibold text-[color:var(--navy)]">
                        {entry.total.toLocaleString("en-NZ")}
                      </span>
                      <span className="w-28 text-right text-xs text-[color:var(--text-soft)]">
                        {entry.previousTotal !== null && entry.previousTotal > 0
                          ? `${formatSignedDelta(entry.total - entry.previousTotal)} vs ${entry.year - 1}`
                          : ""}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-5 text-xs font-semibold text-[color:var(--text-soft)]">
              <LegendDot color="#d3dae5" label={String(studentsFromYear)} />
              <LegendDot color="#246bff" label={String(studentsToYear)} />
            </div>
            <MonthlyBarChart
              series={studentSeries}
              previous={lastYearStudents.series}
              fromYear={studentsFromYear}
              toYear={studentsToYear}
            />
            <ChartFootnote icon={<UsersRound className="h-4 w-4 text-[#246bff]" />}>
              Actual students on completed bookings, or expected where none was recorded (Jan – Dec{" "}
              {studentsToYear})
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
            info="Approved and available"
            href={`${basePath}/ambassadors`}
          />
          <OpsTile
            icon={<Bell className="h-5 w-5 text-[#c07a12]" />}
            label="Pending approvals"
            value={String(pendingApplications.length)}
            info="Awaiting review"
            href={`${basePath}/ambassadors`}
          />
          <OpsTile
            icon={<CalendarCheck2 className="h-5 w-5 text-[#246bff]" />}
            label="Sessions assigned"
            value={String(sessionsAssignedThisYear)}
            info="Year to date"
            href={calendarHref ?? bookingsHref("future")}
          />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] xl:grid-rows-[auto_1fr]">
          <ChartPanel
            title="Presentations delivered across NZ"
            tone="green"
            className="flex flex-col xl:row-span-2"
            bodyClassName="flex flex-1 flex-col"
          >
            {regionCoverage.length > 0 ? (
              <CoverageMap regions={regionCoverage} periodLabel={periodLabel} />
            ) : (
              <EmptyStateCopy copy="No schools or ambassadors to show for this period yet." />
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

        <div className="flex flex-col rounded-[26px] border border-[color:rgba(4,15,75,0.08)] bg-white/92 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[color:var(--navy)]">
              Outstanding payment submissions
            </p>
            <ButtonLink href={`${basePath}/payments`} variant="ghost">
              Open payments
              <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
          <div
            className={cn(
              "mt-3 flex min-w-0 flex-1 flex-col gap-2",
              // The pager stays on the panel's bottom edge on every page.
              paymentSummary.outstanding.length > OUTSTANDING_PAYMENTS_PAGE_SIZE &&
                "[&>:last-child]:mt-auto"
            )}
          >
            <PagedList
              pageSize={OUTSTANDING_PAYMENTS_PAGE_SIZE}
              itemLabel="outstanding payments"
              rows={paymentSummary.outstanding.map((payment) => (
                <div
                  key={payment.id}
                  className="flex max-h-[88px] min-w-0 flex-1 items-center justify-between gap-3 rounded-[14px] bg-[linear-gradient(135deg,#fffaf2,#fdfdf6)] px-3 py-2 shadow-[inset_0_0_0_1px_rgba(192,122,18,0.14)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[color:var(--navy)]">
                      {payment.ambassadorName}
                    </p>
                    <p className="truncate text-xs text-[color:var(--text-soft)]" title={payment.eligibilityReason}>
                      {payment.invoiceNumber
                        ? `Invoice ${payment.invoiceNumber} · ${payment.eligibilityReason}`
                        : payment.eligibilityReason}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <p className="text-sm font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                      {formatCurrency(payment.amountCents)}
                    </p>
                    <span className="rounded-full bg-[#fff3dd] px-2 py-0.5 text-[11px] font-semibold text-[#c07a12]">
                      {outstandingPaymentLabels[payment.status] ?? "Outstanding"}
                    </span>
                  </div>
                </div>
              ))}
            />
            {paymentSummary.outstanding.length === 0 ? (
              <EmptyStateCopy copy="No outstanding ambassador payments — every eligible submission has been paid." />
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
              <Link href={feedbackHref("school")} className="group grid gap-1">
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
              <Link href={feedbackHref("ambassador")} className="group grid gap-1">
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
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
                  Expected
                </p>
                <p className="mt-1 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">
                  {studentReachRange.expected.toLocaleString("en-NZ")}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
                  Actual
                </p>
                <p className="mt-1 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">
                  {studentReachRange.reached.toLocaleString("en-NZ")}
                </p>
              </div>
            </div>
            {studentReachRange.expected > 0 ? (
              <span className="mt-3 inline-flex w-fit rounded-full bg-[#eaf8ee] px-3 py-1 text-xs font-semibold text-[#1d6f35]">
                {formatSignedDelta(studentReachRange.reached - studentReachRange.expected)} vs expected
              </span>
            ) : null}
            <p className="mt-2 text-sm text-[color:var(--text-soft)]">
              Actual recorded for {studentReachRange.actualRecordedCount} of{" "}
              {studentReachRange.deliveredSessionCount} completed{" "}
              {studentReachRange.deliveredSessionCount === 1 ? "session" : "sessions"} across{" "}
              {studentReachRange.schoolsReached}{" "}
              {studentReachRange.schoolsReached === 1 ? "school" : "schools"}; the rest count their
              expected number.
            </p>
            {studentReachRange.sessionsMissingNumber > 0 ? (
              <Link
                href={bookingsHref("all", "missing-students")}
                className="mt-3 inline-flex w-fit rounded-full bg-[#fff3dd] px-3 py-1 text-xs font-semibold text-[#9a5a00]"
              >
                {studentReachRange.sessionsMissingNumber} completed{" "}
                {studentReachRange.sessionsMissingNumber === 1 ? "session has" : "sessions have"} no
                student number
              </Link>
            ) : null}
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
  items: Array<{ icon: ReactNode; value: number; label: string; href: string; info?: string }>;
}) {
  return (
    <Card className="rounded-[28px] border-[#d7efdd] bg-[linear-gradient(135deg,#f1faf3,#f8fdf9)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--green)]">
        At a glance
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5 xl:divide-x xl:divide-[color:rgba(4,15,75,0.08)]">
        {items.map((item) => (
          // The help button sits beside the link rather than inside it.
          <div key={item.label} className="flex items-center gap-1.5 xl:px-4 xl:first:pl-0">
            <Link href={item.href} className="group flex items-center gap-3">
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
            {item.info ? (
              <InfoTooltip label={item.label} className="self-end">
                {item.info}
              </InfoTooltip>
            ) : null}
          </div>
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
  withArrow,
  info
}: {
  icon: ReactNode;
  label: string;
  value: number;
  href: string;
  withArrow?: boolean;
  info?: string;
}) {
  return (
    <div className="relative">
      <Link
        href={href}
        className="grid h-full justify-items-center gap-3 rounded-[24px] border border-[color:rgba(4,15,75,0.08)] bg-white/94 px-4 py-5 text-center shadow-[0_3px_10px_rgba(11,24,77,0.05)] transition hover:border-[color:rgba(4,15,75,0.16)]"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#f6fbff,#edf7ff)]">
          {icon}
        </div>
        <p className="text-sm font-medium text-[color:var(--text-soft)]">{label}</p>
        <p className="text-3xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">{value}</p>
      </Link>
      {/* Beside the link rather than inside it, so it doesn't navigate. */}
      {info ? (
        <InfoTooltip label={label} className="absolute right-3 top-3">
          {info}
        </InfoTooltip>
      ) : null}
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
  bodyClassName,
  action,
  children
}: {
  title: string;
  tone?: "blue" | "green";
  className?: string;
  bodyClassName?: string;
  // A control shown on the heading row, such as the year form.
  action?: ReactNode;
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[color:var(--navy)]">{title}</p>
        {action}
      </div>
      <div className={cn("mt-4", bodyClassName)}>{children}</div>
    </div>
  );
}

// Two typed-in years for a chart to compare. A plain GET form: the years join
// the page address next to everything in `keep`, without jumping to the top.
function YearCompareForm({
  action,
  keep,
  fromName,
  toName,
  fromYear,
  toYear
}: {
  action: string;
  keep: Record<string, string>;
  fromName: string;
  toName: string;
  fromYear: number;
  toYear: number;
}) {
  return (
    <Form
      action={action}
      scroll={false}
      className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[color:var(--text-soft)]"
    >
      {Object.entries(keep).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label className="flex items-center gap-1.5">
        From
        <Input
          key={`${fromName}-${fromYear}`}
          type="number"
          name={fromName}
          min={2000}
          max={2100}
          required
          defaultValue={fromYear}
          className="w-[84px]"
        />
      </label>
      <label className="flex items-center gap-1.5">
        To
        <Input
          key={`${toName}-${toYear}`}
          type="number"
          name={toName}
          min={2000}
          max={2100}
          required
          defaultValue={toYear}
          className="w-[84px]"
        />
      </label>
      <Button type="submit" variant="secondary">
        Compare
      </Button>
    </Form>
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

function LegendDot({
  color,
  label,
  dashed = false
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-1 w-5 rounded-full"
        style={
          dashed
            ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 6px, transparent 6px 10px)` }
            : { backgroundColor: color }
        }
      />
      {label}
    </span>
  );
}

function ComparisonLineChart({
  series,
  fromYear,
  toYear
}: {
  series: Array<{ label: string; current: number; previous: number }>;
  fromYear: number;
  toYear: number;
}) {
  const width = 720;
  const height = 260;
  const paddingX = 24;
  const paddingY = 20;
  const labelSpace = 24;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2 - labelSpace;
  const baseline = paddingY + chartHeight;
  const maxValue = Math.max(
    ...series.map((point) => Math.max(point.current, point.previous)),
    1
  );

  const pointX = (index: number) =>
    paddingX + (series.length === 1 ? chartWidth / 2 : (chartWidth / (series.length - 1)) * index);
  const pointY = (value: number) => baseline - (value / maxValue) * chartHeight;
  const linePoints = (key: "current" | "previous") =>
    series.map((point, index) => `${pointX(index)},${pointY(point[key])}`).join(" ");

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
        {[0, 0.25, 0.5, 0.75, 1].map((marker) => (
          <line
            key={marker}
            x1={paddingX}
            x2={width - paddingX}
            y1={baseline - chartHeight * marker}
            y2={baseline - chartHeight * marker}
            stroke="rgba(4,15,75,0.07)"
          />
        ))}
        <polyline
          fill="none"
          stroke="#8fadf2"
          strokeDasharray="6 6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          points={linePoints("previous")}
        />
        <polyline
          fill="none"
          stroke="#18a83b"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
          points={linePoints("current")}
        />
        {series.map((point, index) => (
          <g key={point.label}>
            <title>
              {`${point.label}: ${point.previous} in ${fromYear}, ${point.current} in ${toYear}`}
            </title>
            {/* A wide invisible column so the month is easy to hover. */}
            <rect
              x={pointX(index) - chartWidth / 24}
              y={paddingY}
              width={chartWidth / 12}
              height={chartHeight}
              fill="transparent"
            />
            <circle cx={pointX(index)} cy={pointY(point.previous)} r="3" fill="#8fadf2" stroke="white" strokeWidth="1.5" />
            <circle cx={pointX(index)} cy={pointY(point.current)} r="4" fill="#18a83b" stroke="white" strokeWidth="2" />
            <text
              x={pointX(index)}
              y={height - 6}
              textAnchor="middle"
              className="fill-[color:var(--text-soft)] text-[11px] font-semibold uppercase tracking-[0.1em]"
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>
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
  const center = 90;
  const visibleSegments = segments.filter((segment) => segment.value > 0);
  // Each slice is its own arc path. Dashed circles leave a notch where the
  // last slice meets the circle's start point, so they aren't used here.
  const pointAt = (fraction: number) => {
    const angle = fraction * 2 * Math.PI - Math.PI / 2;
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle)
    };
  };
  const arcs = visibleSegments.map((segment, index) => {
    const precedingValue = visibleSegments
      .slice(0, index)
      .reduce((sum, preceding) => sum + preceding.value, 0);
    const startFraction = total > 0 ? precedingValue / total : 0;
    const endFraction = total > 0 ? (precedingValue + segment.value) / total : 0;
    const start = pointAt(startFraction);
    const end = pointAt(endFraction);

    return {
      ...segment,
      isFullCircle: endFraction - startFraction >= 0.9999,
      path: `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${
        endFraction - startFraction > 0.5 ? 1 : 0
      } 1 ${end.x} ${end.y}`
    };
  });

  return (
    <div className="relative mx-auto h-44 w-44">
      <svg viewBox="0 0 180 180" className="h-full w-full">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#edf2f9" strokeWidth="26" />
        {arcs.map((arc) =>
          arc.isFullCircle ? (
            <circle
              key={arc.label}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth="26"
            />
          ) : (
            <path key={arc.label} d={arc.path} fill="none" stroke={arc.color} strokeWidth="26" />
          )
        )}
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

function MonthlyBarChart({
  series,
  previous,
  fromYear,
  toYear
}: {
  series: Array<{ label: string; value: number }>;
  previous: Array<{ label: string; value: number }>;
  fromYear: number;
  toYear: number;
}) {
  const maxValue = Math.max(
    ...series.map((point) => point.value),
    ...previous.map((point) => point.value),
    1
  );
  const barHeight = (value: number) => (value > 0 ? Math.max(8, (value / maxValue) * 100) : 2);

  return (
    <div className="rounded-[24px] border border-[color:rgba(4,15,75,0.08)] bg-[linear-gradient(180deg,rgba(244,249,255,0.7),rgba(255,255,255,0.95))] px-4 py-5">
      <div className="flex h-[170px] items-end gap-2 md:gap-3">
        {series.map((point, index) => {
          const previousValue = previous[index]?.value ?? 0;

          return (
            <div
              key={point.label}
              title={`${point.label}: ${previousValue.toLocaleString("en-NZ")} in ${fromYear}, ${point.value.toLocaleString("en-NZ")} in ${toYear}`}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
            >
              {point.value > 0 ? (
                <span className="text-[10px] font-semibold text-[color:var(--navy)]">
                  {point.value}
                </span>
              ) : null}
              <div className="flex h-full w-full max-w-9 items-end justify-center gap-0.5">
                <div
                  className="w-1/2 max-w-3 rounded-t-[4px] bg-[#d3dae5]"
                  style={{ height: `${barHeight(previousValue)}%` }}
                />
                <div
                  className="w-1/2 max-w-4 rounded-t-[4px] bg-[linear-gradient(180deg,#4d8bff,#246bff)]"
                  style={{ height: `${barHeight(point.value)}%` }}
                />
              </div>
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

type CoverageRegion = {
  slug: string;
  name: string;
  schools: number;
  presentations: number;
  // Everyone who can cover the area: based there or willing to travel there.
  ambassadors: Array<{ id: string; name: string }>;
};

const OUTSTANDING_PAYMENTS_PAGE_SIZE = 4;

// Shared by the area table's heading and rows so the columns line up.
const COVERAGE_TABLE_COLUMNS = "grid grid-cols-[minmax(0,1fr)_3.5rem_3rem_4rem] items-center";
const COVERAGE_TABLE_PAGE_SIZE = 8;

function countLabel(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// One ambassador can cover several areas, so combined counts are by person.
function uniqueAmbassadors(regions: CoverageRegion[]) {
  const byId = new Map(
    regions.flatMap((region) => region.ambassadors).map((ambassador) => [ambassador.id, ambassador])
  );
  return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function CoverageMap({ regions, periodLabel }: { regions: CoverageRegion[]; periodLabel: string }) {
  const sum = (items: CoverageRegion[], key: "schools" | "presentations") =>
    items.reduce((total, region) => total + region[key], 0);
  const orderedRegions = [...regions].sort((left, right) => {
    const rankDifference = regionNorthToSouthRank(left) - regionNorthToSouthRank(right);
    return rankDifference || left.name.localeCompare(right.name);
  });
  // The table leads with where the most presentations were delivered.
  const tableRegions = [...orderedRegions].sort(
    (left, right) =>
      right.presentations - left.presentations ||
      right.schools - left.schools ||
      right.ambassadors.length - left.ambassadors.length
  );
  const aucklandRegions = orderedRegions.filter((region) => isAucklandRegion(region));
  const otherRegions = regions.filter((region) => !isAucklandRegion(region));
  const points = [
    ...(aucklandRegions.length > 0
      ? [{
          slug: "auckland",
          name: "Auckland",
          presentations: sum(aucklandRegions, "presentations"),
          areas: aucklandRegions,
          position: { x: 69, y: 19 }
        }]
      : []),
    ...otherRegions.map((region) => ({
      ...region,
      areas: [region],
      position: regionMapPosition(region)
    }))
  ];
  const locatedPoints = points.filter((point) => point.position && point.presentations > 0);

  return (
    <div className="grid flex-1 gap-5 md:grid-cols-[minmax(300px,1.15fr)_minmax(0,0.85fr)]">
      <div className="relative mx-auto aspect-[22/26] w-full max-w-[524px] md:self-center" aria-label="Map of presentations delivered across New Zealand">
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
            aria-label={`${point.name}: ${countLabel(point.presentations, "presentation")} delivered`}
            style={{ left: `${point.position?.x}%`, top: `${point.position?.y}%` }}
            className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full hover:z-30 focus:outline-none focus-visible:z-30 focus-visible:ring-4 focus-visible:ring-[rgba(24,168,59,0.2)]"
          >
            <span className="flex h-8 min-w-8 items-center justify-center rounded-full border-2 border-white bg-[#18a83b] px-1.5 text-xs font-bold text-white shadow-[0_7px_18px_rgba(17,122,46,0.3)] transition group-hover:scale-110 group-focus-visible:scale-110">
              {point.presentations}
            </span>
            <CoverageTooltip
              title={point.name}
              className={(point.position?.x ?? 0) > 58 ? "right-10 top-0" : "left-10 top-0"}
            >
              <span className="mt-1 block text-xs text-[color:var(--text-soft)]">
                {countLabel(point.presentations, "presentation")}
              </span>
              {point.areas.length > 1
                ? point.areas.map((area) => (
                    <span key={area.slug} className="mt-1 flex items-baseline justify-between gap-3 text-xs text-[color:var(--navy)]">
                      <span>{area.name}</span>
                      <span className="font-semibold text-[#117a2e]">{area.presentations}</span>
                    </span>
                  ))
                : null}
            </CoverageTooltip>
          </button>
        ))}
      </div>

      <div className="flex flex-col rounded-[20px] border border-[#d7efdd] bg-white/85 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#117a2e]">{periodLabel}</p>
            <p className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
              {countLabel(sum(regions, "presentations"), "presentation")} delivered
            </p>
            <p className="mt-1 text-sm text-[color:var(--text-soft)]">
              {countLabel(sum(regions, "schools"), "school")} reached,{" "}
              {countLabel(uniqueAmbassadors(regions).length, "ambassador")}
            </p>
          </div>
          <MapPinned className="h-6 w-6 text-[#18a83b]" />
        </div>
        <div
          className={cn(
            COVERAGE_TABLE_COLUMNS,
            "mt-4 px-[13px] pb-1.5 text-center text-[10px] font-semibold text-[color:var(--text-soft)]"
          )}
        >
          <span className="text-left">Area</span>
          <span>Delivered</span>
          <span>Schools</span>
          <span>Ambassadors</span>
        </div>
        <div
          className={cn(
            "flex flex-1 flex-col rounded-[14px] border border-[#d7efdd] bg-[#f8fcf9]",
            // The pager sits on the card's bottom edge on every page.
            tableRegions.length > COVERAGE_TABLE_PAGE_SIZE &&
              "[&>:last-child]:mt-auto [&>:last-child]:border-t [&>:last-child]:border-[#dfeee3] [&>:last-child]:p-3"
          )}
        >
          <PagedList
            pageSize={COVERAGE_TABLE_PAGE_SIZE}
            itemLabel="areas"
            rows={tableRegions.map((region, index) => (
            <div
              key={region.slug}
              className={cn(
                COVERAGE_TABLE_COLUMNS,
                "max-h-[64px] flex-1 px-3 py-2.5",
                index % COVERAGE_TABLE_PAGE_SIZE > 0 && "border-t border-[#dfeee3]"
              )}
            >
              <span
                tabIndex={0}
                className="group relative mr-2 min-w-0 rounded-[6px] hover:z-30 focus:outline-none focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-[rgba(24,168,59,0.3)]"
              >
                <span className="block truncate text-sm font-semibold text-[color:var(--navy)]">
                  {region.name}
                </span>
                <CoverageTooltip title={region.name} className="bottom-full left-0 mb-2">
                  <CoverageAmbassadorNames ambassadors={region.ambassadors} />
                </CoverageTooltip>
              </span>
              <CoverageBadge
                count={region.presentations}
                label={`${region.name}: ${countLabel(region.presentations, "presentation")} delivered`}
                className="bg-[#e5f6e9] text-[#117a2e]"
              />
              <CoverageBadge
                count={region.schools}
                label={`${region.name}: ${countLabel(region.schools, "school")}`}
                className="bg-[#edf0f7] text-[color:var(--navy)]"
              />
              <button
                type="button"
                aria-label={`${region.name}: ${countLabel(region.ambassadors.length, "ambassador")}`}
                className="group relative justify-self-center rounded-full hover:z-30 focus:outline-none focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-[rgba(24,168,59,0.3)]"
              >
                <CoverageBadge count={region.ambassadors.length} className="bg-[#e8f0ff] text-[#246bff]" />
                <CoverageTooltip title={region.name} className="bottom-full right-0 mb-2">
                  <CoverageAmbassadorNames ambassadors={region.ambassadors} />
                </CoverageTooltip>
              </button>
            </div>
            ))}
          />
        </div>
      </div>
    </div>
  );
}

function CoverageTooltip({
  title,
  className,
  children
}: {
  title: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute z-20 w-56 rounded-[14px] border border-[#cce8d3] bg-white p-3 text-left opacity-0 shadow-[0_14px_34px_rgba(4,15,75,0.16)] transition group-hover:opacity-100 group-focus-visible:opacity-100",
        className
      )}
    >
      <span className="block text-sm font-semibold text-[color:var(--navy)]">{title}</span>
      {children}
    </span>
  );
}

function CoverageAmbassadorNames({ ambassadors }: { ambassadors: CoverageRegion["ambassadors"] }) {
  if (ambassadors.length === 0) {
    return (
      <span className="mt-1 block text-xs text-[color:var(--text-soft)]">No ambassadors cover this area</span>
    );
  }

  return ambassadors.map((ambassador) => (
    <span key={ambassador.id} className="mt-0.5 block text-xs text-[color:var(--navy)]">
      {ambassador.name}
    </span>
  ));
}

function CoverageBadge({
  count,
  label,
  className
}: {
  count: number;
  label?: string;
  className: string;
}) {
  return (
    <span
      aria-label={label}
      className={cn(
        "flex h-7 w-fit min-w-7 items-center justify-center justify-self-center rounded-full px-2 text-xs font-bold",
        count > 0 ? className : "bg-[#f0f2f5] text-[color:var(--text-soft)]"
      )}
    >
      {count}
    </span>
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
    { terms: ["hamilton"], rank: 50 },
    { terms: ["waikato"], rank: 55 },
    { terms: ["tauranga"], rank: 60 },
    { terms: ["bay of plenty", "rotorua"], rank: 65 },
    { terms: ["gisborne"], rank: 70 },
    { terms: ["taranaki", "new plymouth"], rank: 80 },
    { terms: ["hawke", "napier", "hastings"], rank: 90 },
    { terms: ["palmerston"], rank: 100 },
    { terms: ["whanganui", "manawat"], rank: 105 },
    { terms: ["wellington"], rank: 110 },
    { terms: ["nelson"], rank: 120 },
    { terms: ["tasman"], rank: 130 },
    { terms: ["marlborough"], rank: 140 },
    { terms: ["west coast"], rank: 150 },
    { terms: ["christchurch"], rank: 160 },
    { terms: ["canterbury"], rank: 165 },
    { terms: ["dunedin"], rank: 170 },
    { terms: ["otago"], rank: 172 },
    { terms: ["queenstown"], rank: 175 },
    { terms: ["southland", "invercargill"], rank: 180 }
  ];
  const match = regionsNorthToSouth.find(({ terms }) => terms.some((term) => value.includes(term)));
  return match?.rank ?? Number.MAX_SAFE_INTEGER;
}

function regionMapPosition(region: { slug: string; name: string }) {
  const value = `${region.slug} ${region.name}`.toLowerCase();
  const positions: Array<{ terms: string[]; x: number; y: number }> = [
    { terms: ["northland", "whangarei"], x: 59, y: 9 },
    { terms: ["hamilton"], x: 73, y: 27 },
    { terms: ["waikato"], x: 75, y: 33 },
    { terms: ["tauranga"], x: 83, y: 29 },
    { terms: ["bay of plenty", "rotorua"], x: 84, y: 35 },
    { terms: ["gisborne"], x: 91, y: 29 },
    { terms: ["taranaki", "new plymouth"], x: 64, y: 36 },
    { terms: ["hawke", "napier", "hastings"], x: 84, y: 41 },
    { terms: ["palmerston"], x: 74, y: 40 },
    { terms: ["whanganui", "manawat"], x: 67, y: 43 },
    { terms: ["wellington"], x: 72, y: 53 },
    { terms: ["nelson"], x: 57, y: 54 },
    { terms: ["tasman"], x: 51, y: 57 },
    { terms: ["marlborough"], x: 63, y: 58 },
    { terms: ["west coast"], x: 36, y: 66 },
    { terms: ["christchurch"], x: 47, y: 72 },
    { terms: ["canterbury"], x: 40, y: 75 },
    { terms: ["dunedin"], x: 35, y: 90 },
    { terms: ["otago"], x: 29, y: 82 },
    { terms: ["queenstown"], x: 22, y: 85 },
    { terms: ["southland", "invercargill"], x: 17, y: 90 }
  ];
  const match = positions.find(({ terms }) => terms.some((term) => value.includes(term)));
  return match ? { x: match.x, y: match.y } : null;
}

function StageBarChart({ stages }: { stages: Array<{ label: string; value: number }> }) {
  const maxValue = Math.max(...stages.map((stage) => stage.value), 1);

  return (
    <div className="flex h-[110px] items-end gap-4 px-2">
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
  info,
  href
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
  info?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="grid gap-2 rounded-[24px] border border-[color:rgba(4,15,75,0.08)] bg-white/94 px-4 py-4 shadow-[0_3px_10px_rgba(11,24,77,0.05)] transition hover:border-[color:rgba(4,15,75,0.16)]"
    >
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(180deg,#f6fbff,#edf7ff)]">
          {icon}
        </div>
        <p className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--text-soft)]">
          {label}
          {info ? <InfoTooltip label={label}>{info}</InfoTooltip> : null}
        </p>
      </div>
      <p className="text-2xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">{value}</p>
      {detail ? <p className="text-xs text-[color:var(--text-soft)]">{detail}</p> : null}
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
  // Dated by its sessions, as on the Bookings page, so a historical booking
  // imported during the period isn't counted as completed in it.
  const completed = rangeBookings.filter(
    (booking) =>
      isCompletedBooking(booking) && booking.sessions.some((session) => rangeSessionIds.has(session.id))
  );
  const needsReview = rangeBookings.filter(
    (booking) =>
      BOOKING_REVIEW_STATUSES.has(booking.status) ||
      booking.sessions.some((session) => BOOKING_REVIEW_STATUSES.has(session.status))
  );
  // Every session of those completed bookings in the period, so a multi-session
  // booking counts each presentation it delivered.
  const presentationsDelivered = rangeSessions.filter(isCountedPresentation);
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
      const createdAt = new Date(bookingActivityDate(booking)).getTime();
      return createdAt >= sevenDaysAgo && createdAt <= now.getTime();
    }).length,
    needsReview: needsReview.length,
    confirmed: confirmed.length,
    upcomingSessions: confirmedUpcoming.length,
    pending: rangeBookings.filter((booking) => BOOKING_PENDING_STATUSES.has(booking.status)).length,
    completed: completed.length,
    presentationsDelivered: presentationsDelivered.length,
    // A school with several completed bookings in the period counts once.
    schoolsVisited: new Set(
      completed.map((booking) => booking.sessions[0]?.schoolId ?? booking.schoolName)
    ).size,
    cancelled: cancelled.length
  };
}

// Presentations delivered per month: every non-cancelled session of a completed
// booking, by its session date, for two years. The earlier year's total stops
// at `previousCutoff` so a year in progress compares like for like.
function buildPresentationsComparison(
  bookings: BookingRequestView[],
  fromYear: number,
  year: number,
  previousCutoff: Date
) {
  const current = Array.from({ length: 12 }, () => 0);
  const previous = Array.from({ length: 12 }, () => 0);
  let previousTotal = 0;

  for (const booking of bookings) {
    if (!isCompletedBooking(booking)) {
      continue;
    }

    for (const session of booking.sessions) {
      if (isCancelledSession(session)) {
        continue;
      }

      const { year: sessionYear, month } = nzYearMonth(session.startsAt);

      if (sessionYear === year) {
        current[month] += 1;
      } else if (sessionYear === fromYear) {
        previous[month] += 1;

        if (new Date(session.startsAt).getTime() < previousCutoff.getTime()) {
          previousTotal += 1;
        }
      }
    }
  }

  return {
    series: MONTH_LABELS.map((label, index) => ({
      label,
      current: current[index],
      previous: previous[index]
    })),
    total: current.reduce((sum, count) => sum + count, 0),
    previousTotal
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
    { label: "Ambassador-referred", value: count("ambassador"), color: "#f5a623" },
    { label: "Ambassador self-sourced", value: count("ambassador_booked"), color: "#7c3aed" }
  ].map((segment) => ({ ...segment, percent: percent(segment.value) }));

  return { total, segments };
}

function buildBookingStatusBreakdown(yearBookings: BookingRequestView[]) {
  const count = (group: BookingStatusGroup) =>
    yearBookings.filter((booking) => bookingStatusGroup(booking) === group).length;
  const total = yearBookings.length;
  const percent = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);
  const segments = [
    { label: "Completed", value: count("completed"), color: "#18a83b" },
    { label: "Confirmed", value: count("confirmed"), color: "#7c3aed" },
    { label: "Rescheduling", value: count("rescheduling"), color: "#ea580c" },
    { label: "Withdrawal", value: count("withdrawal"), color: "#db2777" },
    { label: "Pending", value: count("pending"), color: "#98a2b3" },
    { label: "Cancelled", value: count("cancelled"), color: "#d75b52" }
  ].map((segment) => ({ ...segment, percent: percent(segment.value) }));

  return {
    total,
    segments,
    completionRate: percent(count("completed"))
  };
}

function buildYearlyStudentSeries(
  sessions: BookingSessionView[],
  year: number,
  now: Date
) {
  const yearDeliveredSessions = sessions.filter(
    (session) =>
      nzYear(session.startsAt) === year &&
      isCountedPresentation(session) &&
      new Date(session.endsAt).getTime() < now.getTime()
  );
  // Same students-reached figure as the glance strip, split by month.
  const summary = summarizeStudentReach([], yearDeliveredSessions);
  const counts = Array.from({ length: 12 }, () => 0);
  const reachedBySession = studentsReachedBySession(yearDeliveredSessions);

  for (const session of yearDeliveredSessions) {
    counts[nzYearMonth(session.startsAt).month] += reachedBySession.get(session.id) ?? 0;
  }

  return {
    series: MONTH_LABELS.map((label, index) => ({ label, value: counts[index] })),
    total: summary.reached,
    schoolsReached: summary.schoolsReached
  };
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
      nzYear(payment.paidAt ?? payment.createdAt) === year
  );
  const outstanding = payments.filter((payment) =>
    ["pending", "eligible", "approved"].includes(payment.status)
  );

  return {
    paidThisYearCents: paidThisYear.reduce((total, payment) => total + payment.amountCents, 0),
    paidThisYearCount: paidThisYear.length,
    // A payment awaiting a staff custom review (0056) has no payable total yet.
    outstandingCents: outstanding
      .filter((payment) => !isAwaitingCustomReview(payment))
      .reduce((total, payment) => total + payment.amountCents, 0),
    outstandingCount: outstanding.length,
    outstanding
  };
}

function buildRegionCoverage(
  presentationSessions: BookingSessionView[],
  approvedAmbassadors: AmbassadorProfile[],
  regions: RegionSummary[]
): CoverageRegion[] {
  const regionNamesBySlug = new Map(regions.map((region) => [region.slug, region.name]));
  const tallies = new Map<
    string,
    {
      schools: Set<string>;
      presentations: number;
      ambassadors: CoverageRegion["ambassadors"];
    }
  >();
  // Anything without a known region shares one row, so the totals still add up.
  const tallyFor = (regionSlug: string) => {
    const slug =
      regionSlug === "online" || regionNamesBySlug.has(regionSlug) ? regionSlug : "unassigned";
    const tally = tallies.get(slug) ?? {
      schools: new Set<string>(),
      presentations: 0,
      ambassadors: [] as CoverageRegion["ambassadors"]
    };
    tallies.set(slug, tally);
    return tally;
  };

  for (const session of presentationSessions) {
    const tally = tallyFor(session.regionSlug);
    tally.schools.add(session.schoolId ?? session.schoolName);
    tally.presentations += 1;
  }

  for (const ambassador of approvedAmbassadors) {
    const coveredSlugs = new Set(
      [ambassador.regionSlug, ...ambassador.travelRegions].filter((slug) =>
        regionNamesBySlug.has(slug)
      )
    );
    const person = { id: ambassador.id, name: ambassador.name };

    for (const slug of coveredSlugs.size > 0 ? coveredSlugs : ["unassigned"]) {
      tallyFor(slug).ambassadors.push(person);
    }
  }

  return Array.from(tallies.entries()).map(([slug, tally]) => ({
    slug,
    name: slug === "online" ? "Online" : (regionNamesBySlug.get(slug) ?? "No region set"),
    schools: tally.schools.size,
    presentations: tally.presentations,
    ambassadors: [...tally.ambassadors].sort((left, right) => left.name.localeCompare(right.name))
  }));
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
  const current = nzYearMonth(now);
  const inMonth = (value: string, monthsBack: number) => {
    const date = nzYearMonth(value);
    const target = new Date(Date.UTC(current.year, current.month - monthsBack, 1));
    return date.year === target.getUTCFullYear() && date.month === target.getUTCMonth();
  };
  const deliveredIn = (monthsBack: number) =>
    sessions.filter((session) => isCountedPresentation(session) && inMonth(session.startsAt, monthsBack));
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
  const ambassadorRatings = averageReportRating(reports);
  const average = (values: number[]) =>
    values.length > 0
      ? Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10
      : 0;

  return {
    schoolRating: average(schoolRatings),
    schoolCount: schoolRatings.length,
    ambassadorRating:
      ambassadorRatings.rating === null ? 0 : Math.round(ambassadorRatings.rating * 10) / 10,
    ambassadorCount: ambassadorRatings.count
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
