import "server-only";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { isBookableSessionTime, isWithinBookingWindow } from "@/lib/services/availability";
import { loadAvailabilityConfig } from "@/lib/services/availability-server";
import { nzDateTimeToIso } from "@/lib/utils";

// Ambassador hours are currently free text. Only accept an unambiguous range;
// blank or unrecognised text must not be treated as consent to a new time.
function clockMinutes(value: string) {
  const match = value.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  if (minutes > 59 || hours > (match[3] ? 12 : 23) || (match[3] && hours < 1)) return null;
  if (match[3]) hours = hours % 12 + (match[3] === "pm" ? 12 : 0);
  return hours * 60 + minutes;
}

export async function validateGuestReschedule(input: {
  date: string; time: string; startsAt: string; endsAt: string; ambassadorId: string | null;
}) {
  if (!z.iso.date().safeParse(input.date).success || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)
    || !isWithinBookingWindow(input.date)) return null;
  const startsAt = nzDateTimeToIso(input.date, input.time);
  const duration = Date.parse(input.endsAt) - Date.parse(input.startsAt);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 8 * 60 * 60 * 1000) return null;
  const endsAt = new Date(Date.parse(startsAt) + duration).toISOString();
  const startMinutes = clockMinutes(input.time)!;
  const endMinutes = startMinutes + duration / 60000;
  if (endMinutes >= 24 * 60) return null;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  const availability = await loadAvailabilityConfig();
  if (!isBookableSessionTime(input.date, input.time, endTime, availability)) return null;
  if (!input.ambassadorId) return { startsAt, endsAt };
  const admin = createAdminClient();
  if (!admin) return null;
  const [profileResult, slotsResult] = await Promise.all([
    admin.from("ambassador_profiles").select("status, profile_details").eq("id", input.ambassadorId).single(),
    admin.from("ambassador_availability").select("starts_at, ends_at, status")
      .eq("ambassador_profile_id", input.ambassadorId).lt("starts_at", endsAt).gt("ends_at", startsAt)
  ]);
  if (profileResult.error || slotsResult.error || profileResult.data.status !== "approved") return null;
  const details = profileResult.data.profile_details as {
    unavailableDates?: string[]; weeklyAvailability?: Record<string, string>;
  } | null;
  if (details?.unavailableDates?.includes(input.date)) return null;
  const slots = slotsResult.data || [];
  if (slots.some((slot) => slot.status !== "available")) return null;
  if (slots.some((slot) => Date.parse(slot.starts_at) <= Date.parse(startsAt) && Date.parse(slot.ends_at) >= Date.parse(endsAt))) {
    return { startsAt, endsAt };
  }
  const weekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(`${input.date}T12:00:00Z`).getUTCDay()];
  const hours = details?.weeklyAvailability?.[weekday];
  const range = typeof hours === "string" ? hours.split(/\s*(?:-|–|—|\bto\b)\s*/i) : null;
  if (range?.length !== 2) return null;
  const availableStart = clockMinutes(range[0]);
  const availableEnd = clockMinutes(range[1]);
  if (availableStart == null || availableEnd == null || startMinutes < availableStart || endMinutes > availableEnd) return null;
  return { startsAt, endsAt };
}
