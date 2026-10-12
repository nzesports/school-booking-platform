import { after } from "next/server";

import { config } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { relationOne } from "@/lib/supabase/relation";
import { formatTime, formatWeekdayDate } from "@/lib/utils";

import { deleteOutlookCalendarEvent, syncOutlookCalendarEvent } from "./calendar";
import { escapeHtml } from "./email-triggers";

// Keeps the shared schools@ Outlook calendar in step with every booking:
// pending ones show as tentative so the team can follow them up, confirmed
// and delivered ones as busy, and cancelled or declined ones are removed.
// Changes sync straight away; the hourly cron and the Settings button catch
// up anything missed (sessions changed since their last sync).

const REMOVED_STATUSES = new Set(["cancelled", "declined"]);
const TENTATIVE_STATUSES = new Set(["requested", "tentative", "applied", "reschedule_requested"]);
const STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  tentative: "Tentative – needs review",
  applied: "Ambassador applied – needs review",
  ambassador_assigned: "Ambassador assigned",
  confirmed: "Confirmed",
  reschedule_requested: "Reschedule requested",
  withdrawal_requested: "Ambassador withdrawal requested",
  completed_pending_report: "Delivered – report due",
  report_submitted: "Delivered – report submitted",
  payment_pending: "Delivered – payment pending",
  paid: "Delivered – paid",
  closed: "Delivered"
};

const SESSION_COLUMNS =
  "id, booking_request_id, status, starts_at, ends_at, year_levels, expected_student_count, location_address, schools(name, address, city), presentation_types(title), ambassador_profiles(display_name, profiles!ambassador_profiles_user_id_fkey(full_name))";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
export type CalendarSyncCounts = { added: number; updated: number; removed: number; failed: number };

function isOutlookEventId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.startsWith("calendar-");
}

