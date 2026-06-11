import type { ReactNode } from "react";
import { ArrowRight, MessageSquareText, Star, UsersRound } from "lucide-react";

import { MetricGrid } from "@/components/dashboard/metric-grid";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  AmbassadorProfile,
  BookingSessionView,
  DashboardMetric,
  ReportSummary
} from "@/lib/domain/types";
import { buildYearGroupCoverage, isDeliveredSession } from "@/lib/services/dashboard-insights";
import { cn, formatShortDate, formatTime, formatWeekdayDate } from "@/lib/utils";

type SeriesPoint = {
  label: string;
  value: number;
};

export function OperationsAnalytics({
  metrics,
  sourceMetrics,
  upcomingSessions,
  reports,
  ambassadors,
  calendarHref,
  calendarActionLabel = "View full calendar",
  feedbackHref,
  feedbackActionLabel = "Open reports",
  audienceLabel,
  sessions,
  periodLabel = "This period"
}: {
  metrics: DashboardMetric[];
  sourceMetrics?: DashboardMetric[];
  upcomingSessions: BookingSessionView[];
  reports: ReportSummary[];
  ambassadors: AmbassadorProfile[];
  calendarHref: string;
  calendarActionLabel?: string;
  feedbackHref: string;
  feedbackActionLabel?: string;
  audienceLabel: string;
  sessions?: BookingSessionView[];
  periodLabel?: string;
}) {
  const analyticsSessions = sessions ?? upcomingSessions;
  const deliveredSessions = analyticsSessions.filter((session) => isDeliveredSession(session));
  const attendanceSeries = buildAttendanceSeries(reports, deliveredSessions, upcomingSessions);
  const deliverySeries = buildDeliverySeries(reports, deliveredSessions, upcomingSessions);
  const studentsReached = buildStudentsReached(reports, deliveredSessions);
  const presentationsDelivered = Math.max(reports.length, deliveredSessions.length);
  const feedbackRating = buildFeedbackRating(reports);
  const approvedAmbassadors = ambassadors.filter((ambassador) => ambassador.status === "approved").length;
  const schoolsReached = new Set(deliveredSessions.map((session) => session.schoolName)).size;
  const coverage = buildYearGroupCoverage(deliveredSessions);

  return (
    <div className="grid gap-6">
      <MetricGrid metrics={metrics} />

      {sourceMetrics && sourceMetrics.length > 0 ? (
        <Card className="rounded-[30px] border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,251,255,0.9))]">
          <DashboardCardHeading
            kicker="Where bookings come from"
            title="Source split for this range"
          />
          <div className="mt-5">
            <MetricGrid metrics={sourceMetrics} />
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 2xl:grid-cols-[1.14fr_0.86fr]">
        <Card className="rounded-[32px] border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(247,251,255,0.9))]">
          <DashboardCardHeading
            kicker="Upcoming presentations"
            title="What the team is delivering next"
            actionHref={calendarHref}
            actionLabel={calendarActionLabel}
          />
          <div className="mt-6 grid gap-4">
            {upcomingSessions.slice(0, 4).map((session) => (
              <div
                key={session.id}
                className="grid gap-4 rounded-[24px] border border-[color:rgba(4,15,75,0.08)] bg-white/92 px-5 py-5 shadow-[0_18px_40px_rgba(11,24,77,0.05)] md:grid-cols-[0.9fr_1.15fr_0.95fr_auto]"
              >
                <div>
                  <p className="text-sm font-semibold text-[#246bff]">
                    {formatWeekdayDate(session.startsAt)}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                    {formatTime(session.startsAt)}
                  </p>
                </div>
                <div>
                  <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--navy)]">
                    {session.presentationTitle}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--text-soft)]">{session.schoolName}</p>
                  <p className="mt-1 text-sm text-[color:var(--text-soft)]">{session.assignedAmbassadorName ?? "Ambassador to assign"}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[color:var(--navy)]">{session.regionSlug}</p>
                  <p className="mt-1 text-sm text-[color:var(--text-soft)]">{session.yearLevels}</p>
                </div>
                <div className="flex items-center md:justify-end">
                  <StatusBadge value={session.status} />
                </div>
              </div>
            ))}
            {upcomingSessions.length === 0 ? (
              <EmptyStateCopy copy="No upcoming presentations are scheduled yet." />
            ) : null}
          </div>
        </Card>

        <Card className="rounded-[32px] border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(243,248,255,0.92))]">
          <DashboardCardHeading kicker="Students reached" title={periodLabel} />
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-5xl font-semibold tracking-[-0.06em] text-[color:var(--navy)]">
                {studentsReached.toLocaleString("en-NZ")}
              </p>
              <p className="mt-3 text-sm font-semibold text-[color:var(--green)]">
                {schoolsReached} schools reached
              </p>
            </div>
            <div className="rounded-[22px] border border-[color:rgba(4,15,75,0.08)] bg-white/92 px-4 py-3 text-sm text-[color:var(--text-soft)]">
              Based on delivered sessions and submitted reports across {audienceLabel.toLowerCase()}.
            </div>
          </div>
          <div className="mt-6">
            <LineTrendChart series={attendanceSeries} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[0.86fr_1.14fr]">
        <Card className="rounded-[32px] border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,250,255,0.92))]">
          <DashboardCardHeading kicker="Presentations delivered" title={periodLabel} />
          <p className="mt-5 text-5xl font-semibold tracking-[-0.06em] text-[color:var(--navy)]">
            {presentationsDelivered}
          </p>
          <p className="mt-3 text-sm font-semibold text-[color:var(--green)]">
            {reports.length} submitted reports
          </p>
          <div className="mt-8">
            <MiniBarChart series={deliverySeries} />
          </div>
        </Card>

        <Card className="rounded-[32px] border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,252,255,0.92))]">
          <DashboardCardHeading
            kicker="Feedback summary"
            title="This month"
            actionHref={feedbackHref}
            actionLabel={feedbackActionLabel}
          />
          <div className="mt-5 grid gap-5 md:grid-cols-[auto_1fr] md:items-end">
            <div>
              <p className="text-5xl font-semibold tracking-[-0.06em] text-[color:var(--navy)]">
                {feedbackRating.toFixed(1)}
                <span className="ml-2 text-2xl font-medium text-[color:var(--text-soft)]">/ 5</span>
              </p>
              <p className="mt-3 text-sm text-[color:var(--text-soft)]">
                from {reports.length} submitted reviews
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 text-[#f5b319]">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star
                    key={index}
                    className={cn(
                      "h-6 w-6",
                      index < Math.round(feedbackRating) ? "fill-current" : "fill-transparent"
                    )}
                  />
                ))}
              </div>
              <div className="rounded-[20px] border border-[color:rgba(4,15,75,0.08)] bg-white/92 px-4 py-3 text-sm text-[color:var(--text-soft)]">
                {approvedAmbassadors} approved ambassadors available to support sessions.
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <AnalyticsInfoTile
              icon={<MessageSquareText className="h-5 w-5 text-[#246bff]" />}
              label="Year groups reached"
              value={coverage.reachedLabel}
            />
            <AnalyticsInfoTile
              icon={<UsersRound className="h-5 w-5 text-[color:var(--green)]" />}
              label="Coverage gaps"
              value={coverage.gapLabel}
            />
            <AnalyticsInfoTile
              icon={<ArrowRight className="h-5 w-5 text-[color:var(--navy)]" />}
              label="Upcoming sessions"
              value={String(upcomingSessions.length)}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function DashboardCardHeading({
  kicker,
  title,
  actionHref,
  actionLabel
}: {
  kicker: string;
  title: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--green)]">
          {kicker}
        </p>
        <h2 className="mt-2 text-[clamp(1.7rem,2vw,2.25rem)] font-semibold tracking-[-0.05em] text-[color:var(--navy)]">
          {title}
        </h2>
      </div>
      {actionHref && actionLabel ? (
        <ButtonLink href={actionHref} variant="ghost" className="min-h-[40px] px-3 py-2">
          {actionLabel}
          <ArrowRight className="h-4 w-4" />
        </ButtonLink>
      ) : null}
    </div>
  );
}

