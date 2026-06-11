import { createAdminClient } from "@/lib/supabase/admin";

import { createOutlookCalendarEvent } from "./calendar";

export async function syncSessionToCalendar(opts: {
  bookingSessionId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  schoolName: string;
  schoolAddress: string;
  ambassadorName: string;
}) {
  const result = await createOutlookCalendarEvent({
    title: opts.title,
    startsAt: opts.startsAt,
    endsAt: opts.endsAt,
    description: `Ambassador: ${opts.ambassadorName}<br>School: ${opts.schoolName}`,
    location: opts.schoolAddress
  });

  const admin = createAdminClient();

  if (!admin) {
    return result;
  }

  const { data: calendarEvent } = await admin
    .from("calendar_events")
    .insert({
      booking_session_id: opts.bookingSessionId,
      provider: "outlook",
      external_event_id: result.id,
      sync_status: result.status,
      last_synced_at: result.status === "synced" ? new Date().toISOString() : null,
      last_error: "error" in result ? result.error : null
    })
    .select("id")
    .single();

  if (result.status === "synced" && calendarEvent?.id) {
    await admin
      .from("booking_sessions")
      .update({ calendar_event_id: calendarEvent.id })
      .eq("id", opts.bookingSessionId);
  }

  return result;
}