// Latest calendar_events row per session (older code could leave several).
async function loadCalendarRows(admin: Admin, sessionIds?: string[]) {
  const rows = await fetchAllRows("calendar events", (from, to) => {
    const query = admin
      .from("calendar_events")
      .select("id, booking_session_id, external_event_id, sync_status, last_synced_at, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });
    return (sessionIds ? query.in("booking_session_id", sessionIds) : query).range(from, to);
  });
  const latest = new Map<string, (typeof rows)[number]>();

  for (const row of rows) {
    if (!latest.has(row.booking_session_id as string)) {
      latest.set(row.booking_session_id as string, row);
    }
  }

  return latest;
}

async function syncChunk(admin: Admin, sessionIds: string[], counts: CalendarSyncCounts) {
  const { data: sessions, error } = await admin
    .from("booking_sessions")
    .select(SESSION_COLUMNS)
    .in("id", sessionIds);

  if (error || !sessions) {
    counts.failed += sessionIds.length;
    return;
  }

  // Online columns (0050) are optional so sync still works without them.
  const { data: online } = await admin
    .from("booking_sessions")
    .select("id, delivery_mode, meeting_url")
    .in("id", sessionIds);
  const onlineById = new Map((online ?? []).map((row) => [row.id as string, row]));
  const bookingIds = [...new Set(sessions.map((session) => session.booking_request_id as string))];
  const { data: bookings } = await admin
    .from("booking_requests")
    .select("id, reference_code, primary_contact_id")
    .in("id", bookingIds);
  const bookingById = new Map((bookings ?? []).map((booking) => [booking.id as string, booking]));
  const contactIds = (bookings ?? []).map((booking) => booking.primary_contact_id).filter(Boolean);
  const { data: contacts } = contactIds.length
    ? await admin.from("school_contacts").select("id, full_name, email, phone").in("id", contactIds)
    : { data: [] };
  const contactById = new Map((contacts ?? []).map((contact) => [contact.id as string, contact]));
  const calendarRows = await loadCalendarRows(admin, sessionIds);

  for (const session of sessions) {
    const sessionId = session.id as string;
    const existing = calendarRows.get(sessionId);
    const externalId = isOutlookEventId(existing?.external_event_id) ? existing.external_event_id : null;
    const status = session.status as string;
    const now = new Date().toISOString();

    if (REMOVED_STATUSES.has(status)) {
      if (!existing) {
        continue;
      }

      const removed = externalId ? await deleteOutlookCalendarEvent(externalId).catch(() => false) : true;
      await admin
        .from("calendar_events")
        .update({
          external_event_id: removed ? null : externalId,
          sync_status: removed ? "removed" : "failed",
          last_synced_at: removed ? now : existing.last_synced_at,
          last_error: removed ? null : "Could not remove the Outlook event."
        })
        .eq("id", existing.id);
      counts[removed ? "removed" : "failed"] += 1;
      continue;
    }

    const booking = bookingById.get(session.booking_request_id as string);
    const contact = booking?.primary_contact_id ? contactById.get(booking.primary_contact_id as string) : null;
    const school = relationOne(session.schools);
    const ambassador = relationOne(session.ambassador_profiles);
    const ambassadorName = relationOne(ambassador?.profiles)?.full_name ?? ambassador?.display_name;
    const onlineRow = onlineById.get(sessionId);
    const isOnline = onlineRow?.delivery_mode === "online";
    const meetingUrl = (onlineRow?.meeting_url as string | null) ?? null;
    const schoolName = (school?.name as string | null) ?? "School";
    const tentative = TENTATIVE_STATUSES.has(status);
    const bookingUrl = `${config.siteUrl}/admin/bookings?status=all&range=all&booking=${session.booking_request_id}#booking-${session.booking_request_id}`;
    const detail = (label: string, value?: string | null) =>
      value ? `<b>${label}:</b> ${escapeHtml(value)}<br>` : "";
    const description = [
      detail("Status", STATUS_LABELS[status] ?? status),
      detail("Presentation", relationOne(session.presentation_types)?.title as string | undefined),
      detail("School", schoolName),
      detail(
        "When",
        `${formatWeekdayDate(session.starts_at as string)}, ${formatTime(session.starts_at as string)} – ${formatTime(session.ends_at as string)} (NZ time)`
      ),
      detail("Contact", [contact?.full_name, contact?.email, contact?.phone].filter(Boolean).join(" · ")),
      detail("Year groups", session.year_levels as string | null),
      detail("Expected students", session.expected_student_count == null ? null : String(session.expected_student_count)),
      detail("Ambassador", ambassadorName ?? "Not assigned yet"),
      detail("Booking reference", booking?.reference_code as string | null),
      isOnline
        ? meetingUrl
          ? `<b>Video call:</b> <a href="${escapeHtml(meetingUrl)}">${escapeHtml(meetingUrl)}</a><br>`
          : "<b>Video call:</b> link not added yet<br>"
        : "",
      `<br><a href="${escapeHtml(bookingUrl)}">Open this booking on the booking platform</a>`
    ].join("");
    const location = isOnline
      ? meetingUrl ?? "Online (video call)"
      : [session.location_address || school?.address, school?.city].filter(Boolean).join(", ") || schoolName;
    const result = await syncOutlookCalendarEvent(
      {
        title: `${tentative ? "[Tentative] " : ""}Esports Session - ${schoolName}${isOnline ? " (online)" : ""}`,
        startsAt: session.starts_at as string,
        endsAt: session.ends_at as string,
        description,
        location,
        showAs: tentative ? "tentative" : "busy"
      },
      externalId
    ).catch((caught: unknown) => ({
      id: "",
      status: "failed" as const,
      error: caught instanceof Error ? caught.message : "Calendar sync failed."
    }));

    if (result.status === "skipped_unconfigured") {
      counts.failed += 1;
      continue;
    }

    const payload = {
      booking_session_id: sessionId,
      provider: "outlook",
      external_event_id: result.status === "synced" ? result.id : externalId,
      sync_status: result.status,
      last_synced_at: result.status === "synced" ? now : existing?.last_synced_at ?? null,
      last_error: "error" in result ? String(result.error).slice(0, 500) : null
    };

    if (existing) {
      await admin.from("calendar_events").update(payload).eq("id", existing.id);
    } else {
      await admin.from("calendar_events").insert(payload);
    }

    if (result.status === "synced") {
      counts[externalId ? "updated" : "added"] += 1;
    } else {
      counts.failed += 1;
    }
  }
}

export async function syncSessionsToCalendar(sessionIds: string[]): Promise<CalendarSyncCounts> {
  const counts: CalendarSyncCounts = { added: 0, updated: 0, removed: 0, failed: 0 };
  const admin = createAdminClient();
  const ids = [...new Set(sessionIds.filter(Boolean))];

  if (!admin || !config.isMicrosoftGraphConfigured || ids.length === 0) {
    return counts;
  }

  // Small chunks, a few at a time, to stay well inside Microsoft's limits.
  const chunks = Array.from({ length: Math.ceil(ids.length / 10) }, (_, index) =>
    ids.slice(index * 10, index * 10 + 10)
  );

  for (let index = 0; index < chunks.length; index += 3) {
    await Promise.all(chunks.slice(index, index + 3).map((chunk) => syncChunk(admin, chunk, counts)));
  }

  return counts;
}

export async function syncBookingsToCalendar(bookingIds: string[]) {
  const admin = createAdminClient();
  const ids = [...new Set(bookingIds.filter(Boolean))];

  if (!admin || ids.length === 0) {
    return { added: 0, updated: 0, removed: 0, failed: 0 };
  }

  const { data } = await admin.from("booking_sessions").select("id").in("booking_request_id", ids);
  return syncSessionsToCalendar((data ?? []).map((row) => row.id as string));
}

// Runs after the response is sent, so saving a booking is never slowed down
// or blocked by Outlook.
export function scheduleCalendarSync(target: { bookingIds?: string[]; sessionIds?: string[] }) {
  if (!config.isMicrosoftGraphConfigured) {
    return;
  }

  after(async () => {
    try {
      if (target.sessionIds?.length) await syncSessionsToCalendar(target.sessionIds);
      if (target.bookingIds?.length) await syncBookingsToCalendar(target.bookingIds);
    } catch {
      console.error("[calendar] Background calendar sync failed.");
    }
  });
}

// Deleting bookings cascades their calendar rows, so read the Outlook event
// ids before deleting, then remove them once the delete has succeeded.
export async function collectCalendarEventIdsForBookings(bookingIds: string[]) {
  const admin = createAdminClient();

  if (!admin || !config.isMicrosoftGraphConfigured || bookingIds.length === 0) {
    return [];
  }

  const { data: sessions } = await admin.from("booking_sessions").select("id").in("booking_request_id", bookingIds);
  const sessionIds = (sessions ?? []).map((row) => row.id as string);

  if (sessionIds.length === 0) {
    return [];
  }

  const rows = await loadCalendarRows(admin, sessionIds);
  return [...rows.values()].map((row) => row.external_event_id).filter(isOutlookEventId);
}

export function scheduleOutlookEventRemoval(eventIds: string[]) {
  if (eventIds.length === 0) {
    return;
  }

  after(async () => {
    for (const eventId of eventIds) {
      await deleteOutlookCalendarEvent(eventId).catch(() => false);
    }
  });
}

// Sessions whose calendar event is missing or older than their last change,
// newest first. Used by the hourly cron and the Settings "Sync" button.
export async function reconcileCalendar(limit: number) {
  const admin = createAdminClient();

  if (!admin || !config.isMicrosoftGraphConfigured) {
    return { counts: { added: 0, updated: 0, removed: 0, failed: 0 }, remaining: 0, configured: false };
  }

  const [sessions, bookings, calendarRows] = await Promise.all([
    fetchAllRows("sessions for calendar", (from, to) =>
      admin
        .from("booking_sessions")
        .select("id, booking_request_id, status, starts_at, updated_at")
        .order("starts_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows("bookings for calendar", (from, to) =>
      admin.from("booking_requests").select("id, updated_at").order("id", { ascending: true }).range(from, to)
    ),
    loadCalendarRows(admin)
  ]);
  const bookingUpdatedAt = new Map(bookings.map((booking) => [booking.id as string, booking.updated_at as string]));
  const due = sessions
    .filter((session) => {
      const row = calendarRows.get(session.id as string);

      if (REMOVED_STATUSES.has(session.status as string)) {
        return Boolean(row && isOutlookEventId(row.external_event_id));
      }

      if (!row?.last_synced_at || row.sync_status !== "synced") {
        return true;
      }

      const syncedAt = new Date(row.last_synced_at as string).getTime();
      const changedAt = Math.max(
        new Date(session.updated_at as string).getTime(),
        new Date(bookingUpdatedAt.get(session.booking_request_id as string) ?? 0).getTime()
      );
      return changedAt > syncedAt;
    })
    .map((session) => session.id as string);

  const counts = await syncSessionsToCalendar(due.slice(0, limit));
  return { counts, remaining: Math.max(0, due.length - limit), configured: true };
}
