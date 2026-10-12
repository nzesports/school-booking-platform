import { createAdminClient } from "@/lib/supabase/admin";

import { relationOne } from "@/lib/supabase/relation";

import { createOrUpdateTeamsMeeting, type TeamsFailureCode } from "./calendar";
import { escapeHtml } from "./email-triggers";

// Unsynced results carry a random `calendar-<uuid>` placeholder, not an
// Outlook id, so only a real stored id may be PATCHed.
function isOutlookEventId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.startsWith("calendar-");
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