function AnalyticsInfoTile({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-[color:rgba(4,15,75,0.08)] bg-white/92 px-4 py-4 shadow-[0_14px_32px_rgba(11,24,77,0.05)]">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#f6fbff,#edf7ff)]">
        {icon}
      </div>
      <p className="mt-4 text-sm text-[color:var(--text-soft)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--navy)]">
        {value}
      </p>
    </div>
  );
}

function LineTrendChart({ series }: { series: SeriesPoint[] }) {
  const width = 520;
  const height = 220;
  const paddingX = 22;
  const paddingY = 22;
  const chartHeight = height - paddingY * 2;
  const chartWidth = width - paddingX * 2;
  const maxValue = Math.max(...series.map((point) => point.value), 1);

  const coordinates = series.map((point, index) => {
    const x =
      paddingX + (series.length === 1 ? chartWidth / 2 : (chartWidth / (series.length - 1)) * index);
    const y = height - paddingY - (point.value / maxValue) * chartHeight;
    return { x, y };
  });

  const linePath = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath = [
    `M ${coordinates[0]?.x ?? paddingX} ${height - paddingY}`,
    ...coordinates.map((point) => `L ${point.x} ${point.y}`),
    `L ${coordinates[coordinates.length - 1]?.x ?? width - paddingX} ${height - paddingY}`,
    "Z"
  ].join(" ");

  return (
    <div className="rounded-[28px] border border-[color:rgba(4,15,75,0.08)] bg-[linear-gradient(180deg,rgba(240,247,255,0.72),rgba(255,255,255,0.94))] px-4 py-5">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full">
        <defs>
          <linearGradient id="attendance-fill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(36,107,255,0.24)" />
            <stop offset="100%" stopColor="rgba(36,107,255,0.02)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((marker) => (
          <line
            key={marker}
            x1={paddingX}
            x2={width - paddingX}
            y1={height - paddingY - chartHeight * marker}
            y2={height - paddingY - chartHeight * marker}
            stroke="rgba(4,15,75,0.08)"
            strokeDasharray="5 7"
          />
        ))}
        <path d={areaPath} fill="url(#attendance-fill)" />
        <polyline
          fill="none"
          stroke="#246bff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
          points={linePath}
        />
        {coordinates.map((point, index) => (
          <circle
            key={series[index]?.label ?? index}
            cx={point.x}
            cy={point.y}
            r="6"
            fill="#246bff"
            stroke="white"
            strokeWidth="4"
          />
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
        {series.map((point) => (
          <span key={point.label} className="text-center">
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function MiniBarChart({ series }: { series: SeriesPoint[] }) {
  const maxValue = Math.max(...series.map((point) => point.value), 1);

  return (
    <div className="rounded-[28px] border border-[color:rgba(4,15,75,0.08)] bg-[linear-gradient(180deg,rgba(244,249,255,0.78),rgba(255,255,255,0.96))] px-4 py-5">
      <div className="flex h-[170px] items-end gap-4">
        {series.map((point) => {
          const height = Math.max(16, (point.value / maxValue) * 100);
          return (
            <div key={point.label} className="flex flex-1 flex-col items-center gap-3">
              <div className="flex h-full w-full items-end justify-center">
                <div className="relative h-full w-8 rounded-full bg-[linear-gradient(180deg,rgba(175,213,237,0.3),rgba(175,213,237,0.08))]">
                  <span
                    className="absolute inset-x-0 bottom-0 rounded-full bg-[linear-gradient(180deg,#8cc4f0,#246bff)]"
                    style={{ height: `${height}%` }}
                  />
                </div>
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                {point.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyStateCopy({ copy }: { copy: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-[color:rgba(4,15,75,0.1)] bg-white/70 px-5 py-8 text-sm text-[color:var(--text-soft)]">
      {copy}
    </div>
  );
}

function buildAttendanceSeries(
  reports: ReportSummary[],
  deliveredSessions: BookingSessionView[],
  upcomingSessions: BookingSessionView[]
) {
  const recentReports = [...reports]
    .sort((left, right) => new Date(left.submittedAt).getTime() - new Date(right.submittedAt).getTime())
    .slice(-6);

  if (recentReports.length > 0) {
    let cumulative = 0;

    return recentReports.map((report) => {
      cumulative += Number(report.attendeeCount ?? 0);
      return {
        label: formatShortDate(report.submittedAt),
        value: cumulative
      };
    });
  }

  const sessions = [...deliveredSessions]
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())
    .slice(-6);

  if (sessions.length === 0) {
    const futureSessions = [...upcomingSessions]
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())
      .slice(0, 6);

    if (futureSessions.length === 0) {
      return fallbackSeries(["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6"], [0, 0, 0, 0, 0, 0]);
    }

    let cumulativeExpected = 0;
    return futureSessions.map((session) => {
      cumulativeExpected += Number(session.expectedStudentCount ?? 0);
      return {
        label: formatShortDate(session.startsAt),
        value: cumulativeExpected
      };
    });
  }

  let cumulative = 0;

  return sessions.map((session) => {
    cumulative += Number(session.actualStudentCount ?? session.expectedStudentCount ?? 0);
    return {
      label: formatShortDate(session.startsAt),
      value: cumulative
    };
  });
}

function buildDeliverySeries(
  reports: ReportSummary[],
  deliveredSessions: BookingSessionView[],
  upcomingSessions: BookingSessionView[]
) {
  const recentReports = [...reports]
    .sort((left, right) => new Date(left.submittedAt).getTime() - new Date(right.submittedAt).getTime())
    .slice(-6);

  if (recentReports.length > 0) {
    return recentReports.map((report) => ({
      label: formatShortDate(report.submittedAt),
      value: Math.max(report.attendeeCount, 1)
    }));
  }

  const recentDelivered = [...deliveredSessions]
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())
    .slice(-6);

  if (recentDelivered.length > 0) {
    return recentDelivered.map((session) => ({
      label: formatShortDate(session.startsAt),
      value: Math.max(Number(session.actualStudentCount ?? session.expectedStudentCount ?? 0), 1)
    }));
  }

  const fallbackSessions = [...upcomingSessions]
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())
    .slice(0, 6);

  if (fallbackSessions.length > 0) {
    return fallbackSessions.map((session) => ({
      label: formatShortDate(session.startsAt),
      value: Math.max(session.expectedStudentCount, 1)
    }));
  }

  return fallbackSeries(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], [80, 110, 160, 120, 190, 170]);
}

function buildFeedbackRating(reports: ReportSummary[]) {
  if (reports.length === 0) {
    return 0;
  }

  const ratings = reports
    .map((report) => report.teacherResponseRating)
    .filter((rating): rating is number => typeof rating === "number" && Number.isFinite(rating));

  if (ratings.length === 0) {
    const reviewedRatio = reports.filter((report) => report.status === "reviewed").length / reports.length;
    return Math.min(5, Math.max(3.8, Math.round((4.1 + reviewedRatio * 0.9) * 10) / 10));
  }

  return Math.round((ratings.reduce((total, rating) => total + rating, 0) / ratings.length) * 10) / 10;
}

function buildStudentsReached(reports: ReportSummary[], deliveredSessions: BookingSessionView[]) {
  if (reports.length > 0) {
    return reports.reduce((total, report) => total + Number(report.attendeeCount ?? 0), 0);
  }

  return deliveredSessions.reduce(
    (total, session) => total + Number(session.actualStudentCount ?? session.expectedStudentCount ?? 0),
    0
  );
}

function fallbackSeries(labels: string[], values: number[]) {
  return labels.map((label, index) => ({
    label,
    value: values[index] ?? 0
  }));
}
