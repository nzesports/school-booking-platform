// Two sessions clash only when their times actually overlap. Back-to-back
// sessions (one ends exactly when the next starts) are fine. Same rule as the
// database checks (0052 guest reschedules, 0054 staff reschedules, 0055
// assignments).
export function intervalsOverlap(
  leftStart: string | Date,
  leftEnd: string | Date,
  rightStart: string | Date,
  rightEnd: string | Date
) {
  return (
    new Date(leftStart).getTime() < new Date(rightEnd).getTime() &&
    new Date(leftEnd).getTime() > new Date(rightStart).getTime()
  );
}

const INACTIVE_SESSION_STATUSES = new Set(["cancelled", "declined"]);

export function findOverlappingSession<
  T extends { id: string; status: string; starts_at: string; ends_at: string }
>(sessions: T[], ignoreSessionId: string, startsAt: string, endsAt: string) {
  return sessions.find(
    (session) =>
      session.id !== ignoreSessionId &&
      !INACTIVE_SESSION_STATUSES.has(session.status) &&
      intervalsOverlap(session.starts_at, session.ends_at, startsAt, endsAt)
  );
}
