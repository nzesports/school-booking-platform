import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { config } from "@/lib/env";
import { PLATFORM_DATA_TAG } from "@/lib/services/cache-tags";
import { sendFeedbackRequestEmail } from "@/lib/services/email-triggers";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils";

// Hourly sweep (Vercel Cron — see vercel.json): marks sessions whose end time
// has passed as delivered and emails the school a feedback invitation. Safe to
// run repeatedly — the status filter means each session is processed once, and
// email_logs is checked before sending as a second guard.

// Statuses that count as "was going ahead" when the session time passes.
const DELIVERABLE_STATUSES = ["confirmed", "ambassador_assigned"];
// Session statuses that keep a booking request open.
const ACTIVE_SESSION_STATUSES = [
  "tentative",
  "ambassador_needed",
  "ambassador_applied",
  "ambassador_assigned",
  "confirmed",
  "reschedule_requested"
];

function isAuthorized(request: NextRequest) {
  if (!config.cronSecret) {
    return false;
  }

  const header = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");

  return header === `Bearer ${config.cronSecret}` || querySecret === config.cronSecret;
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
    .select("id, booking_request_id, school_id, presentation_type_id, starts_at, ends_at")
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
        .select("id, primary_contact_id")
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
        .in("status", ["confirmed", "ambassador_assigned", "ambassador_needed", "tentative"]);
    }
  }

  if (completedSessions > 0) {
    // Route handlers can't use updateTag (server-action only); "max" expires
    // the tagged entries so the next portal render refetches.
    revalidateTag(PLATFORM_DATA_TAG, "max");
  }

  return NextResponse.json({ completedSessions, emailsSent });
}
