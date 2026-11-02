"use server";

import { createHash } from "node:crypto";
import { updateTag } from "next/cache";
import { z } from "zod";
import { PLATFORM_DATA_TAG } from "@/lib/services/cache-tags";
import { requirePortalAccess } from "@/lib/services/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailDeliveryContext } from "@/lib/services/email-delivery-context";
import { SCHOOL_REPLY_TO } from "@/lib/services/email-triggers";
import { sendSchoolSessionEmails } from "@/lib/services/school-session-email";
import { sendTransactionalEmail, renderEmailEventHtml, type EmailEventInput } from "@/lib/services/email";

function adminClient() {
  const admin = createAdminClient();
  if (!admin) throw new Error("Email database is unavailable.");
  return admin;
}
function eventFor(status: string) {
  if (["confirmed", "ambassador_assigned"].includes(status)) return "confirmed" as const;
  if (["requested", "tentative", "applied", "ambassador_needed"].includes(status)) return "tentative" as const;
  if (["cancelled", "declined"].includes(status)) return "cancelled" as const;
  throw new Error("No booking status email is available for this session status.");
}
async function capture(sessionId: string, kind: "status" | "feedback" = "status") {
  const admin = adminClient();
  const { data: session, error } = await admin.from("booking_sessions")
    .select("booking_request_id, status, ends_at").eq("id", sessionId).single();
  if (error) throw new Error("Booking session could not be loaded.");
  if (kind === "feedback" && (!["completed_pending_report", "report_submitted", "payment_pending", "paid", "closed"].includes(session.status) || Date.parse(session.ends_at) > Date.now())) {
    throw new Error("Feedback emails are available after a session is completed.");
  }
  const messages: EmailEventInput[] = [];
  await emailDeliveryContext.run({ preview: messages }, () =>
    sendSchoolSessionEmails(session.booking_request_id, [sessionId], kind === "feedback" ? "feedback" : eventFor(session.status)));
  if (messages.length !== 1) throw new Error("A single email preview could not be prepared.");
  return { session, message: messages[0] };
}
function fingerprint(message: EmailEventInput) {
  // Personal notes are saved with the preview, independently of booking/template data.
  return createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(message).filter(([key]) => key !== "notes").sort(([a], [b]) => a.localeCompare(b))))).digest("hex");
}

// Falls back to the pre-0053 columns so history still loads before that
// migration is applied (those rows simply have no viewable content).
async function loadEmailLogs(bookingRequestId: string, sessionId: string) {
  const query = (columns: string) => adminClient().from("email_logs").select(columns)
    .or(`related_booking_request_id.eq.${bookingRequestId},related_booking_session_id.eq.${sessionId}`)
    .order("created_at", { ascending: false });
  const base = "id, recipient_email, template_key, status, created_at, sent_at, error_message, related_booking_session_id";
  type LogRow = { id: string; recipient_email: string; template_key: string; status: string; created_at: string; sent_at: string | null; error_message: string | null; related_booking_session_id: string | null; subject?: string | null };
  const result = await query(`${base}, subject`).returns<LogRow[]>();
  if (result.error && /subject/.test(result.error.message)) return query(base).returns<LogRow[]>();
  return result;
}

export async function loadBookingEmailsAction(sessionId: string) {
  await requirePortalAccess("staff");
  const admin = adminClient();
  z.uuid().parse(sessionId);
  const { data: session, error } = await admin.from("booking_sessions")
    .select("booking_request_id, status, ends_at").eq("id", sessionId).single();
  if (error) throw new Error("Booking session could not be loaded.");
  const [{ data: booking, error: bookingError }, { data: logs, error: logError }, { data: attempts, error: attemptError }] = await Promise.all([
    admin.from("booking_requests").select("reference_code, manual_email_only, import_batch_id, contact_position, school_contacts!booking_requests_primary_contact_id_fkey(full_name,email,position)").eq("id", session.booking_request_id).single(),
    loadEmailLogs(session.booking_request_id, sessionId),
    admin.from("booking_email_sends").select("id, status, created_at, sent_at, error_message, payload")
      .eq("booking_session_id", sessionId).neq("status", "preview").order("created_at", { ascending: false })
  ]);
  if (bookingError || logError || attemptError) throw new Error("Email history could not be loaded.");
  let available = true;
  try { eventFor(session.status); } catch { available = false; }
  return { booking, available, feedbackAvailable: ["completed_pending_report", "report_submitted", "payment_pending", "paid", "closed"].includes(session.status) && Date.parse(session.ends_at) <= Date.now(), history: [
    ...(logs ?? []).filter(log => !log.related_booking_session_id || log.related_booking_session_id === sessionId)
      // Content is only stored for emails logged after 0053; failed sends have none worth showing.
      .map(log => ({ ...log, source: "log" as const, has_content: Boolean(log.subject) && log.status === "sent" })),
    ...(attempts ?? []).map(attempt => {
      const payload = attempt.payload as EmailEventInput;
      return { id: attempt.id, status: attempt.status, created_at: attempt.created_at, sent_at: attempt.sent_at, error_message: attempt.error_message, recipient_email: payload.recipientEmail, template_key: payload.templateKey, subject: payload.subject, source: "send" as const, has_content: true };
    })
  ].sort((a,b) => b.created_at.localeCompare(a.created_at)) };
}

