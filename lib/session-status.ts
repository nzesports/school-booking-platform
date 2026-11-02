import type { BookingSessionView } from "@/lib/domain/types";

// Statuses where a session is still upcoming business (not delivered,
// cancelled or in a reschedule/withdrawal request).
const SETTLED_ACTIVE_STATUSES = new Set(["requested", "tentative", "applied", "ambassador_assigned", "confirmed"]);

type StatusFields = Pick<BookingSessionView, "status" | "rescheduleConfirmationNeededAt">;

// The school moved this session itself and staff haven't confirmed the new
// date yet. The stored status is unchanged; this only affects grouping/labels.
export function needsRescheduleConfirmation(session: StatusFields) {
  return Boolean(session.rescheduleConfirmationNeededAt) && SETTLED_ACTIVE_STATUSES.has(session.status);
}

export function isReschedulingSession(session: StatusFields) {
  return session.status === "reschedule_requested" || needsRescheduleConfirmation(session);
}

export function isWithdrawalSession(session: StatusFields) {
  return session.status === "withdrawal_requested";
}

// What to show on a session's status pill. "rescheduled" is display-only.
export function sessionDisplayStatus(session: StatusFields) {
  return needsRescheduleConfirmation(session) ? "rescheduled" : session.status;
}
