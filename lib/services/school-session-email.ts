import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils";
import {
  sendBookingCancelledEmail,
  sendBookingConfirmedEmail,
  sendBookingRescheduledEmail,
  sendFeedbackRequestEmail,
  sendSchoolRescheduleNoticeEmail
} from "./email-triggers";

// One notification per affected session, with its own calendar event. Always
// use the booking's contact rather than an unrelated contact at the school.
export async function sendSchoolSessionEmails(
  bookingId: string,
  sessionIds: string[],
  event: "confirmed" | "cancelled" | "rescheduled" | "feedback" | "reschedule_requested" | "reschedule_declined",
  requestedDate?: string
) {
  if (!sessionIds.length) return;
  const admin = createAdminClient();
  if (!admin) throw new Error("Email database is not configured.");
  const { data: booking, error } = await admin.from("booking_requests")
    .select("reference_code, primary_contact_id, school_id").eq("id", bookingId).single();
  if (error) throw error;
  const [contactResult, schoolResult, sessionsResult] = await Promise.all([
    booking.primary_contact_id
      ? admin.from("school_contacts").select("email, full_name").eq("id", booking.primary_contact_id).single()
      : admin.from("school_contacts").select("email, full_name").eq("school_id", booking.school_id)
          .eq("is_primary", true).limit(1).single(),
    admin.from("schools").select("name").eq("id", booking.school_id).single(),
    admin.from("booking_sessions").select("id, starts_at, ends_at, presentation_type_id, status")
      .eq("booking_request_id", bookingId).in("id", sessionIds)
  ]);
  if (contactResult.error) throw contactResult.error;
  if (schoolResult.error) throw schoolResult.error;
  if (sessionsResult.error) throw sessionsResult.error;
  const contact = contactResult.data;
  if (!contact.email) throw new Error("Booking contact has no email address.");
  const sessions = sessionsResult.data ?? [];
  const ids = [...new Set(sessions.map((session) => session.presentation_type_id).filter(Boolean))];
  const { data: presentations, error: presentationError } = await admin.from("presentation_types")
    .select("id, title").in("id", ids);
  if (presentationError) throw presentationError;
  const titles = new Map((presentations ?? []).map((presentation) => [presentation.id, presentation.title]));
  const send = {
    confirmed: sendBookingConfirmedEmail, cancelled: sendBookingCancelledEmail,
    rescheduled: sendBookingRescheduledEmail, feedback: sendFeedbackRequestEmail,
    reschedule_requested: (opts: Parameters<typeof sendBookingCancelledEmail>[0]) =>
      sendSchoolRescheduleNoticeEmail({ ...opts, decision: "requested", requestedDate }),
    reschedule_declined: (opts: Parameters<typeof sendBookingCancelledEmail>[0]) =>
      sendSchoolRescheduleNoticeEmail({ ...opts, decision: "declined" })
  }[event];
  const results = await Promise.allSettled(sessions.map((session) => send({
    contactEmail: contact.email as string,
    contactName: (contact.full_name as string) || "there",
    schoolName: schoolResult.data.name as string,
    presentationTitle: (titles.get(session.presentation_type_id) as string) || "NZ Esports presentation",
    sessionDate: formatDateTime(session.starts_at as string),
    sessionStartsAt: session.starts_at as string,
    sessionEndsAt: session.ends_at as string,
    isConfirmed: session.status === "confirmed",
    bookingId,
    bookingSessionId: session.id as string,
    referenceCode: booking.reference_code as string
  })));
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("One or more session notifications could not be completed.");
  }
}
