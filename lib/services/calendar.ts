import { randomUUID } from "node:crypto";

import { config } from "@/lib/env";

type CalendarEventInput = {
  title: string;
  startsAt: string;
  endsAt: string;
  description: string;
  location: string;
};

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

export async function createOutlookCalendarEvent(input: CalendarEventInput) {
  if (!config.isMicrosoftGraphConfigured) {
    return {
      id: `calendar-${randomUUID()}`,
      status: "skipped_unconfigured" as const
    };
  }

  const token = await getGraphToken();

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendars/${config.microsoftCalendarId}/events`,
    {
      method: "POST",
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
          dateTime: input.startsAt,
          timeZone: "Pacific/Auckland"
        },
        end: {
          dateTime: input.endsAt,
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

  const payload = (await response.json()) as { id: string };

  return {
    id: payload.id,
    status: "synced" as const
  };
}
