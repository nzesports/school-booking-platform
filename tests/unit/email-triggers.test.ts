import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), insert: vi.fn(), template: vi.fn() }));
vi.mock("@/lib/env", () => ({ config: { siteUrl: "https://book.nzesports.org.nz" } }));
vi.mock("@/lib/services/email", () => ({ sendTransactionalEmail: mocks.send }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  from: () => ({
    insert: mocks.insert,
    select: () => ({ eq: () => ({ maybeSingle: mocks.template }) })
  })
}) }));

import {
  sendSchoolWelcomeEmail, sendAmbassadorApplicationReceivedEmail,
  sendAmbassadorApprovedEmail, sendBookingConfirmedEmail,
  sendBookingCancelledEmail, sendBookingRescheduledEmail,
  sendPaymentApprovalToFinanceEmail, sendSchoolRescheduleNoticeEmail
} from "@/lib/services/email-triggers";

const session = {
  contactEmail: "school@example.nz", contactName: "Teacher", schoolName: "Test School",
  sessionDate: "22 September 2026, 9:00 am", presentationTitle: "Digital Wellbeing",
  bookingId: "booking-1", bookingSessionId: "session-1", referenceCode: "123456",
  sessionStartsAt: "2026-09-21T21:00:00.000Z", sessionEndsAt: "2026-09-21T22:00:00.000Z"
};

beforeEach(() => {
  mocks.send.mockReset().mockImplementation(async (event) => ({ ...event, id: "message-1", status: "sent" }));
  mocks.insert.mockReset().mockResolvedValue({ error: null });
  mocks.template.mockReset().mockResolvedValue({ data: null, error: null });
});

describe("notification routing and content", () => {
  it("sends school and ambassador signup and approval emails to the correct users", async () => {
    await sendSchoolWelcomeEmail(session);
    await sendAmbassadorApplicationReceivedEmail({ ambassadorEmail: "ambassador@example.nz", ambassadorName: "Alex" });
    await sendAmbassadorApprovedEmail({ ambassadorEmail: "ambassador@example.nz", ambassadorName: "Alex" });
    expect(mocks.send.mock.calls.map(([event]) => [event.templateKey, event.recipientEmail])).toEqual([
      ["school_welcome", "school@example.nz"],
      ["ambassador_application_received", "ambassador@example.nz"],
      ["ambassador_approved", "ambassador@example.nz"]
    ]);
    expect(mocks.send.mock.calls[0][0].html).toContain("https://book.nzesports.org.nz/school");
    expect(mocks.insert).toHaveBeenCalledTimes(3);
  });

  it.each([sendBookingConfirmedEmail, sendBookingRescheduledEmail])(
    "preserves calendar buttons even when a saved template omits them", async (send) => {
      mocks.template.mockResolvedValue({ data: { subject: "Booking", body_html: "<p>Updated</p>", is_active: true } });
      await send(session);
      const html = mocks.send.mock.calls[0][0].html;
      for (const label of ["Google Calendar", "Outlook", "Office 365", "Yahoo Calendar", "Apple / .ics"]) {
        expect(html).toContain(label);
      }
      expect(html).toContain("https://book.nzesports.org.nz/api/calendar/session-1");
    }
  );

  it("does not duplicate calendar buttons already included by the template", async () => {
    mocks.template.mockResolvedValue({ data: { subject: "Booking", body_html: "<p>{{calendarLinks}}</p>", is_active: true } });
    await sendBookingConfirmedEmail(session);
    expect(mocks.send.mock.calls[0][0].html.match(/Google Calendar/g)).toHaveLength(1);
  });

  it("does not confirm a tentative booking just because its requested date was changed", async () => {
    await sendBookingRescheduledEmail({ ...session, isConfirmed: false });
    const html = mocks.send.mock.calls[0][0].html;
    expect(html).toContain("final booking confirmation is still pending");
    expect(html).not.toContain("Add it to your calendar");
  });

  it("sends cancellation and reschedule acknowledgments without claiming a new date is confirmed", async () => {
    await sendBookingCancelledEmail(session);
    expect(mocks.send.mock.calls[0][0].html).toContain("has been cancelled");
    expect(mocks.send.mock.calls[0][0].html).not.toContain("Add it to your calendar");
    await sendSchoolRescheduleNoticeEmail({ ...session, decision: "requested", requestedDate: "2026-10-01" });
    expect(mocks.send.mock.calls[1][0].html).toContain("not confirmed yet");
    await sendSchoolRescheduleNoticeEmail({ ...session, decision: "declined" });
    expect(mocks.send.mock.calls[2][0].html).toContain("original session date and time are unchanged");
  });

  it("sends finance to its dedicated recipient and preserves the payment confirmation button", async () => {
    mocks.template.mockResolvedValue({ data: { subject: "Invoice", body_html: "<p>Invoice</p>", is_active: true } });
    await sendPaymentApprovalToFinanceEmail({
      toEmail: "finance@example.nz", invoiceNumber: "INV-1", ambassadorName: "Alex",
      sessionDescription: "Test session", amountLabel: "$250 NZD",
      bankAccountName: "Test Account", bankAccountNumber: "test-account",
      confirmationToken: "test-token", bookingSessionId: "session-1"
    });
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ recipientEmail: "finance@example.nz", includeUnsubscribe: false });
    expect(mocks.send.mock.calls[0][0].html).toContain("https://book.nzesports.org.nz/finance/payment/test-token");
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ recipient_type: "finance", status: "sent" });
  });
});
