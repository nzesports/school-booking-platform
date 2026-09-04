import { buildCalendarLinksEmailHtml } from "./calendar-links";

// Sample placeholder values shared by the template editor preview and the
// "Send test" action so {{placeholders}} render as something realistic.
export const EMAIL_SAMPLE_VALUES: Record<string, string> = {
  contactName: "Jordan Smith",
  schoolName: "Rangitoto College",
  bookingId: "BK-2026-0412",
  sessionDate: "Tue, 15 Sep 2026 · 9:30 am",
  presentationTitle: "Digital Wellbeing",
  ambassadorName: "Aroha Ngata",
  sessionAddress: "12 Example Street, Auckland",
  reviewUrl: "https://example.org/feedback/sample",
  loginUrl: "https://example.org/login",
  invoiceNumber: "INV-2026-014",
  amount: "$250.00",
  amountLabel: "$250.00 NZD",
  sessionDescription: "Digital Wellbeing — Rangitoto College — 15 September 2026",
  bankAccountName: "Aroha Ngata",
  bankAccountNumber: "12-3456-7890123-00",
  gstLine: "",
  confirmationButton:
    '<p><a href="https://example.org/finance/payment/sample" style="display:inline-block;border-radius:12px;background:#18a83b;color:#fff;padding:13px 22px;font-weight:700;text-decoration:none;">Payment made</a></p>',
  calendarLinks: buildCalendarLinksEmailHtml(
    {
      title: "Digital Wellbeing — NZ Esports presentation",
      description: "NZ Esports school presentation at Rangitoto College.",
      location: "Rangitoto College",
      startsAt: "2026-09-14T21:30:00.000Z",
      endsAt: "2026-09-14T22:30:00.000Z"
    },
    "https://example.org/api/calendar/sample"
  )
};

export function substituteSampleValues(html: string) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key: string) => EMAIL_SAMPLE_VALUES[key] ?? `{{${key}}}`);
}
