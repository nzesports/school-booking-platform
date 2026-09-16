// Shared labels for the status update confirmation and its server-side dispatch.
export function statusEmailEvent(status: string) {
  if (status === "confirmed") return "confirmed" as const;
  if (["requested", "tentative"].includes(status)) return "tentative" as const;
  if (["cancelled", "declined"].includes(status)) return "cancelled" as const;
  if (["closed", "completed_pending_report"].includes(status)) return "feedback" as const;
  return null;
}
export function statusEmailLabel(status: string) {
  const event = statusEmailEvent(status);
  return event === "feedback" ? "a thank-you email with the school feedback link"
    : event === "confirmed" ? "a booking confirmation email"
    : event === "cancelled" ? "a cancellation email"
    : event === "tentative" ? "a pending booking email" : null;
}
