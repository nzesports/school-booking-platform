import { addDays, addMinutes, format, isAfter, isBefore, set } from "date-fns";

import type { AvailabilitySlot } from "@/lib/domain/types";

export const BOOKING_WINDOW_DAYS = 365;

export type AvailabilityRuleConfig = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotIntervalMinutes: number;
};

export type AvailabilityOverrideConfig = {
  date: string;
  isAvailable: boolean;
  reason?: string;
};

export type AvailabilityConfig = {
  rules: AvailabilityRuleConfig[];
  overrides: AvailabilityOverrideConfig[];
};

const holidayDates = new Set([
  "2026-01-01",
  "2026-01-02",
  "2026-02-06",
  "2026-04-03",
  "2026-04-06",
  "2026-04-27",
  "2026-06-01",
  "2026-07-10",
  "2026-10-26",
  "2026-12-25",
  "2026-12-28"
]);

const slotStarts = Array.from({ length: 48 }, (_, index) => 8 * 60 + index * 10);

function timeToMinutes(time: string) {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function getRulesForDate(date: Date, config?: AvailabilityConfig) {
  return config?.rules.filter((rule) => rule.dayOfWeek === date.getDay()) ?? [];
}

function getOverrideForDate(dateString: string, config?: AvailabilityConfig) {
  return config?.overrides.find((override) => override.date === dateString);
}

export function isBookableDate(dateString: string, config?: AvailabilityConfig) {
  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const override = getOverrideForDate(dateString, config);

  if (override) {
    return override.isAvailable;
  }

  const rules = getRulesForDate(date, config);

  if (rules.length > 0) {
    return true;
  }

  const day = date.getDay();
  return day !== 0 && day !== 6 && !holidayDates.has(dateString);
}

export function buildAvailabilitySlots(dateString: string, config?: AvailabilityConfig): AvailabilitySlot[] {
  if (!isBookableDate(dateString, config)) {
    return [];
  }

  const baseDate = new Date(`${dateString}T00:00:00`);
  const rules = getRulesForDate(baseDate, config);
  const starts =
    rules.length > 0
      ? rules.flatMap((rule) => {
          const startMinutes = timeToMinutes(rule.startTime);
          const endMinutes = timeToMinutes(rule.endTime);
          const interval = Math.max(rule.slotIntervalMinutes, 10);
          const values: number[] = [];

          for (let totalMinutes = startMinutes; totalMinutes < endMinutes; totalMinutes += interval) {
            values.push(totalMinutes);
          }

          return values;
        })
      : slotStarts;

  return starts.map((totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const start = set(baseDate, { hours, minutes, seconds: 0, milliseconds: 0 });
    const end = addMinutes(start, 10);

    return {
      label: `${format(start, "hh:mm a")} - ${format(end, "hh:mm a")}`,
      startTime: format(start, "HH:mm"),
      endTime: format(end, "HH:mm"),
      isAvailable: isAfter(start, new Date())
    };
  });
}

export function nextBookableDates(daysAhead = 21, config?: AvailabilityConfig) {
  const dates: string[] = [];
  const now = new Date();

  for (let offset = 1; offset <= daysAhead; offset += 1) {
    const date = addDays(now, offset);
    const day = format(date, "yyyy-MM-dd");

    if (isBookableDate(day, config) && isBefore(now, date)) {
      dates.push(day);
    }
  }

  return dates;
}
