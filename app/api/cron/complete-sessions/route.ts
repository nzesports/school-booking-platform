import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { config } from "@/lib/env";
import { AVAILABILITY_DATA_TAG, PLATFORM_DATA_TAG } from "@/lib/services/cache-tags";
import {
  sendFeedbackRequestEmail,
  sendSessionReminderEmail
} from "@/lib/services/email-triggers";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils";

// How far ahead the upcoming-session reminder goes out.
const REMINDER_WINDOW_HOURS = 48;

// Hourly sweep (Vercel Cron — see vercel.json): marks sessions whose end time
// has passed as delivered and emails the school a feedback invitation. Safe to
// run repeatedly — the status filter means each session is processed once, and
// email_logs is checked before sending as a second guard.

// Statuses that count as "was going ahead" when the session time passes.
const DELIVERABLE_STATUSES = ["confirmed", "ambassador_assigned"];
// Session statuses that keep a booking request open.
const ACTIVE_SESSION_STATUSES = [
  "tentative",
  "applied",
  "ambassador_assigned",
  "confirmed",
  "withdrawal_requested",
  "reschedule_requested"
];

function isAuthorized(request: NextRequest) {
  if (!config.cronSecret) {
    return false;
  }

  // Vercel Cron authenticates with the Authorization header only; never accept
  // the secret via query string, where it would leak into logs and referrers.
  const header = request.headers.get("authorization");

  return header === `Bearer ${config.cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json({ error: "Supabase admin access is unavailable." }, { status: 503 });
  }

  const now = new Date().toISOString();
  const { data: dueSessions, error } = await admin
    .from("booking_sessions")
    .select("id, booking_request_id, school_id, presentation_type_id, starts_at, ends_at, expected_student_count, year_levels")
    .in("status", DELIVERABLE_STATUSES)
    .lt("ends_at", now);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let completedSessions = 0;
  let emailsSent = 0;
  const touchedBookingIds = new Set<string>();

  for (const session of dueSessions ?? []) {
    const { error: updateError } = await admin
      .from("booking_sessions")
      .update({ status: "completed_pending_report" })
      .eq("id", session.id)
      .in("status", DELIVERABLE_STATUSES);

    if (updateError) {
      continue;
    }

    completedSessions += 1;
    touchedBookingIds.add(session.booking_request_id as string);

    await admin.from("booking_status_history").insert({
      booking_session_id: session.id,
      booking_request_id: session.booking_request_id,
      new_status: "completed_pending_report",
      reason: "Automatically marked delivered after session end"
    });

    await admin.from("booking_activity_logs").insert({
      booking_session_id: session.id,
      booking_request_id: session.booking_request_id,
      action: "session.auto_completed",
      actor_type: "system",
      details: { ends_at: session.ends_at }
    });

    // Second idempotency guard: never email the same session twice.
    const { data: alreadyEmailed } = await admin
      .from("email_logs")
      .select("id")
      .eq("template_key", "school_feedback_request")
      .eq("related_booking_session_id", session.id)
      .limit(1);

    if (alreadyEmailed?.length) {
      continue;
    }

    const [{ data: booking }, { data: school }, { data: presentation }] = await Promise.all([
      admin
        .from("booking_requests")
        .select("id, reference_code, primary_contact_id")
        .eq("id", session.booking_request_id)
        .maybeSingle(),
      admin.from("schools").select("name").eq("id", session.school_id).maybeSingle(),
      admin
        .from("presentation_types")
        .select("title")
        .eq("id", session.presentation_type_id)
        .maybeSingle()
    ]);
    const { data: contact } = booking?.primary_contact_id
      ? await admin
          .from("school_contacts")
          .select("full_name, email")
          .eq("id", booking.primary_contact_id)
          .maybeSingle()
      : { data: null };

    if (contact?.email) {
      const result = await sendFeedbackRequestEmail({
        contactEmail: contact.email as string,
        contactName: (contact.full_name as string | null) ?? "there",
        schoolName: (school?.name as string | null) ?? "your school",
        sessionDate: formatDateTime(session.starts_at as string),
        sessionStartsAt: session.starts_at as string,
        sessionEndsAt: session.ends_at as string,
        expectedStudentCount: session.expected_student_count == null ? null : Number(session.expected_student_count),
        yearLevels: (session.year_levels as string) || "",
        presentationTitle: (presentation?.title as string | null) ?? "your presentation",
        bookingId: session.booking_request_id as string,
        bookingSessionId: session.id as string
      }).catch(() => null);

      if (result?.status === "sent") {
        emailsSent += 1;
      }
    }
  }

  // Close out parent bookings whose sessions are all delivered or cancelled.
  for (const bookingId of touchedBookingIds) {
    const { data: openSessions } = await admin
      .from("booking_sessions")
      .select("id")
      .eq("booking_request_id", bookingId)
      .in("status", ACTIVE_SESSION_STATUSES)
      .limit(1);

    if (!openSessions?.length) {
      await admin
        .from("booking_requests")
        .update({ status: "completed_pending_report" })
        .eq("id", bookingId)
        .in("status", ["confirmed", "ambassador_assigned", "applied", "tentative"]);
    }
  }

  // ---------------------------------------------------------------- reminders
  // Upcoming confirmed sessions inside the reminder window get a heads-up
  // email to the school; email_logs guarantees one reminder per session.
  let remindersSent = 0;
  const reminderWindowEnd = new Date(
    Date.now() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();
  const { data: upcomingSessions } = await admin
    .from("booking_sessions")
    .select("id, booking_request_id, school_id, presentation_type_id, starts_at, ends_at, expected_student_count, year_levels")
    .in("status", DELIVERABLE_STATUSES)
    .gt("starts_at", now)
    .lte("starts_at", reminderWindowEnd);

  for (const session of upcomingSessions ?? []) {
    const { data: alreadyReminded } = await admin
      .from("email_logs")
      .select("id")
      .eq("template_key", "school_session_reminder")
      .eq("related_booking_session_id", session.id)
      .limit(1);

    if (alreadyReminded?.length) {
      continue;
    }

    const [{ data: booking }, { data: school }, { data: presentation }] = await Promise.all([
      admin
        .from("booking_requests")
        .select("id, reference_code, primary_contact_id")
        .eq("id", session.booking_request_id)
        .maybeSingle(),
      admin.from("schools").select("name").eq("id", session.school_id).maybeSingle(),
      admin
        .from("presentation_types")
        .select("title")
        .eq("id", session.presentation_type_id)
        .maybeSingle()
    ]);
    const { data: contact } = booking?.primary_contact_id
      ? await admin
          .from("school_contacts")
          .select("full_name, email")
          .eq("id", booking.primary_contact_id)
          .maybeSingle()
      : { data: null };

    if (contact?.email) {
      const result = await sendSessionReminderEmail({
        contactEmail: contact.email as string,
        contactName: (contact.full_name as string | null) ?? "there",
        schoolName: (school?.name as string | null) ?? "your school",
        sessionDate: formatDateTime(session.starts_at as string),
        sessionStartsAt: session.starts_at as string,
        sessionEndsAt: session.ends_at as string,
        expectedStudentCount: session.expected_student_count == null ? null : Number(session.expected_student_count),
        yearLevels: (session.year_levels as string) || "",
        presentationTitle: (presentation?.title as string | null) ?? "your presentation",
        bookingId: session.booking_request_id as string,
        referenceCode: (booking?.reference_code as string | null) ?? undefined,
        bookingSessionId: session.id as string
      }).catch(() => null);

      if (result?.status === "sent") {
        remindersSent += 1;
      }
    }
  }

  if (completedSessions > 0) {
    // Route handlers can't use updateTag (server-action only); "max" expires
    // the tagged entries so the next portal render refetches.
    revalidateTag(PLATFORM_DATA_TAG, "max");
    revalidateTag(AVAILABILITY_DATA_TAG, "max");
  }

  return NextResponse.json({ completedSessions, emailsSent, remindersSent });
}
