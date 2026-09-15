// Add-to-calendar link builders for the main providers, plus an ICS file for
// Apple Calendar and generic downloads. All take UTC instants (ISO strings)
// and event text; no external services involved.

export type CalendarEventInput = {
  title: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  uid?: string;
  cancelled?: boolean;
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
    { label: "Yahoo Calendar", href: yahooCalendarUrl(event) },
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

// RFC 5545 lines are limited to 75 octets. Fold on Unicode character
// boundaries so long school names/URLs survive import across calendar apps.
function foldIcsLine(line: string) {
  const encoder = new TextEncoder();
  let result = "";
  let bytes = 0;
  for (const character of line) {
    const length = encoder.encode(character).length;
    if (bytes + length > 75) {
      result += "\r\n ";
      bytes = 1;
    }
    result += character;
    bytes += length;
  }
  return result;
}

export function buildIcsContent(event: CalendarEventInput) {
  const uid = event.uid ?? `${toUtcStamp(event.startsAt)}-${Math.random().toString(36).slice(2, 10)}@nzesports`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NZ Esports//School Bookings//EN",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(uid)}`,
    `STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
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
    .map(foldIcsLine)
    .join("\r\n") + "\r\n";
}

// Shared plain text for every calendar provider; keep HTML out of ICS details.
export function bookingCalendarDescription(input: {
  presentationTitle: string;
  schoolName: string;
  ambassadorName?: string | null;
  referenceCode?: string | null;
  yearLevels?: string | null;
  expectedStudentCount?: number | null;
  manageUrl: string;
}) {
  return [
    `NZ Esports school presentation: ${input.presentationTitle}`,
    `School: ${input.schoolName}`,
    `Ambassador: ${input.ambassadorName || "To be assigned"}`,
    input.referenceCode ? `Booking reference: ${input.referenceCode}` : "",
    input.yearLevels ? `Year groups: ${input.yearLevels}` : "",
    input.expectedStudentCount != null ? `Expected students: ${input.expectedStudentCount}` : "",
    "",
    "Need to cancel or reschedule?",
    `Manage your booking: ${input.manageUrl}`,
    "Enter the booking reference and the email address used for the booking and verify with the one-time code sent to your email to view and manage this booking in your browser. Changes within 24 hours must be arranged with the team. No account or password is needed.",
    "Select View booking, choose your session, then select Cancel or Reschedule. New dates must be at least seven days ahead."
  ].filter((line) => line !== "").join("\n");
}
