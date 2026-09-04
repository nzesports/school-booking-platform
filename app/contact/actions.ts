"use server";

import {
  buildContactEmailHtml,
  contactFormSchema,
  type ContactFormState
} from "@/lib/services/contact";
import { sendTransactionalEmail } from "@/lib/services/email";

export async function submitContactFormAction(
  _previousState: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  // Bots commonly fill fields hidden from people. Return a normal-looking
  // success so the form does not reveal which anti-spam check caught them.
  if (String(formData.get("website2") || "").trim()) {
    return {
      status: "success",
      message: "Thanks — your message has been sent. We'll be in touch soon."
    };
  }

  const parsed = contactFormSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    school: formData.get("school") ?? "",
    subject: formData.get("subject"),
    message: formData.get("message")
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors
    };
  }

  const startedAt = Number(formData.get("startedAt"));

  if (!Number.isFinite(startedAt) || Date.now() - startedAt < 800) {
    return {
      status: "error",
      message: "Please wait a moment, then send your message again."
    };
  }

  let result: Awaited<ReturnType<typeof sendTransactionalEmail>>;

  try {
    result = await sendTransactionalEmail({
      templateKey: "website_contact",
      recipientEmail: "schools@esf.nz",
      subject: `[Website contact] ${parsed.data.subject}`,
      html: buildContactEmailHtml(parsed.data),
      replyTo: {
        email: parsed.data.email,
        name: parsed.data.name
      },
      includeUnsubscribe: false
    });
  } catch {
    return {
      status: "error",
      message: "We couldn't send your message just now. Please try again shortly."
    };
  }

  if (result.status !== "sent") {
    return {
      status: "error",
      message: "We couldn't send your message just now. Please try again shortly."
    };
  }

  return {
    status: "success",
    message: "Thanks — your message has been sent. We'll be in touch soon."
  };
}
