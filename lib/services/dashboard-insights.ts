import type {
  AmbassadorProfile,
  BookingActivityLogSummary,
  BookingRequestView,
  BookingSessionView,
  BookingStatus,
  DashboardMetric,
  PresentationType,
  ReportSummary,
  School,
  SchoolFeedbackSummary
} from "@/lib/domain/types";
import { formatShortDate } from "@/lib/utils";

export type DashboardRange = "week" | "month" | "term" | "biannual" | "year" | "all";
export type BookingLifecycleView = "current" | "future" | "past" | "cancelled" | "all";

export const dashboardRangeOptions: Array<{ value: DashboardRange; label: string }> = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "term", label: "This term" },
  { value: "biannual", label: "Bi-annual" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" }
];

export const bookingLifecycleOptions: Array<{ value: BookingLifecycleView; label: string }> = [
  { value: "current", label: "Current" },
  { value: "future", label: "Future" },
  { value: "past", label: "Past" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All bookings" }
];

const deliveredStatuses = new Set<BookingStatus>([
  "completed_pending_report",
  "report_submitted",
  "payment_pending",
  "paid",
  "closed"
]);

const cancelledStatuses = new Set<BookingStatus>(["cancel_requested", "cancelled", "declined"]);

const actionStatuses = new Set<BookingStatus>([
  "requested",
  "tentative",
  "ambassador_needed",
  "reschedule_requested",
  "cancel_requested",
  "completed_pending_report",
  "report_submitted",
  "payment_pending"
]);

const targetYearGroups = [7, 8, 9, 10, 11, 12, 13];

export function readDashboardRange(value?: string | string[] | null): DashboardRange {
  const range = Array.isArray(value) ? value[0] : value;
  return dashboardRangeOptions.some((option) => option.value === range)
    ? (range as DashboardRange)
    : "month";
}

export function readBookingLifecycleView(value?: string | string[] | null): BookingLifecycleView {
  const view = Array.isArray(value) ? value[0] : value;
  return bookingLifecycleOptions.some((option) => option.value === view)
    ? (view as BookingLifecycleView)
    : "current";
}

export function dashboardRangeLabel(range: DashboardRange) {
  return dashboardRangeOptions.find((option) => option.value === range)?.label ?? "This month";
}

export function dashboardRangeWindow(range: DashboardRange, now = new Date()) {
  if (range === "all") {
    return { start: null, end: null };
  }

  const start = new Date(now);
  const end = new Date(now);

  if (range === "week") {
    const day = start.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayOffset);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 7);
    return { start, end };
  }

  if (range === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setMonth(start.getMonth() + 1);
    return { start, end };
  }

  if (range === "term") {
    const month = now.getMonth();
    const termStartMonth = month < 3 ? 0 : month < 6 ? 3 : month < 9 ? 6 : 9;
    start.setMonth(termStartMonth, 1);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setMonth(termStartMonth + 3);
    return { start, end };
  }

  if (range === "biannual") {
    const startMonth = now.getMonth() < 6 ? 0 : 6;
    start.setMonth(startMonth, 1);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setMonth(startMonth + 6);
    return { start, end };
  }

  start.setMonth(0, 1);
  start.setHours(0, 0, 0, 0);
  end.setFullYear(start.getFullYear() + 1, 0, 1);
  end.setHours(0, 0, 0, 0);
  return { start, end };
}

export function sessionInRange(session: BookingSessionView, range: DashboardRange, now = new Date()) {
  const { start, end } = dashboardRangeWindow(range, now);

  if (!start || !end) {
    return true;
  }

  const sessionTime = new Date(session.startsAt).getTime();
  return sessionTime >= start.getTime() && sessionTime < end.getTime();
}

export function reportInRange(report: ReportSummary, range: DashboardRange, now = new Date()) {
  const { start, end } = dashboardRangeWindow(range, now);

  if (!start || !end) {
    return true;
  }

  const reportTime = new Date(report.submittedAt).getTime();
  return reportTime >= start.getTime() && reportTime < end.getTime();
}

