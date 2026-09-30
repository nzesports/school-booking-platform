import { beforeEach, describe, expect, it, vi } from "vitest";

// The final sender is the backstop for record-only bookings: every email tied
// to such a booking (school, ambassador, reminder, feedback, finance) must be
// held unless staff deliberately send it by hand.
const mocks = vi.hoisted(() => ({ bookingEmailPolicy: vi.fn() }));

vi.mock("@/lib/env", () => ({
  config: {
    isBrevoConfigured: true,
    brevoApiKey: "test-api-key",
    brevoSenderName: "NZ Esports",
    brevoSenderEmail: "info@example.nz",
    siteUrl: "https://bookings.example.nz"
  }
}));
vi.mock("@/lib/services/booking-email-policy", () => ({ bookingEmailPolicy: mocks.bookingEmailPolicy }));

import { sendTransactionalEmail } from "@/lib/services/email";
import { emailDeliveryContext } from "@/lib/services/email-delivery-context";

const fetchMock = vi.fn();
const RECORD_ONLY_BOOKING = { id: "booking-1", manualOnly: true, imported: false };

describe("record-only bookings at the email sender", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ messageId: "brevo-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.bookingEmailPolicy.mockReset();
    mocks.bookingEmailPolicy.mockResolvedValue(RECORD_ONLY_BOOKING);
  });

  it("holds a school email for the booking without contacting Brevo", async () => {
    const result = await sendTransactionalEmail({
      templateKey: "school_booking_confirmed",
      recipientEmail: "aroha@example.nz",
      subject: "Your session is confirmed",
      html: "<p>Confirmed</p>",
      bookingRequestId: "booking-1",
      bookingReference: "123456"
    });

    expect(result.status).toBe("suppressed_manual_only");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("holds session emails too, including the finance invoice", async () => {
    const result = await sendTransactionalEmail({
      templateKey: "payment_approval_finance",
      recipientEmail: "finance@example.nz",
      subject: "Payment INV-1",
      html: "<p>Invoice</p>",
      bookingSessionId: "session-1",
      bookingReference: "123456"
    });

    expect(result.status).toBe("suppressed_manual_only");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends when staff deliberately send it by hand (Emails tab, Resend to finance)", async () => {
    const result = await emailDeliveryContext.run({ manualBookingId: "booking-1" }, () =>
      sendTransactionalEmail({
        templateKey: "payment_approval_finance",
        recipientEmail: "finance@example.nz",
        subject: "Payment INV-1",
        html: "<p>Invoice</p>",
        bookingSessionId: "session-1",
        bookingReference: "123456"
      })
    );

    expect(result.status).toBe("sent");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
