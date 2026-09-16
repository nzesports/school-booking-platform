import { bookingEmailPolicy } from "./booking-email-policy";
import { emailDeliveryContext } from "./email-delivery-context";
import { relationOne } from "@/lib/supabase/relation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils";
import {
  sendBookingCancelledEmail,
  sendBookingConfirmedEmail,
  sendBookingRequestReceivedEmail,
  sendBookingRescheduledEmail,
  sendFeedbackRequestEmail,
  sendSchoolRescheduleNoticeEmail
} from "./email-triggers";

// One notification per affected session, with its own calendar event. Always
// use the booking's contact rather than an unrelated contact at the school.
export async function sendSchoolSessionEmails(
  bookingId: string,
  sessionIds: string[],
  event: "tentative" | "confirmed" | "cancelled" | "rescheduled" | "feedback" | "reschedule_requested" | "reschedule_declined",
  requestedDate?: string
) {
  if (!sessionIds.length) return;
  const context = emailDeliveryContext.getStore();
  if (!context?.preview) {
    const policy = await bookingEmailPolicy(bookingId);
    if (policy?.manualOnly && context?.manualBookingId !== policy.id
      && !(policy.imported && context?.statusChangeBookingId === policy.id)) return;
  }
  const admin = createAdminClient();
  if (!admin) throw new Error("Email database is not configured.");
  const { data: booking, error } = await admin.from("booking_requests")
    .select("reference_code, primary_contact_id, school_id").eq("id", bookingId).single();
  if (error) throw error;
  const [contactResult, schoolResult, sessionsResult] = await Promise.all([
    booking.primary_contact_id
      ? admin.from("school_contacts").select("email, full_name, phone").eq("id", booking.primary_contact_id).single()
      : admin.from("school_contacts").select("email, full_name, phone").eq("school_id", booking.school_id)
          .eq("is_primary", true).limit(1).single(),
    admin.from("schools").select("name, regions(name)").eq("id", booking.school_id).single(),
    admin.from("booking_sessions").select("id, starts_at, ends_at, presentation_type_id, status, expected_student_count, year_levels, ambassador_profiles(display_name, profiles!ambassador_profiles_user_id_fkey(full_name))")
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
  if (event === "tentative") {
    const result = await sendBookingRequestReceivedEmail({
      contactEmail: contact.email as string,
      contactName: (contact.full_name as string) || "there",
      contactPhone: (contact.phone as string) || "",
      schoolName: schoolResult.data.name as string,
      bookingId,
      referenceCode: booking.reference_code as string,
      sessions: sessions.map((session) => ({
        presentationTitle: (titles.get(session.presentation_type_id) as string) || "NZ Esports presentation",
        regionName: relationOne(schoolResult.data.regions)?.name || "",
        startsAt: session.starts_at as string,
        endsAt: session.ends_at as string,
        yearLevels: (session.year_levels as string) || "",
        expectedStudentCount: Number(session.expected_student_count)
      }))
    });
    if (result.status !== "sent") {
      throw new Error("Pending booking notification could not be completed.");
    }
    return;
  }
  const send = {
    confirmed: sendBookingConfirmedEmail, cancelled: sendBookingCancelledEmail,
    rescheduled: sendBookingRescheduledEmail, feedback: sendFeedbackRequestEmail,
    reschedule_requested: (opts: Parameters<typeof sendBookingCancelledEmail>[0]) =>
      sendSchoolRescheduleNoticeEmail({ ...opts, decision: "requested", requestedDate }),
    reschedule_declined: (opts: Parameters<typeof sendBookingCancelledEmail>[0]) =>
      sendSchoolRescheduleNoticeEmail({ ...opts, decision: "declined" })
  }[event];
  const results = await Promise.allSettled(sessions.map((session) => send({
    ambassadorName: relationOne(relationOne(session.ambassador_profiles)?.profiles)?.full_name || relationOne(session.ambassador_profiles)?.display_name || undefined,
    contactEmail: contact.email as string,
    contactName: (contact.full_name as string) || "there",
    schoolName: schoolResult.data.name as string,
    presentationTitle: (titles.get(session.presentation_type_id) as string) || "NZ Esports presentation",
    sessionDate: formatDateTime(session.starts_at as string),
    sessionStartsAt: session.starts_at as string,
    sessionEndsAt: session.ends_at as string,
    expectedStudentCount: session.expected_student_count == null ? null : Number(session.expected_student_count),
    yearLevels: (session.year_levels as string) || "",
    isConfirmed: session.status === "confirmed",
    bookingId,
    bookingSessionId: session.id as string,
    referenceCode: booking.reference_code as string
  })));
  if (results.some((result) => result.status === "rejected" || result.value.status !== "sent")) {
    throw new Error("One or more session notifications could not be completed.");
  }
}

// Called only after normal booking mutations, never by the data-only importer
// or scheduled reminders. Keep the persisted import guard for background mail.
export async function sendSchoolStatusChangeEmails(
  ...args: Parameters<typeof sendSchoolSessionEmails>
) {
  if (args[2] === "feedback") return sendSchoolSessionEmails(...args);
  return emailDeliveryContext.run(
    { ...emailDeliveryContext.getStore(), statusChangeBookingId: args[0] },
    () => sendSchoolSessionEmails(...args)
  );
}
