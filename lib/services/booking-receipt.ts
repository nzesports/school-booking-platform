import { formatLongDate, formatTime } from "@/lib/utils";

export type BookingReceiptSession = {
  presentationTitle: string;
  regionName: string;
  startsAt: string;
  endsAt: string;
  yearLevels: string;
  expectedStudentCount: number;
};

export type BookingReceiptDetails = {
  schoolName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  schoolNotes?: string;
  referenceCode: string;
  sessions: BookingReceiptSession[];
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]!);
}

export function buildBookingReceipt(details: BookingReceiptDetails) {
  const row = (label: string, value: string) =>
    `<tr><th scope="row" style="padding:6px 12px 6px 0;text-align:left;vertical-align:top;">${label}</th><td style="padding:6px 0;white-space:pre-line;">${escapeHtml(value)}</td></tr>`;
  const sessions = details.sessions.map((session, index) => `
    <h3 style="margin:24px 0 8px;">Requested session ${index + 1}</h3>
    <table role="table" style="width:100%;border-collapse:collapse;">
      ${row("Presentation", session.presentationTitle)}
      ${row("Date", formatLongDate(session.startsAt))}
      ${row("Time", `${formatTime(session.startsAt)} – ${formatTime(session.endsAt)} (New Zealand time)`)}
      ${row("School / location", details.schoolName)}
      ${row("Region", session.regionName)}
      ${row("Year groups", session.yearLevels)}
      ${row("Expected students", String(session.expectedStudentCount))}
    </table>`).join("");

  return `
    <h2 style="margin:24px 0 8px;">Your booking request</h2>
    <p>Pending approval — these are your requested details. We will confirm availability with you.</p>
    <table role="table" style="width:100%;border-collapse:collapse;">
      ${row("Reference", details.referenceCode)}
      ${row("School", details.schoolName)}
      ${row("Contact", details.contactName)}
      ${row("Email", details.contactEmail)}
      ${row("Phone", details.contactPhone)}
    </table>
    ${sessions}
    <p>The exact venue address and room will be confirmed with your school.</p>
    ${details.schoolNotes ? `<h3>School notes</h3><p style="white-space:pre-line;">${escapeHtml(details.schoolNotes)}</p>` : ""}`;
}
