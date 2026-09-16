"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import { requirePortalAccess } from "@/lib/services/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailDeliveryContext } from "@/lib/services/email-delivery-context";
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
  return createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(message).sort(([a], [b]) => a.localeCompare(b))))).digest("hex");
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
    admin.from("email_logs").select("id, recipient_email, template_key, status, created_at, sent_at, error_message, related_booking_session_id")
      .or(`related_booking_request_id.eq.${session.booking_request_id},related_booking_session_id.eq.${sessionId}`).order("created_at", { ascending: false }),
    admin.from("booking_email_sends").select("id, status, created_at, sent_at, error_message, payload")
      .eq("booking_session_id", sessionId).neq("status", "preview").order("created_at", { ascending: false })
  ]);
  if (bookingError || logError || attemptError) throw new Error("Email history could not be loaded.");
  let available = true;
  try { eventFor(session.status); } catch { available = false; }
  return { booking, available, feedbackAvailable: ["completed_pending_report", "report_submitted", "payment_pending", "paid", "closed"].includes(session.status) && Date.parse(session.ends_at) <= Date.now(), history: [
    ...(logs ?? []).filter(log => !log.related_booking_session_id || log.related_booking_session_id === sessionId),
    ...(attempts ?? []).map(attempt => {
      const payload = attempt.payload as EmailEventInput;
      return { id: attempt.id, status: attempt.status, created_at: attempt.created_at, sent_at: attempt.sent_at, error_message: attempt.error_message, recipient_email: payload.recipientEmail, template_key: payload.templateKey };
    })
  ].sort((a,b) => b.created_at.localeCompare(a.created_at)) };
}

export async function previewBookingEmailAction(sessionId: string, kind: "status" | "feedback" = "status") {
  const actor = await requirePortalAccess("staff");
  z.uuid().parse(sessionId);
  z.enum(["status", "feedback"]).parse(kind);
  const { session, message } = await capture(sessionId, kind);
  const { data, error } = await adminClient().from("booking_email_sends").insert({
    actor_id: actor.id, booking_request_id: session.booking_request_id,
    booking_session_id: sessionId, session_status: session.status, payload: message
  }).select("id").single();
  if (error) throw new Error("Email preview could not be saved. Nothing was sent.");
  return { id: data.id as string, recipient: message.recipientEmail, subject: message.subject,
    reference: message.bookingReference, html: renderEmailEventHtml(message) };
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
    const result = await emailDeliveryContext.run({ manualBookingId: draft.booking_request_id }, () => sendTransactionalEmail(payload));
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
  if (status !== "sent") throw new Error(failure || "Email could not be sent.");
  return { message: "Email sent successfully." };
}