export function reviewInRange(review: SchoolFeedbackSummary, range: DashboardRange, now = new Date()) {
  const { start, end } = dashboardRangeWindow(range, now);

  if (!start || !end) {
    return true;
  }

  const reviewTime = new Date(review.createdAt).getTime();
  return reviewTime >= start.getTime() && reviewTime < end.getTime();
}

function bookingCreatedInRange(booking: BookingRequestView, range: DashboardRange, now = new Date()) {
  const { start, end } = dashboardRangeWindow(range, now);

  if (!start || !end) {
    return true;
  }

  const createdTime = new Date(booking.createdAt).getTime();
  return createdTime >= start.getTime() && createdTime < end.getTime();
}

export function bookingInRange(booking: BookingRequestView, range: DashboardRange, now = new Date()) {
  const { start, end } = dashboardRangeWindow(range, now);

  if (!start || !end) {
    return true;
  }

  const createdTime = new Date(booking.createdAt).getTime();
  return (
    (createdTime >= start.getTime() && createdTime < end.getTime()) ||
    booking.sessions.some((session) => sessionInRange(session, range, now))
  );
}

export function isDeliveredSession(session: BookingSessionView, now = new Date()) {
  return (
    deliveredStatuses.has(session.status) ||
    session.reportStatus === "submitted" ||
    session.reportStatus === "reviewed" ||
    Boolean(session.actualStudentCount) ||
    (new Date(session.endsAt).getTime() < now.getTime() && !cancelledStatuses.has(session.status))
  );
}

export function isCancelledSession(session: BookingSessionView) {
  return cancelledStatuses.has(session.status);
}

export function bookingNeedsAction(booking: BookingRequestView) {
  return (
    actionStatuses.has(booking.status) ||
    booking.sessions.some((session) => actionStatuses.has(session.status))
  );
}

export function isCompletedBooking(booking: BookingRequestView) {
  return (
    ["report_submitted", "paid", "closed"].includes(booking.status) ||
    (booking.sessions.length > 0 && booking.sessions.every((session) => isDeliveredSession(session)))
  );
}

export function isFutureSession(session: BookingSessionView, now = new Date()) {
  return new Date(session.startsAt).getTime() >= now.getTime() && !isCancelledSession(session);
}

export function filterBookingsByLifecycle(
  bookings: BookingRequestView[],
  view: BookingLifecycleView,
  now = new Date()
) {
  if (view === "all") {
    return bookings;
  }

  return bookings.filter((booking) => {
    if (view === "cancelled") {
      return cancelledStatuses.has(booking.status) || booking.sessions.some(isCancelledSession);
    }

    if (view === "future") {
      return booking.sessions.some((session) => isFutureSession(session, now));
    }

    if (view === "past") {
      return booking.sessions.some((session) => isDeliveredSession(session, now));
    }

    return (
      actionStatuses.has(booking.status) ||
      booking.sessions.some((session) => actionStatuses.has(session.status))
    );
  });
}

