import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, filterValue, type FakeCall, type FakeResult } from "./support/fake-supabase";

// loadPaymentDetails builds the finance invoice's session line. It must list
// exactly the sessions the payment's report covered, as recorded atomically
// by submit_ambassador_report_group (0054) in booking_activity_logs
// ("report.covered_by_same_day_report"), and refuse (null) rather than send
// a partial or misattributed invoice. The real function runs against an
// in-memory model of the tables below.
const mocks = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.client }));

import { describePaymentAmount } from "@/lib/payment-breakdown";
import { loadPaymentDetails } from "@/lib/services/payment-automation";
import { formatTime } from "@/lib/utils";

const PAYMENT_ID = "11111111-1111-4111-8111-111111111111";
const AMB = "22222222-2222-4222-8222-222222222222";
const OTHER_AMB = "23232323-2323-4323-8323-232323232323";
const BOOKING = "33333333-3333-4333-8333-333333333333";
const OTHER_BOOKING = "34343434-3434-4434-8434-343434343434";
const REPORT = "44444444-4444-4444-8444-444444444444";
const SCHOOL = "school-1";
const WELLBEING = "presentation-wellbeing";
const ESPORTS = "presentation-esports";

// 15 Sep 2026 is NZST (+12): 09:00 NZ = 21:00Z the day before.
const FIRST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // 09:00-10:00, covered sibling
const ANCHOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // 10:00-11:00, the paid session
const SAME_DAY_UNRELATED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // 13:00, not covered
const NEXT_WEEK = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"; // a later session, not covered

type Session = {
  id: string;
  booking_request_id: string | null;
  school_id: string | null;
  presentation_type_id: string | null;
  assigned_ambassador_id: string | null;
  starts_at: string;
  ends_at: string;
};
type Log = {
  id: string;
  action: string;
  booking_request_id: string | null;
  booking_session_id: string | null;
  details: Record<string, unknown> | null;
};

let payment: Record<string, unknown>;
let sessions: Map<string, Session>;
let reports: Array<{ id: string; booking_session_id: string; ambassador_profile_id: string }>;
let logs: Log[];
let failing: Set<string>;
let fake: ReturnType<typeof createFakeSupabase>;

function session(id: string, start: string, end: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    booking_request_id: BOOKING,
    school_id: SCHOOL,
    presentation_type_id: WELLBEING,
    assigned_ambassador_id: AMB,
    starts_at: start,
    ends_at: end,
    ...overrides
  };
}

function coverage(sessionId: string | null, overrides: Partial<Log> = {}, details: Record<string, unknown> = {}): Log {
  return {
    id: `log-${logs.length + 1}`,
    action: "report.covered_by_same_day_report",
    booking_request_id: BOOKING,
    booking_session_id: sessionId,
    details: { report_id: REPORT, reported_session_id: ANCHOR, ...details },
    ...overrides
  };
}

function answer(call: FakeCall): FakeResult | undefined {
  // "table" fails list queries, "table:single" fails single-row lookups.
  const key = `${call.table}${call.single ? ":single" : ""}`;
  if (failing.has(key)) return { error: { code: "XX000", message: `${key} failed` } };

  switch (call.table) {
    case "payments":
      return { data: payment };
    case "booking_sessions": {
      if (call.single) return { data: sessions.get(String(filterValue(call, "id"))) ?? null };
      const ids = (filterValue(call, "id", "in") as string[]) ?? [];
      return { data: ids.map((id) => sessions.get(id)).filter(Boolean) };
    }
    case "ambassador_reports":
      return {
        data: reports.filter(
          (report) =>
            report.booking_session_id === filterValue(call, "booking_session_id") &&
            report.ambassador_profile_id === filterValue(call, "ambassador_profile_id")
        )
      };
    case "booking_activity_logs":
      return {
        data: logs.filter(
          (log) =>
            log.action === filterValue(call, "action") &&
            String(log.details?.report_id) === filterValue(call, "details->>report_id")
        )
      };
    case "schools":
      return { data: { name: "Rangitoto College" } };
    case "presentation_types": {
      const titles: Record<string, string> = { [WELLBEING]: "Digital Wellbeing", [ESPORTS]: "Understanding Esports" };
      const ids = (filterValue(call, "id", "in") as string[]) ?? [];
      return { data: ids.filter((id) => titles[id]).map((id) => ({ id, title: titles[id] })) };
    }
    case "ambassador_profiles":
      return { data: { id: AMB, user_id: "user-1" } };
    case "profiles":
      return { data: { id: "user-1", full_name: "Aroha Ambassador" } };
    default:
      return undefined;
  }
}

