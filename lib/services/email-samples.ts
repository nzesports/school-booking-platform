import { buildSchoolEmailDetails } from "./school-email-details";
import { siteUrl } from "@/lib/site-url";

import { buildCalendarLinksEmailHtml } from "./calendar-links";
import { buildBookingReceipt } from "./booking-receipt";

// Sample placeholder values shared by the template editor preview and the
// "Send test" action so {{placeholders}} render as something realistic.
export const EMAIL_SAMPLE_VALUES: Record<string, string> = {
  expectedStudentCount: "120",
  yearLevels: "Years 7 to 8",
  sessionSummary: buildSchoolEmailDetails({ schoolName: "Rangitoto College", presentationTitle: "Digital Wellbeing", sessionStartsAt: "2026-09-14T21:30:00.000Z", sessionEndsAt: "2026-09-14T22:30:00.000Z", expectedStudentCount: 120, yearLevels: "Years 7 to 8" }).html,
  contactName: "Jordan Smith",
  contactEmail: "jordan@example.nz",
  contactPhone: "09 555 0100",
  schoolNotes: "Please meet at the school office.",
  regionName: "Auckland",
  sessionTime: "9:30 am – 10:30 am (NZ time)",
  bookingSummary: buildBookingReceipt({
    schoolName: "Rangitoto College",
    contactName: "Jordan Smith",
    contactEmail: "jordan@example.nz",
    contactPhone: "09 555 0100",
    referenceCode: "BK-2026-0412",
    sessions: [{
      presentationTitle: "Digital Wellbeing",
      regionName: "Auckland",
      startsAt: "2026-09-14T21:30:00.000Z",
      endsAt: "2026-09-14T22:30:00.000Z",
      yearLevels: "Years 7 to 8",
      expectedStudentCount: 120
    }]
  }),
  schoolName: "Rangitoto College",
  bookingId: "BK-2026-0412",
  sessionDate: "Tue, 15 Sep 2026 · 9:30 am",
  presentationTitle: "Digital Wellbeing",
  ambassadorName: "Aroha Ngata",
  sessionAddress: "12 Example Street, Auckland",
  reviewUrl: `${siteUrl}/feedback/sample`,
  siteUrl,
  portalUrl: `${siteUrl}/ambassador`,
  loginUrl: `${siteUrl}/login`,
  invoiceNumber: "INV-2026-014",
  amount: "$250.00",
  amountLabel: "$250.00 NZD",
  sessionDescription: "Digital Wellbeing — Rangitoto College — 15 September 2026",
  bankAccountName: "Aroha Ngata",
  bankAccountNumber: "12-3456-7890123-00",
  gstLine: "",
  confirmationButton:
    `<p><a href="${siteUrl}/finance/payment/sample" style="display:inline-block;border-radius:12px;background:#18a83b;color:#fff;padding:13px 22px;font-weight:700;text-decoration:none;">Payment made</a></p>`,
  calendarLinks: buildCalendarLinksEmailHtml(
    {
      title: "Digital Wellbeing — NZ Esports presentation",
      description: "NZ Esports school presentation at Rangitoto College.",
      location: "Rangitoto College",
      startsAt: "2026-09-14T21:30:00.000Z",
      endsAt: "2026-09-14T22:30:00.000Z"
    },
    `${siteUrl}/api/calendar/sample`
  )
};

export function substituteSampleValues(html: string) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key: string) => EMAIL_SAMPLE_VALUES[key] ?? `{{${key}}}`);
}
