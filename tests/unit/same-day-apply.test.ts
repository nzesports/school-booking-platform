import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, redirectUrlOf } from "./support/fake-supabase";

// applyToSessionAction applies for the whole day's back-to-back sessions in
// one call to apply_to_session_group (0055): every session or none. The fake
// RPC below models that contract over an in-memory booking, so the tests can
// check the action never leaves the day half applied for.
const mocks = vi.hoisted(() => ({ client: null as unknown }));

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

import { applyToSessionAction } from "@/app/portal/actions";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const FIRST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECOND = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BOOKING_ID = "66666666-6666-4666-8666-666666666666";
// 11:00 and 12:00 on 11 Mar 2099 in Auckland: one NZ day, well in the future.
const DAY = Date.parse("2099-03-10T22:00:00Z");

type SessionRow = { id: string; status: string; assigned: string | null; startsAt: number };

let sessions: SessionRow[];
let applications: Map<string, string>;
let failSecondInsert: boolean;
let fake: ReturnType<typeof createFakeSupabase>;

// The RPC contract: validate the anchor, then apply to every open, future,
// unassigned session of the day that has no live application - atomically.
function applyGroup(args: Record<string, unknown>) {
  const anchor = sessions.find((row) => row.id === args.p_session_id);

  if (!anchor || anchor.assigned || !["tentative", "applied"].includes(anchor.status)) {
    return { data: [{ outcome: "session-not-open", booking_request_id: BOOKING_ID, session_ids: null }] };
  }
  if (anchor.startsAt <= Date.now()) {
    return { data: [{ outcome: "session-already-started", booking_request_id: BOOKING_ID, session_ids: null }] };
  }
  if (applications.has(anchor.id) && applications.get(anchor.id) !== "withdrawn") {
    return { data: [{ outcome: "already-applied", booking_request_id: BOOKING_ID, session_ids: null }] };
  }

  const members = sessions.filter(
    (row) =>
      !row.assigned &&
      ["tentative", "applied"].includes(row.status) &&
      row.startsAt > Date.now() &&
      (!applications.has(row.id) || applications.get(row.id) === "withdrawn")
  );

  // A failure part-way through rolls the whole transaction back.
  if (failSecondInsert && members.some((row) => row.id === SECOND)) {
    return { error: { code: "23505", message: "insert failed" } };
  }

  for (const member of members) {
    applications.set(member.id, "applied");
    member.status = "applied";
  }

  return {
    data: [{ outcome: "applied", booking_request_id: BOOKING_ID, session_ids: members.map((row) => row.id) }]
  };
}

function applyForm(sessionId = FIRST) {
  const form = new FormData();
  form.set("bookingSessionId", sessionId);
  form.set("returnTo", "/ambassador/bookings?tab=open");
  form.set("message", "Happy to cover both");
  return form;
}

async function apply(form = applyForm()) {
  const error = await applyToSessionAction(form).catch((caught: unknown) => caught);
  return redirectUrlOf(error);
}

function directSessionOrApplicationWrites() {
  return fake.calls.filter(
    (call) =>
      ["booking_sessions", "booking_session_applications", "booking_requests", "booking_status_history"].includes(
        call.table
      ) && call.operation !== "select"
  );
}

describe("applyToSessionAction for back-to-back sessions", () => {
  beforeEach(() => {
    sessions = [
      { id: FIRST, status: "tentative", assigned: null, startsAt: DAY },
      { id: SECOND, status: "tentative", assigned: null, startsAt: DAY + 60 * 60_000 }
    ];
    applications = new Map();
    failSecondInsert = false;
    fake = createFakeSupabase({
      rpc: (name, args) => (name === "apply_to_session_group" ? applyGroup(args) : undefined)
    });
    mocks.client = fake.client;
  });

  it("applies to the whole day in one database call and reports success", async () => {
    expect(await apply()).toBe("/ambassador/bookings?tab=open&applied=1");
    expect(fake.rpcCalls).toEqual([
      {
        name: "apply_to_session_group",
        args: { p_session_id: FIRST, p_actor_id: ACTOR_ID, p_message: "Happy to cover both" }
      }
    ]);
    expect([...applications.entries()]).toEqual([
      [FIRST, "applied"],
      [SECOND, "applied"]
    ]);
    expect(sessions.map((row) => row.status)).toEqual(["applied", "applied"]);
  });

  it("never writes sessions, applications or the booking itself", async () => {
    await apply();

    expect(directSessionOrApplicationWrites()).toEqual([]);
  });

  it("leaves neither session applied for when the group can't be applied for", async () => {
    failSecondInsert = true;

    expect(await apply()).toBe("/ambassador/bookings?tab=open&error=application-failed");
    expect(applications.size).toBe(0);
    expect(sessions.map((row) => row.status)).toEqual(["tentative", "tentative"]);
  });

  it("applies only to the sibling still missing an application", async () => {
    applications.set(SECOND, "applied");

    expect(await apply()).toBe("/ambassador/bookings?tab=open&applied=1");
    expect(sessions.map((row) => row.status)).toEqual(["applied", "tentative"]);
  });

  it("is safe to repeat: a second apply changes nothing and says so", async () => {
    await apply();
    const before = JSON.stringify([...applications.entries()]);

    expect(await apply()).toBe("/ambassador/bookings?tab=open&error=already-applied");
    expect(JSON.stringify([...applications.entries()])).toBe(before);
  });

  it("blocks applying to a session that has already started", async () => {
    sessions = [{ id: FIRST, status: "tentative", assigned: null, startsAt: Date.now() - 60_000 }];

    expect(await apply()).toBe("/ambassador/bookings?tab=open&error=session-already-started");
    expect(applications.size).toBe(0);
  });

  it("shows the database's refusal for an assigned session", async () => {
    sessions[0].assigned = "other-ambassador";

    expect(await apply()).toBe("/ambassador/bookings?tab=open&error=session-not-open");
  });

  it("passes on an inactive or unapproved ambassador refused by the database", async () => {
    fake = createFakeSupabase({
      rpc: () => ({ data: [{ outcome: "ambassador-not-found", booking_request_id: null, session_ids: null }] })
    });
    mocks.client = fake.client;

    expect(await apply()).toBe("/ambassador/bookings?tab=open&error=ambassador-not-found");
  });
});
