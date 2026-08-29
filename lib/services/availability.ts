import { addDays, addMinutes, format, isAfter, isBefore, set } from "date-fns";

import type { AvailabilitySlot } from "@/lib/domain/types";

export const BOOKING_WINDOW_DAYS = 365;
export const MIN_BOOKING_LEAD_DAYS = 7;

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
  limitedDates?: string[];
};

export type BookingDateState = "available" | "limited" | "unavailable";

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
  "2026-12-28",
  "2027-01-01",
  "2027-01-04",
  "2027-02-08",
  "2027-03-26",
  "2027-03-29",
  "2027-04-26",
  "2027-06-07",
  "2027-06-25",
  "2027-10-25",
  "2027-12-27",
  "2027-12-28"
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

  // Public holidays stay blocked even when weekly availability rules exist;
  // only an explicit per-date override can open one.
  if (holidayDates.has(dateString)) {
    return false;
  }

  const rules = getRulesForDate(date, config);

  if (rules.length > 0) {
    return true;
  }

  const day = date.getDay();
  return day !== 0 && day !== 6;
}

export function isBookableSessionTime(
  dateString: string,
  startTime: string,
  endTime: string,
  config?: AvailabilityConfig
) {
  if (!isBookableDate(dateString, config)) {
    return false;
  }

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
    return false;
  }

  const rules = getRulesForDate(new Date(`${dateString}T00:00:00`), config);

  if (rules.length === 0) {
    return startMinutes >= 8 * 60 && endMinutes <= 16 * 60;
  }

  return rules.some(
    (rule) =>
      startMinutes >= timeToMinutes(rule.startTime) && endMinutes <= timeToMinutes(rule.endTime)
  );
}

function nzDateString(value: Date) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function minimumBookingDate(now = new Date()) {
  const nzToday = new Date(`${nzDateString(now)}T12:00:00`);
  return format(addDays(nzToday, MIN_BOOKING_LEAD_DAYS), "yyyy-MM-dd");
}

export function maximumBookingDate(now = new Date()) {
  const nzToday = new Date(`${nzDateString(now)}T12:00:00`);
  return format(addDays(nzToday, BOOKING_WINDOW_DAYS), "yyyy-MM-dd");
}

export function bookingDateState(dateString: string, config?: AvailabilityConfig): BookingDateState {
  if (!isWithinBookingWindow(dateString) || !isBookableDate(dateString, config)) {
    return "unavailable";
  }

  return config?.limitedDates?.includes(dateString) ? "limited" : "available";
}

export function isWithinBookingWindow(dateString: string, now = new Date()) {
  return dateString >= minimumBookingDate(now) && dateString <= maximumBookingDate(now);
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
  const earliestDate = minimumBookingDate(now);

  for (let offset = MIN_BOOKING_LEAD_DAYS; offset <= daysAhead; offset += 1) {
    const date = addDays(new Date(`${nzDateString(now)}T12:00:00`), offset);
    const day = format(date, "yyyy-MM-dd");

    if (day >= earliestDate && isBookableDate(day, config) && isBefore(now, date)) {
      dates.push(day);
    }
  }

  return dates;
}