function buildFunnelMetrics(
  bookings: BookingRequestView[],
  activityLogs: BookingActivityLogSummary[] = []
) {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const hasLogs = activityLogs.length > 0;
  const recentSubmissionLogs = activityLogs.filter(
    (log) =>
      log.action === "booking_request.submitted" &&
      new Date(log.createdAt).getTime() > thirtyDaysAgo
  );
  const recentConfirmedLogs = activityLogs.filter(
    (log) =>
      log.action === "booking.status_updated" &&
      log.details.status === "confirmed" &&
      new Date(log.createdAt).getTime() > thirtyDaysAgo
  );
  const recentBookings = bookings.filter(
    (booking) => new Date(booking.createdAt).getTime() > thirtyDaysAgo
  );
  const submissionsLast30d = hasLogs ? recentSubmissionLogs.length : recentBookings.length;
  const confirmedLast30d = hasLogs
    ? recentConfirmedLogs.length
    : recentBookings.filter((booking) =>
        booking.sessions.some((session) =>
          ["confirmed", "ambassador_assigned"].includes(session.status)
        )
      ).length;
  const conversionRate =
    submissionsLast30d > 0 ? Math.round((confirmedLast30d / submissionsLast30d) * 100) : 0;
  const submissionByBookingId = new Map(
    activityLogs
      .filter((log) => log.action === "booking_request.submitted" && log.bookingRequestId)
      .map((log) => [log.bookingRequestId as string, new Date(log.createdAt).getTime()])
  );
  const confirmationDurations = activityLogs
    .filter((log) => log.action === "booking.status_updated" && log.details.status === "confirmed")
    .map((log) => {
      const submittedAt = log.bookingRequestId
        ? submissionByBookingId.get(log.bookingRequestId)
        : null;

      if (!submittedAt) {
        return null;
      }

      return new Date(log.createdAt).getTime() - submittedAt;
    })
    .filter((duration): duration is number => typeof duration === "number" && duration >= 0);
  const averageConfirmationHours =
    confirmationDurations.length > 0
      ? Math.round(
          confirmationDurations.reduce((total, duration) => total + duration, 0) /
            confirmationDurations.length /
            (60 * 60 * 1000)
        )
      : 0;

  return [
    {
      label: "Submissions 30d",
      value: String(submissionsLast30d),
      trend: hasLogs ? "From activity logs" : "From booking records",
      detail: "Public, staff, and referred requests",
      icon: "file",
      tone: "blue"
    },
    {
      label: "Confirmed 30d",
      value: String(confirmedLast30d),
      trend: "Booking funnel",
      detail: "Moved into confirmed delivery",
      icon: "calendar",
      tone: "green"
    },
    {
      label: "Conversion rate",
      value: `${conversionRate}%`,
      trend: "Confirmed / submitted",
      detail: "Last 30 days",
      icon: "sparkles",
      tone: "navy"
    },
    {
      label: "Avg confirm time",
      value: averageConfirmationHours ? `${averageConfirmationHours}h` : "No data",
      trend: "Submission to confirmation",
      detail: "Based on activity log pairs",
      icon: "clock",
      tone: "amber"
    }
  ] satisfies DashboardMetric[];
}

export function buildSourceMetrics(bookings: BookingRequestView[]): DashboardMetric[] {
  const sourceCount = (source: BookingRequestView["source"]) =>
    bookings.filter((booking) => booking.source === source).length;

  return [
    {
      label: "School-initiated",
      value: String(sourceCount("public")),
      trend: "Public and portal booking forms",
      detail: "Requests created by schools",
      icon: "school",
      tone: "green"
    },
    {
      label: "Staff-logged",
      value: String(sourceCount("staff")),
      trend: "Manual staff entry",
      detail: "Requests created by operations",
      icon: "users",
      tone: "blue"
    },
    {
      label: "Ambassador-referred",
      value: String(sourceCount("ambassador")),
      trend: "Outreach attribution",
      detail: "Staff logged with ambassador referral",
      icon: "sparkles",
      tone: "amber"
    }
  ];
}

