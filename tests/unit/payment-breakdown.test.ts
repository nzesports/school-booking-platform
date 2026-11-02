import { describe, expect, it } from "vitest";

import {
  additionalCentsForTier,
  classifyReportGroup,
  describePaymentAmount,
  EXTENDED_PAIR_CENTS,
  isAwaitingCustomReview,
  MAX_EXTRA_PAYMENT_CENTS,
  parseExtraAmountCents,
  reviewReasonLabel,
  SHORT_PAIR_CENTS
} from "@/lib/payment-breakdown";

describe("parseExtraAmountCents", () => {
  it("treats an empty field as no extra", () => {
    expect(parseExtraAmountCents("")).toBe(0);
    expect(parseExtraAmountCents("   ")).toBe(0);
  });

  it("accepts whole dollars up to the cap", () => {
    expect(parseExtraAmountCents("50")).toBe(5000);
    expect(parseExtraAmountCents("0")).toBe(0);
    expect(parseExtraAmountCents("250")).toBe(MAX_EXTRA_PAYMENT_CENTS);
  });

  it("rejects cents, negatives, words and amounts over the cap", () => {
    for (const input of ["50.5", "-50", "1e2", "fifty", "251", "9999999999"]) {
      expect(parseExtraAmountCents(input)).toBeNull();
    }
  });
});

// Working interpretation, same as public.report_payment_tier (0056): the gap
// runs from the FIRST session's END to the SECOND session's START.
describe("classifyReportGroup", () => {
  // First session 09:00-10:00 NZ (NZST, 15 Sep 2026); second starts `gap`
  // minutes after it ends and lasts 45 minutes.
  const FIRST_END = Date.parse("2026-09-14T22:00:00.000Z");
  const pair = (gapMinutes: number, extraSeconds = 0) => {
    const secondStart = FIRST_END + gapMinutes * 60_000 + extraSeconds * 1000;
    return [
      { startsAt: new Date(FIRST_END - 60 * 60_000).toISOString(), endsAt: new Date(FIRST_END).toISOString() },
      { startsAt: new Date(secondStart).toISOString(), endsAt: new Date(secondStart + 45 * 60_000).toISOString() }
    ];
  };

  it.each([
    [0, "pair_within_60"],
    [1, "pair_within_60"],
    [59, "pair_within_60"],
    [60, "pair_within_60"],
    [61, "pair_within_60"],
    [119, "pair_within_60"],
    [120, "pair_120_to_240"],
    [121, "pair_120_to_240"],
    [239, "pair_120_to_240"],
    [240, "custom_review"],
    [241, "custom_review"],
    [600, "custom_review"]
  ] as const)("a %i-minute gap is %s", (gap, tier) => {
    expect(classifyReportGroup(pair(gap)).tier).toBe(tier);
  });

  it("puts exactly 120 minutes in the 2 to 4 hour band, and 1 second short of 240 inside it", () => {
    expect(classifyReportGroup(pair(119, 59)).tier).toBe("pair_within_60");
    expect(classifyReportGroup(pair(120, 1)).tier).toBe("pair_120_to_240");
    expect(classifyReportGroup(pair(239, 59)).tier).toBe("pair_120_to_240");
  });

  it("names why a pair needs review, with the gap", () => {
    expect(classifyReportGroup(pair(240))).toEqual({ tier: "custom_review", reviewReason: "gap_240_or_more", gapMinutes: 240 });
  });

  it("measures end to start regardless of the order the sessions are given in", () => {
    expect(classifyReportGroup([...pair(30)].reverse())).toEqual({ tier: "pair_within_60", gapMinutes: 30 });
  });

  it("sends overlapping sessions to review", () => {
    expect(classifyReportGroup(pair(-15))).toMatchObject({ tier: "custom_review", reviewReason: "overlapping_times" });
  });

  it("pays a single session with no additional amount", () => {
    expect(classifyReportGroup(pair(0).slice(0, 1))).toEqual({ tier: "single" });
  });

  it("sends three or more sessions to review whatever the gaps", () => {
    const three = [...pair(0), { startsAt: "2026-09-15T00:00:00.000Z", endsAt: "2026-09-15T00:45:00.000Z" }];
    expect(classifyReportGroup(three)).toEqual({ tier: "custom_review", reviewReason: "three_or_more_sessions" });
  });

  it.each([
    ["a missing end", [{ startsAt: "2026-09-14T21:00:00.000Z", endsAt: null }]],
    ["an end before its start", [{ startsAt: "2026-09-14T22:00:00.000Z", endsAt: "2026-09-14T21:00:00.000Z" }]],
    ["a zero-length session", [{ startsAt: "2026-09-14T22:00:00.000Z", endsAt: "2026-09-14T22:00:00.000Z" }]],
    ["an unparseable time", [{ startsAt: "not a time", endsAt: "2026-09-14T22:00:00.000Z" }]],
    ["no sessions", []]
  ])("sends %s to review", (_label, sessions) => {
    expect(classifyReportGroup(sessions)).toEqual({ tier: "custom_review", reviewReason: "invalid_times" });
  });

  it("adds $50 or $100 only for the two automatic pair tiers", () => {
    expect(additionalCentsForTier("single")).toBe(0);
    expect(additionalCentsForTier("pair_within_60")).toBe(SHORT_PAIR_CENTS);
    expect(additionalCentsForTier("pair_120_to_240")).toBe(EXTENDED_PAIR_CENTS);
    expect(additionalCentsForTier("custom_review")).toBe(0);
  });

  it("explains each review reason and the measurement", () => {
    expect(reviewReasonLabel("gap_over_60_to_120", 90)).toContain("90 minutes apart");
    expect(reviewReasonLabel("gap_over_60_to_120", 90)).toContain("first session's end to the second session's start");
    expect(reviewReasonLabel("three_or_more_sessions")).toContain("three or more");
  });
});

