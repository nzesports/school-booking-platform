import { randomUUID } from "node:crypto";

import { config } from "@/lib/env";

type CalendarEventInput = {
  title: string;
  startsAt: string;
  endsAt: string;
  description: string;
  location: string;
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
        }
      })
    }
  );

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
