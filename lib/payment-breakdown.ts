import { formatCurrency } from "@/lib/utils";

// Same-day payment tiers (0056, short pair widened to 2 hours in 0057). One report covers an ambassador's sessions of
// one booking on one NZ day; its payment has one delivery fee, at most one
// sourcing bonus, and for exactly two sessions an amount set by the gap
// between them. The gap is measured from the first session's END to the
// second session's START (working interpretation).
//
//   one session                         +$0
//   two, gap under 120 minutes          +$50   (SHORT_PAIR_CENTS)
//   two, gap 120 and under 240          +$100  (EXTENDED_PAIR_CENTS)
//
// "pair_within_60" is the stored name of the +$50 tier from 0056; it now
// means less than 2 hours. Since 0057 the report RPC is passed 0 for both
// amounts: staff add them at approval as the add-on, which the tier
// preselects.
//
// Anything else needs an explicit staff custom review: nothing extra is added
// automatically. The report RPC (submit_ambassador_report_group) decides the
// tier under its locks; classifyReportGroup mirrors it for labels and tests.
export const SHORT_PAIR_CENTS = 5000;
export const EXTENDED_PAIR_CENTS = 10000;
export const GAP_MEASUREMENT_NOTE = "gap measured from the first session's end to the second session's start";

// Staff top-ups at approval: whole dollars, capped. The approval RPC and the
// payments check constraint enforce the same rule. For a payment that needs a
// custom review this extra is the staff-chosen custom amount ($0 allowed).
export const MAX_EXTRA_PAYMENT_CENTS = 25000;

export type PaymentTier = "single" | "pair_within_60" | "pair_120_to_240" | "custom_review";
export type PaymentReviewReason =
  // Only on payments from before 0057.
  | "gap_over_60_to_120"
  | "gap_240_or_more"
  | "three_or_more_sessions"
  | "overlapping_times"
  | "invalid_times";

export type ReportGroupTier = {
  tier: PaymentTier;
  reviewReason?: PaymentReviewReason;
  gapMinutes?: number;
};

// Mirror of public.report_payment_tier (0057). Sessions in any order.
export function classifyReportGroup(
  sessions: Array<{ startsAt?: string | null; endsAt?: string | null }>
): ReportGroupTier {
  const times = sessions.map((session) => ({
    start: session.startsAt ? new Date(session.startsAt).getTime() : Number.NaN,
    end: session.endsAt ? new Date(session.endsAt).getTime() : Number.NaN
  }));

  if (times.length === 0 || times.some((time) => !Number.isFinite(time.start) || !Number.isFinite(time.end) || time.end <= time.start)) {
    return { tier: "custom_review", reviewReason: "invalid_times" };
  }

  if (times.length === 1) {
    return { tier: "single" };
  }

  if (times.length >= 3) {
    return { tier: "custom_review", reviewReason: "three_or_more_sessions" };
  }

  const [first, second] = [...times].sort((left, right) => left.start - right.start || left.end - right.end);
  const gapSeconds = (second.start - first.end) / 1000;
  const gapMinutes = Math.floor(gapSeconds / 60);

  if (gapSeconds < 0) return { tier: "custom_review", reviewReason: "overlapping_times", gapMinutes };
  if (gapSeconds < 7200) return { tier: "pair_within_60", gapMinutes };
  if (gapSeconds < 14400) return { tier: "pair_120_to_240", gapMinutes };
  return { tier: "custom_review", reviewReason: "gap_240_or_more", gapMinutes };
}

export function additionalCentsForTier(tier: PaymentTier) {
  return tier === "pair_within_60" ? SHORT_PAIR_CENTS : tier === "pair_120_to_240" ? EXTENDED_PAIR_CENTS : 0;
}

// Why staff must review, in words for staff and ambassadors.
export function reviewReasonLabel(reason?: string | null, gapMinutes?: number | null) {
  const gap = typeof gapMinutes === "number" ? `approximately ${gapMinutes} minutes apart` : null;

  switch (reason) {
    case "gap_over_60_to_120":
      return `The two sessions are ${gap ?? "over 1 hour and up to 2 hours apart"} (${GAP_MEASUREMENT_NOTE}): over 1 hour, up to 2 hours.`;
    case "gap_240_or_more":
      return `The two sessions are ${gap ?? "4 hours or more apart"} (${GAP_MEASUREMENT_NOTE}): 4 hours or more.`;
    case "three_or_more_sessions":
      return "The report covers three or more sessions.";
    case "overlapping_times":
      return "The sessions' times overlap.";
    case "invalid_times":
      return "A session has a missing or invalid start or end time.";
    default:
      return "This payment needs a staff custom review.";
  }
}

// The additional (system-set) part, worded for its tier. Payments from before
// 0056 have no tier; their additional amount was the flat second-session one.
export function additionalAmountLabel(tier?: string | null) {
  return tier === "pair_120_to_240"
    ? "second session (over 2 hours later)"
    : tier === "pair_within_60"
      ? "second session (less than 2 hours apart)"
      : "second session";
}

export type PaymentBreakdown = {
  amountCents: number;
  baseAmountCents: number;
  sourcingBonusCents: number;
  additionalSessionCents: number;
  extraAmountCents: number;
  paymentNote?: string;
  currency?: string;
  paymentTier?: string | null;
  reviewRequired?: boolean;
};

// A payment created for staff custom review that staff haven't decided yet.
// Its amount is only the recognised delivery fee and sourcing bonus, so it is
// not an earned or payable total and is left out of earnings sums.
export function isAwaitingCustomReview(payment: {
  reviewRequired?: boolean;
  customReviewedAt?: string | null;
  status?: string;
}) {
  return Boolean(payment.reviewRequired) && !payment.customReviewedAt && ["pending", "eligible"].includes(String(payment.status));
}

// Parses the approval form's extra amount. Empty means no extra; anything
// else must be whole dollars within the cap.
export function parseExtraAmountCents(input: string): number | null {
  const value = input.trim();

  if (!value) {
    return 0;
  }

  if (!/^\d{1,6}$/.test(value)) {
    return null;
  }

  const cents = Number(value) * 100;
  return cents <= MAX_EXTRA_PAYMENT_CENTS ? cents : null;
}

// "$300 ($250 delivery + $50 second session (less than 2 hours apart))". Each part
// appears once: delivery, sourcing bonus, the tier's additional amount, and
// the staff-chosen add-on with its note, so finance sees exactly what was set
// by hand.
export function describePaymentAmount(payment: PaymentBreakdown) {
  const currency = payment.currency ?? "NZD";
  const total = formatCurrency(payment.amountCents, currency);
  const parts = [
    `${formatCurrency(payment.baseAmountCents, currency)} delivery`,
    ...(payment.sourcingBonusCents > 0
      ? [`${formatCurrency(payment.sourcingBonusCents, currency)} sourcing bonus`]
      : []),
    ...(payment.additionalSessionCents > 0
      ? [`${formatCurrency(payment.additionalSessionCents, currency)} ${additionalAmountLabel(payment.paymentTier)}`]
      : []),
    ...(payment.extraAmountCents > 0
      ? [`${formatCurrency(payment.extraAmountCents, currency)} add-on: ${payment.paymentNote ?? "no note recorded"}`]
      : [])
  ];

  return parts.length > 1 ? `${total} (${parts.join(" + ")})` : total;
}
