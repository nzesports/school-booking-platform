import { addDays, addMinutes, format, isAfter, isBefore, set } from "date-fns";

import type { AvailabilitySlot } from "@/lib/domain/types";

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

const slotStarts = Array.from({ length: 43 }, (_, index) => 9 * 60 + index * 10);

export function isBookableDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay();
  return day !== 0 && day !== 6 && !holidayDates.has(dateString);
}

export function buildAvailabilitySlots(dateString: string): AvailabilitySlot[] {
  if (!isBookableDate(dateString)) {
    return [];
  }

  const baseDate = new Date(`${dateString}T00:00:00`);

  return slotStarts.map((totalMinutes) => {
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

export function nextBookableDates(daysAhead = 21) {
  const dates: string[] = [];
  const now = new Date();

  for (let offset = 1; offset <= daysAhead; offset += 1) {
    const date = addDays(now, offset);
    const day = format(date, "yyyy-MM-dd");

    if (isBookableDate(day) && isBefore(now, date)) {
      dates.push(day);
    }
  }

  return dates;
}
