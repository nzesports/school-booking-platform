// Banner messages for per-session edits made from the booking details dialog
// (student numbers, video-call links, Teams links). Shared by the admin and
// staff bookings pages.
type SearchParams = Record<string, string | string[] | undefined>;

function read(searchParams: SearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

const successMessages: Record<string, string> = {
  students: "Student numbers saved.",
  "reschedule-confirmed": "New date confirmed.",
  status: "Booking status updated.",
  "status-emailed": "Booking status updated and the school has been emailed.",
  "meeting-link": "Video-call link saved.",
  "meeting-link-sent": "Video-call link saved and emailed to the school and ambassador.",
  "meeting-link-removed": "Video-call link removed.",
  "teams-link": "Teams link created. It will go out in the confirmation email.",
  "teams-link-sent": "Teams link created and emailed to the school and ambassador."
};

const errorMessages: Record<string, string> = {
  "invalid-status": "Choose a valid booking status.",
  "booking-not-found": "That booking couldn't be found. It may have been deleted.",
  "cannot-complete-future": "A booking can't be marked completed before its session has happened.",
  "status-update-failed": "The status couldn't be updated. Please try again.",
  "booking-status-changed":
    "Not updated: this booking's status was changed by someone else (or the school) a moment ago. Review the booking and try again.",
  "ambassador-conflict":
    "Not assigned: this ambassador already has a session that overlaps one of these times (in this booking or another). Choose another ambassador or move a session first.",
  "reinstate-ambassador-conflict":
    "Not updated: bringing these sessions back would double-book their ambassador, who now has another session at that time. Reassign or move a session first.",
  "same-day-group-blocked":
    "Not changed: one of this booking's other sessions that day can't be changed the same way (for example, it has a reschedule pending). Resolve it first, then try again.",
  "assign-failed": "The ambassador couldn't be assigned. Refresh the booking and try again.",
  "unassign-failed": "The ambassador couldn't be unassigned. Refresh the booking and try again.",
  "session-not-assignable": "Delivered and closed sessions keep their ambassador.",
  "session-not-assigned": "That session no longer has an ambassador assigned.",
  "ambassador-not-approved": "Only approved ambassadors can be assigned.",
  "not-authorized": "Your account can't make that change.",
  "invalid-student-count": "Enter student numbers between 0 and 10,000.",
  "student-count-update-failed": "The student numbers couldn't be saved. Please try again.",
  "reschedule-confirm-failed": "The new date couldn't be confirmed. Please try again.",
  "reschedule-changed":
    "Not confirmed: the school changed this session again after it was opened. Review the latest date, then confirm.",
  "invalid-meeting-link": "Enter a full video-call link starting with https://.",
  "meeting-link-update-failed": "The video-call link couldn't be saved. Please try again.",
  "session-not-found": "That session couldn't be found. It may have been changed or removed.",
  "teams-unconfigured":
    "Microsoft isn't connected on this site, so a Teams link can't be created. Paste a Zoom, Google Meet or Teams link instead.",
  "teams-signin":
    "Couldn't sign in to Microsoft. Check the MICROSOFT_GRAPH_* settings, or paste a link instead.",
  "teams-permission":
    "Microsoft refused to create the meeting. The app needs the Calendars.ReadWrite permission. Paste a link instead for now.",
  "teams-licence":
    "The shared Microsoft calendar account can't create Teams meetings (it needs a Teams licence). Paste a link instead for now.",
  "teams-not-online": "Teams links can only be created for online sessions.",
  "teams-other": "Microsoft couldn't create the Teams link. Try again, or paste a link instead."
};

// State returned by the booking-details dialog actions, shown inside the
// dialog so it can stay open after saving.
export type SessionActionState = { tone: "success" | "error"; message: string } | null;

export type SessionDialogAction = (
  state: SessionActionState,
  formData: FormData
) => Promise<SessionActionState>;

export function sessionActionResult(
  outcome: { updated: string } | { error: string }
): SessionActionState {
  if ("error" in outcome) {
    return { tone: "error", message: errorMessages[outcome.error] ?? "Something went wrong. Please try again." };
  }

  return {
    tone: "success",
    message: successMessages[outcome.updated] ?? "Saved."
  };
}

export function sessionUpdateNotice(searchParams: SearchParams) {
  const updated = read(searchParams, "updated");
  const error = read(searchParams, "error");

  if (updated && successMessages[updated]) {
    return { scope: "booking" as const, tone: "success" as const, message: successMessages[updated] };
  }

  if (error && errorMessages[error]) {
    return { scope: "booking" as const, tone: "error" as const, message: errorMessages[error] };
  }

  return null;
}
