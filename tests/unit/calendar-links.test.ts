import { describe, expect, it, vi } from "vitest";

import {
  buildCalendarLinksEmailHtml,
  buildIcsContent,
  googleCalendarUrl,
  office365Url,
  outlookLiveUrl,
  yahooCalendarUrl,
  type CalendarEventInput
} from "@/lib/services/calendar-links";

const event: CalendarEventInput = {
  title: "Esports & wellbeing",
  description: "Assembly presentation",
  location: "Harbour College",
  startsAt: "2026-09-07T21:00:00.000Z",
  endsAt: "2026-09-07T21:10:00.000Z"
};

describe("calendar links", () => {
  it("keeps a session UID stable and folds long Unicode lines for calendar imports", () => {
    const content = buildIcsContent({ ...event, uid: "session-1@book.nzesports.org.nz", cancelled: true, title: "Māori school presentation ".repeat(12) });
    expect(content).toContain("UID:session-1@book.nzesports.org.nz");
    expect(content).toContain("STATUS:CANCELLED");
    expect(content.replace(/\r\n /g, "")).toContain("Māori school presentation ".repeat(12));
    for (const line of content.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it("builds provider URLs with UTC times and event details", () => {
    const google = new URL(googleCalendarUrl(event));
    const outlook = new URL(outlookLiveUrl(event));
    const office = new URL(office365Url(event));
    const yahoo = new URL(yahooCalendarUrl(event));

    expect(google.searchParams.get("dates")).toBe("20260907T210000Z/20260907T211000Z");
    expect(google.searchParams.get("text")).toBe(event.title);
    expect(outlook.searchParams.get("startdt")).toBe(event.startsAt);
    expect(office.hostname).toBe("outlook.office.com");
    expect(yahoo.searchParams.get("in_loc")).toBe(event.location);
  });

  it("includes the hosted ICS option only when a URL is supplied", () => {
    expect(buildCalendarLinksEmailHtml(event)).not.toContain("Apple / .ics");
    expect(buildCalendarLinksEmailHtml(event, "https://example.nz/event.ics")).toContain(
      "Apple / .ics"
    );
  });

  it("escapes ICS punctuation and newlines", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.123456);
    const content = buildIcsContent({
      ...event,
      title: "Esports, wellbeing; pathways",
      description: "Line one\nLine two"
    });

    expect(content).toContain("SUMMARY:Esports\\, wellbeing\\; pathways");
    expect(content).toContain("DESCRIPTION:Line one\\nLine two");
    expect(content).toContain("DTSTART:20260907T210000Z");
    expect(content).toContain("\r\n");
  });
});
