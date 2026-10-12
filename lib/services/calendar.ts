import { randomUUID } from "node:crypto";

import { config } from "@/lib/env";

type CalendarEventInput = {
  title: string;
  startsAt: string;
  endsAt: string;
  description: string;
  location: string;
  // How the event shows in Outlook; pending bookings show as tentative.
  showAs?: "tentative" | "busy";
};

function toGraphNzDateTime(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  })
    .format(new Date(value))
    .replace(" ", "T");
}

async function getGraphToken() {
  const params = new URLSearchParams({
    client_id: config.microsoftClientId as string,
    client_secret: config.microsoftClientSecret as string,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials"
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${config.microsoftTenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params
    }
  );

  if (!response.ok) {
    throw new Error("Unable to fetch Microsoft Graph access token.");
  }

  const payload = (await response.json()) as { access_token: string };
  return payload.access_token;
}

export async function syncOutlookCalendarEvent(
  input: CalendarEventInput,
  externalEventId?: string | null
) {
  if (!config.isMicrosoftGraphConfigured) {
    return {
      id: `calendar-${randomUUID()}`,
      status: "skipped_unconfigured" as const
    };
  }

  const token = await getGraphToken();
  const userId = encodeURIComponent(config.microsoftUserId as string);
  const calendarPath = config.microsoftCalendarId
    ? `calendars/${encodeURIComponent(config.microsoftCalendarId)}`
    : "calendar";

  const eventPath = externalEventId
    ? `/events/${encodeURIComponent(externalEventId)}`
    : "/events";
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userId}/${calendarPath}${eventPath}`,
    {
      method: externalEventId ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        subject: input.title,
        body: {
          contentType: "HTML",
          content: input.description
        },
        start: {
          dateTime: toGraphNzDateTime(input.startsAt),
          timeZone: "Pacific/Auckland"
        },
        end: {
          dateTime: toGraphNzDateTime(input.endsAt),
          timeZone: "Pacific/Auckland"
        },
        location: {
          displayName: input.location
        },
        ...(input.showAs ? { showAs: input.showAs } : {})
      })
    }
  );

  // The stored event was deleted in Outlook; create a replacement rather than
  // failing every retry against an id that no longer exists.
  if (externalEventId && response.status === 404) {
    return syncOutlookCalendarEvent(input, null);
  }

  if (!response.ok) {
    return {
      id: `calendar-${randomUUID()}`,
      status: "failed" as const,
      error: await response.text()
    };
  }

  const payload = externalEventId ? { id: externalEventId } : ((await response.json()) as { id: string });

  return {
    id: payload.id,
    status: "synced" as const
  };
}

export async function createOutlookCalendarEvent(input: CalendarEventInput) {
  return syncOutlookCalendarEvent(input);
}

// Teams meetings are created as an Outlook event on the shared calendar with
// isOnlineMeeting set; Microsoft then returns the meeting's join link. Anyone
// can join from a web browser, without a Teams account.
export type TeamsFailureCode = "signin" | "permission" | "licence" | "other";

type TeamsMeetingResult =
  | { status: "created"; eventId: string; joinUrl: string; lobbyBypassed: boolean }
  | { status: "unconfigured" }
  | { status: "failed"; code: TeamsFailureCode };

function graphCalendarBase() {
  const userId = encodeURIComponent(config.microsoftUserId as string);
  const calendarPath = config.microsoftCalendarId
    ? `calendars/${encodeURIComponent(config.microsoftCalendarId)}`
    : "calendar";
  return { userId, eventsUrl: `https://graph.microsoft.com/v1.0/users/${userId}/${calendarPath}/events` };
}

// Classifies a Graph error so staff see a cause they can act on.
async function classifyGraphError(response: Response): Promise<TeamsFailureCode> {
  const text = await response.text();
  let code = "";
  try {
    code = String((JSON.parse(text) as { error?: { code?: string } }).error?.code ?? "");
  } catch {
    code = "";
  }

  if (response.status === 401 || response.status === 403 || /Access|Authorization|Forbidden/i.test(code)) {
    return "permission";
  }

  if (/OnlineMeeting|TeamsForBusiness|ProviderNotSupported/i.test(`${code} ${text}`)) {
    return "licence";
  }

  console.error("[teams] Microsoft Graph error", { status: response.status, code });
  return "other";
}

