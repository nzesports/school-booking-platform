import { createAdminClient } from "@/lib/supabase/admin";

import { sendTransactionalEmail } from "./email";

type EmailResult = Awaited<ReturnType<typeof sendTransactionalEmail>>;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function logEmail(result: EmailResult, related?: {
  bookingRequestId?: string;
  bookingSessionId?: string;
  recipientType?: string;
}) {
  const admin = createAdminClient();

  if (!admin) {
    return;
  }

  await admin.from("email_logs").insert({
    template_key: result.templateKey,
    recipient_email: result.recipientEmail,
    recipient_type: related?.recipientType ?? null,
    related_booking_request_id: related?.bookingRequestId ?? null,
    related_booking_session_id: related?.bookingSessionId ?? null,
    brevo_message_id: result.id,
    status: result.status,
    error_message: "error" in result ? result.error : null,
    sent_at: result.status === "sent" ? new Date().toISOString() : null
  });
}

async function renderTemplate(key: string, vars: Record<string, string>) {
  const admin = createAdminClient();

  if (!admin) {
    return null;
  }

  const { data } = await admin
    .from("email_templates")
    .select("subject, body_html, is_active")
    .eq("template_key", key)
    .maybeSingle();

  if (!data?.is_active) {
    return null;
  }

  const substitute = (value: string) =>
    value.replace(/\{\{(\w+)\}\}/g, (_, placeholder: string) =>
      escapeHtml(vars[placeholder] ?? "")
    );

  return {
    subject: substitute(data.subject as string),
    html: substitute(data.body_html as string)
  };
}

export async function sendBookingRequestReceivedEmail(opts: {
  contactEmail: string;
  contactName: string;
  schoolName: string;
  bookingId: string;
}) {
  const contactName = escapeHtml(opts.contactName);
  const schoolName = escapeHtml(opts.schoolName);
  const bookingId = escapeHtml(opts.bookingId);
  const template = await renderTemplate("booking_request_received", {
    contactName: opts.contactName,
    schoolName: opts.schoolName,
    bookingId: opts.bookingId
  });
  const result = await sendTransactionalEmail({
    templateKey: "booking_request_received",
    recipientEmail: opts.contactEmail,
    subject: template?.subject ?? "We've received your booking request",
    html:
      template?.html ??
      `
      <p>Hi ${contactName},</p>
      <p>Thank you for your booking request for <strong>${schoolName}</strong>.</p>
      <p>Your reference number is <strong>${bookingId}</strong>.</p>
      <p>Our team will be in touch within 2 business days to confirm your session.</p>
      <p>If you want to access the school portal, sign up with this same email address after
      verification and your school contact record will be linked automatically.</p>
    `
  });

  await logEmail(result, {
    bookingRequestId: opts.bookingId,
    recipientType: "school"
  });
  return result;
}

export async function sendBookingConfirmedEmail(opts: {
  contactEmail: string;
  contactName: string;
  schoolName: string;
  sessionDate: string;
  presentationTitle: string;
  bookingId?: string;
  bookingSessionId?: string;
}) {
  const contactName = escapeHtml(opts.contactName);
  const schoolName = escapeHtml(opts.schoolName);
  const sessionDate = escapeHtml(opts.sessionDate);
  const presentationTitle = escapeHtml(opts.presentationTitle);
  const template = await renderTemplate("school_booking_confirmed", {
    contactName: opts.contactName,
    schoolName: opts.schoolName,
    sessionDate: opts.sessionDate,
    presentationTitle: opts.presentationTitle,
    bookingId: opts.bookingId ?? "",
    bookingSessionId: opts.bookingSessionId ?? ""
  });
  const result = await sendTransactionalEmail({
    templateKey: "school_booking_confirmed",
    recipientEmail: opts.contactEmail,
    subject: template?.subject ?? "Your session is confirmed",
    html:
      template?.html ??
      `
      <p>Hi ${contactName},</p>
      <p>Great news: your <strong>${presentationTitle}</strong> session for
      <strong>${schoolName}</strong> on <strong>${sessionDate}</strong> is now confirmed.</p>
      <p>We'll send you a reminder closer to the date.</p>
    `
  });

  await logEmail(result, {
    bookingRequestId: opts.bookingId,
    bookingSessionId: opts.bookingSessionId,
    recipientType: "school"
  });
  return result;
}

export async function sendBookingCancelledEmail(opts: {
  contactEmail: string;
  contactName: string;
  schoolName: string;
  sessionDate: string;
  presentationTitle: string;
  bookingId?: string;
  bookingSessionId?: string;
}) {
  const contactName = escapeHtml(opts.contactName);
  const schoolName = escapeHtml(opts.schoolName);
  const sessionDate = escapeHtml(opts.sessionDate);
  const presentationTitle = escapeHtml(opts.presentationTitle);
  const template = await renderTemplate("school_booking_cancelled", {
    contactName: opts.contactName,
    schoolName: opts.schoolName,
    sessionDate: opts.sessionDate,
    presentationTitle: opts.presentationTitle,
    bookingId: opts.bookingId ?? "",
    bookingSessionId: opts.bookingSessionId ?? ""
  });
  const result = await sendTransactionalEmail({
    templateKey: "school_booking_cancelled",
    recipientEmail: opts.contactEmail,
    subject: template?.subject ?? "Your session has been cancelled",
    html:
      template?.html ??
      `
      <p>Hi ${contactName},</p>
      <p>Your <strong>${presentationTitle}</strong> session for
      <strong>${schoolName}</strong> on <strong>${sessionDate}</strong> has been cancelled.</p>
      <p>If this was unexpected, reply to this email and our team will help.</p>
    `
  });

  await logEmail(result, {
    bookingRequestId: opts.bookingId,
    bookingSessionId: opts.bookingSessionId,
    recipientType: "school"
  });
  return result;
}

export async function sendAmbassadorAssignedEmail(opts: {
  ambassadorEmail: string;
  ambassadorName: string;
  schoolName: string;
  sessionDate: string;
  sessionAddress: string;
  presentationTitle: string;
  bookingSessionId: string;
}) {
  const ambassadorName = escapeHtml(opts.ambassadorName);
  const schoolName = escapeHtml(opts.schoolName);
  const sessionDate = escapeHtml(opts.sessionDate);
  const sessionAddress = escapeHtml(opts.sessionAddress || "To be confirmed");
  const presentationTitle = escapeHtml(opts.presentationTitle);
  const template = await renderTemplate("ambassador_assignment_confirmation", {
    ambassadorName: opts.ambassadorName,
    schoolName: opts.schoolName,
    sessionDate: opts.sessionDate,
    sessionAddress: opts.sessionAddress || "To be confirmed",
    presentationTitle: opts.presentationTitle,
    bookingSessionId: opts.bookingSessionId
  });
  const result = await sendTransactionalEmail({
    templateKey: "ambassador_assignment_confirmation",
    recipientEmail: opts.ambassadorEmail,
    subject: template?.subject ?? `Session confirmed: ${opts.presentationTitle} at ${opts.schoolName}`,
    html:
      template?.html ??
      `
      <p>Hi ${ambassadorName},</p>
      <p>You've been assigned to deliver <strong>${presentationTitle}</strong>
      at <strong>${schoolName}</strong> on <strong>${sessionDate}</strong>.</p>
      <p>Location: ${sessionAddress}</p>
    `
  });

  await logEmail(result, {
    bookingSessionId: opts.bookingSessionId,
    recipientType: "ambassador"
  });
  return result;
}
