import { addDays, format } from "date-fns";
import { unstable_cache } from "next/cache";

import type { AvailabilityConfig } from "@/lib/services/availability";
import { BOOKING_WINDOW_DAYS } from "@/lib/services/availability";
import { AVAILABILITY_DATA_TAG, PUBLIC_CONTENT_TAG } from "@/lib/services/cache-tags";
import { createAdminClient } from "@/lib/supabase/admin";
import { nzDateTimeToIso } from "@/lib/utils";

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

// Queried by the root layout on every page render — cache it. The date window
// drifting by up to 5 minutes is harmless; staff settings saves bust the tag.
export const loadAvailabilityConfig = unstable_cache(
  loadAvailabilityConfigUncached,
  ["availability-config"],
  { revalidate: 300, tags: [PUBLIC_CONTENT_TAG, AVAILABILITY_DATA_TAG] }
);

async function loadAvailabilityConfigUncached(daysAhead = BOOKING_WINDOW_DAYS): Promise<AvailabilityConfig> {
  const admin = createAdminClient();

  if (!admin) {
    return { rules: [], overrides: [], limitedDates: [] };
  }

  const now = new Date();
  const startDate = nzDateString(now);
  const endDate = format(addDays(new Date(`${startDate}T12:00:00`), daysAhead), "yyyy-MM-dd");
  const afterEndDate = format(addDays(new Date(`${endDate}T12:00:00`), 1), "yyyy-MM-dd");
  const [rulesResult, overridesResult, sessionsResult] = await Promise.all([
    admin
      .from("availability_rules")
      .select("day_of_week, start_time, end_time, slot_interval_minutes")
      .eq("is_active", true),
    admin
      .from("availability_overrides")
      .select("override_date, is_available, reason")
      .gte("override_date", startDate)
      .lte("override_date", endDate),
    admin
      .from("booking_sessions")
      .select("starts_at, status")
      .gte("starts_at", nzDateTimeToIso(startDate, "00:00"))
      .lt("starts_at", nzDateTimeToIso(afterEndDate, "00:00"))
      .in("status", [
        "requested",
        "tentative",
        "applied",
        "ambassador_assigned",
        "confirmed",
        "reschedule_requested"
      ])
  ]);

  const limitedDates = new Set(
    (sessionsResult.data ?? []).map((session) => nzDateString(new Date(session.starts_at as string)))
  );

  return {
    rules: (rulesResult.data ?? []).map((rule) => ({
      dayOfWeek: Number(rule.day_of_week),
      startTime: String(rule.start_time),
      endTime: String(rule.end_time),
      slotIntervalMinutes: Number(rule.slot_interval_minutes ?? 60)
    })),
    overrides: (overridesResult.data ?? []).map((override) => ({
      date: String(override.override_date),
      isAvailable: Boolean(override.is_available),
      reason: (override.reason as string | null) ?? undefined
    })),
    limitedDates: Array.from(limitedDates)
  };
}
