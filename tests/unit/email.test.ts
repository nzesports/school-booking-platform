import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  config: {
    isBrevoConfigured: true,
    brevoApiKey: "test-api-key",
    brevoSenderName: "NZ Esports",
    brevoSenderEmail: "info@example.nz",
    siteUrl: "https://bookings.example.nz"
  }
}));

import { sendTransactionalEmail } from "@/lib/services/email";

const fetchMock = vi.fn();

describe("sendTransactionalEmail", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("sends contact reply-to metadata without newsletter headers", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ messageId: "brevo-message-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      })
    );

    const result = await sendTransactionalEmail({
      templateKey: "website_contact",
      recipientEmail: "schools@example.nz",
      subject: "[Website contact] A question",
      html: "<p>Hello team</p>",
      replyTo: { email: "teacher@example.nz", name: "Taylor Teacher" },
      includeUnsubscribe: false
    });

    expect(result.status).toBe("sent");
    expect(result.id).toBe("brevo-message-1");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(request.body));
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(request.method).toBe("POST");
    expect(request.headers).toMatchObject({ "api-key": "test-api-key" });
    expect(payload.replyTo).toEqual({ email: "teacher@example.nz", name: "Taylor Teacher" });
    expect(payload.headers).toBeUndefined();
    expect(payload.htmlContent).not.toContain(">Unsubscribe</a>");
  });

  it("returns Brevo response details for rejected requests", async () => {
    fetchMock.mockResolvedValue(new Response("invalid sender", { status: 400 }));

    const result = await sendTransactionalEmail({
      templateKey: "test",
      recipientEmail: "school@example.nz",
      subject: "Test",
      html: "<p>Test</p>"
    });

    expect(result).toMatchObject({ status: "failed", error: "invalid sender" });
  });
});
