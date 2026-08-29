import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bookingDateState,
  buildAvailabilitySlots,
  isBookableDate,
  isBookableSessionTime,
  isWithinBookingWindow,
  maximumBookingDate,
  minimumBookingDate,
  type AvailabilityConfig
} from "@/lib/services/availability";

const mondayRuleConfig: AvailabilityConfig = {
  rules: [
    {
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
      slotIntervalMinutes: 30
    }
  ],
  overrides: []
};

describe("availability rules", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T09:00:00+12:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses weekdays by default and blocks weekends and public holidays", () => {
    expect(isBookableDate("2026-09-07")).toBe(true);
    expect(isBookableDate("2026-09-06")).toBe(false);
    expect(isBookableDate("2026-10-26")).toBe(false);
  });

  it("lets explicit overrides close or open a date", () => {
    const config: AvailabilityConfig = {
      rules: [],
      overrides: [
        { date: "2026-09-07", isAvailable: false },
        { date: "2026-10-26", isAvailable: true }
      ]
    };

    expect(isBookableDate("2026-09-07", config)).toBe(false);
    expect(isBookableDate("2026-10-26", config)).toBe(true);
  });

  it("enforces configured session windows", () => {
    expect(isBookableSessionTime("2026-09-07", "09:00", "09:30", mondayRuleConfig)).toBe(
      true
    );
    expect(isBookableSessionTime("2026-09-07", "08:50", "09:20", mondayRuleConfig)).toBe(
      false
    );
    expect(isBookableSessionTime("2026-09-07", "09:30", "09:20", mondayRuleConfig)).toBe(
      false
    );
  });

  it("builds slots at the configured interval", () => {
    expect(buildAvailabilitySlots("2026-09-07", mondayRuleConfig)).toMatchObject([
      { startTime: "09:00", endTime: "09:10", isAvailable: true },
      { startTime: "09:30", endTime: "09:40", isAvailable: true }
    ]);
  });

  it("keeps booking dates inside the seven-day to one-year window", () => {
    const now = new Date("2026-08-29T09:00:00+12:00");

    expect(minimumBookingDate(now)).toBe("2026-09-05");
    expect(maximumBookingDate(now)).toBe("2027-08-29");
    expect(isWithinBookingWindow("2026-09-04", now)).toBe(false);
    expect(isWithinBookingWindow("2026-09-05", now)).toBe(true);
    expect(isWithinBookingWindow("2027-08-30", now)).toBe(false);
  });

  it("reports configured limited dates without making them unavailable", () => {
    const config: AvailabilityConfig = {
      rules: [],
      overrides: [],
      limitedDates: ["2026-09-07"]
    };

    expect(bookingDateState("2026-09-07", config)).toBe("limited");
  });
});
