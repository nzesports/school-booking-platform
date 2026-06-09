import { randomUUID } from "node:crypto";

import { config } from "@/lib/env";

type EmailEventInput = {
  templateKey: string;
  recipientEmail: string;
  subject: string;
  html: string;
};

export async function sendTransactionalEmail(event: EmailEventInput) {
  if (!config.isBrevoConfigured) {
    return {
      id: `email-${randomUUID()}`,
      status: "skipped_unconfigured" as const,
      ...event
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
      htmlContent: event.html
    })
  });

  if (!response.ok) {
    return {
      id: `email-${randomUUID()}`,
      status: "failed" as const,
      error: await response.text(),
      ...event
    };
  }

  const payload = (await response.json()) as { messageId?: string };

  return {
    id: payload.messageId ?? `email-${randomUUID()}`,
    status: "sent" as const,
    ...event
  };
}
