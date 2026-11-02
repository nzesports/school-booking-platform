import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase } from "./support/fake-supabase";

// submitAmbassadorReportAction hands the whole grouped write to
// submit_ambassador_report_group (0054). These tests pin what the action asks
// the database for (payout parts, grouping inputs) and that every failure or
// refusal leaves nothing half-written from the app side. The grouping rules
// themselves (siblings, cancelled sessions, other ambassadors/days/bookings,
// concurrent submissions) live in the SQL function.
const mocks = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  })
}));
vi.mock("@/lib/services/auth", () => ({
  buildAuthConfirmUrl: vi.fn(),
  requirePortalAccess: vi.fn(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    role: "ambassador",
    fullName: "Aroha Ambassador",
    email: "aroha@example.nz",
    status: "active"
  }))
}));
vi.mock("@/lib/services/notifications", () => ({
  notifyStaff: vi.fn(async () => undefined),
  notifyUser: vi.fn(async () => undefined)
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.client }));

import { submitAmbassadorReportAction } from "@/app/portal/actions";

const AMBASSADOR_ID = "44444444-4444-4444-8444-444444444444";
const SESSION_ID = "55555555-5555-4555-8555-555555555555";
const BOOKING_ID = "66666666-6666-4666-8666-666666666666";

let fake: ReturnType<typeof createFakeSupabase>;
let rpcResult: { data?: unknown; error?: unknown };
let bookingSource: { source: string; ambassador_outreach_by: string | null };

function reportForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  const fields: Record<string, string> = {
    bookingSessionId: SESSION_ID,
    presenterName: "Aroha Ambassador",
    deliveredDate: "2026-10-20",
    deliveredTime: "09:00",
    studentsCompeted: "no",
    attendeeCount: "140",
    ageGroups: "Years 7 to 8",
    parentsPresent: "no",
    attendanceRating: "5",
    studentEngagementRating: "4",
    teacherResponseRating: "5",
    presentationEnergyRating: "4",
    returnTo: "/ambassador/reports",
    ...overrides
  };

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }

  return form;
}

async function submit(form = reportForm()) {
  const error = await submitAmbassadorReportAction(form).catch((caught: unknown) => caught);
  return String((error as Error).message).replace(/^REDIRECT:/, "");
}

function writesTo(table: string) {
  return fake.calls.filter((call) => call.table === table && call.operation !== "select");
}

