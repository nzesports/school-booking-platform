"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { config } from "@/lib/env";
import { relationOne } from "@/lib/supabase/relation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGuestBookingGrant, loadGuestBookings } from "@/lib/services/guest-booking-access";
import { ACCESS_COOKIE, CHALLENGE_COOKIE, SESSION_SECONDS, CHANGE_NOTICE_HOURS, newAccessSecret, validAccessSecret, hashAccessSecret, privateRateKey } from "@/lib/services/booking-access-security";
import { scheduleEmail } from "@/lib/services/email-background";
import { sendSchoolSessionEmails } from "@/lib/services/school-session-email";
import { notifyStaff, notifyUser } from "@/lib/services/notifications";
import { validateGuestReschedule } from "@/lib/services/guest-rescheduling";
import { AVAILABILITY_DATA_TAG, PLATFORM_DATA_TAG } from "@/lib/services/cache-tags";
import { syncSessionToCalendar } from "@/lib/services/calendar-triggers";

const cookieOptions = { httpOnly: true, secure: new URL(config.siteUrl).protocol === "https:", sameSite: "strict" as const, path: "/manage-booking" };

async function checkRate(kind: string, value: string, limit: number) {
  const admin = createAdminClient();
  if (!admin || !config.supabaseServiceRoleKey) redirect("/manage-booking?error=unavailable");
  const { data, error } = await admin.rpc("allow_booking_access_request", {
    p_key: privateRateKey(kind, value, config.supabaseServiceRoleKey), p_limit: limit
  });
  if (error) { console.error("[booking-access] Rate limit unavailable", { code: error.code }); redirect("/manage-booking?error=unavailable"); }
  return data === true;
}

