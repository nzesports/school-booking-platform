import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, filterValue, redirectUrlOf, type FakeResult } from "./support/fake-supabase";

// Withdrawals and assignments change the day's back-to-back sessions in one
// 0055 database call each. The database is the authority (validation,
// overlap, whole group or nothing); these tests pin the action's side of the
// contract: the right RPC and arguments, the outcome shown as-is, nothing
// written directly, and one set of notifications/emails - only after the call
// succeeded.
const mocks = vi.hoisted(() => ({
  client: null as unknown,
  actor: {
    id: "11111111-1111-4111-8111-111111111111",
    role: "staff",
    fullName: "Test Staff",
    email: "staff@example.nz",
    status: "active"
  },
  events: [] as string[]
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT:${url}`), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  })
}));
vi.mock("@/lib/services/auth", () => ({
  buildAuthConfirmUrl: vi.fn(),
  requirePortalAccess: vi.fn(async () => mocks.actor)
}));
vi.mock("@/lib/services/email-background", () => ({
  scheduleEmail: vi.fn(() => {
    mocks.events.push("email");
  })
}));
vi.mock("@/lib/services/calendar-sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/calendar-sync")>()),
  scheduleCalendarSync: vi.fn()
}));
vi.mock("@/lib/services/notifications", () => ({
  notifyStaff: vi.fn(async () => {
    mocks.events.push("notify-staff");
  }),
  notifyUser: vi.fn(async (userId: string) => {
    mocks.events.push(`notify:${userId}`);
  })
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.client }));
vi.mock("@/lib/services/availability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/availability")>()),
  isBookableDate: () => true,
  isBookableSessionTime: () => true,
  isWithinBookingWindow: () => true
}));
vi.mock("@/lib/services/availability-server", () => ({ loadAvailabilityConfig: vi.fn(async () => ({})) }));

import {
  assignAmbassadorAction,
  saveAmbassadorBookingAction,
  bulkUpdateBookingStatusAction,
  confirmRescheduledSessionAction,
  requestSchoolBookingChangeAction,
  requestSchoolSessionRescheduleAction,
  requestSessionWithdrawalAction,
  resolveSessionWithdrawalAction,
  updateBookingStatusAction,
  updateBookingStatusInPlaceAction,
  withdrawApplicationAction
} from "@/app/portal/actions";
import { scheduleCalendarSync } from "@/lib/services/calendar-sync";
import { scheduleEmail } from "@/lib/services/email-background";
import { notifyStaff, notifyUser } from "@/lib/services/notifications";

const STAFF = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "staff",
  fullName: "Test Staff",
  email: "staff@example.nz",
  status: "active"
};
const AMBASSADOR_USER = {
  id: "22222222-2222-4222-8222-222222222222",
  role: "ambassador",
  fullName: "Aroha Ambassador",
  email: "aroha@example.nz",
  status: "active"
};
const FIRST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECOND = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BOOKING_ID = "66666666-6666-4666-8666-666666666666";
const NEW_AMBASSADOR = "44444444-4444-4444-8444-444444444444";
const OLD_AMBASSADOR = "55555555-5555-4555-8555-555555555555";
const APPLICANT_A = "77777777-7777-4777-8777-777777777777";
const APPLICANT_B = "88888888-8888-4888-8888-888888888888";

const SCHOOL_USER = {
  id: "33333333-3333-4333-8333-333333333333",
  role: "school",
  fullName: "Sam School",
  email: "sam@school.nz",
  status: "active"
};
const SESSION_STARTS_AT = "2099-03-10T22:00:00+00:00";

let fake: ReturnType<typeof createFakeSupabase>;
let rpcResult: FakeResult;
let sessionUpdateResult: FakeResult | undefined;
let stillFlagged: boolean;
let currentSessionStatus: string;
let directoryOnly: Set<string>;
const OWN_PROFILE = "12121212-1212-4212-8212-121212121212";
const FLAGGED_AT = "2099-01-01T00:00:00.123456+00:00";

const userIdFor = (profileId: string) => `user-of-${profileId}`;

function form(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

async function run(action: (formData: FormData) => Promise<void>, data: FormData) {
  const error = await action(data).catch((caught: unknown) => caught);
  return redirectUrlOf(error);
}

function directGroupWrites() {
  return fake.calls.filter(
    (call) =>
      ["booking_sessions", "booking_session_applications", "booking_status_history", "booking_activity_logs"].includes(
        call.table
      ) && call.operation !== "select"
  );
}

function group(outcome: string, extra: Record<string, unknown> = {}): FakeResult {
  return {
    data: [{ outcome, booking_request_id: BOOKING_ID, session_ids: [FIRST, SECOND], ...extra }]
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.events.length = 0;
  mocks.actor = STAFF;
  rpcResult = group("assigned");
  sessionUpdateResult = undefined;
  stillFlagged = false;
  currentSessionStatus = "confirmed";
  directoryOnly = new Set();
  fake = createFakeSupabase({
    query: (call) => {
      if (call.table === "booking_sessions" && call.operation === "update" && sessionUpdateResult) {
        return sessionUpdateResult;
      }
      if (call.table === "booking_sessions" && call.single) {
        return {
          data: {
            id: FIRST,
            booking_request_id: BOOKING_ID,
            status: currentSessionStatus,
            starts_at: SESSION_STARTS_AT,
            ends_at: "2099-03-10T23:00:00+00:00",
            school_id: "school-1",
            presentation_type_id: "presentation-1",
            reschedule_confirmation_needed_at: stillFlagged ? FLAGGED_AT : null
          }
        };
      }
      if (call.table === "booking_sessions" && filterValue(call, "id", "in")) {
        return {
          data: [
            { id: FIRST, assigned_ambassador_id: OLD_AMBASSADOR, starts_at: SESSION_STARTS_AT, presentation_type_id: "p" },
            { id: SECOND, assigned_ambassador_id: OLD_AMBASSADOR, starts_at: SESSION_STARTS_AT, presentation_type_id: "p" }
          ]
        };
      }
      if (call.table === "schools") {
        return { data: { id: "school-1", name: "Harbour College", address: "1 Harbour Rd", region_id: null, status: "active" } };
      }
      if (call.table === "presentation_types") {
        return { data: { id: "presentation-1", title: "Digital Wellbeing", is_active: true } };
      }
      if (call.table === "ambassador_profiles" && call.single && filterValue(call, "user_id")) {
        return { data: { id: OWN_PROFILE, status: "approved" } };
      }
      if (call.table === "ambassador_profiles" && call.single) {
        const profileId = String(filterValue(call, "id"));
        return { data: { user_id: directoryOnly.has(profileId) ? null : userIdFor(profileId) } };
      }
      if (call.table === "ambassador_profiles") {
        const ids = (filterValue(call, "id", "in") as string[]) ?? [];
        return { data: ids.map((id) => ({ id, user_id: userIdFor(id) })) };
      }
      if (call.table === "profiles") {
        return { data: { email: `${String(filterValue(call, "id"))}@example.nz`, full_name: "Someone" } };
      }
      if (call.table === "booking_requests" && call.operation === "select") {
        return { data: { id: BOOKING_ID, school_id: "school-1", submitted_by_user_id: null } };
      }
      if (call.table === "booking_requests" && call.operation === "insert") return { data: { id: BOOKING_ID } };
      return undefined;
    },
    rpc: () => {
      mocks.events.push("rpc");
      return rpcResult;
    }
  });
  mocks.client = fake.client;
});

describe("withdrawApplicationAction", () => {
  const withdrawForm = () =>
    form({ bookingSessionId: FIRST, reason: "Can no longer travel", returnTo: "/ambassador/open-bookings" });

  beforeEach(() => {
    mocks.actor = AMBASSADOR_USER;
  });

  it("withdraws the day's applications in one call and tells staff once, afterwards", async () => {
    rpcResult = group("withdrawn");

    expect(await run(withdrawApplicationAction, withdrawForm())).toBe(
      "/ambassador/open-bookings?withdrawn=application"
    );
    expect(fake.rpcCalls).toEqual([
      {
        name: "withdraw_application_group",
        args: { p_session_id: FIRST, p_actor_id: AMBASSADOR_USER.id, p_reason: "Can no longer travel" }
      }
    ]);
    expect(notifyStaff).toHaveBeenCalledTimes(1);
    expect(mocks.events).toEqual(["rpc", "notify-staff"]);
    expect(directGroupWrites()).toEqual([]);
  });

  it("reports a repeat (nothing left to withdraw) without notifying anyone", async () => {
    rpcResult = group("application-not-found", { session_ids: null });

    expect(await run(withdrawApplicationAction, withdrawForm())).toBe(
      "/ambassador/open-bookings?error=application-not-found"
    );
    expect(notifyStaff).not.toHaveBeenCalled();
  });

  it("treats a database error as nothing withdrawn", async () => {
    rpcResult = { error: { code: "40P01", message: "deadlock detected" } };

    expect(await run(withdrawApplicationAction, withdrawForm())).toBe(
      "/ambassador/open-bookings?error=application-not-found"
    );
    expect(notifyStaff).not.toHaveBeenCalled();
  });
});

describe("requestSessionWithdrawalAction", () => {
  const requestForm = () =>
    form({
      bookingSessionId: FIRST,
      reasonType: "unavailable",
      reason: "Family emergency that week",
      returnTo: "/ambassador/upcoming"
    });

  beforeEach(() => {
    mocks.actor = AMBASSADOR_USER;
  });

  it("requests withdrawal for the whole day and tells staff once", async () => {
    rpcResult = group("requested");

    expect(await run(requestSessionWithdrawalAction, requestForm())).toBe(
      "/ambassador/upcoming?requested=withdrawal"
    );
    expect(fake.rpcCalls[0]).toEqual({
      name: "request_session_withdrawal_group",
      args: {
        p_session_id: FIRST,
        p_actor_id: AMBASSADOR_USER.id,
        p_reason_type: "unavailable",
        p_reason: "Family emergency that week"
      }
    });
    expect(notifyStaff).toHaveBeenCalledTimes(1);
    expect(directGroupWrites()).toEqual([]);
  });

  it("changes nothing when a sibling can't be withdrawn from", async () => {
    rpcResult = group("same-day-group-blocked", { session_ids: null });

    expect(await run(requestSessionWithdrawalAction, requestForm())).toBe(
      "/ambassador/upcoming?error=same-day-group-blocked"
    );
    expect(notifyStaff).not.toHaveBeenCalled();
  });

  it("is safe to repeat", async () => {
    rpcResult = group("withdrawal-already-requested", { session_ids: null });

    expect(await run(requestSessionWithdrawalAction, requestForm())).toBe(
      "/ambassador/upcoming?error=withdrawal-already-requested"
    );
    expect(notifyStaff).not.toHaveBeenCalled();
  });

  it("rejects an invalid reason type before calling the database", async () => {
    const data = requestForm();
    data.set("reasonType", "bored");

    expect(await run(requestSessionWithdrawalAction, data)).toBe("/ambassador/upcoming?error=invalid-withdrawal");
    expect(fake.rpcCalls).toEqual([]);
  });
});

describe("resolveSessionWithdrawalAction", () => {
  const resolveForm = (decision: string) =>
    form({ bookingSessionId: FIRST, decision, returnTo: "/staff/bookings" });

  it("reopens the whole day, messages the ambassador once and syncs every session", async () => {
    rpcResult = group("resolved", { ambassador_profile_id: OLD_AMBASSADOR, booking_cancelled: false });

    expect(await run(resolveSessionWithdrawalAction, resolveForm("approve"))).toBe(
      "/staff/bookings?withdrawal=approved"
    );
    expect(fake.rpcCalls[0]).toEqual({
      name: "resolve_session_withdrawal_group",
      args: { p_session_id: FIRST, p_actor_id: STAFF.id, p_decision: "reopen", p_note: null }
    });
    expect(notifyUser).toHaveBeenCalledTimes(1);
    expect(notifyUser).toHaveBeenCalledWith(userIdFor(OLD_AMBASSADOR), expect.anything());
    expect(scheduleEmail).toHaveBeenCalledTimes(1);
    expect(scheduleCalendarSync).toHaveBeenCalledWith({ sessionIds: [FIRST, SECOND] });
    expect(mocks.events[0]).toBe("rpc");
    expect(directGroupWrites()).toEqual([]);
  });

  it("maps the old 'decline' value to keeping the ambassador", async () => {
    rpcResult = group("resolved", { ambassador_profile_id: OLD_AMBASSADOR });

    expect(await run(resolveSessionWithdrawalAction, resolveForm("decline"))).toBe(
      "/staff/bookings?withdrawal=declined"
    );
    expect(fake.rpcCalls[0].args.p_decision).toBe("keep");
  });

  it("sends nothing when someone else already resolved it", async () => {
    rpcResult = group("no-withdrawal-pending", { session_ids: null });

    expect(await run(resolveSessionWithdrawalAction, resolveForm("cancel_rebooked"))).toBe(
      "/staff/bookings?error=no-withdrawal-pending"
    );
    expect(notifyUser).not.toHaveBeenCalled();
    expect(scheduleEmail).not.toHaveBeenCalled();
    expect(scheduleCalendarSync).not.toHaveBeenCalled();
  });
});

describe("assignAmbassadorAction", () => {
  const assignForm = (ambassadorProfileId: string) =>
    form({ bookingSessionId: FIRST, ambassadorProfileId, returnTo: "/staff/bookings" });

  it("assigns the day in one call: one email and notice, declined applicants told once each", async () => {
    rpcResult = group("assigned", {
      previous_ambassador_id: null,
      declined_ambassador_ids: [APPLICANT_A, APPLICANT_B],
      replaced_withdrawal: false
    });

    expect(await run(assignAmbassadorAction, assignForm(NEW_AMBASSADOR))).toBe("/staff/bookings?assigned=1");
    expect(fake.rpcCalls).toEqual([
      {
        name: "assign_ambassador_group",
        args: { p_session_id: FIRST, p_actor_id: STAFF.id, p_ambassador_profile_id: NEW_AMBASSADOR }
      }
    ]);
    expect(scheduleEmail).toHaveBeenCalledTimes(1);
    expect(scheduleCalendarSync).toHaveBeenCalledWith({ sessionIds: [FIRST, SECOND] });
    expect(vi.mocked(notifyUser).mock.calls.map(([userId]) => userId).sort()).toEqual(
      [userIdFor(NEW_AMBASSADOR), userIdFor(APPLICANT_A), userIdFor(APPLICANT_B)].sort()
    );
    expect(mocks.events[0]).toBe("rpc");
    expect(directGroupWrites()).toEqual([]);
  });

  it("shows the database's overlap refusal and sends nothing", async () => {
    rpcResult = group("ambassador-conflict", { session_ids: null, conflict_session_id: "other-session" });

    expect(await run(assignAmbassadorAction, assignForm(NEW_AMBASSADOR))).toBe(
      "/staff/bookings?error=ambassador-conflict"
    );
    expect(scheduleEmail).not.toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
    expect(scheduleCalendarSync).not.toHaveBeenCalled();
  });

  it("treats a repeat of the same assignment as done, without re-sending", async () => {
    rpcResult = group("already-assigned", { session_ids: null });

    expect(await run(assignAmbassadorAction, assignForm(NEW_AMBASSADOR))).toBe("/staff/bookings?assigned=1");
    expect(scheduleEmail).not.toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("tells a replaced ambassador whose withdrawal this approves", async () => {
    rpcResult = group("assigned", {
      previous_ambassador_id: OLD_AMBASSADOR,
      declined_ambassador_ids: [],
      replaced_withdrawal: true
    });

    await run(assignAmbassadorAction, assignForm(NEW_AMBASSADOR));

    expect(notifyUser).toHaveBeenCalledWith(
      userIdFor(OLD_AMBASSADOR),
      expect.objectContaining({ type: "session_withdrawal_approved" })
    );
  });

  it("unassigns through the same call, tells the previous ambassador once and syncs every session", async () => {
    rpcResult = group("unassigned", { previous_ambassador_id: OLD_AMBASSADOR });

    expect(await run(assignAmbassadorAction, assignForm(""))).toBe("/staff/bookings?unassigned=1");
    expect(fake.rpcCalls[0].args).toEqual({
      p_session_id: FIRST,
      p_actor_id: STAFF.id,
      p_ambassador_profile_id: null
    });
    expect(notifyUser).toHaveBeenCalledTimes(1);
    expect(notifyUser).toHaveBeenCalledWith(userIdFor(OLD_AMBASSADOR), expect.anything());
    expect(scheduleEmail).not.toHaveBeenCalled();
    expect(scheduleCalendarSync).toHaveBeenCalledWith({ sessionIds: [FIRST, SECOND] });
  });

  it("syncs the calendar for a directory-only ambassador who has no email", async () => {
    directoryOnly.add(NEW_AMBASSADOR);
    rpcResult = group("assigned", { previous_ambassador_id: null, declined_ambassador_ids: [], replaced_withdrawal: false });

    expect(await run(assignAmbassadorAction, assignForm(NEW_AMBASSADOR))).toBe("/staff/bookings?assigned=1");
    expect(scheduleEmail).not.toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
    expect(scheduleCalendarSync).toHaveBeenCalledWith({ sessionIds: [FIRST, SECOND] });
  });

  it("refuses an ambassador whose portal account is inactive (decided by the database)", async () => {
    rpcResult = group("ambassador-not-approved", { session_ids: null });

    expect(await run(assignAmbassadorAction, assignForm(NEW_AMBASSADOR))).toBe(
      "/staff/bookings?error=ambassador-not-approved"
    );
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it("passes on terminal-session protection from the database", async () => {
    rpcResult = group("session-not-assignable", { session_ids: null });

    expect(await run(assignAmbassadorAction, assignForm(NEW_AMBASSADOR))).toBe(
      "/staff/bookings?error=session-not-assignable"
    );
  });

  it("reports a failed call as not assigned", async () => {
    rpcResult = { error: { code: "40P01", message: "deadlock detected" } };

    expect(await run(assignAmbassadorAction, assignForm(NEW_AMBASSADOR))).toBe(
      "/staff/bookings?error=assign-failed"
    );
    expect(await run(assignAmbassadorAction, assignForm(""))).toBe("/staff/bookings?error=unassign-failed");
    expect(notifyUser).not.toHaveBeenCalled();
  });
});

function directBookingWrites() {
  return fake.calls.filter(
    (call) =>
      ["booking_requests", "booking_sessions", "booking_status_history", "booking_activity_logs"].includes(call.table) &&
      call.operation !== "select"
  );
}

function statusRow(extra: Record<string, unknown> = {}) {
  return {
    outcome: "updated",
    booking_id: BOOKING_ID,
    old_status: "tentative",
    changed_session_ids: [FIRST, SECOND],
    conflict_session_id: null,
    ...extra
  };
}

describe("updateBookingStatusAction", () => {
  const statusForm = (fields: Record<string, string> = {}) =>
    form({
      bookingRequestId: BOOKING_ID,
      status: "confirmed",
      expectedStatus: "tentative",
      emailChoice: "send",
      returnTo: "/staff/bookings",
      ...fields
    });

  it("changes the booking and its sessions in one call, from the status staff saw", async () => {
    rpcResult = { data: [statusRow()] };

    expect(await run(updateBookingStatusAction, statusForm())).toBe("/staff/bookings?updated=status");
    expect(fake.rpcCalls).toEqual([
      {
        name: "update_booking_status_batch",
        args: {
          p_actor_id: STAFF.id,
          p_status: "confirmed",
          p_bookings: [{ id: BOOKING_ID, expected_status: "tentative" }],
          p_reason: null,
          p_bulk: false,
          p_email_choice: "send"
        }
      }
    ]);
    expect(directBookingWrites()).toEqual([]);
    // One school email, after the call, for the sessions that changed.
    expect(scheduleEmail).toHaveBeenCalledTimes(1);
    expect(mocks.events).toEqual(["rpc", "email"]);
  });

  it("falls back to the status read under the lock when the form sends none", async () => {
    rpcResult = { data: [statusRow()] };

    await run(updateBookingStatusAction, statusForm({ expectedStatus: "" }));

    expect(fake.rpcCalls[0].args.p_bookings).toEqual([{ id: BOOKING_ID, expected_status: null }]);
  });

  it("refuses without writing or emailing when the booking changed meanwhile", async () => {
    rpcResult = { data: [statusRow({ outcome: "booking-status-changed", changed_session_ids: null })] };

    expect(await run(updateBookingStatusAction, statusForm())).toBe("/staff/bookings?error=booking-status-changed");
    expect(scheduleEmail).not.toHaveBeenCalled();
    expect(scheduleCalendarSync).not.toHaveBeenCalled();
  });

  it("treats a failure inside the transaction as nothing changed", async () => {
    rpcResult = { error: { code: "23514", message: "check violation after the parent update" } };

    expect(await run(updateBookingStatusAction, statusForm())).toBe("/staff/bookings?error=status-update-failed");
    expect(directBookingWrites()).toEqual([]);
    expect(scheduleEmail).not.toHaveBeenCalled();
  });

  it("passes on the database's refusals: future completion and reinstated double-booking", async () => {
    rpcResult = { data: [statusRow({ outcome: "cannot-complete-future" })] };
    expect(await run(updateBookingStatusAction, statusForm({ status: "closed" }))).toBe(
      "/staff/bookings?error=cannot-complete-future"
    );

    rpcResult = { data: [statusRow({ outcome: "reinstate-ambassador-conflict", conflict_session_id: "other" })] };
    expect(await run(updateBookingStatusAction, statusForm({ expectedStatus: "cancelled" }))).toBe(
      "/staff/bookings?error=reinstate-ambassador-conflict"
    );
  });

  it("doesn't email when nothing changed or staff chose not to", async () => {
    rpcResult = { data: [statusRow({ changed_session_ids: [] })] };
    await run(updateBookingStatusAction, statusForm());
    rpcResult = { data: [statusRow()] };
    await run(updateBookingStatusAction, statusForm({ emailChoice: "skip" }));

    expect(scheduleEmail).not.toHaveBeenCalled();
  });

  it("shows the refusal inside the booking dialog too", async () => {
    rpcResult = { data: [statusRow({ outcome: "booking-status-changed" })] };

    const state = await updateBookingStatusInPlaceAction(null, statusForm());
    expect(state).toMatchObject({ tone: "error" });
  });
});

describe("bulkUpdateBookingStatusAction", () => {
  const OTHER_BOOKING = "99999999-9999-4999-8999-999999999999";
  const bulkForm = () =>
    form({
      bookingRequestId: [BOOKING_ID, OTHER_BOOKING],
      [`expectedStatus.${BOOKING_ID}`]: "tentative",
      [`expectedStatus.${OTHER_BOOKING}`]: "cancelled",
      status: "confirmed",
      emailChoice: "send",
      returnTo: "/staff/bookings"
    });

  it("sends the whole batch, with each booking's expected status, in one call", async () => {
    rpcResult = {
      data: [statusRow(), statusRow({ booking_id: OTHER_BOOKING, old_status: "cancelled", changed_session_ids: [] })]
    };

    expect(await run(bulkUpdateBookingStatusAction, bulkForm())).toBe("/staff/bookings?updated=bulk-status");
    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0].args).toMatchObject({
      p_status: "confirmed",
      p_bulk: true,
      p_bookings: [
        { id: BOOKING_ID, expected_status: "tentative" },
        { id: OTHER_BOOKING, expected_status: "cancelled" }
      ]
    });
    expect(directBookingWrites()).toEqual([]);
    // Only the booking whose sessions changed is emailed.
    expect(scheduleEmail).toHaveBeenCalledTimes(1);
  });

  it("changes no booking when any one of them was changed meanwhile", async () => {
    rpcResult = { data: [statusRow({ outcome: "booking-status-changed", booking_id: OTHER_BOOKING })] };

    expect(await run(bulkUpdateBookingStatusAction, bulkForm())).toBe("/staff/bookings?error=booking-status-changed");
    expect(scheduleEmail).not.toHaveBeenCalled();
    expect(scheduleCalendarSync).not.toHaveBeenCalled();
  });
});

describe("requestSchoolBookingChangeAction (school cancellation)", () => {
  const cancelForm = () =>
    form({ bookingRequestId: BOOKING_ID, intent: "cancel", reason: "Exams moved", returnTo: "/school/bookings" });

  beforeEach(() => {
    mocks.actor = SCHOOL_USER;
  });

  it("cancels in one call and notifies only afterwards, for the sessions it cancelled", async () => {
    rpcResult = group("cancelled", { booking_cancelled: true, previous_status: "confirmed" });

    expect(await run(requestSchoolBookingChangeAction, cancelForm())).toBe("/school/bookings?cancelled=1");
    expect(fake.rpcCalls).toEqual([
      {
        name: "cancel_school_booking",
        args: { p_booking_id: BOOKING_ID, p_actor_id: SCHOOL_USER.id, p_notes: "Exams moved" }
      }
    ]);
    expect(directBookingWrites()).toEqual([]);
    expect(mocks.events[0]).toBe("rpc");
    expect(notifyStaff).toHaveBeenCalledTimes(1);
    expect(notifyUser).toHaveBeenCalledWith(userIdFor(OLD_AMBASSADOR), expect.anything());
    expect(scheduleEmail).toHaveBeenCalledTimes(1);
  });

  it("leaves everything as it was when the transaction fails part-way", async () => {
    rpcResult = { error: { code: "XX000", message: "session update failed" } };

    expect(await run(requestSchoolBookingChangeAction, cancelForm())).toBe(
      "/school/bookings?error=change-request-failed"
    );
    expect(directBookingWrites()).toEqual([]);
    expect(notifyStaff).not.toHaveBeenCalled();
    expect(scheduleEmail).not.toHaveBeenCalled();
  });

  it.each(["booking-not-owned", "booking-not-cancellable", "booking-not-found"])(
    "passes on %s without notifying anyone",
    async (outcome) => {
      rpcResult = group(outcome, { session_ids: null });

      expect(await run(requestSchoolBookingChangeAction, cancelForm())).toBe(`/school/bookings?error=${outcome}`);
      expect(notifyStaff).not.toHaveBeenCalled();
    }
  );
});

describe("requestSchoolSessionRescheduleAction", () => {
  const rescheduleForm = () =>
    form({
      bookingRequestId: BOOKING_ID,
      bookingSessionId: FIRST,
      preferredDate: "2099-04-01",
      notes: "Swimming sports clash",
      returnTo: "/school/bookings"
    });

  beforeEach(() => {
    mocks.actor = SCHOOL_USER;
  });

  it("sends the status and start it read, so a later change isn't overwritten", async () => {
    rpcResult = { data: [{ outcome: "requested", previous_status: "confirmed" }] };

    expect(await run(requestSchoolSessionRescheduleAction, rescheduleForm())).toBe(
      "/school/bookings?requested=reschedule"
    );
    expect(fake.rpcCalls[0]).toEqual({
      name: "request_school_session_reschedule",
      args: {
        p_booking_id: BOOKING_ID,
        p_session_id: FIRST,
        p_actor_id: SCHOOL_USER.id,
        p_preferred_date: "2099-04-01",
        p_notes: "Swimming sports clash",
        p_expected_status: "confirmed",
        p_expected_starts_at: SESSION_STARTS_AT
      }
    });
    expect(directBookingWrites()).toEqual([]);
  });

  it("reports a session that was cancelled or moved after it was read", async () => {
    rpcResult = { data: [{ outcome: "change-request-failed", previous_status: "cancelled" }] };

    expect(await run(requestSchoolSessionRescheduleAction, rescheduleForm())).toBe(
      "/school/bookings?error=change-request-failed"
    );
    expect(notifyStaff).not.toHaveBeenCalled();
    expect(scheduleEmail).not.toHaveBeenCalled();
  });
});

describe("confirmRescheduledSessionAction", () => {
  const confirmForm = (fields: Record<string, string> = {}) =>
    form({ sessionId: FIRST, expectedStartsAt: SESSION_STARTS_AT, expectedFlaggedAt: FLAGGED_AT, ...fields });

  it("confirms only the start time and school move staff were shown", async () => {
    sessionUpdateResult = { data: { id: FIRST, booking_request_id: BOOKING_ID, starts_at: SESSION_STARTS_AT } };

    expect(await confirmRescheduledSessionAction(null, confirmForm())).toMatchObject({ tone: "success" });
    const update = fake.calls.find((call) => call.table === "booking_sessions" && call.operation === "update");
    expect(update && filterValue(update, "starts_at")).toBe(SESSION_STARTS_AT);
    expect(update && filterValue(update, "reschedule_confirmation_needed_at")).toBe(FLAGGED_AT);
  });

  it.each([
    ["missing", { expectedFlaggedAt: "" }],
    ["malformed", { expectedFlaggedAt: "yesterday" }],
    ["missing start", { expectedStartsAt: "" }]
  ])("refuses a %s token instead of confirming unchecked", async (_label, fields) => {
    expect(await confirmRescheduledSessionAction(null, confirmForm(fields))).toMatchObject({ tone: "error" });
    expect(fake.calls.filter((call) => call.table === "booking_sessions" && call.operation === "update")).toEqual([]);
  });

  it("refuses when the school moved it away and back to the same time (new move stamp)", async () => {
    // Same start time, but the row's stamp is a later move, so the
    // conditional update matches nothing and the flag is still set.
    sessionUpdateResult = { data: null };
    stillFlagged = true;

    expect(
      await confirmRescheduledSessionAction(null, confirmForm({ expectedFlaggedAt: "2098-12-31T00:00:00+00:00" }))
    ).toMatchObject({ tone: "error" });
    expect(scheduleCalendarSync).not.toHaveBeenCalled();
  });

  it("refuses when the school moved the session again after the panel loaded", async () => {
    sessionUpdateResult = { data: null };
    stillFlagged = true;

    expect(await confirmRescheduledSessionAction(null, confirmForm())).toMatchObject({ tone: "error" });
    expect(scheduleCalendarSync).not.toHaveBeenCalled();
  });

  it("does not call a cancelled session confirmed merely because its flag cleared", async () => {
    sessionUpdateResult = { data: null };
    stillFlagged = false;
    currentSessionStatus = "cancelled";
    expect(await confirmRescheduledSessionAction(null, confirmForm())).toMatchObject({ tone: "error" });
    expect(scheduleCalendarSync).not.toHaveBeenCalled();
  });

  it("treats a repeat after someone else confirmed as done", async () => {
    sessionUpdateResult = { data: null };
    stillFlagged = false;

    expect(await confirmRescheduledSessionAction(null, confirmForm())).toMatchObject({ tone: "success" });
  });
});

describe("saveAmbassadorBookingAction (checked session insert)", () => {
  const bookingForm = () =>
    form({
      schoolId: "13131313-1313-4313-8313-131313131313",
      presentationTypeId: "14141414-1414-4414-8414-141414141414",
      date: "2099-05-04",
      startTime: "09:30",
      durationMinutes: "45",
      yearLevels: "Years 9 to 10",
      expectedStudentCount: "80",
      schoolSource: "existing",
      returnTo: "/ambassador/upcoming"
    });

  beforeEach(() => {
    mocks.actor = AMBASSADOR_USER;
  });

  it("asks the database for the ambassador themselves, in person, report not yet due", async () => {
    rpcResult = { data: [{ outcome: "ambassador-conflict", session_id: null, conflict_session_id: "other" }] };

    await run(saveAmbassadorBookingAction, bookingForm());

    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0]).toMatchObject({
      name: "insert_booking_session_checked",
      args: {
        p_actor_id: AMBASSADOR_USER.id,
        p_booking_id: BOOKING_ID,
        p_session: {
          assigned_ambassador_id: OWN_PROFILE,
          delivery_mode: "in_person",
          meeting_url: null,
          status: "ambassador_assigned",
          report_status: "not_submitted"
        }
      }
    });
  });

  it("removes the booking and explains a clash, with no notices or emails", async () => {
    rpcResult = { data: [{ outcome: "ambassador-conflict", session_id: null, conflict_session_id: "other" }] };

    expect(await run(saveAmbassadorBookingAction, bookingForm())).toBe(
      "/ambassador/upcoming?error=ambassador-booking-conflict"
    );
    expect(fake.calls.some((call) => call.table === "booking_requests" && call.operation === "delete")).toBe(true);
    expect(fake.calls.some((call) => call.table === "booking_sessions" && call.operation === "insert")).toBe(false);
    expect(fake.calls.some((call) => call.table === "booking_status_history")).toBe(false);
    expect(notifyStaff).not.toHaveBeenCalled();
    expect(scheduleEmail).not.toHaveBeenCalled();
    expect(scheduleCalendarSync).not.toHaveBeenCalled();
  });

  it.each(["not-authorized", "invalid-session", "ambassador-not-approved"])(
    "removes the booking when the database refuses with %s",
    async (outcome) => {
      rpcResult = { data: [{ outcome, session_id: null, conflict_session_id: null }] };

      expect(await run(saveAmbassadorBookingAction, bookingForm())).toBe(
        "/ambassador/upcoming?error=booking-session-save-failed"
      );
      expect(fake.calls.some((call) => call.table === "booking_requests" && call.operation === "delete")).toBe(true);
    }
  );
});
