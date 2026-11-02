import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase } from "./support/fake-supabase";

// sendFinancePaymentEmailAction against an in-memory payment row. The two
// RPCs are modelled on claim_finance_payment_email /
// complete_finance_payment_email (0054); they run synchronously, which makes
// each one atomic here just as the row lock makes it atomic in Postgres.
const mocks = vi.hoisted(() => ({
  client: null as unknown,
  sendEmail: vi.fn()
}));

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
vi.mock("@/lib/services/email-triggers", () => ({
  sendAmbassadorApprovedEmail: vi.fn(),
  sendAmbassadorAssignedEmail: vi.fn(),
  sendAmbassadorLateCancellationEmail: vi.fn(),
  sendAmbassadorWithdrawalResolvedEmail: vi.fn(),
  sendPaymentApprovalToFinanceEmail: mocks.sendEmail
}));
vi.mock("@/lib/services/notifications", () => ({
  notifyStaff: vi.fn(async () => undefined),
  notifyUser: vi.fn(async () => undefined)
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.client }));

import { sendFinancePaymentEmailAction } from "@/app/portal/actions";
import { hashFinanceConfirmationToken } from "@/lib/services/payment-automation";

const PAYMENT_ID = "22222222-2222-4222-8222-222222222222";

type PaymentRow = {
  id: string;
  status: string;
  invoice_number: string | null;
  booking_session_id: string;
  amount_cents: number;
  base_amount_cents: number;
  sourcing_bonus_cents: number;
  additional_session_cents: number;
  extra_amount_cents: number;
  bank_account_name: string;
  bank_account_number: string;
  finance_email_status: string | null;
  finance_email_claim_id: string | null;
  finance_email_claimed_at: number | null;
  finance_email_attempts: number;
  finance_email_error: string | null;
  finance_confirmation_token_hash: string | null;
  finance_confirmation_expires_at: string | null;
  sent_to_finance_at: string | null;
};

let payment: PaymentRow;
let fake: ReturnType<typeof createFakeSupabase>;
let claimCounter = 0;

function freshPayment(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: PAYMENT_ID,
    status: "approved",
    invoice_number: "INV-2026-22222222",
    booking_session_id: "33333333-3333-4333-8333-333333333333",
    amount_cents: 30000,
    base_amount_cents: 25000,
    sourcing_bonus_cents: 0,
    additional_session_cents: 5000,
    extra_amount_cents: 0,
    bank_account_name: "A Ambassador",
    bank_account_number: "12-3456-7890123-00",
    finance_email_status: null,
    finance_email_claim_id: null,
    finance_email_claimed_at: null,
    finance_email_attempts: 0,
    finance_email_error: null,
    finance_confirmation_token_hash: null,
    finance_confirmation_expires_at: null,
    sent_to_finance_at: null,
    ...overrides
  };
}

function claimRpc(args: Record<string, unknown>) {
  const now = Date.now();
  const linkExpired =
    !payment.finance_confirmation_expires_at || Date.parse(payment.finance_confirmation_expires_at) <= now;
  const claimStale =
    payment.finance_email_claimed_at === null ||
    payment.finance_email_claimed_at <= now - Number(args.p_stale_after_seconds) * 1000;
  const claimable =
    payment.status === "approved" &&
    Boolean(payment.invoice_number) &&
    (payment.finance_email_status === null ||
      payment.finance_email_status === "failed" ||
      (payment.finance_email_status === "sent" && linkExpired) ||
      (payment.finance_email_status === "pending" && claimStale));

  if (!claimable) {
    return { data: [] };
  }

  const claimId = `claim-${++claimCounter}`;
  const firstSend = payment.sent_to_finance_at === null;
  Object.assign(payment, {
    finance_email_status: "pending",
    finance_email_claim_id: claimId,
    finance_email_claimed_at: now,
    finance_email_error: null,
    finance_confirmation_token_hash: args.p_token_hash as string,
    finance_confirmation_expires_at: args.p_token_expires_at as string
  });

  return {
    data: [
      {
        claim_id: claimId,
        first_send: firstSend,
        invoice_number: payment.invoice_number,
        booking_session_id: payment.booking_session_id
      }
    ]
  };
}

