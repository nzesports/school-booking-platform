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
  cc?: string[];
  replyTo?: { email: string; name?: string };
  includeUnsubscribe?: boolean;
  attachments?: Array<{ name: string; contentBase64: string }>;
};

export function renderEmailEventHtml(event: Pick<EmailEventInput, "html" | "bookingReference" | "includeUnsubscribe">) {
  const reference = event.bookingReference;
  const escapedReference = reference?.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]!);
  const referenceMarker = escapedReference
    ? `<p style="margin:0 0 20px;"><span style="display:inline-block;border:1px solid #d8e4ee;border-radius:8px;background:#f3f7fb;padding:6px 10px;color:#344663;font-size:12px;letter-spacing:0.04em;">Booking ref: <strong style="font-family:monospace;font-size:13px;">${escapedReference}</strong></span></p>`
    : "";

  return renderBrandedEmail(referenceMarker + event.html, { includeUnsubscribe: event.includeUnsubscribe });
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
