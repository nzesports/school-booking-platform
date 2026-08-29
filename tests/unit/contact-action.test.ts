import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendTransactionalEmailMock } = vi.hoisted(() => ({
  sendTransactionalEmailMock: vi.fn()
}));

vi.mock("@/lib/services/email", () => ({
  sendTransactionalEmail: sendTransactionalEmailMock
}));

import { submitContactFormAction } from "@/app/contact/actions";
import { initialContactFormState } from "@/lib/services/contact";

function validFormData() {
  const formData = new FormData();
  formData.set("name", "Aroha Rangi");
  formData.set("email", "aroha@example.nz");
  formData.set("school", "Harbour College");
  formData.set("subject", "Presentation question");
  formData.set("message", "Could you tell me about the available sessions?");
  formData.set("startedAt", String(Date.now() - 2_000));
  return formData;
}

describe("submitContactFormAction", () => {
  beforeEach(() => {
    sendTransactionalEmailMock.mockReset();
    sendTransactionalEmailMock.mockResolvedValue({ status: "sent", id: "message-1" });
  });

  it("sends a validated enquiry to Brevo with reply-to details", async () => {
    const result = await submitContactFormAction(initialContactFormState, validFormData());

    expect(result.status).toBe("success");
    expect(sendTransactionalEmailMock).toHaveBeenCalledOnce();
    expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: "website_contact",
        subject: "[Website contact] Presentation question",
        includeUnsubscribe: false,
        replyTo: { email: "aroha@example.nz", name: "Aroha Rangi" }
      })
    );
  });

  it("returns field errors without sending invalid data", async () => {
    const formData = validFormData();
    formData.set("email", "invalid");
    formData.set("message", "short");

    const result = await submitContactFormAction(initialContactFormState, formData);

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.email).toBeDefined();
    expect(result.fieldErrors?.message).toBeDefined();
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });

  it("quietly accepts honeypot submissions without sending", async () => {
    const formData = new FormData();
    formData.set("website2", "https://spam.example");

    const result = await submitContactFormAction(initialContactFormState, formData);

    expect(result.status).toBe("success");
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });

  it("blocks submissions completed implausibly quickly", async () => {
    const formData = validFormData();
    formData.set("startedAt", String(Date.now()));

    const result = await submitContactFormAction(initialContactFormState, formData);

    expect(result.status).toBe("error");
    expect(result.message).toContain("wait a moment");
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });

  it("shows a retryable error when delivery fails", async () => {
    sendTransactionalEmailMock.mockResolvedValueOnce({ status: "failed", id: "message-2" });

    const result = await submitContactFormAction(initialContactFormState, validFormData());

    expect(result).toMatchObject({ status: "error" });
    expect(result.message).toContain("try again");
  });

  it("shows a retryable error when the email request throws", async () => {
    sendTransactionalEmailMock.mockRejectedValueOnce(new Error("network unavailable"));

    const result = await submitContactFormAction(initialContactFormState, validFormData());

    expect(result).toMatchObject({ status: "error" });
    expect(result.message).toContain("try again");
  });
});