function completeRpc(args: Record<string, unknown>) {
  if (payment.finance_email_claim_id !== args.p_claim_id || payment.finance_email_status !== "pending") {
    return { data: false };
  }

  const sent = args.p_sent === true;
  Object.assign(payment, {
    finance_email_status: sent ? "sent" : "failed",
    finance_email_attempts: payment.finance_email_attempts + 1,
    finance_email_error: sent ? null : String(args.p_error ?? "failed"),
    sent_to_finance_at: sent ? new Date().toISOString() : payment.sent_to_finance_at,
    finance_email_claim_id: null,
    finance_email_claimed_at: null
  });

  return { data: true };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function sendForm() {
  const form = new FormData();
  form.set("paymentId", PAYMENT_ID);
  form.set("returnTo", "/staff/payments");
  return form;
}

function sentTokens() {
  return mocks.sendEmail.mock.calls.map(([options]) => (options as { confirmationToken: string }).confirmationToken);
}

describe("sendFinancePaymentEmailAction", () => {
  beforeEach(() => {
    claimCounter = 0;
    payment = freshPayment();
    mocks.sendEmail.mockReset();
    mocks.sendEmail.mockResolvedValue({ status: "sent" });
    fake = createFakeSupabase({
      query: (call) => {
        if (call.table === "payments" && call.single) return { data: { ...payment } };
        if (call.table === "booking_sessions" && call.single) {
          return { data: { id: payment.booking_session_id, booking_request_id: null } };
        }
        return undefined;
      },
      rpc: (name, args) =>
        name === "claim_finance_payment_email"
          ? claimRpc(args)
          : name === "complete_finance_payment_email"
            ? completeRpc(args)
            : { error: { message: `unexpected rpc ${name}` } }
    });
    mocks.client = fake.client;
  });

  it("lets only one of two concurrent sends email finance, and persists that email's token", async () => {
    const gate = deferred();
    mocks.sendEmail.mockImplementation(async () => {
      await gate.promise;
      return { status: "sent" };
    });

    const first = sendFinancePaymentEmailAction(sendForm());
    const second = sendFinancePaymentEmailAction(sendForm());
    await vi.waitFor(() => expect(mocks.sendEmail).toHaveBeenCalledTimes(1));
    gate.resolve();
    const results = await Promise.all([first, second]);

    expect(results.map((result) => result.tone).sort()).toEqual(["error", "success"]);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(payment.finance_confirmation_token_hash).toBe(hashFinanceConfirmationToken(sentTokens()[0]));
    expect(payment.finance_email_status).toBe("sent");
    expect(payment.finance_email_attempts).toBe(1);
  });

  it("puts a pre-0056 second-session amount in the finance email with neutral wording", async () => {
    await sendFinancePaymentEmailAction(sendForm());

    expect(mocks.sendEmail.mock.calls[0][0]).toMatchObject({
      amountLabel: "$300 ($250 delivery + $50 second session)"
    });
  });

  it.each([
    ["pair_within_60", 5000, "$300 ($250 delivery + $50 second session (less than 2 hours apart))"],
    ["pair_120_to_240", 10000, "$350 ($250 delivery + $100 second session (over 2 hours later))"]
  ])("words a %s payment by its tier, never as back-to-back for the extended gap", async (tier, additional, label) => {
    Object.assign(payment, {
      payment_tier: tier,
      additional_session_cents: additional,
      amount_cents: 25000 + additional
    });

    await sendFinancePaymentEmailAction(sendForm());

    expect(mocks.sendEmail.mock.calls[0][0]).toMatchObject({ amountLabel: label });
  });

  it("itemizes a flagged payment's add-on once", async () => {
    Object.assign(payment, {
      payment_tier: "custom_review",
      review_required: true,
      additional_session_cents: 0,
      extra_amount_cents: 15000,
      amount_cents: 40000,
      payment_note: "Three sessions, agreed rate"
    });

    await sendFinancePaymentEmailAction(sendForm());

    expect(mocks.sendEmail.mock.calls[0][0]).toMatchObject({
      amountLabel: "$400 ($250 delivery + $150 add-on: Three sessions, agreed rate)"
    });
  });

  it("refuses a retry while a send is in flight, then lets a stale claim be taken over without the old send overwriting it", async () => {
    const stuck = deferred();
    mocks.sendEmail.mockImplementationOnce(async () => {
      await stuck.promise;
      return { status: "sent" };
    });

    const stuckSend = sendFinancePaymentEmailAction(sendForm());
    await vi.waitFor(() => expect(mocks.sendEmail).toHaveBeenCalledTimes(1));

    const tooSoon = await sendFinancePaymentEmailAction(sendForm());
    expect(tooSoon.tone).toBe("error");
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);

    // Eleven minutes later the first request still hasn't finished.
    payment.finance_email_claimed_at = Date.now() - 11 * 60 * 1000;
    const takeover = await sendFinancePaymentEmailAction(sendForm());
    expect(takeover.tone).toBe("success");
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);

    stuck.resolve();
    const stale = await stuckSend;

    const [, newestToken] = sentTokens();
    expect(stale.tone).toBe("error");
    expect(payment.finance_confirmation_token_hash).toBe(hashFinanceConfirmationToken(newestToken));
    expect(payment.finance_email_status).toBe("sent");
    expect(payment.finance_email_attempts).toBe(1);
  });

  it("never reverts a payment finance confirmed while the email was still being recorded", async () => {
    const gate = deferred();
    mocks.sendEmail.mockImplementation(async () => {
      await gate.promise;
      return { status: "sent" };
    });

    const send = sendFinancePaymentEmailAction(sendForm());
    await vi.waitFor(() => expect(mocks.sendEmail).toHaveBeenCalledTimes(1));
    payment.status = "paid";
    gate.resolve();
    await send;

    expect(payment.status).toBe("paid");
    // Every payment write goes through the claim/complete RPCs; none set status.
    expect(fake.calls.filter((call) => call.table === "payments" && call.operation !== "select")).toEqual([]);
  });

  it("records a thrown email error against the claim so staff can resend immediately", async () => {
    mocks.sendEmail.mockRejectedValueOnce(new Error("Brevo timed out"));

    const failed = await sendFinancePaymentEmailAction(sendForm());
    expect(failed.tone).toBe("error");
    expect(payment).toMatchObject({
      finance_email_status: "failed",
      finance_email_error: "Brevo timed out",
      finance_email_claim_id: null,
      finance_email_attempts: 1
    });

    const retried = await sendFinancePaymentEmailAction(sendForm());
    expect(retried.tone).toBe("success");
    expect(payment.finance_email_status).toBe("sent");
  });

  it("records a provider rejection as failed", async () => {
    mocks.sendEmail.mockResolvedValueOnce({ status: "failed", error: "Mailbox unavailable" });

    expect((await sendFinancePaymentEmailAction(sendForm())).tone).toBe("error");
    expect(payment).toMatchObject({ finance_email_status: "failed", finance_email_error: "Mailbox unavailable" });
  });

  it("won't resend a payment already with finance on a live link, but will once the link expires", async () => {
    payment = freshPayment({
      finance_email_status: "sent",
      sent_to_finance_at: new Date().toISOString(),
      finance_confirmation_token_hash: "live-hash",
      finance_confirmation_expires_at: new Date(Date.now() + 86_400_000).toISOString()
    });

    expect((await sendFinancePaymentEmailAction(sendForm())).tone).toBe("error");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(payment.finance_confirmation_token_hash).toBe("live-hash");

    payment.finance_confirmation_expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await sendFinancePaymentEmailAction(sendForm())).tone).toBe("success");
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("won't send a payment that isn't approved (pending review or already paid)", async () => {
    for (const status of ["pending", "paid"]) {
      payment = freshPayment({ status });
      expect((await sendFinancePaymentEmailAction(sendForm())).tone).toBe("error");
    }

    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