const when = (start: string, end: string) => `${formatTime(start)}–${formatTime(end)}`;
const FIRST_TIMES = ["2026-09-14T21:00:00.000Z", "2026-09-14T22:00:00.000Z"] as const;
const ANCHOR_TIMES = ["2026-09-14T22:00:00.000Z", "2026-09-14T23:00:00.000Z"] as const;
const PAIR =
  `Rangitoto College — 2 sessions: ` +
  `1. Digital Wellbeing, 15 Sep 2026, ${when(...FIRST_TIMES)}; ` +
  `2. Understanding Esports, 15 Sep 2026, ${when(...ANCHOR_TIMES)}`;
const ANCHOR_ONLY = `Understanding Esports — Rangitoto College — 15 Sep 2026, ${when(...ANCHOR_TIMES)}`;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  payment = {
    id: PAYMENT_ID,
    booking_session_id: ANCHOR,
    ambassador_profile_id: AMB,
    amount_cents: 30000,
    base_amount_cents: 25000,
    sourcing_bonus_cents: 0,
    additional_session_cents: 5000,
    extra_amount_cents: 0,
    payment_note: null,
    currency: "NZD",
    invoice_number: "INV-2026-11111111",
    invoice_generated_at: "2026-09-20T00:00:00.000Z",
    bank_account_name: "A Ambassador",
    bank_account_number: "12-3456-7890123-00",
    gst_number: null
  };
  sessions = new Map(
    [
      session(FIRST, ...FIRST_TIMES),
      session(ANCHOR, ...ANCHOR_TIMES, { presentation_type_id: ESPORTS }),
      session(SAME_DAY_UNRELATED, "2026-09-15T01:00:00.000Z", "2026-09-15T02:00:00.000Z"),
      session(NEXT_WEEK, "2026-09-21T21:00:00.000Z", "2026-09-21T22:00:00.000Z")
    ].map((row) => [row.id, row])
  );
  reports = [{ id: REPORT, booking_session_id: ANCHOR, ambassador_profile_id: AMB }];
  logs = [];
  logs.push(coverage(FIRST));
  failing = new Set();
  fake = createFakeSupabase({ query: answer });
  mocks.client = fake.client;
});

describe("loadPaymentDetails — grouped report", () => {
  it("lists every covered session once, chronologically, with title and NZ date and times", async () => {
    const details = await loadPaymentDetails(PAYMENT_ID);

    expect(details?.sessionDescription).toBe(PAIR);
    expect(details?.bookingSessionId).toBe(ANCHOR);
  });

  it("never adds unrelated same-day or later sessions of the booking", async () => {
    const description = (await loadPaymentDetails(PAYMENT_ID))?.sessionDescription ?? "";

    expect(description).not.toContain("1:00 pm");
    expect(description).not.toContain("22 Sep 2026");
    expect(description.match(/\d\. /g)).toHaveLength(2);
  });

  it("keeps the one monetary breakdown out of the session line", async () => {
    const details = await loadPaymentDetails(PAYMENT_ID);

    expect(details?.sessionDescription).not.toContain("$");
    // No payment_tier on this row: a pre-0056 payment, worded neutrally.
    expect(details && describePaymentAmount(details)).toBe("$300 ($250 delivery + $50 second session)");
  });

  it("is unaffected by duplicate coverage rows or their order", async () => {
    logs = [coverage(FIRST), coverage(FIRST)].reverse();

    expect((await loadPaymentDetails(PAYMENT_ID))?.sessionDescription).toBe(PAIR);
  });

  it("lists three covered sessions with sourcing and a staff extra described once", async () => {
    sessions.set(SAME_DAY_UNRELATED, session(SAME_DAY_UNRELATED, ANCHOR_TIMES[1], "2026-09-15T00:00:00.000Z"));
    logs = [coverage(SAME_DAY_UNRELATED), coverage(FIRST)];
    Object.assign(payment, {
      amount_cents: 40000,
      sourcing_bonus_cents: 5000,
      extra_amount_cents: 5000,
      payment_note: "Third session"
    });

    const details = await loadPaymentDetails(PAYMENT_ID);

    expect(details?.sessionDescription).toBe(
      `${PAIR.replace("2 sessions", "3 sessions")}; 3. Digital Wellbeing, 15 Sep 2026, ${when(ANCHOR_TIMES[1], "2026-09-15T00:00:00.000Z")}`
    );
    expect(details && describePaymentAmount(details)).toBe(
      "$400 ($250 delivery + $50 sourcing bonus + $50 second session + $50 add-on: Third session)"
    );
  });
});