describe("describePaymentAmount", () => {
  const single = {
    amountCents: 25000,
    baseAmountCents: 25000,
    sourcingBonusCents: 0,
    additionalSessionCents: 0,
    extraAmountCents: 0
  };

  it.each([
    ["normal single", { ...single, paymentTier: "single" }, "$250"],
    ["sourced single", { ...single, amountCents: 30000, sourcingBonusCents: 5000, paymentTier: "single" }, "$300 ($250 delivery + $50 sourcing bonus)"],
    [
      "pair less than 2 hours apart",
      { ...single, amountCents: 30000, additionalSessionCents: 5000, paymentTier: "pair_within_60" },
      "$300 ($250 delivery + $50 second session (less than 2 hours apart))"
    ],
    [
      "sourced pair less than 2 hours apart",
      { ...single, amountCents: 35000, sourcingBonusCents: 5000, additionalSessionCents: 5000, paymentTier: "pair_within_60" },
      "$350 ($250 delivery + $50 sourcing bonus + $50 second session (less than 2 hours apart))"
    ],
    [
      "pair over 2 hours apart",
      { ...single, amountCents: 35000, additionalSessionCents: 10000, paymentTier: "pair_120_to_240" },
      "$350 ($250 delivery + $100 second session (over 2 hours later))"
    ],
    [
      "sourced pair over 2 hours apart",
      { ...single, amountCents: 40000, sourcingBonusCents: 5000, additionalSessionCents: 10000, paymentTier: "pair_120_to_240" },
      "$400 ($250 delivery + $50 sourcing bonus + $100 second session (over 2 hours later))"
    ],
    [
      "pair from before 0056 (no tier)",
      { ...single, amountCents: 30000, additionalSessionCents: 5000 },
      "$300 ($250 delivery + $50 second session)"
    ]
  ])("itemizes a %s once", (_label, payment, expected) => {
    expect(describePaymentAmount(payment)).toBe(expected);
  });

  it("never calls an extended-gap amount 'back-to-back'", () => {
    expect(
      describePaymentAmount({ ...single, amountCents: 35000, additionalSessionCents: 10000, paymentTier: "pair_120_to_240" })
    ).not.toMatch(/back-to-back/i);
  });

  it("names a staff add-on and its note, so finance sees what was added by hand", () => {
    expect(
      describePaymentAmount({ ...single, amountCents: 30000, extraAmountCents: 5000, paymentNote: "Second session in booking 123456" })
    ).toBe("$300 ($250 delivery + $50 add-on: Second session in booking 123456)");
  });

  it("words a flagged payment's add-on like any other, and leaves out a $0 one", () => {
    const reviewed = { ...single, paymentTier: "custom_review", reviewRequired: true, paymentNote: "Three sessions, agreed rate" };

    expect(describePaymentAmount({ ...reviewed, amountCents: 40000, extraAmountCents: 15000 })).toBe(
      "$400 ($250 delivery + $150 add-on: Three sessions, agreed rate)"
    );
    expect(describePaymentAmount(reviewed)).toBe("$250");
    expect(
      describePaymentAmount({ ...reviewed, amountCents: 30000, sourcingBonusCents: 5000 })
    ).toBe("$300 ($250 delivery + $50 sourcing bonus)");
  });

  it("keeps a no-payment approval at a plain $0", () => {
    expect(
      describePaymentAmount({
        amountCents: 0,
        baseAmountCents: 0,
        sourcingBonusCents: 0,
        additionalSessionCents: 0,
        extraAmountCents: 0,
        paymentTier: "custom_review",
        reviewRequired: true,
        paymentNote: "Covered elsewhere"
      })
    ).toBe("$0");
  });
});

describe("isAwaitingCustomReview", () => {
  it("is true only for an undecided review payment", () => {
    expect(isAwaitingCustomReview({ reviewRequired: true, status: "pending" })).toBe(true);
    expect(isAwaitingCustomReview({ reviewRequired: true, status: "eligible" })).toBe(true);
    expect(isAwaitingCustomReview({ reviewRequired: true, status: "approved", customReviewedAt: "2026-09-20T00:00:00Z" })).toBe(false);
    expect(isAwaitingCustomReview({ reviewRequired: true, status: "not_eligible", customReviewedAt: "2026-09-20T00:00:00Z" })).toBe(false);
    expect(isAwaitingCustomReview({ reviewRequired: false, status: "pending" })).toBe(false);
    expect(isAwaitingCustomReview({ status: "pending" })).toBe(false);
  });
});
