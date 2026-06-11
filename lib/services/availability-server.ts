import { addDays, format } from "date-fns";

import type { AvailabilityConfig } from "@/lib/services/availability";
import { BOOKING_WINDOW_DAYS } from "@/lib/services/availability";
import { createAdminClient } from "@/lib/supabase/admin";

export async function loadAvailabilityConfig(daysAhead = BOOKING_WINDOW_DAYS): Promise<AvailabilityConfig> {
  const admin = createAdminClient();

  if (!admin) {
    return { rules: [], overrides: [] };
  }

  const now = new Date();
  const startDate = format(now, "yyyy-MM-dd");
  const endDate = format(addDays(now, daysAhead), "yyyy-MM-dd");
  const [rulesResult, overridesResult] = await Promise.all([
    admin
      .from("availability_rules")
      .select("day_of_week, start_time, end_time, slot_interval_minutes")
      .eq("is_active", true),
    admin
      .from("availability_overrides")
      .select("override_date, is_available, reason")
      .gte("override_date", startDate)
      .lte("override_date", endDate)
  ]);

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
    }))
  };
}
