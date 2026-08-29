import { describe, expect, it } from "vitest";

import {
  buildContactEmailHtml,
  contactFormSchema,
  type ContactFormValues
} from "@/lib/services/contact";

const validContact: ContactFormValues = {
  name: "Aroha Rangi",
  email: "aroha@example.nz",
  school: "Harbour College",
  subject: "Presentation question",
  message: "Could you tell me about the available sessions?"
};

describe("contactFormSchema", () => {
  it("normalises valid contact details", () => {
    const result = contactFormSchema.parse({
      ...validContact,
      name: "  Aroha Rangi  ",
      email: "  aroha@example.nz ",
      school: "  Harbour College "
    });

    expect(result).toMatchObject(validContact);
  });

  it("rejects invalid email addresses and short messages", () => {
    const result = contactFormSchema.safeParse({
      ...validContact,
      email: "not-an-email",
      message: "Too short"
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email?.[0]).toBe("Enter a valid email address.");
      expect(result.error.flatten().fieldErrors.message?.[0]).toContain("at least 10");
    }
  });

  it("allows the optional school field to be blank", () => {
    expect(contactFormSchema.safeParse({ ...validContact, school: "" }).success).toBe(true);
  });

  it("keeps email header fields to a single line", () => {
    expect(
      contactFormSchema.safeParse({ ...validContact, subject: "Question\nBcc: someone@example.nz" })
        .success
    ).toBe(false);
  });
});

describe("buildContactEmailHtml", () => {
  it("escapes visitor-controlled HTML and keeps line breaks", () => {
    const html = buildContactEmailHtml({
      ...validContact,
      name: "Aroha <Admin>",
      subject: "Help & advice",
      message: "First line\n<script>alert('x')</script>"
    });

    expect(html).toContain("Aroha &lt;Admin&gt;");
    expect(html).toContain("Help &amp; advice");
    expect(html).toContain("First line<br>&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("omits an empty school row", () => {
    expect(buildContactEmailHtml({ ...validContact, school: "" })).not.toContain(
      "School or organisation:"
    );
  });
});
