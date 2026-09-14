import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/services/email-triggers", () => ({
  sendBookingConfirmedEmail: mocks.send, sendBookingCancelledEmail: mocks.send,
  sendBookingRescheduledEmail: mocks.send, sendFeedbackRequestEmail: mocks.send,
  sendSchoolRescheduleNoticeEmail: mocks.send
}));
import { sendSchoolSessionEmails } from "@/lib/services/school-session-email";

beforeEach(() => {
  mocks.send.mockReset().mockResolvedValue({ status: "sent" });
  const tables: Record<string, Array<Record<string, unknown>>> = {
    booking_requests: [{ id: "booking", school_id: "school", primary_contact_id: "contact", reference_code: "123" }],
    school_contacts: [{ id: "contact", email: "teacher@example.nz", full_name: "Teacher" }],
    schools: [{ id: "school", name: "Test School" }],
    presentation_types: [{ id: "p1", title: "Wellbeing" }, { id: "p2", title: "Online Safety" }],
    booking_sessions: [
      { id: "s1", booking_request_id: "booking", presentation_type_id: "p1", starts_at: "2026-09-21T21:00:00Z", ends_at: "2026-09-21T22:00:00Z" },
      { id: "s2", booking_request_id: "booking", presentation_type_id: "p2", starts_at: "2026-09-22T21:00:00Z", ends_at: "2026-09-22T22:00:00Z" },
      { id: "unrelated", booking_request_id: "another-booking", presentation_type_id: "p1" }
    ]
  };
  mocks.from.mockReset().mockImplementation((table: string) => {
    let rows = tables[table];
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return query; },
      single: async () => ({ data: rows[0], error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve)
    };
    return query;
  });
});

describe("school session notifications", () => {
  it("sends each affected session with its own title, dates and calendar ID", async () => {
    await sendSchoolSessionEmails("booking", ["s1", "s2", "unrelated"], "confirmed");
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls.map(([payload]) => [payload.bookingSessionId, payload.presentationTitle])).toEqual([
      ["s1", "Wellbeing"], ["s2", "Online Safety"]
    ]);
    expect(mocks.send.mock.calls[1][0]).toMatchObject({ contactEmail: "teacher@example.nz", sessionStartsAt: "2026-09-22T21:00:00Z" });
  });
  it("does not send notifications when no sessions changed", async () => {
    await sendSchoolSessionEmails("booking", [], "cancelled");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
