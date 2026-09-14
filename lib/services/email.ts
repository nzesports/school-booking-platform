import { randomUUID } from "node:crypto";

import { config } from "@/lib/env";
import { renderBrandedEmail } from "@/lib/services/email-layout";

type EmailEventInput = {
  templateKey: string;
  recipientEmail: string;
  subject: string;
  html: string;
  cc?: string[];
  replyTo?: { email: string; name?: string };
  includeUnsubscribe?: boolean;
  attachments?: Array<{ name: string; contentBase64: string }>;
};

export async function sendTransactionalEmail(event: EmailEventInput) {
  // Keep attachment payloads out of the returned event so callers/logs
  // don't hold large base64 blobs.
  const { attachments, cc, replyTo, includeUnsubscribe, ...loggableEvent } = event;

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
        htmlContent: renderBrandedEmail(event.html, { includeUnsubscribe }),
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
