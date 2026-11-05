import { describe, expect, it } from "vitest";

import type { BookingSessionView } from "@/lib/domain/types";
import {
  groupReportVisits,
  groupSameDaySessions,
  nzDayKey,
  nzWeekKey,
  reportDayKey,
  sessionGroupMatches,
  sessionGroupSummary
} from "@/lib/same-day-sessions";
import { studentsReachedBySession, summarizeStudentReach } from "@/lib/services/dashboard-insights";

function session(overrides: Partial<BookingSessionView> & Pick<BookingSessionView, "id" | "startsAt">) {
  return {
    presentationSlug: "digital-wellbeing",
    presentationTitle: "Digital Wellbeing",
    regionSlug: "auckland",
    regionName: "Auckland",
    schoolName: "Harbour College",
    endsAt: overrides.startsAt,
    yearLevels: "Years 7 to 8",
    expectedStudentCount: 60,
    status: "tentative",
    reportStatus: "not_submitted",
    paymentStatus: "not_eligible",
    bookingRequestId: "booking-1",
    ...overrides
  } as BookingSessionView;
}

describe("nzDayKey", () => {
  it("uses the New Zealand calendar day, not UTC", () => {
    // 11:30 UTC on 2 Nov is 00:30 on 3 Nov in Auckland (NZDT, +13).
    expect(nzDayKey("2026-11-02T11:30:00Z")).toBe("2026-11-03");
    expect(nzDayKey("2026-11-02T10:30:00Z")).toBe("2026-11-02");
  });
});

describe("groupSameDaySessions", () => {
  const first = session({ id: "a", startsAt: "2026-11-03T22:00:00Z" });
  const second = session({
    id: "b",
    startsAt: "2026-11-03T21:00:00Z",
    presentationTitle: "Understanding Esports",
    yearLevels: "Years 9 to 10",
    expectedStudentCount: 70
  });

  it("puts back-to-back sessions of one booking on one NZ day together, earliest first", () => {
    expect(groupSameDaySessions([first, second]).map((group) => group.map((item) => item.id))).toEqual([
      ["b", "a"]
    ]);
  });

  it("keeps a different booking at the same school and time apart", () => {
    const otherBooking = session({ id: "c", startsAt: first.startsAt, bookingRequestId: "booking-2" });
    expect(groupSameDaySessions([first, otherBooking])).toHaveLength(2);
  });

  it("keeps the same booking on different NZ days apart", () => {
    const nextDay = session({ id: "d", startsAt: "2026-11-04T21:00:00Z" });
    expect(groupSameDaySessions([first, nextDay])).toHaveLength(2);
  });

  it("can partition a day by state (calendar: open vs upcoming)", () => {
    const modes: Record<string, string> = { a: "open", b: "upcoming" };
    expect(groupSameDaySessions([first, second], (item) => modes[item.id])).toHaveLength(2);
  });

  it("matches filters on any session of the group, so the second title finds the booking", () => {
    const [group] = groupSameDaySessions([first, second]);

    expect(sessionGroupMatches(group, { presentation: "Understanding Esports" })).toBe(true);
    expect(sessionGroupMatches(group, { presentation: "Digital Wellbeing" })).toBe(true);
    expect(sessionGroupMatches(group, { query: "years 9" })).toBe(true);
    expect(sessionGroupMatches(group, { presentation: "Something Else" })).toBe(false);
    expect(sessionGroupMatches(group, { region: "wellington" })).toBe(false);
  });

  it("summarises every title, year level and the total students", () => {
    const [group] = groupSameDaySessions([first, second]);

    expect(sessionGroupSummary(group)).toEqual({
      presentationTitles: ["Understanding Esports", "Digital Wellbeing"],
      yearLevels: ["Years 9 to 10", "Years 7 to 8"],
      studentCount: 130
    });
  });
});

describe("nzWeekKey", () => {
  it("starts the week on the New Zealand Monday", () => {
    // Sunday 1 Nov and Monday 2 Nov 2026 in Auckland (NZDT, +13).
    expect(nzWeekKey("2026-11-01T01:00:00Z")).toBe("2026-10-26");
    expect(nzWeekKey("2026-11-01T12:00:00Z")).toBe("2026-11-02");
  });
});

describe("report grouping", () => {
  const base = { assignedAmbassadorId: "amb-1", schoolId: "school-1" };
  const wedAm = session({ ...base, id: "wed-am", startsAt: "2026-10-27T20:00:00Z" });
  const wedLate = session({ ...base, id: "wed-late", startsAt: "2026-10-27T22:30:00Z" });
  const thuAm = session({ ...base, id: "thu-am", startsAt: "2026-10-28T20:00:00Z" });

  it("puts one school's sessions on a day together, even from separate bookings", () => {
    const otherBooking = session({ ...base, id: "other", startsAt: "2026-10-27T21:00:00Z", bookingRequestId: "booking-2" });

    expect(reportDayKey(otherBooking)).toBe(reportDayKey(wedAm));
  });

  it("keeps other schools and other ambassadors apart", () => {
    const otherSchool = session({ ...base, id: "s", startsAt: wedAm.startsAt, schoolId: "school-2" });
    const otherAmbassador = session({ ...base, id: "a", startsAt: wedAm.startsAt, assignedAmbassadorId: "amb-2" });

    expect(reportDayKey(otherSchool)).not.toBe(reportDayKey(wedAm));
    expect(reportDayKey(otherAmbassador)).not.toBe(reportDayKey(wedAm));
  });

  it("makes one visit of a two-day booking, with a list of sessions per day", () => {
    const visits = groupReportVisits([thuAm, wedLate, wedAm]);

    expect(visits.map((days) => days.map((day) => day.map((item) => item.id)))).toEqual([
      [["wed-am", "wed-late"], ["thu-am"]]
    ]);
  });

  it("splits a booking that runs into the next week", () => {
    const nextWeek = session({ ...base, id: "next", startsAt: "2026-11-03T20:00:00Z" });

    expect(groupReportVisits([wedAm, nextWeek])).toHaveLength(2);
  });
});

describe("students reached", () => {
  const base = { assignedAmbassadorId: "amb-1", schoolId: "school-1", expectedStudentCount: 110 };
  const reported = session({ ...base, id: "reported", startsAt: "2026-10-27T20:00:00Z", actualStudentCount: 220 });
  const covered = session({ ...base, id: "covered", startsAt: "2026-10-27T22:30:00Z" });

  it("counts a day's report once, not the covered session's expected number on top", () => {
    expect(summarizeStudentReach([], [reported, covered]).reached).toBe(220);
    expect(studentsReachedBySession([reported, covered]).get("covered")).toBe(0);
  });

  it("falls back to expected numbers when nothing was reported that day", () => {
    const first = session({ ...base, id: "first", startsAt: "2026-11-10T20:00:00Z" });
    const second = session({ ...base, id: "second", startsAt: "2026-11-10T22:00:00Z" });

    expect(summarizeStudentReach([], [first, second]).reached).toBe(220);
  });

  it("keeps a report of 0 students as 0", () => {
    const none = session({ ...base, id: "none", startsAt: "2026-11-11T20:00:00Z", actualStudentCount: 0 });

    expect(summarizeStudentReach([], [none]).reached).toBe(0);
  });
});
