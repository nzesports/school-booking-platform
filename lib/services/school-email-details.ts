import { formatTime } from "@/lib/utils";

export type SchoolEmailDetails = {
  schoolName: string;
  presentationTitle: string;
  sessionStartsAt: string;
  sessionEndsAt: string;
  expectedStudentCount: number | null;
  yearLevels: string;
};

export function formatSchoolEmailDate(value: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland", weekday: "long", day: "numeric", month: "long", year: "numeric"
  }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]!);
}

export function buildSchoolEmailDetails(details: SchoolEmailDetails) {
  const vars = {
    schoolName: details.schoolName,
    presentationTitle: details.presentationTitle,
    sessionDate: formatSchoolEmailDate(details.sessionStartsAt),
    sessionTime: `${formatTime(details.sessionStartsAt)} – ${formatTime(details.sessionEndsAt)} (New Zealand time)`,
    expectedStudentCount: details.expectedStudentCount == null ? "Not recorded" : String(details.expectedStudentCount),
    yearLevels: details.yearLevels || "Not recorded"
  };
  const rows = [
    ["Presentation", vars.presentationTitle], ["School / location", vars.schoolName],
    ["Date", vars.sessionDate], ["Time", vars.sessionTime],
    ["Expected students", vars.expectedStudentCount], ["Year groups", vars.yearLevels]
  ];
  return {
    vars,
    html: `<div data-school-session-details="true"><h3 style="margin:24px 0 8px;">Session details</h3>
      <table style="width:100%;border-collapse:collapse;">${rows.map(([label, value]) =>
        `<tr><th scope="row" style="padding:7px 12px 7px 0;text-align:left;vertical-align:top;">${label}</th><td style="padding:7px 0;">${escapeHtml(value)}</td></tr>`
      ).join("")}</table></div>`
  };
}
