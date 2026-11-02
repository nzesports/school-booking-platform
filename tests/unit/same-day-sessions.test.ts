import { describe, expect, it } from "vitest";

import type { BookingSessionView } from "@/lib/domain/types";
import {
  groupSameDaySessions,
  nzDayKey,
  sessionGroupMatches,
  sessionGroupSummary
} from "@/lib/same-day-sessions";

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
