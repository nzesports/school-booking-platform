import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { relationOne } from "@/lib/supabase/relation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACCESS_COOKIE, hashAccessSecret, validAccessSecret } from "@/lib/services/booking-access-security";
import { loadSessionRescheduleHistory } from "@/lib/services/session-change-history";

export const GUEST_BOOKING_COOKIE = ACCESS_COOKIE;

export const getGuestBookingGrant = cache(async () => {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value || "";
  if (!validAccessSecret(token)) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const tokenHash = hashAccessSecret(token);
  const { data, error } = await admin.rpc("get_booking_access_session", { p_token_hash: tokenHash });
  if (error) throw new Error(`Booking access lookup failed (${error.code}).`);
  const row = data?.[0] as { booking_id: string; email: string; reference_code: string; expires_at: string } | undefined;
  return row ? { bookingId: row.booking_id, email: row.email, reference: row.reference_code, tokenHash } : null;
});

export async function loadGuestBookings() {
  const grant = await getGuestBookingGrant();
  const admin = createAdminClient();
  if (!grant || !admin) return null;
  const query = admin.from("booking_requests")
    .select("id, reference_code, contact:school_contacts!booking_requests_primary_contact_id_fkey(email), schools(name), booking_sessions(id, status, updated_at, starts_at, ends_at, year_levels, expected_student_count, location_address, assigned_ambassador_id, presentation_types(title), ambassador_profiles(display_name, profiles!ambassador_profiles_user_id_fkey(full_name)))")
    .eq("id", grant.bookingId)
    .eq("reference_code", grant.reference);
  const { data, error } = await query;
  if (error) throw new Error("Unable to load bookings.");
  const history = await loadSessionRescheduleHistory(grant.bookingId);
  return (data || []).filter((booking) => relationOne(booking.contact)?.email?.trim().toLowerCase() === grant.email).map((booking) => ({
    ...booking,
    schools: relationOne(booking.schools),
    booking_sessions: booking.booking_sessions.map((session) => {
      const ambassador = relationOne(session.ambassador_profiles);
      return {
        ...session,
        rescheduleHistory: history[session.id] || [],
        presentation_types: relationOne(session.presentation_types),
        ambassador_profiles: ambassador ? { ...ambassador, profiles: relationOne(ambassador.profiles) } : null
      };
    })
  }));
}