describe("loadPaymentDetails — legacy and single sessions", () => {
  it("uses only the paid session when its report has no coverage record, whatever the amount says", async () => {
    logs = [];

    expect((await loadPaymentDetails(PAYMENT_ID))?.sessionDescription).toBe(ANCHOR_ONLY);
  });

  it("uses only the paid session when there is no matching report", async () => {
    reports = [];

    expect((await loadPaymentDetails(PAYMENT_ID))?.sessionDescription).toBe(ANCHOR_ONLY);
  });

  it("uses only the paid session when the payment has no ambassador", async () => {
    payment.ambassador_profile_id = null;

    expect((await loadPaymentDetails(PAYMENT_ID))?.sessionDescription).toBe(ANCHOR_ONLY);
    expect(fake.calls.some((call) => call.table === "ambassador_reports")).toBe(false);
  });

  it("ignores another report's coverage of a same-day neighbour", async () => {
    logs = [coverage(FIRST, {}, { report_id: "55555555-5555-4555-8555-555555555555" })];

    expect((await loadPaymentDetails(PAYMENT_ID))?.sessionDescription).toBe(ANCHOR_ONLY);
  });

  it("shows the New Zealand date, not the UTC one, across midnight", async () => {
    // 11:30Z on 2 Nov 2026 is 00:30 on 3 Nov in Auckland (NZDT, +13).
    sessions.set(ANCHOR, session(ANCHOR, "2026-11-02T11:30:00.000Z", "2026-11-02T12:15:00.000Z", { presentation_type_id: ESPORTS }));
    logs = [];

    const description = (await loadPaymentDetails(PAYMENT_ID))?.sessionDescription ?? "";
    expect(description).toContain("03 Nov 2026");
    expect(description).not.toContain("02 Nov");
  });
});

describe("loadPaymentDetails — refuses rather than guessing", () => {
  it.each<[string, () => void]>([
    ["coverage names another paid session", () => (logs = [coverage(FIRST, {}, { reported_session_id: NEXT_WEEK })])],
    ["coverage belongs to another booking", () => (logs = [coverage(FIRST, { booking_request_id: OTHER_BOOKING })])],
    ["coverage has no covered session", () => (logs = [coverage(null)])],
    ["coverage points at the paid session itself", () => (logs = [coverage(ANCHOR)])],
    ["a covered session was deleted", () => sessions.delete(FIRST)],
    [
      "a covered session is in another booking",
      () => sessions.set(FIRST, session(FIRST, ...FIRST_TIMES, { booking_request_id: OTHER_BOOKING }))
    ],
    [
      "a covered session belongs to another ambassador",
      () => sessions.set(FIRST, session(FIRST, ...FIRST_TIMES, { assigned_ambassador_id: OTHER_AMB }))
    ],
    [
      "a covered session is at another school",
      () => sessions.set(FIRST, session(FIRST, ...FIRST_TIMES, { school_id: "school-2" }))
    ],
    [
      "a covered session has no valid time",
      () => sessions.set(FIRST, session(FIRST, "not a time", FIRST_TIMES[1]))
    ],
    [
      "two reports match the paid session",
      () => reports.push({ id: "66666666-6666-4666-8666-666666666666", booking_session_id: ANCHOR, ambassador_profile_id: AMB })
    ],
    ["the paid session is gone", () => sessions.delete(ANCHOR)]
  ])("returns null when %s", async (_label, arrange) => {
    arrange();

    expect(await loadPaymentDetails(PAYMENT_ID)).toBeNull();
  });

  it("returns null across the NZ midnight boundary even though the UTC date matches", async () => {
    // Both on 2 Nov UTC, but 23:00 on 2 Nov and 00:00 on 3 Nov in Auckland.
    sessions.set(ANCHOR, session(ANCHOR, "2026-11-02T10:00:00.000Z", "2026-11-02T10:45:00.000Z"));
    sessions.set(FIRST, session(FIRST, "2026-11-02T11:00:00.000Z", "2026-11-02T11:45:00.000Z"));

    expect(await loadPaymentDetails(PAYMENT_ID)).toBeNull();
  });

  // booking_sessions:single is the paid session, booking_sessions the covered ones.
  it.each([
    "booking_sessions:single",
    "booking_sessions",
    "ambassador_reports",
    "booking_activity_logs",
    "presentation_types",
    "schools:single",
    "ambassador_profiles:single"
  ])("returns null when the %s query fails", async (key) => {
    failing.add(key);

    expect(await loadPaymentDetails(PAYMENT_ID)).toBeNull();
  });
});
