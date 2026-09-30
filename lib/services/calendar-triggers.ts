import { createAdminClient } from "@/lib/supabase/admin";

import { syncOutlookCalendarEvent } from "./calendar";
import { escapeHtml } from "./email-triggers";

// Unsynced results carry a random `calendar-<uuid>` placeholder, not an
// Outlook id, so only a real stored id may be PATCHed.
function isOutlookEventId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.startsWith("calendar-");
}

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
  // A failed sync keeps the last real Outlook id, so retries update that event
  // instead of creating a duplicate.
  const existingExternalId = isOutlookEventId(existingEvent?.external_event_id)
    ? existingEvent.external_event_id
    : null;
  const result = await syncOutlookCalendarEvent({
    title: opts.title,
    startsAt: opts.startsAt,
    endsAt: opts.endsAt,
    description: `Ambassador: ${escapeHtml(opts.ambassadorName)}<br>School: ${escapeHtml(opts.schoolName)}`,
    location: opts.schoolAddress
  }, existingExternalId);

  if (!admin) {
    return result;
  }

  const calendarPayload = {
    booking_session_id: opts.bookingSessionId,
    provider: "outlook",
    // Never replace a real event id with a failure placeholder.
    external_event_id: result.status === "synced" ? result.id : existingExternalId,
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
