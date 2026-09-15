import { createAdminClient } from "@/lib/supabase/admin";
import type { BookingSessionView } from "@/lib/domain/types";

type Reschedule = NonNullable<BookingSessionView["rescheduleHistory"]>[number];

// Load only completed reschedules, separately from the capped activity feed.
// Otherwise badges would disappear as unrelated activity pushes them out.
export async function loadSessionRescheduleHistory(bookingId?: string) {
  const admin = createAdminClient();
  const history: Record<string, Reschedule[]> = {};
  if (!admin) return history;
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = admin.from("booking_activity_logs")
      .select("id, booking_session_id, created_at, details")
      .in("action", ["session.rescheduled_by_school", "session.reschedule_approved"])
      .not("booking_session_id", "is", null)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (bookingId) query = query.eq("booking_request_id", bookingId);
    const { data, error } = await query;
    if (error) {
      throw new Error(`Unable to load session reschedule history (${error.code}).`);
    }
    for (const row of data || []) {
      const details = row.details && typeof row.details === "object"
        ? row.details as Record<string, unknown> : {};
      const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : undefined;
      const previousStartsAt = date(details.previous_starts_at);
      const startsAt = date(details.starts_at);
      // An approval with the same time is not an actual schedule change.
      if (previousStartsAt && startsAt && Date.parse(previousStartsAt) === Date.parse(startsAt)) continue;
      const sessionId = row.booking_session_id as string;
      (history[sessionId] ??= []).push({ changedAt: row.created_at as string, previousStartsAt, startsAt });
    }
    if (!data || data.length < pageSize) break;
  }
  return history;
}
