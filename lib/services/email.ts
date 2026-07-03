import { randomUUID } from "node:crypto";

import { config } from "@/lib/env";

type EmailEventInput = {
  templateKey: string;
  recipientEmail: string;
  subject: string;
  html: string;
  cc?: string[];
  attachments?: Array<{ name: string; contentBase64: string }>;
};

export async function sendTransactionalEmail(event: EmailEventInput) {
  // Keep attachment payloads out of the returned event so callers/logs
  // don't hold large base64 blobs.
  const { attachments, cc, ...loggableEvent } = event;

  if (!config.isBrevoConfigured) {
    return {
      id: `email-${randomUUID()}`,
      status: "skipped_unconfigured" as const,
      ...loggableEvent
    };
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
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
      htmlContent: event.html,
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

  if (!response.ok) {
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