export function buildRangeMetrics(
  bookings: BookingRequestView[],
  createdBookings: BookingRequestView[],
  ambassadors: AmbassadorProfile[],
  activityLogs: BookingActivityLogSummary[] = []
): DashboardMetric[] {
  const sessions = bookings.flatMap((booking) => booking.sessions);
  const bookingsNeedingAction = bookings.filter(
    (booking) =>
      actionStatuses.has(booking.status) ||
      booking.sessions.some((session) => actionStatuses.has(session.status))
  );
  const approvedAmbassadors = ambassadors.filter((ambassador) => ambassador.status === "approved");
  const upcomingSessions = sessions.filter((session) => isFutureSession(session));
  const confirmedBookings = bookings.filter((booking) =>
    ["confirmed", "ambassador_assigned"].includes(booking.status)
  );
  const cancelledBookings = bookings.filter((booking) => cancelledStatuses.has(booking.status));
  const completedBookings = bookings.filter(isCompletedBooking);

  return [
    {
      label: "Bookings needing action",
      value: String(bookingsNeedingAction.length),
      trend: "Needs review",
      detail: "Assignment, approval, and follow-up",
      icon: "file",
      tone: "amber"
    },
    {
      label: "Upcoming sessions",
      value: String(upcomingSessions.length),
      trend: "Sessions, not bookings",
      detail: "Any non-cancelled future session",
      icon: "calendar",
      tone: "green"
    },
    {
      label: "Confirmed bookings",
      value: String(confirmedBookings.length),
      trend: "Ready or assigned",
      detail: "Confirmed and ambassador-assigned requests",
      icon: "shield",
      tone: "blue"
    },
    {
      label: "Cancelled bookings",
      value: String(cancelledBookings.length),
      trend: "Cancelled or declined",
      detail: "Requests removed from delivery",
      icon: "clock",
      tone: "amber"
    },
    {
      label: "Completed bookings",
      value: String(completedBookings.length),
      trend: "Delivered lifecycle",
      detail: "Reported, paid, closed, or all sessions delivered",
      icon: "school",
      tone: "blue"
    },
    {
      label: "New bookings",
      value: String(createdBookings.length),
      trend: "Created in range",
      detail: "Booking requests created this period",
      icon: "file",
      tone: "green"
    },
    {
      label: "Ambassadors available",
      value: String(approvedAmbassadors.length),
      trend: "Ready to assign",
      detail: "Approved and available for delivery",
      icon: "users",
      tone: "navy"
    },
    ...buildFunnelMetrics(bookings, activityLogs)
  ];
}

export function extractYearNumbers(label?: string) {
  if (!label) {
    return [];
  }

  const matches = Array.from(label.matchAll(/\d+/g)).map((match) => Number(match[0]));

  if (matches.length >= 2) {
    const [start, end] = matches;

    if (start <= end && end - start <= 13) {
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }
  }

  return Array.from(new Set(matches));
}

export function formatYearGroups(years: number[]) {
  if (years.length === 0) {
    return "Not recorded";
  }

  return years
    .sort((left, right) => left - right)
    .map((year) => `Y${year}`)
    .join(", ");
}

export function buildYearGroupCoverage(sessions: BookingSessionView[]) {
  const delivered = sessions.filter((session) => isDeliveredSession(session));
  const reached = Array.from(
    new Set(delivered.flatMap((session) => extractYearNumbers(session.yearLevels)))
  ).filter((year) => targetYearGroups.includes(year));
  const gaps = targetYearGroups.filter((year) => !reached.includes(year));

  return {
    reached,
    gaps,
    reachedLabel: formatYearGroups(reached),
    gapLabel: gaps.length > 0 ? formatYearGroups(gaps) : "No obvious gaps"
  };
}

