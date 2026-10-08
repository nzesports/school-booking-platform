import { siteUrl } from "@/lib/site-url";
import { formatTime, formatWeekdayDate } from "@/lib/utils";

export type SchoolEmailDetails = {
  ambassadorName?: string;
  referenceCode?: string;
  schoolName: string;
  presentationTitle: string;
  sessionStartsAt: string;
  sessionEndsAt: string;
  expectedStudentCount: number | null;
  yearLevels: string;
  // Online sessions show the video-call link instead of a venue.
  deliveryMode?: "in_person" | "online";
  meetingUrl?: string | null;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]!);
}

export function buildSchoolEmailDetails(details: SchoolEmailDetails) {
  const vars = {
    ambassadorName: details.ambassadorName || "To be assigned",
    referenceCode: details.referenceCode || "Not recorded",
    schoolName: details.schoolName,
    presentationTitle: details.presentationTitle,
    sessionDate: formatWeekdayDate(details.sessionStartsAt),
    sessionTime: `${formatTime(details.sessionStartsAt)} – ${formatTime(details.sessionEndsAt)} (New Zealand time)`,
    expectedStudentCount: details.expectedStudentCount == null ? "Not recorded" : String(details.expectedStudentCount),
    yearLevels: details.yearLevels || "Not recorded"
  };
  const isOnline = details.deliveryMode === "online";
  const rows = [
    ["Ambassador", vars.ambassadorName],
    ["Presentation", vars.presentationTitle],
    ...(isOnline
      ? [["School", vars.schoolName], ["Location", "Online (video call)"]]
      : [["School / location", vars.schoolName]]),
    ["Date", vars.sessionDate], ["Time", vars.sessionTime],
    ["Expected students", vars.expectedStudentCount], ["Year groups", vars.yearLevels]
  ];
  const meetingRow = isOnline
    ? `<tr><th scope="row" style="padding:7px 12px 7px 0;text-align:left;vertical-align:top;">Video-call link</th><td style="padding:7px 0;">${
        details.meetingUrl
          ? `<a href="${escapeHtml(details.meetingUrl)}">${escapeHtml(details.meetingUrl)}</a>`
          : "We'll send the link before your session."
      }</td></tr>`
    : "";
  return {
    vars,
    html: `<div data-school-session-details="true"><h3 style="margin:24px 0 8px;">Session details</h3>
      <table style="width:100%;border-collapse:collapse;">${rows.map(([label, value]) =>
        `<tr><th scope="row" style="padding:7px 12px 7px 0;text-align:left;vertical-align:top;">${label}</th><td style="padding:7px 0;">${escapeHtml(value)}</td></tr>`
      ).join("")}${meetingRow}</table><p style="font-size:12px;line-height:1.5;font-style:italic;">Need to cancel or reschedule? <a href="${escapeHtml(siteUrl)}/manage-booking">Manage your booking</a> by entering the booking reference shown above and the email address used for the booking. View your details and make changes in your browser. Changes within 24 hours of the session must be arranged with the team. No account or password is needed.</p></div>`
  };
}
