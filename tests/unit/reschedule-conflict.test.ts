import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, filterValue } from "./support/fake-supabase";

// resolveSessionRescheduleAction must not move a session onto a time its
// assigned ambassador is already booked for. The action pre-checks for a
// clear message; resolve_session_reschedule (0054) re-checks under a table
// lock and is the authority (modelled here by `rpcResult`).
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
    role: "staff",
    fullName: "Test Staff",
    email: "staff@example.nz",
    status: "active"
  }))
}));
vi.mock("@/lib/services/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/availability")>()),
  isBookableDate: () => true,
  isBookableSessionTime: () => true,
  isWithinBookingWindow: () => true
}));
vi.mock("@/lib/services/availability-server", () => ({ loadAvailabilityConfig: vi.fn(async () => ({})) }));
vi.mock("@/lib/services/email-background", () => ({ scheduleEmail: vi.fn() }));
vi.mock("@/lib/services/calendar-sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/calendar-sync")>()),
  scheduleCalendarSync: vi.fn()
}));
vi.mock("@/lib/services/notifications", () => ({
  notifyStaff: vi.fn(async () => undefined),
  notifyUser: vi.fn(async () => undefined)
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.client }));

import { resolveSessionRescheduleAction } from "@/app/portal/actions";

const SESSION_ID = "55555555-5555-4555-8555-555555555555";
const AMBASSADOR_ID = "44444444-4444-4444-8444-444444444444";
// 10:00-11:00 on 1 Dec 2026 in Auckland (NZDT, +13).
const NEW_START = "2026-11-30T21:00:00.000Z";
const NEW_END = "2026-11-30T22:00:00.000Z";

let fake: ReturnType<typeof createFakeSupabase>;
let ambassadorSessions: Array<{ id: string; status: string; starts_at: string; ends_at: string }>;
let rpcResult: { data?: unknown; error?: unknown };

function resolveForm(decision: "approve" | "decline" = "approve") {
  const form = new FormData();
  form.set("bookingSessionId", SESSION_ID);
  form.set("decision", decision);
  form.set("finalDate", "2026-12-01");
  form.set("finalTime", "10:00");
  form.set("returnTo", "/staff/bookings");
  return form;
}

async function resolve(form = resolveForm()) {
  const error = await resolveSessionRescheduleAction(form).catch((caught: unknown) => caught);
  return String((error as Error).message).replace(/^REDIRECT:/, "");
}

const otherSession = (id: string, startsAt: string, endsAt: string, status = "confirmed") => ({
  id,
  status,
  starts_at: startsAt,
  ends_at: endsAt
});

describe("resolveSessionRescheduleAction", () => {
  beforeEach(() => {
    ambassadorSessions = [];
    rpcResult = { data: [{ outcome: "resolved", restored_status: "confirmed" }] };
    fake = createFakeSupabase({
      query: (call) => {
        if (call.table === "booking_sessions" && call.single) {
          return {
            data: {
              id: SESSION_ID,
              booking_request_id: "booking-1",
              school_id: "school-1",
              assigned_ambassador_id: AMBASSADOR_ID,
              status: "reschedule_requested",
              starts_at: "2026-11-20T21:00:00.000Z",
              ends_at: "2026-11-20T22:00:00.000Z",
              reschedule_previous_status: "confirmed"
            }
          };
        }
        if (call.table === "booking_sessions" && filterValue(call, "assigned_ambassador_id")) {
          return { data: ambassadorSessions };
        }
        return undefined;
      },
      rpc: () => rpcResult
    });
    mocks.client = fake.client;
  });

  it("refuses to move the session onto the ambassador's other confirmed session", async () => {
    ambassadorSessions = [otherSession("other", NEW_START, NEW_END)];

    expect(await resolve()).toBe("/staff/bookings?error=reschedule-ambassador-conflict");
    expect(fake.rpcCalls).toEqual([]);
  });

  it("refuses a partial overlap of a single minute", async () => {
    ambassadorSessions = [otherSession("other", "2026-11-30T21:59:00.000Z", "2026-11-30T23:00:00.000Z")];

    expect(await resolve()).toBe("/staff/bookings?error=reschedule-ambassador-conflict");
  });

  it("allows a back-to-back time that only touches another session", async () => {
    ambassadorSessions = [
      otherSession("before", "2026-11-30T20:00:00.000Z", NEW_START),
      otherSession("after", NEW_END, "2026-11-30T23:00:00.000Z")
    ];

    expect(await resolve()).toBe("/staff/bookings?resolved=approve");
    expect(fake.rpcCalls).toHaveLength(1);
    const args = fake.rpcCalls[0].args;
    expect(fake.rpcCalls[0].name).toBe("resolve_session_reschedule");
    expect(Date.parse(String(args.p_new_start))).toBe(Date.parse(NEW_START));
    expect(Date.parse(String(args.p_new_end))).toBe(Date.parse(NEW_END));
  });

  it("ignores cancelled and declined sessions at the same time", async () => {
    ambassadorSessions = [
      otherSession("cancelled", NEW_START, NEW_END, "cancelled"),
      otherSession("declined", NEW_START, NEW_END, "declined")
    ];

    expect(await resolve()).toBe("/staff/bookings?resolved=approve");
  });

  it("surfaces a conflict the database found after the pre-check (a concurrent assignment)", async () => {
    rpcResult = { data: [{ outcome: "ambassador-conflict", conflict_session_id: "late" }] };

    expect(await resolve()).toBe("/staff/bookings?error=reschedule-ambassador-conflict");
    expect(fake.calls.filter((call) => call.table === "booking_status_history")).toEqual([]);
  });

  it("reports a request someone else already resolved", async () => {
    rpcResult = { data: [{ outcome: "not-pending" }] };

    expect(await resolve()).toBe("/staff/bookings?error=reschedule-resolution-failed");
  });

  it("declines without a conflict check and keeps the original time", async () => {
    ambassadorSessions = [otherSession("other", NEW_START, NEW_END)];

    expect(await resolve(resolveForm("decline"))).toBe("/staff/bookings?resolved=decline");
    expect(fake.rpcCalls[0].args).toMatchObject({ p_decision: "decline", p_new_start: null, p_new_end: null });
  });

  it("never updates booking_sessions directly", async () => {
    await resolve();

    expect(fake.calls.filter((call) => call.table === "booking_sessions" && call.operation === "update")).toEqual(
      []
    );
  });
});
