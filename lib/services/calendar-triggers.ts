import { createAdminClient } from "@/lib/supabase/admin";

import { syncOutlookCalendarEvent } from "./calendar";

export async function syncSessionToCalendar(opts: {
  bookingSessionId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  schoolName: string;
  schoolAddress: string;
  ambassadorName: string;
}) {
  const admin = createAdminClient();
  const { data: existingEvent } = admin
    ? await admin
        .from("calendar_events")
        .select("id, external_event_id, sync_status")
        .eq("booking_session_id", opts.bookingSessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const existingExternalId =
    existingEvent?.sync_status === "synced"
      ? (existingEvent.external_event_id as string | null)
      : null;
  const result = await syncOutlookCalendarEvent({
    title: opts.title,
    startsAt: opts.startsAt,
    endsAt: opts.endsAt,
    description: `Ambassador: ${opts.ambassadorName}<br>School: ${opts.schoolName}`,
    location: opts.schoolAddress
  }, existingExternalId);

  if (!admin) {
    return result;
  }

  const calendarPayload = {
    booking_session_id: opts.bookingSessionId,
    provider: "outlook",
    external_event_id: result.id,
    sync_status: result.status,
    last_synced_at: result.status === "synced" ? new Date().toISOString() : null,
    last_error: "error" in result ? result.error : null
  };
  const calendarEvent = existingEvent
    ? await admin
        .from("calendar_events")
        .update(calendarPayload)
        .eq("id", existingEvent.id)
        .select("id")
        .single()
        .then(({ data }) => data)
    : await admin
        .from("calendar_events")
        .insert(calendarPayload)
        .select("id")
        .single()
        .then(({ data }) => data);

  if (result.status === "synced" && calendarEvent?.id) {
    await admin
      .from("booking_sessions")
      .update({ calendar_event_id: calendarEvent.id })
      .eq("id", opts.bookingSessionId);
  }

  return result;
}
