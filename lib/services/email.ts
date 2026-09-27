import { bookingEmailPolicy } from "./booking-email-policy";
import { emailDeliveryContext } from "./email-delivery-context";

import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { relationOne } from "@/lib/supabase/relation";
import { config } from "@/lib/env";
import { renderBrandedEmail } from "@/lib/services/email-layout";

export type EmailEventInput = {
  bookingReference?: string;
  bookingRequestId?: string;
  bookingSessionId?: string;
  templateKey: string;
  recipientEmail: string;
  subject: string;
  html: string;
  notes?: string;
  cc?: string[];
  replyTo?: { email: string; name?: string };
  includeUnsubscribe?: boolean;
  attachments?: Array<{ name: string; contentBase64: string }>;
};

export function renderEmailEventHtml(event: Pick<EmailEventInput, "html" | "bookingReference" | "includeUnsubscribe" | "notes">) {
  const reference = event.bookingReference;
  const escapedReference = reference?.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]!);
  const referenceMarker = escapedReference
    ? `<p style="margin:0 0 20px;"><span style="display:inline-block;border:1px solid #d8e4ee;border-radius:8px;background:#f3f7fb;padding:6px 10px;color:#344663;font-size:12px;letter-spacing:0.04em;">Booking ref: <strong style="font-family:monospace;font-size:13px;">${escapedReference}</strong></span></p>`
    : "";

  const escapedNotes = event.notes?.trim().replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]!).replace(/\r\n|\r|\n/g, "<br>");
  const notesSection = escapedNotes
    ? `<div style="margin-top:24px;padding:20px 24px;border:1px solid #c9e7d1;border-radius:14px;background-color:#eef9f1;color:#040F4B;overflow-wrap:anywhere;"><h2 style="margin:0 0 8px;font-size:16px;">Notes</h2><p style="margin:0;">${escapedNotes}</p></div>`
    : "";

  // Keep the closing paragraph last, including for stored email templates.
  const signoff = /<p\b[^>]*>\s*Thanks again,\s*<br\s*\/?>(?:\s|&nbsp;)*(?:The\s+)?NZ Esports team\s*<\/p>/i;
  const body = notesSection && signoff.test(event.html)
    ? event.html.replace(signoff, (closing) => notesSection + closing)
    : event.html + notesSection;

  return renderBrandedEmail(referenceMarker + body, { includeUnsubscribe: event.includeUnsubscribe });
}

export async function sendTransactionalEmail(event: EmailEventInput) {
  // Keep attachment payloads out of the returned event so callers/logs
  // don't hold large base64 blobs.
  const { attachments, cc, replyTo, includeUnsubscribe, ...loggableEvent } = event;

  const context = emailDeliveryContext.getStore();
  if (context?.preview) {
    context.preview.push(event);
    return { id: "preview", status: "sent" as const, ...loggableEvent };
  }
  const policy = await bookingEmailPolicy(event.bookingRequestId, event.bookingSessionId);
  if (policy?.manualOnly && context?.manualBookingId !== policy.id
      && !(policy.imported && context?.statusChangeBookingId === policy.id)) {
    return { id: `email-${randomUUID()}`, status: "suppressed_manual_only" as const, ...loggableEvent };
  }

  if (!config.isBrevoConfigured) {
    console.error("[email] BREVO_API_KEY is missing; notification skipped.", {
      templateKey: event.templateKey
    });
    return {
      id: `email-${randomUUID()}`,
      status: "skipped_unconfigured" as const,
      error: "BREVO_API_KEY is not configured for this deployment.",
      ...loggableEvent
    };
  }

  let reference = event.bookingReference;
  if (!reference && (event.bookingRequestId || event.bookingSessionId)) {
    const admin = createAdminClient();
    if (!admin) throw new Error("Cannot resolve booking email reference.");
    if (event.bookingRequestId) {
      const { data, error } = await admin.from("booking_requests")
        .select("reference_code").eq("id", event.bookingRequestId).single();
      if (error) throw new Error("Cannot resolve booking email reference.");
      reference = data.reference_code as string;
    } else {
      const { data, error } = await admin.from("booking_sessions")
        .select("booking_requests(reference_code)").eq("id", event.bookingSessionId!).single();
      if (error) throw new Error("Cannot resolve booking email reference.");
      reference = relationOne(data.booking_requests)?.reference_code;
    }
  }

  let response: Response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "Content-Type": "application/json",
        "api-key": config.brevoApiKey as string
      },
      body: JSON.stringify({
        sender: {
          name: config.brevoSenderName,
          email: config.brevoSenderEmail
        },
        to: [{ email: event.recipientEmail }],
        subject: event.subject,
        // Every email ships inside the branded shell. Inbound contact notices
        // omit newsletter-only unsubscribe controls.
        htmlContent: renderEmailEventHtml({ ...event, bookingReference: reference, includeUnsubscribe }),
        ...(includeUnsubscribe === false
          ? {}
          : {
              headers: {
                "List-Unsubscribe": `<mailto:${config.brevoSenderEmail}?subject=Unsubscribe>`
              }
            }),
        ...(replyTo ? { replyTo } : {}),
        // Brevo rejects empty arrays for these keys, so only include them when populated.
        ...(cc && cc.length > 0 ? { cc: cc.map((email) => ({ email })) } : {}),
        ...(attachments && attachments.length > 0
          ? {
              attachment: attachments.map((attachment) => ({
                name: attachment.name,
                content: attachment.contentBase64
              }))
            }
          : {})
      })
    });
  } catch {
    console.error("[email] Brevo request failed or timed out.", {
      templateKey: event.templateKey
    });
    return {
      id: `email-${randomUUID()}`,
      status: "failed" as const,
      error: "Brevo request failed or timed out; delivery is unconfirmed. Check Brevo logs before retrying.",
      ...loggableEvent
    };
  }

  if (!response.ok) {
    console.error("[email] Brevo rejected the notification.", {
      templateKey: event.templateKey,
      statusCode: response.status
    });
    return {
      id: `email-${randomUUID()}`,
      status: "failed" as const,
      error: await response.text(),
      ...loggableEvent
    };
  }

  const payload = (await response.json()) as { messageId?: string };

  return {
    id: payload.messageId ?? `email-${randomUUID()}`,
    status: "sent" as const,
    ...loggableEvent
  };
}
