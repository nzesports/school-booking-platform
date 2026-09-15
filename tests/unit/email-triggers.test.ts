import { beforeEach, describe, expect, it, vi } from "vitest";
import schoolTemplates from "@/scripts/data/school-email-templates.json";

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
  sendPaymentApprovalToFinanceEmail, sendSchoolRescheduleNoticeEmail,
  sendSessionReminderEmail, sendFeedbackRequestEmail, sendBookingRequestReceivedEmail
} from "@/lib/services/email-triggers";

const session = {
  contactEmail: "school@example.nz", contactName: "Teacher", schoolName: "Test School",
  sessionDate: "22 September 2026, 9:00 am", presentationTitle: "Digital Wellbeing",
  expectedStudentCount: 120, yearLevels: "Years 7 to 8",
  bookingId: "booking-1", bookingSessionId: "session-1", referenceCode: "123456",
  sessionStartsAt: "2026-09-21T21:00:00.000Z", sessionEndsAt: "2026-09-21T22:00:00.000Z"
};

beforeEach(() => {
  mocks.send.mockReset().mockImplementation(async (event) => ({ ...event, id: "message-1", status: "sent" }));
  mocks.insert.mockReset().mockResolvedValue({ error: null });
  mocks.template.mockReset().mockResolvedValue({ data: null, error: null });
});

describe("notification routing and content", () => {
  it.each([
    ["school_booking_confirmed", sendBookingConfirmedEmail],
    ["school_booking_cancelled", sendBookingCancelledEmail],
    ["school_booking_rescheduled", sendBookingRescheduledEmail],
    ["school_session_reminder", sendSessionReminderEmail],
    ["school_feedback_request", sendFeedbackRequestEmail]
  ] as const)("renders the saved %s template with all session fields", async (key, send) => {
    mocks.template.mockResolvedValue({ data: { ...schoolTemplates.find((template) => template.template_key === key), is_active: true } });
    await send(session);
    const html = mocks.send.mock.calls[0][0].html;
    for (const value of ["Digital Wellbeing", "Test School", "Tuesday, 22 September 2026", "9:00", "10:00", "120"]) expect(html).toContain(value);
    expect(html.match(/data-school-session-details/g)).toHaveLength(1);
    expect(html).not.toMatch(/\{\{\w+\}\}/);
  });
  it.each([sendBookingConfirmedEmail, sendBookingCancelledEmail, sendBookingRescheduledEmail,
    sendSessionReminderEmail, sendFeedbackRequestEmail])("includes full details even when a saved school template has only an introduction", async (send) => {
    mocks.template.mockResolvedValue({ data: { subject: "School email", body_html: "<p>Hello</p>", is_active: true } });
    await send(session);
    const html = mocks.send.mock.calls[0][0].html;
    for (const detail of ["Digital Wellbeing", "Test School", "Tuesday, 22 September 2026", "9:00", "10:00", "120", "Years 7 to 8"]) {
      expect(html).toContain(detail);
    }
  });

  it("renders the saved detail placeholder once and escapes user-provided text", async () => {
    mocks.template.mockResolvedValue({ data: { subject: "Cancelled", body_html: "<p>Cancelled</p>{{sessionSummary}}", is_active: true } });
    await sendBookingCancelledEmail({ ...session, schoolName: "<script>School</script>" });
    const html = mocks.send.mock.calls[0][0].html;
    expect(html.match(/data-school-session-details/g)).toHaveLength(1);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("120");
  });

  it("includes every presentation and student count in the saved receipt template", async () => {
    mocks.template.mockResolvedValue({ data: { ...schoolTemplates.find((template) => template.template_key === "booking_request_received"), is_active: true } });
    await sendBookingRequestReceivedEmail({ ...session, contactPhone: "09 555 0100", sessions: [
      { presentationTitle: "Digital Wellbeing", regionName: "Hamilton", startsAt: session.sessionStartsAt, endsAt: session.sessionEndsAt, yearLevels: "Years 7 to 8", expectedStudentCount: 120 },
      { presentationTitle: "Online Safety", regionName: "Hamilton", startsAt: "2026-09-22T21:00:00Z", endsAt: "2026-09-22T22:00:00Z", yearLevels: "Years 9 to 13", expectedStudentCount: 85 }
    ] });
    const html = mocks.send.mock.calls[0][0].html;
    for (const detail of ["Digital Wellbeing", "Online Safety", "120", "85", "Tuesday, 22 September 2026", "Wednesday, 23 September 2026", "9:00", "10:00"]) expect(html).toContain(detail);
    expect(html.match(/Requested session 1/g)).toHaveLength(1);
  });
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