async function readJoinUrl(token: string, eventUrl: string) {
  // Microsoft fills in the join link asynchronously; give it a moment.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${eventUrl}?$select=id,isOnlineMeeting,onlineMeeting`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.ok) {
      const payload = (await response.json()) as {
        onlineMeeting?: { joinUrl?: string | null } | null;
      };
      const joinUrl = payload.onlineMeeting?.joinUrl;

      if (joinUrl) {
        return joinUrl;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }

  return null;
}

// Best effort: let everyone skip the lobby and present, so the school and the
// ambassador (who join as guests) aren't left waiting for someone to admit
// them. Needs the OnlineMeetings.ReadWrite.All permission and a Teams
// application access policy; without them the meeting still works, but
// guests may wait in the lobby depending on the organisation's Teams policy.
async function openTeamsLobby(token: string, userId: string, joinUrl: string) {
  try {
    const lookup = await fetch(
      `https://graph.microsoft.com/v1.0/users/${userId}/onlineMeetings?$filter=${encodeURIComponent(`JoinWebUrl eq '${joinUrl.replace(/'/g, "''")}'`)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!lookup.ok) {
      return false;
    }

    const meeting = ((await lookup.json()) as { value?: Array<{ id: string }> }).value?.[0];

    if (!meeting) {
      return false;
    }

    const update = await fetch(
      `https://graph.microsoft.com/v1.0/users/${userId}/onlineMeetings/${encodeURIComponent(meeting.id)}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          lobbyBypassSettings: { scope: "everyone", isDialInBypassEnabled: true },
          allowedPresenters: "everyone"
        })
      }
    );

    return update.ok;
  } catch {
    return false;
  }
}

export async function createOrUpdateTeamsMeeting(
  input: CalendarEventInput,
  externalEventId?: string | null
): Promise<TeamsMeetingResult> {
  if (!config.isMicrosoftGraphConfigured) {
    return { status: "unconfigured" };
  }

  let token: string;

  try {
    token = await getGraphToken();
  } catch {
    return { status: "failed", code: "signin" };
  }

  const { userId, eventsUrl } = graphCalendarBase();
  const eventFields = {
    subject: input.title,
    body: { contentType: "HTML", content: input.description },
    start: { dateTime: toGraphNzDateTime(input.startsAt), timeZone: "Pacific/Auckland" },
    end: { dateTime: toGraphNzDateTime(input.endsAt), timeZone: "Pacific/Auckland" },
    location: { displayName: input.location },
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness"
  };

  // Reuse the session's calendar event so each session keeps one meeting.
  let eventId = externalEventId ?? null;
  let response = eventId
    ? await fetch(`${eventsUrl}/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(eventFields)
      })
    : null;

  if (!response || response.status === 404) {
    response = await fetch(eventsUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventFields)
    });
    eventId = null;
  }

  if (!response.ok) {
    return { status: "failed", code: await classifyGraphError(response) };
  }

  if (!eventId) {
    eventId = ((await response.json()) as { id: string }).id;
  }

  const joinUrl = await readJoinUrl(token, `${eventsUrl}/${encodeURIComponent(eventId)}`);

  // The event exists but Microsoft gave it no Teams meeting: almost always a
  // calendar account without a Teams licence.
  if (!joinUrl) {
    return { status: "failed", code: "licence" };
  }

  return {
    status: "created",
    eventId,
    joinUrl,
    lobbyBypassed: await openTeamsLobby(token, userId, joinUrl)
  };
}

export async function deleteOutlookCalendarEvent(externalEventId: string) {
  if (!config.isMicrosoftGraphConfigured) {
    return false;
  }

  const token = await getGraphToken();
  const { eventsUrl } = graphCalendarBase();
  const response = await fetch(`${eventsUrl}/${encodeURIComponent(externalEventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });

  return response.ok || response.status === 404;
}

