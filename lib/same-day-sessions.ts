import type { BookingSessionView } from "@/lib/domain/types";
import { formatTime } from "@/lib/utils";

// Back-to-back sessions of one booking on the same NZ day are one opportunity
// for ambassadors: one card, one application, one report. This is the single
// definition of that group for the UI; the database uses the same booking +
// NZ-day rule (submit_ambassador_report_group in 0054, the *_group functions
// in 0055).

const nzDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Pacific/Auckland",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

// "2026-11-03" for the New Zealand calendar day of an instant.
export function nzDayKey(value: string | Date) {
  return nzDayFormatter.format(new Date(value));
}

export function sameDayKey(session: { id: string; bookingRequestId?: string | null; startsAt: string }) {
  return session.bookingRequestId
    ? `${session.bookingRequestId}|${nzDayKey(session.startsAt)}`
    : session.id;
}

// Groups in order of first appearance; each group is sorted by start time.
// `partition` keeps sessions apart that share a day but not a state, e.g. the
// calendar's open vs. upcoming sessions of one booking.
export function groupSameDaySessions<T extends { id: string; bookingRequestId?: string; startsAt: string }>(
  sessions: T[],
  partition?: (session: T) => string
) {
  const groups = new Map<string, T[]>();

  for (const session of sessions) {
    const key = `${partition ? `${partition(session)}|` : ""}${sameDayKey(session)}`;
    groups.set(key, [...(groups.get(key) ?? []), session]);
  }

  return Array.from(groups.values()).map((group) =>
    [...group].sort((left, right) => left.startsAt.localeCompare(right.startsAt))
  );
}

type ReportSession = {
  id: string;
  schoolId?: string;
  schoolName?: string;
  assignedAmbassadorId?: string;
  startsAt: string;
};

const reportSchoolKey = (session: ReportSession) =>
  `${session.assignedAmbassadorId ?? ""}|${session.schoolId ?? session.schoolName ?? session.id}`;

// What one payment covers: an ambassador's sessions at one school on one NZ
// day, however many bookings they came from (submit_ambassador_report_group
// in 0059).
export function reportDayKey(session: ReportSession) {
  return `${reportSchoolKey(session)}|${nzDayKey(session.startsAt)}`;
}

// The Monday of an instant's New Zealand week, as "2026-10-26".
export function nzWeekKey(value: string | Date) {
  const day = new Date(`${nzDayKey(value)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

// What one report form covers: an ambassador's sessions at one school in one
// NZ week. Longer bookings split by week so pay doesn't wait on them.
export function reportVisitKey(session: ReportSession) {
  return `${reportSchoolKey(session)}|${nzWeekKey(session.startsAt)}`;
}

// Visits in order of first appearance, each a list of days, each a list of
// sessions, all earliest first.
export function groupReportVisits<T extends ReportSession>(sessions: T[]) {
  const visits = new Map<string, Map<string, T[]>>();

  for (const session of sessions) {
    const visitKey = reportVisitKey(session);
    const dayKey = reportDayKey(session);
    const days = visits.get(visitKey) ?? new Map<string, T[]>();
    days.set(dayKey, [...(days.get(dayKey) ?? []), session]);
    visits.set(visitKey, days);
  }

  return Array.from(visits.values()).map((days) =>
    Array.from(days.values())
      .map((day) => [...day].sort((left, right) => left.startsAt.localeCompare(right.startsAt)))
      .sort((left, right) => left[0].startsAt.localeCompare(right[0].startsAt))
  );
}

// "9:00 am–10:00 am and 12:30 pm–1:30 pm": every session of one day, in order.
export function formatSessionTimes(sessions: Array<{ startsAt: string; endsAt?: string | null }>) {
  const ranges = [...sessions]
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    .map((session) =>
      session.endsAt ? `${formatTime(session.startsAt)}–${formatTime(session.endsAt)}` : formatTime(session.startsAt)
    );

  return ranges.length > 1 ? `${ranges.slice(0, -1).join(", ")} and ${ranges[ranges.length - 1]}` : ranges[0] ?? "";
}

export type SessionGroupFilters = {
  query?: string;
  region?: string;
  presentation?: string;
};

// A group matches when any of its sessions does, so the second session's
// presentation or year levels find the whole booking.
export function sessionGroupMatches(group: BookingSessionView[], filters: SessionGroupFilters) {
  const normalized = (filters.query ?? "").trim().toLowerCase();
  const region = filters.region ?? "all";
  const presentation = filters.presentation ?? "all";

  return (
    (!normalized ||
      group.some((session) =>
        [session.schoolName, session.presentationTitle, session.regionName, session.regionSlug, session.yearLevels]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized)
      )) &&
    // Online sessions can be delivered from anywhere, so they show under
    // every region.
    (region === "all" ||
      group.some((session) => session.regionSlug === region || session.deliveryMode === "online")) &&
    (presentation === "all" || group.some((session) => session.presentationTitle === presentation))
  );
}

export function sessionGroupSummary(group: BookingSessionView[], useActualCounts = false) {
  return {
    presentationTitles: Array.from(new Set(group.map((session) => session.presentationTitle))),
    yearLevels: Array.from(new Set(group.map((session) => session.yearLevels).filter(Boolean))),
    studentCount: group.reduce(
      (total, session) =>
        total +
        (useActualCounts
          ? session.actualStudentCount ?? session.expectedStudentCount
          : session.expectedStudentCount),
      0
    )
  };
}
