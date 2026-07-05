// Add-to-calendar link builders for the main providers, plus an ICS file for
// Apple Calendar and generic downloads. All take UTC instants (ISO strings)
// and event text; no external services involved.

export type CalendarEventInput = {
  title: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
};

function toUtcStamp(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function googleCalendarUrl(event: CalendarEventInput) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toUtcStamp(event.startsAt)}/${toUtcStamp(event.endsAt)}`,
    details: event.description ?? "",
    location: event.location ?? ""
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function outlookUrl(base: string, event: CalendarEventInput) {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: new Date(event.startsAt).toISOString(),
    enddt: new Date(event.endsAt).toISOString(),
    body: event.description ?? "",
    location: event.location ?? ""
  });

  return `${base}?${params.toString()}`;
}

export function outlookLiveUrl(event: CalendarEventInput) {
  return outlookUrl("https://outlook.live.com/calendar/0/deeplink/compose", event);
}

export function office365Url(event: CalendarEventInput) {
  return outlookUrl("https://outlook.office.com/calendar/0/deeplink/compose", event);
}

export function yahooCalendarUrl(event: CalendarEventInput) {
  const params = new URLSearchParams({
    v: "60",
    title: event.title,
    st: toUtcStamp(event.startsAt),
    et: toUtcStamp(event.endsAt),
    desc: event.description ?? "",
    in_loc: event.location ?? ""
  });

  return `https://calendar.yahoo.com/?${params.toString()}`;
}

function escapeIcsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function buildIcsContent(event: CalendarEventInput) {
  const uid = `${toUtcStamp(event.startsAt)}-${Math.random().toString(36).slice(2, 10)}@nzesports`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NZ Esports//School Bookings//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toUtcStamp(new Date().toISOString())}`,
    `DTSTART:${toUtcStamp(event.startsAt)}`,
    `DTEND:${toUtcStamp(event.endsAt)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    event.description ? `DESCRIPTION:${escapeIcsText(event.description)}` : "",
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : "",
    "END:VEVENT",
    "END:VCALENDAR"
  ]
    .filter(Boolean)
    .join("\r\n");
}
