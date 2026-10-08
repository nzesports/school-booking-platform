// Banner messages for per-session edits made from the booking details dialog
// (student numbers, video-call links, Teams links). Shared by the admin and
// staff bookings pages.
type SearchParams = Record<string, string | string[] | undefined>;

function read(searchParams: SearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

const LOBBY_NOTE =
  " Depending on your organisation's Teams settings, the school and ambassador may wait in the lobby until someone from NZ Esports lets them in.";

const successMessages: Record<string, string> = {
  students: "Student numbers saved.",
  "meeting-link": "Video-call link saved.",
  "meeting-link-sent": "Video-call link saved and emailed to the school and ambassador.",
  "meeting-link-removed": "Video-call link removed.",
  "teams-link": "Teams link created. It will go out in the confirmation email.",
  "teams-link-sent": "Teams link created and emailed to the school and ambassador."
};

const errorMessages: Record<string, string> = {
  "invalid-student-count": "Enter student numbers between 0 and 10,000.",
  "student-count-update-failed": "The student numbers couldn't be saved. Please try again.",
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
  outcome: { updated: string; lobbyNote?: boolean } | { error: string }
): SessionActionState {
  if ("error" in outcome) {
    return { tone: "error", message: errorMessages[outcome.error] ?? "Something went wrong. Please try again." };
  }

  return {
    tone: "success",
    message: (successMessages[outcome.updated] ?? "Saved.") + (outcome.lobbyNote ? LOBBY_NOTE : "")
  };
}

export function sessionUpdateNotice(searchParams: SearchParams) {
  const updated = read(searchParams, "updated");
  const error = read(searchParams, "error");

  if (updated && successMessages[updated]) {
    const lobby = read(searchParams, "lobby") === "guests-wait" ? LOBBY_NOTE : "";
    return { scope: "booking" as const, tone: "success" as const, message: successMessages[updated] + lobby };
  }

  if (error && errorMessages[error]) {
    return { scope: "booking" as const, tone: "error" as const, message: errorMessages[error] };
  }

  return null;
}
