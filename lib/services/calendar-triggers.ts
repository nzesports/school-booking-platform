import { createAdminClient } from "@/lib/supabase/admin";

import { relationOne } from "@/lib/supabase/relation";

import {
  createOrUpdateTeamsMeeting,
  syncOutlookCalendarEvent,
  type TeamsFailureCode
} from "./calendar";
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
  // Online sessions keep "Online" as the location so updating the event (e.g.
  // on ambassador assignment) never replaces its Teams meeting details. The
  // lookup fails harmlessly before the 0050 migration is applied.
  const { data: delivery } = admin
    ? await admin
        .from("booking_sessions")
        .select("delivery_mode")
        .eq("id", opts.bookingSessionId)
        .maybeSingle()
    : { data: null };
  const result = await syncOutlookCalendarEvent({
    title: opts.title,
    startsAt: opts.startsAt,
    endsAt: opts.endsAt,
    description: `Ambassador: ${escapeHtml(opts.ambassadorName)}<br>School: ${escapeHtml(opts.schoolName)}`,
    location: delivery?.delivery_mode === "online" ? "Online (Microsoft Teams)" : opts.schoolAddress
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

export type TeamsLinkFailure = TeamsFailureCode | "unconfigured" | "not-online";

// Creates (or reuses) the session's Outlook event as a Teams meeting and saves
// the join link on the session. Staff trigger this from the booking details.
export async function createTeamsMeetingForSession(bookingSessionId: string) {
  const admin = createAdminClient();

  if (!admin) {
    return { ok: false as const, code: "other" as TeamsLinkFailure };
  }

  const { data: session } = await admin
    .from("booking_sessions")
    .select(
      "id, starts_at, ends_at, delivery_mode, schools(name), presentation_types(title), ambassador_profiles(display_name, profiles!ambassador_profiles_user_id_fkey(full_name))"
    )
    .eq("id", bookingSessionId)
    .maybeSingle();

  if (!session || session.delivery_mode !== "online") {
    return { ok: false as const, code: "not-online" as TeamsLinkFailure };
  }

  const { data: existingEvent } = await admin
    .from("calendar_events")
    .select("id, external_event_id")
    .eq("booking_session_id", bookingSessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const existingExternalId = isOutlookEventId(existingEvent?.external_event_id)
    ? existingEvent.external_event_id
    : null;
  const schoolName = relationOne(session.schools)?.name ?? "School";
  const presentationTitle = relationOne(session.presentation_types)?.title ?? "NZ Esports presentation";
  const ambassador = relationOne(session.ambassador_profiles);
  const ambassadorName =
    relationOne(ambassador?.profiles)?.full_name ?? ambassador?.display_name ?? "To be assigned";
  const result = await createOrUpdateTeamsMeeting(
    {
      title: `Esports Session - ${schoolName} (online)`,
      startsAt: session.starts_at as string,
      endsAt: session.ends_at as string,
      description: `${escapeHtml(presentationTitle)}<br>School: ${escapeHtml(schoolName)}<br>Ambassador: ${escapeHtml(ambassadorName)}`,
      location: "Online (Microsoft Teams)"
    },
    existingExternalId
  );

  if (result.status === "unconfigured") {
    return { ok: false as const, code: "unconfigured" as TeamsLinkFailure };
  }

  if (result.status === "failed") {
    return { ok: false as const, code: result.code as TeamsLinkFailure };
  }

  const calendarPayload = {
    booking_session_id: bookingSessionId,
    provider: "outlook",
    external_event_id: result.eventId,
    sync_status: "synced",
    last_synced_at: new Date().toISOString(),
    last_error: null
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
  const { error } = await admin
    .from("booking_sessions")
    .update({
      meeting_url: result.joinUrl,
      ...(calendarEvent?.id ? { calendar_event_id: calendarEvent.id } : {})
    })
    .eq("id", bookingSessionId);

  if (error) {
    return { ok: false as const, code: "other" as TeamsLinkFailure };
  }

  return { ok: true as const, joinUrl: result.joinUrl, lobbyBypassed: result.lobbyBypassed };
}

