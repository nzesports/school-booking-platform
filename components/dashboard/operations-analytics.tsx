import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  FilePlus2,
  FileText,
  FolderOpen,
  Globe2,
  Home,
  Hourglass,
  Mail,
  MapPinned,
  School2,
  ShieldCheck,
  Star,
  UserCheck,
  UsersRound
} from "lucide-react";

import { markPaymentPaidAction } from "@/app/portal/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
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
  bookingNeedsAction,
  buildYearGroupCoverage,
  isCancelledSession,
  isCompletedBooking,
  isDeliveredSession,
  isFutureSession,
  reportInRange,
  reviewInRange,
  sessionInRange,
  type DashboardRange
} from "@/lib/services/dashboard-insights";
import { cn, formatCurrency, formatTime, formatWeekdayDate } from "@/lib/utils";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type RegionSummary = { id: string; name: string; slug: string; isActive: boolean };

export function OperationsAnalytics({
  basePath,
  range,
  periodLabel,
  bookings,
  reports,
  schoolReviews,
  ambassadors,
  payments,
  schools,
  presentations,
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
  periodLabel: string;
  bookings: BookingRequestView[];
  reports: ReportSummary[];
  schoolReviews: SchoolFeedbackSummary[];
  ambassadors: AmbassadorProfile[];
  payments: PaymentRecord[];
  schools: School[];
  presentations: PresentationType[];
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

  // Range-scoped data drives the glance strip and pipeline; yearly data drives the charts.
  const rangeBookings = bookings.filter((booking) => bookingInRange(booking, range, now));
  const rangeSessions = rangeBookings.flatMap((booking) =>
    booking.sessions.filter((session) => sessionInRange(session, range, now))
  );
  const rangeReports = reports.filter((report) => reportInRange(report, range, now));
  const rangeReviews = schoolReviews.filter((review) => reviewInRange(review, range, now));
  const deliveredRangeSessions = rangeSessions.filter((session) => isDeliveredSession(session, now));
  const approvedAmbassadors = ambassadors.filter((ambassador) => ambassador.status === "approved");
  const pendingApplications = ambassadors.filter((ambassador) => ambassador.status === "applied");

  const pipeline = buildBookingPipeline(rangeBookings, rangeSessions, now);
  const studentsReachedRange = countStudentsReached(rangeReports, deliveredRangeSessions);

  const yearBookings = bookings.filter((booking) => new Date(booking.createdAt).getFullYear() === year);
  const activity = buildYearlyActivity(bookings, allSessions, year);
  const sources = buildSourceBreakdown(yearBookings);
  const studentSeries = buildYearlyStudentSeries(reports, allSessions, year);
  const yearStudentsTotal = studentSeries.reduce((total, point) => total + point.value, 0);
  const lastYearStudentsTotal = buildYearlyStudentSeries(reports, allSessions, year - 1).reduce(
    (total, point) => total + point.value,
    0
  );
  const yearSchoolsReached = new Set(
    allSessions
      .filter((session) => new Date(session.startsAt).getFullYear() === year && isDeliveredSession(session, now))
      .map((session) => session.schoolName)
  ).size;

  const paymentSummary = buildPaymentSummary(payments, year);
  const regionCoverage = buildRegionCoverage(approvedAmbassadors, regions);
  const ambassadorFunnel = buildAmbassadorFunnel(yearBookings, now);
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

  const bookingsHref = (view: string) => `${basePath}/bookings?status=${view}&range=${range}`;

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
        <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
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
            label="Upcoming sessions"
            value={pipeline.upcomingSessions}
            href={calendarHref ?? bookingsHref("future")}
            withArrow
          />
          <PipelineCard
            icon={<Home className="h-5 w-5 text-[color:var(--green)]" />}
            label="Completed bookings"
            value={pipeline.completed}
            href={bookingsHref("past")}
          />
        </div>
        <PipelineTimeline />
      </Card>

      <Card className="rounded-[32px] border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,251,255,0.9))]">
        <SectionKicker label="Key analytics" />
        <div className="mt-5 grid gap-5 2xl:grid-cols-[1.15fr_0.85fr]">
          <ChartPanel title={`Bookings and sessions over time (${year})`}>
            <div className="flex flex-wrap items-center gap-5 text-xs font-semibold text-[color:var(--text-soft)]">
              <LegendDot color="#18a83b" label="Bookings" />
              <LegendDot color="#246bff" label="Sessions" />
            </div>
            <DualLineChart series={activity.series} />
            <ChartFootnote icon={<ArrowRight className="h-4 w-4 text-[color:var(--green)]" />}>
              {activity.trendNote}
            </ChartFootnote>
          </ChartPanel>

          <ChartPanel title={`Where bookings come from (${year})`}>
            <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
              <DonutChart total={sources.total} segments={sources.segments} />
              <div className="grid gap-3">
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
              All booking data for Jan – Dec {year}
            </ChartFootnote>
          </ChartPanel>
        </div>
      </Card>

      <Card className="rounded-[32px] border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,251,255,0.9))]">
        <SectionKicker label={`Students reached (${year})`} />
        <div className="mt-5 grid gap-6 2xl:grid-cols-[0.32fr_0.68fr] 2xl:items-center">
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
              Yearly trend (Jan – Dec {year})
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

        <div className="mt-5 grid gap-5 2xl:grid-cols-2">
          <ChartPanel title={`Ambassador coverage by region (${year})`} tone="green">
            {regionCoverage.length > 0 ? (
              <>
                <div className="grid gap-3">
                  {regionCoverage.map((region) => (
                    <HorizontalBar
                      key={region.slug}
                      label={region.name}
                      value={region.count}
                      max={regionCoverage[0]?.count ?? 1}
                    />
                  ))}
                </div>
                <p className="mt-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                  Active ambassadors
                </p>
              </>
            ) : (
              <EmptyStateCopy copy="No approved ambassadors are assigned to a region yet." />
            )}
          </ChartPanel>

          <ChartPanel title={`Ambassador-sourced bookings (${year})`} tone="green">
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
        </div>

        <div className="mt-5 rounded-[26px] border border-[color:rgba(4,15,75,0.08)] bg-white/92 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[color:var(--navy)]">
                Outstanding payment submissions
              </p>
              <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                Payment records created from submitted ambassador reports, waiting on an invoice or
                finance.
              </p>
            </div>
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
                  <form action={markPaymentPaidAction}>
                    <input type="hidden" name="paymentId" value={payment.id} />
                    <input type="hidden" name="returnTo" value={basePath} />
                    <Button
                      type="submit"
                      variant="secondary"
                      className="min-h-[38px] rounded-[14px] px-3 py-1.5"
                    >
                      Mark as paid
                    </Button>
                  </form>
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
                      {formatWeekdayDate(session.startsAt)} · {formatTime(session.startsAt)} ·{" "}
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

          <ImpactCard title="Feedback summary">
            <p className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-[color:var(--navy)]">
              {feedback.rating.toFixed(1)}
              <span className="ml-1 text-xl font-medium text-[color:var(--text-soft)]">/5</span>
            </p>
            <div className="mt-2 flex items-center gap-1 text-[#f5b319]">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star
                  key={index}
                  className={cn(
                    "h-5 w-5",
                    index < Math.round(feedback.rating) ? "fill-current" : "fill-transparent"
                  )}
                />
              ))}
            </div>
            <p className="mt-2 text-sm text-[color:var(--text-soft)]">
              From {feedback.reviewCount} submitted {feedback.reviewCount === 1 ? "review" : "reviews"}
            </p>
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
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--green)]">
              Presentation catalogue
            </p>
            <div className="mt-4 grid gap-2.5">
              {presentations.slice(0, 4).map((presentation) => (
                <div key={presentation.id} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2.5 text-sm font-semibold text-[color:var(--navy)]">
                    <FileText className="h-4 w-4 text-[#246bff]" />
                    {presentation.title}
                  </span>
                  <StatusBadge value={presentation.active ? "confirmed" : "cancelled"} />
                </div>
              ))}
              {presentations.length === 0 ? (
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
    <div className="mt-6 hidden px-3 xl:block">
      <div className="relative flex items-center justify-between">
        <span className="absolute inset-x-4 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-[color:rgba(4,15,75,0.16)]" />
        {PIPELINE_STAGES.map((stage) => (
          <span
            key={stage.label}
            className="relative h-4 w-4 rounded-full border-4 bg-white"
            style={{ borderColor: stage.color }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
        {PIPELINE_STAGES.map((stage) => (
          <span key={stage.label}>{stage.label}</span>
        ))}
      </div>
    </div>
  );
}

function ChartPanel({
  title,
  tone = "blue",
  children
}: {
  title: string;
  tone?: "blue" | "green";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[26px] border border-[color:rgba(4,15,75,0.08)] p-5",
        tone === "green"
          ? "bg-[linear-gradient(180deg,rgba(241,250,243,0.7),rgba(255,255,255,0.95))]"
          : "bg-[linear-gradient(180deg,rgba(244,249,255,0.75),rgba(255,255,255,0.95))]"
      )}
    >
      <p className="text-sm font-semibold text-[color:var(--navy)]">{title}</p>
      <div className="mt-4">{children}</div>
    </div>
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
  const height = 210;
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
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[210px] w-full">
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

function HorizontalBar({ label, value, max }: { label: string; value: number; max: number }) {
  const widthPercent = max > 0 ? Math.max(6, (value / max) * 100) : 0;

  return (
    <div className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-sm">
      <span className="truncate font-medium text-[color:var(--navy)]">{label}</span>
      <div className="h-3.5 rounded-full bg-[rgba(4,15,75,0.06)]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,#3fbf68,#18a83b)]"
          style={{ width: `${widthPercent}%` }}
        />
      </div>
      <span className="font-semibold text-[color:var(--navy)]">{value}</span>
    </div>
  );
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
  return {
    newBookings: rangeBookings.filter((booking) => booking.status === "requested").length,
    needsReview: rangeBookings.filter(bookingNeedsAction).length,
    confirmed: rangeBookings.filter((booking) =>
      ["confirmed", "ambassador_assigned"].includes(booking.status)
    ).length,
    upcomingSessions: rangeSessions.filter((session) => isFutureSession(session, now)).length,
    completed: rangeBookings.filter(isCompletedBooking).length
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
    { label: "Staff/agency", value: count("staff"), color: "#246bff" },
    { label: "Ambassador-referred", value: count("ambassador"), color: "#f5a623" }
  ].map((segment) => ({ ...segment, percent: percent(segment.value) }));

  return { total, segments };
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
  pending: "Awaiting invoice",
  eligible: "Eligible",
  invoiced: "Invoice received",
  submitted_for_payment: "Sent to finance"
};

function buildPaymentSummary(payments: PaymentRecord[], year: number) {
  const paidThisYear = payments.filter(
    (payment) =>
      payment.status === "paid" &&
      new Date(payment.paidAt ?? payment.createdAt).getFullYear() === year
  );
  const outstanding = payments.filter((payment) =>
    ["pending", "eligible", "invoiced", "submitted_for_payment"].includes(payment.status)
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
    .sort((left, right) => right.count - left.count)
    .slice(0, 6);
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
  const ratings = [
    ...reports
      .map((report) => report.teacherResponseRating)
      .filter((rating): rating is number => typeof rating === "number" && Number.isFinite(rating)),
    ...reviews
      .map((review) => review.rating)
      .filter((rating): rating is number => typeof rating === "number" && Number.isFinite(rating))
  ];

  return {
    rating:
      ratings.length > 0
        ? Math.round((ratings.reduce((total, rating) => total + rating, 0) / ratings.length) * 10) / 10
        : 0,
    reviewCount: ratings.length
  };
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
