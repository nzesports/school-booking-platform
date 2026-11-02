import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type FakeResult } from "./support/fake-supabase";

// markReportReviewedAction in front of approve_ambassador_report_payment
// (0056). A payment created for staff custom review needs an explicit staff
// decision: the custom amount typed in (even 0), the review confirmed and a
// note, or no payment with a note. The RPC enforces the same rules; these
// tests pin what the action sends, and that it refuses before calling it.
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
vi.mock("@/lib/services/notifications", () => ({
  notifyStaff: vi.fn(async () => undefined),
  notifyUser: vi.fn(async () => undefined)
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.client }));

import { markReportReviewedAction } from "@/app/portal/actions";

const REPORT_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const AMBASSADOR_ID = "44444444-4444-4444-8444-444444444444";
const PAYMENT_ID = "55555555-5555-4555-8555-555555555555";

let report: Record<string, unknown>;
let payment: Record<string, unknown> | null;
let rpcResult: FakeResult;
let fake: ReturnType<typeof createFakeSupabase>;

function approveForm(fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ reportId: REPORT_ID, returnTo: "/staff/payments", ...fields })) {
    form.set(key, value);
  }
  return form;
}

async function approve(fields: Record<string, string> = {}) {
  const error = await markReportReviewedAction(approveForm(fields)).catch((caught: unknown) => caught);
  return String((error as Error).message).replace(/^REDIRECT:/, "");
}

beforeEach(() => {
  report = {
    id: REPORT_ID,
    booking_session_id: SESSION_ID,
    ambassador_profile_id: AMBASSADOR_ID,
    reviewed_for_payment_at: null
  };
  payment = {
    id: PAYMENT_ID,
    status: "pending",
    amount_cents: 25000,
    review_required: true,
    custom_reviewed_at: null
  };
  rpcResult = { data: [{ did_approve: true, payment_id: PAYMENT_ID, booking_session_id: SESSION_ID }] };
  fake = createFakeSupabase({
    query: (call) => {
      if (call.table === "ambassador_reports" && call.single) return { data: report };
      if (call.table === "payments" && call.single) return { data: payment };
      if (call.table === "ambassador_profiles" && call.single) {
        return {
          data: {
            id: AMBASSADOR_ID,
            user_id: "user-1",
            bank_account_name: "A Ambassador",
            bank_account_number: "12-3456-7890123-00",
            gst_number: null
          }
        };
      }
      return undefined;
    },
    rpc: () => rpcResult
  });
  mocks.client = fake.client;
});

describe("approving a payment that needs a custom review", () => {
  it.each([
    ["no confirmation and no amount", {}],
    ["an amount but no confirmation", { extraAmount: "50", paymentNote: "Agreed rate" }],
    ["confirmation but the amount left blank", { customReviewConfirmed: "yes", paymentNote: "Agreed rate" }]
  ])("refuses %s, without calling the database", async (_label, fields) => {
    expect(await approve(fields)).toBe("/staff/payments?error=custom-review-required");
    expect(fake.rpcCalls).toEqual([]);
  });

  it("requires a note even when the custom amount is $0", async () => {
    expect(await approve({ customReviewConfirmed: "yes", extraAmount: "0" })).toBe(
      "/staff/payments?error=payment-note-required"
    );
    expect(fake.rpcCalls).toEqual([]);
  });

  it("refuses a custom amount over the cap", async () => {
    expect(await approve({ customReviewConfirmed: "yes", extraAmount: "251", paymentNote: "Too much" })).toBe(
      "/staff/payments?error=invalid-payment-amount"
    );
    expect(fake.rpcCalls).toEqual([]);
  });

  it("approves an explicit $0 custom amount with the review confirmed and the note sent", async () => {
    expect(await approve({ customReviewConfirmed: "yes", extraAmount: "0", paymentNote: "Base only, agreed" })).toBe(
      "/staff/payments?approved=report-payment"
    );
    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0]).toMatchObject({
      name: "approve_ambassador_report_payment",
      args: {
        p_report_id: REPORT_ID,
        p_extra_amount_cents: 0,
        p_payment_note: "Base only, agreed",
        p_review_confirmed: true
      }
    });
  });

  it("approves a custom amount on top of the recognised part", async () => {
    await approve({ customReviewConfirmed: "yes", extraAmount: "150", paymentNote: "Three sessions" });

    expect(fake.rpcCalls[0].args).toMatchObject({
      p_extra_amount_cents: 15000,
      p_payment_note: "Three sessions",
      p_review_confirmed: true
    });
  });

  it("allows no payment with a note instead", async () => {
    expect(await approve({ skipPayment: "yes", paymentNote: "Paid on another report" })).toBe(
      "/staff/payments?approved=report-no-payment"
    );
    expect(fake.rpcCalls[0].args).toMatchObject({ p_skip_payment: true, p_payment_note: "Paid on another report" });
  });

  it("shows the database's refusal when the RPC enforces the review", async () => {
    rpcResult = { error: { code: "P0001", message: "This payment needs a staff custom review" } };

    expect(await approve({ customReviewConfirmed: "yes", extraAmount: "0", paymentNote: "Agreed" })).toBe(
      "/staff/payments?error=report-review-failed"
    );
  });

  it("is a no-op on retry once the report has been reviewed", async () => {
    report.reviewed_for_payment_at = "2026-09-20T00:00:00.000Z";

    expect(await approve({ customReviewConfirmed: "yes", extraAmount: "0", paymentNote: "Agreed" })).toBe(
      "/staff/payments?approved=report"
    );
    expect(fake.rpcCalls).toEqual([]);
  });

  it("treats a lost race (the RPC approved nothing) as already approved", async () => {
    rpcResult = { data: [{ did_approve: false, payment_id: null, booking_session_id: SESSION_ID }] };

    expect(await approve({ customReviewConfirmed: "yes", extraAmount: "0", paymentNote: "Agreed" })).toBe(
      "/staff/payments?approved=report"
    );
  });
});

describe("approving an automatic tier payment", () => {
  beforeEach(() => {
    payment = { id: PAYMENT_ID, status: "pending", amount_cents: 35000, review_required: false, custom_reviewed_at: null };
  });

  it("needs no review confirmation and sends no note without an extra", async () => {
    expect(await approve()).toBe("/staff/payments?approved=report-payment");
    expect(fake.rpcCalls[0].args).toMatchObject({
      p_extra_amount_cents: 0,
      p_payment_note: null,
      p_review_confirmed: false
    });
  });

  it("keeps the optional extra semantics: a note only when an extra is added", async () => {
    expect(await approve({ extraAmount: "50" })).toBe("/staff/payments?error=payment-note-required");
    await approve({ extraAmount: "50", paymentNote: "Separate booking that day" });
    expect(fake.rpcCalls[0].args).toMatchObject({ p_extra_amount_cents: 5000, p_payment_note: "Separate booking that day" });
  });
});