// Staff-only: the stored content of one email from the booking's history.
export async function loadSentEmailContentAction(source: "log" | "send", id: string) {
  await requirePortalAccess("staff");
  z.enum(["log", "send"]).parse(source);
  z.uuid().parse(id);
  const admin = adminClient();
  if (source === "log") {
    const { data, error } = await admin.from("email_logs")
      .select("recipient_email, subject, html_body, sent_at, created_at").eq("id", id).single();
    if (error || !data.html_body) throw new Error("This email's content wasn't saved.");
    return { recipient: data.recipient_email as string, subject: (data.subject as string | null) ?? "", sentAt: (data.sent_at ?? data.created_at) as string, html: data.html_body as string };
  }
  const { data, error } = await admin.from("booking_email_sends")
    .select("payload, sent_at, created_at").eq("id", id).neq("status", "preview").single();
  if (error) throw new Error("This email could not be loaded.");
  const payload = data.payload as EmailEventInput;
  return { recipient: payload.recipientEmail, subject: payload.subject, sentAt: (data.sent_at ?? data.created_at) as string, html: renderEmailEventHtml(payload) };
}

export async function previewBookingEmailAction(sessionId: string, kind: "status" | "feedback" = "status", notes = "") {
  const actor = await requirePortalAccess("staff");
  z.uuid().parse(sessionId);
  z.enum(["status", "feedback"]).parse(kind);
  const validatedNotes = z.string().max(2000, "Notes must be 2,000 characters or fewer.").parse(notes);
  const { session, message } = await capture(sessionId, kind);
  if (validatedNotes.trim()) message.notes = validatedNotes.trim();
  const { data, error } = await adminClient().from("booking_email_sends").insert({
    actor_id: actor.id, booking_request_id: session.booking_request_id,
    booking_session_id: sessionId, session_status: session.status, payload: message
  }).select("id").single();
  if (error) throw new Error("Email preview could not be saved. Nothing was sent.");
  return { id: data.id as string, recipient: message.recipientEmail, subject: message.subject,
    reference: message.bookingReference, html: renderEmailEventHtml(message), kind, notes: validatedNotes };
}

export async function confirmBookingEmailAction(previewId: string) {
  const actor = await requirePortalAccess("staff");
  z.uuid().parse(previewId);
  const admin = adminClient();
  const { data: draft, error } = await admin.from("booking_email_sends").select("*")
    .eq("id", previewId).eq("actor_id", actor.id).single();
  if (error) throw new Error("Email preview was not found.");
  if (draft.status !== "preview") throw new Error("This send has already been submitted. Check its outcome in email history.");
  if (Date.parse(draft.expires_at) < Date.now()) throw new Error("Preview expired. Please create a new preview.");
  const payload = draft.payload as EmailEventInput;
  const current = await capture(draft.booking_session_id, payload.templateKey === "school_feedback_request" ? "feedback" : "status");
  if (current.session.status !== draft.session_status || fingerprint(current.message) !== fingerprint(payload)) {
    throw new Error("Booking details or email template changed. Please preview the updated email before sending.");
  }
  const { data: claimed, error: claimError } = await admin.from("booking_email_sends")
    .update({ status: "sending" }).eq("id", draft.id).eq("status", "preview")
    .gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
  if (claimError || !claimed) throw new Error("This email is already being sent or the preview has expired.");
  let status = "failed";
  let failure: string | null = null;
  let providerMessageId: string | null = null;
  try {
    const result = await emailDeliveryContext.run({ manualBookingId: draft.booking_request_id }, () => sendTransactionalEmail({ ...payload, replyTo: SCHOOL_REPLY_TO }));
    providerMessageId = result.id;
    status = result.status === "sent" ? "sent" : "failed";
    failure = "error" in result ? result.error : status === "failed" ? "Email was not sent." : null;
  } catch {
    failure = "Delivery could not be confirmed. Check provider logs before retrying.";
  }
  const { error: saveError } = await admin.from("booking_email_sends").update({
    status, error_message: failure, provider_message_id: providerMessageId, sent_at: status === "sent" ? new Date().toISOString() : null
  }).eq("id", draft.id);
  if (saveError) throw new Error("Delivery outcome could not be saved. Do not retry until provider logs have been checked.");
  // Refresh the bookings list's "N emails sent" count.
  updateTag(PLATFORM_DATA_TAG);
  if (status !== "sent") throw new Error(failure || "Email could not be sent.");
  return { message: "Email sent successfully." };
}
