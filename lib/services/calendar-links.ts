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

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// Inline "Add to your calendar" links for emails. Only phrasing content
// (strong/br/a) so the block stays valid inside a template <p>, and inline
// styles only since email clients strip stylesheets. The Apple option needs a
// hosted https .ics URL — data: URIs get stripped by Gmail/Outlook.
export function buildCalendarLinksEmailHtml(event: CalendarEventInput, icsUrl?: string) {
  const pill =
    "display:inline-block;margin:8px 8px 0 0;padding:9px 16px;border:1px solid #cfe6d8;border-radius:999px;background:#f2f9f4;color:#13a64a;font-weight:bold;font-size:13px;text-decoration:none;";
  const links = [
    { label: "Google Calendar", href: googleCalendarUrl(event) },
    { label: "Outlook", href: outlookLiveUrl(event) },
    { label: "Office 365", href: office365Url(event) },
    ...(icsUrl ? [{ label: "Apple / .ics", href: icsUrl }] : [])
  ];

  return (
    `<strong style="color:#040F4B;font-size:14px;">Add it to your calendar</strong><br>` +
    links
      .map(
        (link) =>
          `<a href="${escapeAttr(link.href)}" target="_blank" rel="noopener noreferrer" style="${pill}">${link.label}</a>`
      )
      .join("")
  );
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