async function clientAddress() {
  // Only trust the forwarding header where the hosting edge overwrites it.
  return process.env.VERCEL === "1" ? (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "shared-local";
}

export async function requestBookingAccessAction(formData: FormData) {
  const reference = String(formData.get("reference") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!/^\d{6}$/.test(reference) || email.length > 254 || !z.email().safeParse(email).success) redirect("/manage-booking?error=identifier");
  const admin = createAdminClient();
  if (!admin || !config.supabaseServiceRoleKey) redirect("/manage-booking?error=unavailable");
  if (!await checkRate("request-ip", await clientAddress(), 20)) redirect("/manage-booking?error=rate");
  const emailAllowed = await checkRate("request-email", email, 5);
  const referenceAllowed = await checkRate("request-reference", reference, 5);
  const { data: booking, error } = await admin.from("booking_requests")
    .select("id, reference_code, guest_access_version, contact:school_contacts!booking_requests_primary_contact_id_fkey(email)").eq("reference_code", reference).maybeSingle();
  if (error) { console.error("[booking-access] Lookup unavailable", { code: error.code }); redirect("/manage-booking?error=unavailable"); }
  if (!emailAllowed || !referenceAllowed) redirect("/manage-booking?error=rate");
  if (!booking || relationOne(booking.contact)?.email?.trim().toLowerCase() !== email) redirect("/manage-booking?error=not-found");
  const token = newAccessSecret();
  const { error: sessionError } = await admin.from("booking_access_sessions").insert({
    token_hash: hashAccessSecret(token), booking_request_id: booking.id, email,
    reference_code: reference, access_version: booking.guest_access_version
  });
  if (sessionError) {
    console.error("[booking-access] Session creation unavailable", { code: sessionError.code });
    redirect("/manage-booking?error=unavailable");
  }
  const jar = await cookies();
  const previous = jar.get(ACCESS_COOKIE)?.value;
  if (previous && validAccessSecret(previous)) await admin.from("booking_access_sessions").update({ revoked_at: new Date().toISOString() }).eq("token_hash", hashAccessSecret(previous));
  jar.set(ACCESS_COOKIE, token, { ...cookieOptions, maxAge: SESSION_SECONDS });
  jar.set(CHALLENGE_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  redirect("/manage-booking");
}

export async function endBookingAccessAction() {
  const jar = await cookies();
  const admin = createAdminClient();
  for (const [name, table, column, timestamp] of [[ACCESS_COOKIE, "booking_access_sessions", "token_hash", "revoked_at"], [CHALLENGE_COOKIE, "booking_access_challenges", "challenge_hash", "consumed_at"]]) {
    const value = jar.get(name)?.value;
    if (value && validAccessSecret(value)) {
      if (!admin) redirect("/manage-booking?error=unavailable");
      const { error } = await admin.from(table).update({ [timestamp]: new Date().toISOString() }).eq(column, hashAccessSecret(value));
      if (error) redirect("/manage-booking?error=unavailable");
    }
    jar.set(name, "", { ...cookieOptions, maxAge: 0 });
  }
  redirect("/manage-booking");
}

export async function changeGuestSessionAction(formData: FormData) {
  const parsed = z.object({
    bookingId: z.uuid(), sessionId: z.uuid(), action: z.enum(["cancel", "reschedule"]),
    updatedAt: z.string().min(1).max(64), notes: z.string().max(2000), confirmed: z.literal("yes")
  }).safeParse(Object.fromEntries(["bookingId", "sessionId", "action", "notes", "confirmed", "updatedAt"].map((key) => [key, String(formData.get(key) || "")])));
  if (!parsed.success) redirect("/manage-booking?error=change");
  const grant = await getGuestBookingGrant();
  const bookings = await loadGuestBookings();
  const booking = bookings?.find((item) => item.id === parsed.data.bookingId);
  const session = booking?.booking_sessions.find((item) => item.id === parsed.data.sessionId);
  const admin = createAdminClient();
  if (!grant || !admin) redirect("/manage-booking?error=expired");
  if (!booking || !session || session.updated_at !== parsed.data.updatedAt) redirect("/manage-booking?error=change");
  if (Date.parse(session.starts_at) <= Date.now() + CHANGE_NOTICE_HOURS * 3600000) redirect("/manage-booking?error=cutoff");
  let newStart: string | null = null;
  let newEnd = session.ends_at as string;
  if (parsed.data.action === "reschedule") {
    const replacement = await validateGuestReschedule({
      date: String(formData.get("date") || ""), time: String(formData.get("time") || ""),
      startsAt: session.starts_at, endsAt: session.ends_at, ambassadorId: session.assigned_ambassador_id
    });
    if (!replacement) redirect("/manage-booking?error=availability");
    newStart = replacement.startsAt;
    newEnd = replacement.endsAt;
  }
  const { data: changed, error } = await admin.rpc("change_authenticated_booking_session", {
    p_token_hash: grant.tokenHash, p_booking_id: booking.id, p_session_id: session.id,
    p_expected_updated_at: session.updated_at, p_action: parsed.data.action, p_expected_start: session.starts_at, p_expected_status: session.status,
    p_new_start: newStart, p_notes: parsed.data.notes
  });
  if (error || !changed) redirect("/manage-booking?error=change");
  const event = parsed.data.action === "cancel" ? "cancelled" : "rescheduled";
  scheduleEmail(() => sendSchoolSessionEmails(booking.id, [session.id], event));
  scheduleEmail(async () => {
    const title = `School ${event} a session`;
    const body = `${booking.schools?.name || "A school"} ${event} ${session.presentation_types?.title || "a presentation"} using self-service booking management.`;
    await notifyStaff({ title, body, type: `booking_${event}`, relatedUrl: `/staff/bookings?booking=${booking.id}` });
    if (session.assigned_ambassador_id) {
      const { data } = await admin.from("ambassador_profiles").select("user_id").eq("id", session.assigned_ambassador_id).maybeSingle();
      if (data?.user_id) await notifyUser(data.user_id, { title, body, type: `booking_${event}`, relatedUrl: "/ambassador/upcoming" });
    }
    await syncSessionToCalendar({
      bookingSessionId: session.id,
      title: `${event === "cancelled" ? "CANCELLED: " : ""}${session.presentation_types?.title || "NZ Esports presentation"}`,
      startsAt: newStart || session.starts_at, endsAt: newEnd,
      schoolName: booking.schools?.name || "School", schoolAddress: session.location_address || booking.schools?.name || "",
      ambassadorName: session.ambassador_profiles?.profiles?.full_name || session.ambassador_profiles?.display_name || "To be assigned"
    });
  });
  updateTag(PLATFORM_DATA_TAG);
  updateTag(AVAILABILITY_DATA_TAG);
  revalidatePath("/manage-booking");
  for (const path of ["/school", "/staff", "/admin", "/ambassador"]) revalidatePath(path, "layout");
  redirect(`/manage-booking?success=${event}`);
}