export function buildSchoolDeliverySummaries(schools: School[], bookings: BookingRequestView[]) {
  const sessions = bookings.flatMap((booking) => booking.sessions);

  return schools.map((school) => {
    const schoolSessions = sessions.filter((session) => session.schoolId === school.id);
    const delivered = schoolSessions.filter((session) => isDeliveredSession(session));
    const upcoming = schoolSessions.filter((session) => isFutureSession(session));
    const cancelled = schoolSessions.filter(isCancelledSession);
    const presentationsDelivered = Array.from(
      new Set(delivered.map((session) => session.presentationTitle))
    );
    const studentCount = delivered.reduce(
      (total, session) => total + Number(session.actualStudentCount ?? session.expectedStudentCount ?? 0),
      0
    );
    const yearGroups = Array.from(
      new Set(delivered.flatMap((session) => extractYearNumbers(session.yearLevels)))
    ).filter((year) => targetYearGroups.includes(year));
    const gaps = targetYearGroups.filter((year) => !yearGroups.includes(year));
    const lastDelivered = delivered
      .map((session) => session.startsAt)
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
    const nextSession = upcoming
      .map((session) => session.startsAt)
      .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0];

    return {
      school,
      deliveredCount: delivered.length,
      upcomingCount: upcoming.length,
      cancelledCount: cancelled.length,
      presentationsDelivered,
      studentCount,
      yearGroupsReached: yearGroups,
      yearGroupGaps: gaps,
      yearGroupsReachedLabel: formatYearGroups(yearGroups),
      yearGroupGapsLabel: gaps.length > 0 ? formatYearGroups(gaps) : "No obvious gaps",
      lastDeliveredLabel: lastDelivered ? formatShortDate(lastDelivered) : "Not yet",
      nextSessionLabel: nextSession ? formatShortDate(nextSession) : "None scheduled"
    };
  });
}

export function buildPresentationPerformance(
  presentations: PresentationType[],
  bookings: BookingRequestView[],
  reports: ReportSummary[],
  reviews: SchoolFeedbackSummary[]
) {
  const sessions = bookings.flatMap((booking) => booking.sessions);
  const average = (values: number[]) =>
    values.length > 0
      ? Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10
      : null;

  return presentations.map((presentation) => {
    const presentationSessions = sessions.filter(
      (session) => session.presentationTypeId === presentation.id
    );
    const delivered = presentationSessions.filter((session) => isDeliveredSession(session));
    const presentationReports = reports.filter(
      (report) => report.presentationTypeId === presentation.id
    );
    const presentationReviews = reviews.filter(
      (review) => review.presentationTypeId === presentation.id
    );

    return {
      presentation,
      deliveredCount: delivered.length,
      upcomingCount: presentationSessions.filter((session) => isFutureSession(session)).length,
      totalAttendees: presentationReports.reduce(
        (total, report) => total + report.attendeeCount,
        0
      ),
      avgTeacherRating: average(
        presentationReports
          .map((report) => report.teacherResponseRating)
          .filter((rating): rating is number => typeof rating === "number")
      ),
      avgSchoolRating: average(
        presentationReviews
          .map((review) => review.rating)
          .filter((rating): rating is number => typeof rating === "number")
      ),
      reviewCount: presentationReviews.length,
      reportCount: presentationReports.length
    };
  });
}

export function buildFilteredDashboardData(
  bookings: BookingRequestView[],
  reports: ReportSummary[],
  ambassadors: AmbassadorProfile[],
  schoolReviews: SchoolFeedbackSummary[],
  range: DashboardRange,
  activityLogs: BookingActivityLogSummary[] = [],
  now = new Date()
) {
  const rangeBookings = bookings.filter((booking) => bookingInRange(booking, range, now));
  const createdBookings = bookings.filter((booking) => bookingCreatedInRange(booking, range, now));
  const rangeReports = reports.filter((report) => reportInRange(report, range, now));
  const rangeSchoolReviews = schoolReviews.filter((review) => reviewInRange(review, range, now));
  const rangeSessions = rangeBookings.flatMap((booking) =>
    booking.sessions.filter((session) => sessionInRange(session, range, now))
  );
  const upcomingSessions = rangeSessions
    .filter((session) => isFutureSession(session, now))
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());

  return {
    bookings: rangeBookings,
    reports: rangeReports,
    schoolReviews: rangeSchoolReviews,
    sessions: rangeSessions,
    upcomingSessions,
    metrics: buildRangeMetrics(rangeBookings, createdBookings, ambassadors, activityLogs),
    sourceMetrics: buildSourceMetrics(rangeBookings)
  };
}