describe("submitAmbassadorReportAction", () => {
  beforeEach(() => {
    bookingSource = { source: "public", ambassador_outreach_by: null };
    rpcResult = {
      data: [
        {
          outcome: "submitted",
          report_id: "77777777-7777-4777-8777-777777777777",
          payment_id: "88888888-8888-4888-8888-888888888888",
          covered_session_ids: ["99999999-9999-4999-8999-999999999999"],
          session_count: 2,
          payment_status: "eligible",
          amount_cents: 30000
        }
      ]
    };
    fake = createFakeSupabase({
      query: (call) => {
        if (call.table === "ambassador_profiles" && call.single) return { data: { id: AMBASSADOR_ID } };
        if (call.table === "booking_sessions" && call.single) {
          return {
            data: {
              id: SESSION_ID,
              booking_request_id: BOOKING_ID,
              assigned_ambassador_id: AMBASSADOR_ID,
              starts_at: "2026-10-19T20:00:00Z",
              ends_at: "2026-10-19T21:00:00Z",
              school_id: "school-1",
              status: "confirmed",
              report_status: "not_submitted"
            }
          };
        }
        if (call.table === "booking_requests" && call.single) return { data: bookingSource };
        return undefined;
      },
      rpc: () => rpcResult
    });
    mocks.client = fake.client;
  });

  it("asks for one grouped report with $250 delivery and both gap-tier amounts; the database picks the tier", async () => {
    expect(await submit()).toBe("/ambassador/reports?submitted=report");

    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0].args).not.toHaveProperty("p_second_session_cents");
    expect(fake.rpcCalls[0]).toMatchObject({
      name: "submit_ambassador_report_group",
      args: {
        p_session_id: SESSION_ID,
        p_ambassador_profile_id: AMBASSADOR_ID,
        p_delivery_cents: 25000,
        p_short_pair_cents: 0,
        p_extended_pair_cents: 0,
        p_sourcing_bonus_cents: 5000,
        p_eligible_threshold: 100,
        p_is_sourced: false,
        p_report: expect.objectContaining({ attendee_count: 140, presenter_name: "Aroha Ambassador" })
      }
    });
  });

  it("passes the sourcing bonus through separately when the ambassador sourced the booking", async () => {
    bookingSource = { source: "ambassador_booked", ambassador_outreach_by: AMBASSADOR_ID };
    await submit();

    expect(fake.rpcCalls[0].args).toMatchObject({ p_is_sourced: true, p_sourcing_bonus_cents: 5000 });
  });

  it("does not write the report, sessions or payment itself; the RPC does it in one transaction", async () => {
    await submit();

    expect(writesTo("ambassador_reports")).toEqual([]);
    expect(writesTo("payments")).toEqual([]);
    expect(writesTo("booking_sessions")).toEqual([]);
    expect(writesTo("booking_requests")).toEqual([]);
  });

  it("leaves nothing behind when the transaction fails, so a retry simply resubmits", async () => {
    rpcResult = { error: { code: "23505", message: "duplicate key" } };

    expect(await submit()).toBe("/ambassador/reports?error=report-save-failed");
    expect(writesTo("ambassador_reports")).toEqual([]);
    expect(writesTo("payments")).toEqual([]);
    expect(writesTo("booking_activity_logs")).toEqual([]);

    rpcResult = {
      data: [{ outcome: "submitted", report_id: "r-2", covered_session_ids: [], payment_status: "eligible", amount_cents: 25000 }]
    };
    expect(await submit()).toBe("/ambassador/reports?submitted=report");
    expect(fake.rpcCalls).toHaveLength(2);
  });

  it.each([
    "report-already-submitted",
    "report-day-not-finished",
    "payment-already-exists",
    "session-not-finished",
    "session-not-assigned"
  ])("shows the database's %s refusal and records nothing", async (outcome) => {
    rpcResult = { data: [{ outcome, report_id: null }] };

    expect(await submit()).toBe(`/ambassador/reports?error=${outcome}`);
    expect(writesTo("booking_activity_logs")).toEqual([]);
    expect(writesTo("media_library")).toEqual([]);
  });

  it("maps an unknown outcome to a generic save failure", async () => {
    rpcResult = { data: [{ outcome: "something-new", report_id: null }] };
    expect(await submit()).toBe("/ambassador/reports?error=report-save-failed");
  });

  it("refuses a session that hasn't finished before calling the database", async () => {
    fake = createFakeSupabase({
      query: (call) => {
        if (call.table === "ambassador_profiles" && call.single) return { data: { id: AMBASSADOR_ID } };
        if (call.table === "booking_sessions" && call.single) {
          return {
            data: {
              id: SESSION_ID,
              booking_request_id: BOOKING_ID,
              assigned_ambassador_id: AMBASSADOR_ID,
              starts_at: new Date(Date.now() - 30 * 60_000).toISOString(),
              ends_at: new Date(Date.now() + 30 * 60_000).toISOString(),
              status: "confirmed",
              report_status: "not_submitted"
            }
          };
        }
        return undefined;
      }
    });
    mocks.client = fake.client;

    expect(await submit()).toBe("/ambassador/reports?error=session-not-finished");
    expect(fake.rpcCalls).toEqual([]);
  });

  it("logs which sessions the report covered and the grouped amount", async () => {
    await submit();

    const log = writesTo("booking_activity_logs")[0]?.payload as { details: Record<string, unknown> };
    expect(log.details).toMatchObject({
      covered_session_ids: ["99999999-9999-4999-8999-999999999999"],
      payment_amount_cents: 30000,
      payment_status: "eligible"
    });
  });

  it("records a payment the database sent to custom review as such, with only the recognised amount", async () => {
    rpcResult = {
      data: [
        {
          outcome: "submitted",
          report_id: "77777777-7777-4777-8777-777777777777",
          payment_id: "88888888-8888-4888-8888-888888888888",
          covered_session_ids: ["99999999-9999-4999-8999-999999999999"],
          session_count: 2,
          payment_status: "eligible",
          amount_cents: 25000,
          payment_tier: "custom_review",
          review_required: true,
          review_reason: "gap_over_60_to_120"
        }
      ]
    };

    expect(await submit()).toBe("/ambassador/reports?submitted=report");
    const log = writesTo("booking_activity_logs")[0]?.payload as { details: Record<string, unknown> };
    expect(log.details).toMatchObject({
      payment_tier: "custom_review",
      payment_review_required: true,
      payment_review_reason: "gap_over_60_to_120",
      payment_amount_cents: 25000
    });
  });
});
