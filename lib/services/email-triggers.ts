import { config } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

import { buildCalendarLinksEmailHtml } from "./calendar-links";
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

// htmlVars are substituted without escaping — only for server-built HTML
// blocks (never user input), e.g. the add-to-calendar links.
async function renderTemplate(
  key: string,
  vars: Record<string, string>,
  htmlVars: Record<string, string> = {}
) {
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
      placeholder in htmlVars
        ? htmlVars[placeholder]
        : escapeHtml(vars[placeholder] ?? "")
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

// Builds the add-to-calendar links block when the trigger got real session
// times; the .ics link needs the session id for the hosted download route.
function calendarLinksBlock(opts: {
  presentationTitle: string;
  schoolName: string;
  sessionStartsAt?: string;
  sessionEndsAt?: string;
  bookingSessionId?: string;
}) {
  if (!opts.sessionStartsAt) {
    return "";
  }

  const endsAt =
    opts.sessionEndsAt ??
    new Date(new Date(opts.sessionStartsAt).getTime() + 60 * 60 * 1000).toISOString();

  return buildCalendarLinksEmailHtml(
    {
      title: `${opts.presentationTitle} — NZ Esports presentation`,
      description: `NZ Esports school presentation at ${opts.schoolName}. Manage your booking: ${config.siteUrl}/school/bookings`,
      location: opts.schoolName,
      startsAt: opts.sessionStartsAt,
      endsAt
    },
    opts.bookingSessionId ? `${config.siteUrl}/api/calendar/${opts.bookingSessionId}` : undefined
  );
}

export async function sendBookingConfirmedEmail(opts: {
  contactEmail: string;
  contactName: string;
  schoolName: string;
  sessionDate: string;
  presentationTitle: string;
  bookingId?: string;
  bookingSessionId?: string;
  sessionStartsAt?: string;
  sessionEndsAt?: string;
}) {
  const contactName = escapeHtml(opts.contactName);
  const schoolName = escapeHtml(opts.schoolName);
  const sessionDate = escapeHtml(opts.sessionDate);
  const presentationTitle = escapeHtml(opts.presentationTitle);
  const calendarLinks = calendarLinksBlock(opts);
  const template = await renderTemplate(
    "school_booking_confirmed",
    {
      contactName: opts.contactName,
      schoolName: opts.schoolName,
      sessionDate: opts.sessionDate,
      presentationTitle: opts.presentationTitle,
      bookingId: opts.bookingId ?? "",
      bookingSessionId: opts.bookingSessionId ?? ""
    },
    { calendarLinks }
  );
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
      ${calendarLinks ? `<p>${calendarLinks}</p>` : ""}
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

// Sent when staff mark a booking delivered, inviting the school to complete
// the post-session feedback form in their portal.
export async function sendFeedbackRequestEmail(opts: {
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
  // Absolute public link — works whether or not the school has a portal login.
  const reviewUrl = opts.bookingSessionId
    ? `${config.siteUrl}/feedback/${opts.bookingSessionId}`
    : `${config.siteUrl}/school/reviews`;
  const template = await renderTemplate("school_feedback_request", {
    contactName: opts.contactName,
    schoolName: opts.schoolName,
    sessionDate: opts.sessionDate,
    presentationTitle: opts.presentationTitle,
    reviewUrl
  });
  const result = await sendTransactionalEmail({
    templateKey: "school_feedback_request",
    recipientEmail: opts.contactEmail,
    subject: template?.subject ?? `How was your ${opts.presentationTitle} session?`,
    html:
      template?.html ??
      `
      <p>Hi ${contactName},</p>
      <p>Thanks for hosting the <strong>${presentationTitle}</strong> session at
      <strong>${schoolName}</strong> on <strong>${sessionDate}</strong>.</p>
      <p>We'd love your feedback — it takes about two minutes and helps us keep
      improving for schools across Aotearoa.</p>
      <p><a href="${escapeHtml(reviewUrl)}">Leave your feedback here</a> — no login needed.</p>
      <p>If your school has a portal account you can also leave it under
      Bookings &rarr; Leave review.</p>
    `
  });

  await logEmail(result, {
    bookingRequestId: opts.bookingId,
    bookingSessionId: opts.bookingSessionId,
    recipientType: "school"
  });
  return result;
}

// Sent when a reschedule request is resolved and the booking is re-confirmed
// with its (new) session time.
export async function sendBookingRescheduledEmail(opts: {
  contactEmail: string;
  contactName: string;
  schoolName: string;
  sessionDate: string;
  presentationTitle: string;
  bookingId?: string;
  bookingSessionId?: string;
  sessionStartsAt?: string;
  sessionEndsAt?: string;
}) {
  const contactName = escapeHtml(opts.contactName);
  const schoolName = escapeHtml(opts.schoolName);
  const sessionDate = escapeHtml(opts.sessionDate);
  const presentationTitle = escapeHtml(opts.presentationTitle);
  const calendarLinks = calendarLinksBlock(opts);
  const template = await renderTemplate(
    "school_booking_rescheduled",
    {
      contactName: opts.contactName,
      schoolName: opts.schoolName,
      sessionDate: opts.sessionDate,
      presentationTitle: opts.presentationTitle
    },
    { calendarLinks }
  );
  const result = await sendTransactionalEmail({
    templateKey: "school_booking_rescheduled",
    recipientEmail: opts.contactEmail,
    subject: template?.subject ?? "Your NZ Esports presentation has been rescheduled",
    html:
      template?.html ??
      `
      <p>Hi ${contactName},</p>
      <p>Your reschedule request has been sorted — the <strong>${presentationTitle}</strong>
      session for <strong>${schoolName}</strong> is now confirmed for
      <strong>${sessionDate}</strong>.</p>
      ${calendarLinks ? `<p>${calendarLinks}</p>` : ""}
      <p>We'll send a reminder closer to the day.</p>
    `
  });

  await logEmail(result, {
    bookingRequestId: opts.bookingId,
    bookingSessionId: opts.bookingSessionId,
    recipientType: "school"
  });
  return result;
}

// Reminder ahead of an upcoming confirmed session (sent by the hourly cron).
export async function sendSessionReminderEmail(opts: {
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
  const template = await renderTemplate("school_session_reminder", {
    contactName: opts.contactName,
    schoolName: opts.schoolName,
    sessionDate: opts.sessionDate,
    presentationTitle: opts.presentationTitle
  });
  const result = await sendTransactionalEmail({
    templateKey: "school_session_reminder",
    recipientEmail: opts.contactEmail,
    subject: template?.subject ?? `Coming up: ${opts.presentationTitle} at your school`,
    html:
      template?.html ??
      `
      <p>Hi ${contactName},</p>
      <p>A quick reminder that the <strong>${presentationTitle}</strong> session at
      <strong>${schoolName}</strong> is coming up on <strong>${sessionDate}</strong>.</p>
      <p>Handy checklist: projector or screen ready, microphone if the space needs one,
      and let the office know our ambassador is visiting.</p>
    `
  });

  await logEmail(result, {
    bookingRequestId: opts.bookingId,
    bookingSessionId: opts.bookingSessionId,
    recipientType: "school"
  });
  return result;
}

// Welcome email after a school creates a portal account.
export async function sendSchoolWelcomeEmail(opts: {
  contactEmail: string;
  contactName: string;
  schoolName: string;
}) {
  const contactName = escapeHtml(opts.contactName);
  const schoolName = escapeHtml(opts.schoolName);
  const loginUrl = `${config.siteUrl}/school`;
  const template = await renderTemplate("school_welcome", {
    contactName: opts.contactName,
    schoolName: opts.schoolName,
    loginUrl
  });
  const result = await sendTransactionalEmail({
    templateKey: "school_welcome",
    recipientEmail: opts.contactEmail,
    subject: template?.subject ?? "Welcome to the NZ Esports booking platform",
    html:
      template?.html ??
      `
      <p>Kia ora ${contactName},</p>
      <p>Welcome! Your school portal account for <strong>${schoolName}</strong> is ready.</p>
      <p>From your portal you can track bookings, request reschedules, access session
      resources, and leave feedback after each visit.</p>
      <p><a href="${escapeHtml(loginUrl)}" target="_blank" style="display:inline-block;background-color:#18a83b;color:#ffffff;padding:12px 26px;border-radius:10px;font-weight:bold;text-decoration:none;">Open your school portal</a></p>
    `
  });

  await logEmail(result, { recipientType: "school" });
  return result;
}

// Confirmation to an ambassador that their application was received.
export async function sendAmbassadorApplicationReceivedEmail(opts: {
  ambassadorEmail: string;
  ambassadorName: string;
}) {
  const ambassadorName = escapeHtml(opts.ambassadorName);
  const template = await renderTemplate("ambassador_application_received", {
    ambassadorName: opts.ambassadorName
  });
  const result = await sendTransactionalEmail({
    templateKey: "ambassador_application_received",
    recipientEmail: opts.ambassadorEmail,
    subject: template?.subject ?? "We've received your ambassador application",
    html:
      template?.html ??
      `
      <p>Kia ora ${ambassadorName},</p>
      <p>Thanks for applying to become an NZ Esports ambassador!</p>
      <p>Our team reviews every application personally — we'll be in touch once yours
      has been looked at. Once approved, you'll get full access to the ambassador
      portal with open bookings, training, and resources.</p>
    `
  });

  await logEmail(result, { recipientType: "ambassador" });
  return result;
}

// Sent when staff approve an ambassador application.
export async function sendAmbassadorApprovedEmail(opts: {
  ambassadorEmail: string;
  ambassadorName: string;
}) {
  const ambassadorName = escapeHtml(opts.ambassadorName);
  const loginUrl = `${config.siteUrl}/ambassador`;
  const template = await renderTemplate("ambassador_approved", {
    ambassadorName: opts.ambassadorName,
    loginUrl
  });
  const result = await sendTransactionalEmail({
    templateKey: "ambassador_approved",
    recipientEmail: opts.ambassadorEmail,
    subject: template?.subject ?? "You're in — welcome to the NZ Esports ambassador team!",
    html:
      template?.html ??
      `
      <p>Kia ora ${ambassadorName},</p>
      <p>Great news — your ambassador application has been <strong>approved</strong>!</p>
      <p>Your ambassador portal is now unlocked: browse open school bookings, complete
      your training modules, and set up your payment details so you're ready for your
      first session.</p>
      <p><a href="${escapeHtml(loginUrl)}" target="_blank" style="display:inline-block;background-color:#18a83b;color:#ffffff;padding:12px 26px;border-radius:10px;font-weight:bold;text-decoration:none;">Open your ambassador portal</a></p>
    `
  });

  await logEmail(result, { recipientType: "ambassador" });
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

export async function sendAmbassadorWithdrawalResolvedEmail(opts: {
  ambassadorEmail: string;
  ambassadorName: string;
  schoolName: string;
  sessionDate: string;
  presentationTitle: string;
  decision: "approved" | "declined";
  staffNote?: string;
  bookingSessionId: string;
}) {
  const ambassadorName = escapeHtml(opts.ambassadorName);
  const schoolName = escapeHtml(opts.schoolName);
  const sessionDate = escapeHtml(opts.sessionDate);
  const presentationTitle = escapeHtml(opts.presentationTitle);
  const staffNote = opts.staffNote ? escapeHtml(opts.staffNote) : "";
  const portalUrl =
    opts.decision === "approved"
      ? `${config.siteUrl}/ambassador/open-bookings`
      : `${config.siteUrl}/ambassador/upcoming`;
  const templateKey =
    opts.decision === "approved"
      ? "ambassador_withdrawal_approved"
      : "ambassador_withdrawal_declined";
  const template = await renderTemplate(templateKey, {
    ambassadorName: opts.ambassadorName,
    schoolName: opts.schoolName,
    sessionDate: opts.sessionDate,
    presentationTitle: opts.presentationTitle,
    staffNote: opts.staffNote ?? "No extra note was added.",
    portalUrl
  });
  const result = await sendTransactionalEmail({
    templateKey,
    recipientEmail: opts.ambassadorEmail,
    subject:
      template?.subject ??
      (opts.decision === "approved"
        ? `Withdrawal approved: ${opts.presentationTitle}`
        : `Withdrawal update: ${opts.presentationTitle}`),
    html:
      template?.html ??
      (opts.decision === "approved"
        ? `
      <p>Kia ora ${ambassadorName},</p>
      <p>Your withdrawal from <strong>${presentationTitle}</strong> at
      <strong>${schoolName}</strong> on <strong>${sessionDate}</strong> has been approved.</p>
      <p>The session has been reopened for another ambassador. Thank you for letting us know.</p>
      <p><a href="${escapeHtml(portalUrl)}">Open your ambassador portal</a></p>
    `
        : `
      <p>Kia ora ${ambassadorName},</p>
      <p>We've reviewed your withdrawal request for <strong>${presentationTitle}</strong>
      at <strong>${schoolName}</strong> on <strong>${sessionDate}</strong>.</p>
      <p>You remain assigned to this session for now.</p>
      ${staffNote ? `<p><strong>Note from staff:</strong> ${staffNote}</p>` : ""}
      <p><a href="${escapeHtml(portalUrl)}">Open your upcoming sessions</a></p>
    `)
  });

  await logEmail(result, {
    bookingSessionId: opts.bookingSessionId,
    recipientType: "ambassador"
  });
  return result;
}

export async function sendInvoiceToFinanceEmail(opts: {
  toEmail: string;
  ccEmails: string[];
  invoiceNumber: string;
  ambassadorName: string;
  sessionDescription: string;
  amountLabel: string;
  bookingSessionId: string;
  attachment: { name: string; contentBase64: string };
}) {
  const invoiceNumber = escapeHtml(opts.invoiceNumber);
  const ambassadorName = escapeHtml(opts.ambassadorName);
  const sessionDescription = escapeHtml(opts.sessionDescription);
  const amountLabel = escapeHtml(opts.amountLabel);
  const template = await renderTemplate("invoice_to_finance", {
    invoiceNumber: opts.invoiceNumber,
    ambassadorName: opts.ambassadorName,
    sessionDescription: opts.sessionDescription,
    amountLabel: opts.amountLabel
  });
  const result = await sendTransactionalEmail({
    templateKey: "invoice_to_finance",
    recipientEmail: opts.toEmail,
    cc: opts.ccEmails,
    attachments: [opts.attachment],
    subject: template?.subject ?? `Ambassador invoice ${opts.invoiceNumber} - ${opts.ambassadorName}`,
    html:
      template?.html ??
      `
      <p>Kia ora,</p>
      <p>Invoice <strong>${invoiceNumber}</strong> from <strong>${ambassadorName}</strong>
      for <strong>${sessionDescription}</strong> is attached.</p>
      <p>Amount payable: <strong>${amountLabel}</strong></p>
      <p>Please process this payment and reply to confirm once complete.</p>
    `
  });

  await logEmail(result, {
    bookingSessionId: opts.bookingSessionId,
    recipientType: "finance"
  });
  return result;
}
