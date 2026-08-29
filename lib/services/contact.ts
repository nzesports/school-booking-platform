import { z } from "zod";

const singleLine = /^[^\r\n]+$/;

export const contactFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your name.")
    .max(80, "Keep your name under 80 characters.")
    .regex(singleLine, "Enter your name on one line."),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  school: z.string().trim().max(120, "Keep the school or organisation under 120 characters."),
  subject: z
    .string()
    .trim()
    .min(3, "Enter a subject.")
    .max(120, "Keep the subject under 120 characters.")
    .regex(singleLine, "Enter a subject on one line."),
  message: z
    .string()
    .trim()
    .min(10, "Write at least 10 characters so we know how to help.")
    .max(5000, "Keep your message under 5,000 characters.")
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

export type ContactFieldErrors = Partial<
  Record<keyof ContactFormValues, string[] | undefined>
>;

export type ContactFormState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: ContactFieldErrors;
};

export const initialContactFormState: ContactFormState = {
  status: "idle",
  message: ""
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildContactEmailHtml(values: ContactFormValues) {
  const schoolRow = values.school
    ? `<p style="margin:0 0 8px;"><strong>School or organisation:</strong> ${escapeHtml(values.school)}</p>`
    : "";
  const message = escapeHtml(values.message).replace(/\r?\n/g, "<br>");

  return `
    <h2 style="margin:0 0 20px;color:#040f4b;">New website enquiry</h2>
    <p style="margin:0 0 8px;"><strong>From:</strong> ${escapeHtml(values.name)}</p>
    <p style="margin:0 0 8px;"><strong>Email:</strong> ${escapeHtml(values.email)}</p>
    ${schoolRow}
    <p style="margin:0 0 8px;"><strong>Subject:</strong> ${escapeHtml(values.subject)}</p>
    <div style="margin-top:24px;padding:20px;border-radius:16px;background:#f6fbfd;line-height:1.7;">${message}</div>
  `.trim();
}
