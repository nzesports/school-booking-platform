// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BookingSessionView } from "@/lib/domain/types";

vi.mock("@/components/dashboard/report-media-upload", () => ({ ReportMediaUpload: () => null }));

import { GroupPaymentNote } from "@/components/dashboard/ambassador-report-form";
import { PaymentAmountFields } from "@/components/dashboard/report-details-dialog";

// 0056 tiers as shown to ambassadors (report form) and staff (approval). The
// gap is measured from the first session's end to the second's start.
const FIRST_START = Date.parse("2026-09-14T21:00:00.000Z"); // 09:00 NZST
const session = (id: string, start: number, minutes = 60) =>
  ({
    id,
    bookingRequestId: "visit",
    schoolName: "QA School",
    presentationTitle: "Digital Wellbeing",
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + minutes * 60_000).toISOString(),
    yearLevels: "Years 7 to 8",
    expectedStudentCount: 60
  }) as BookingSessionView;
const pairWithGap = (gapMinutes: number) => [
  session("one", FIRST_START),
  session("two", FIRST_START + (60 + gapMinutes) * 60_000, 45)
];

describe("GroupPaymentNote (ambassador report form)", () => {
  it("says nothing extra for a single session", () => {
    const { container } = render(<GroupPaymentNote sessions={[session("one", FIRST_START)]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    [0, "$50"],
    [60, "$50"],
    [119, "$50"],
    [120, "$100"],
    [239, "$100"]
  ])("a %i-minute gap adds %s", (gap, amount) => {
    render(<GroupPaymentNote sessions={pairWithGap(gap)} />);
    const note = screen.getByTestId("group-payment-note");
    expect(note).toHaveTextContent(`plus ${amount} for the second session`);
    expect(note).toHaveTextContent(`starts ${gap} minutes after the first one ends`);
    expect(note).not.toHaveTextContent(/back-to-back/i);
  });

  it.each([240, 300])("a %i-minute gap is set by staff after review", (gap) => {
    render(<GroupPaymentNote sessions={pairWithGap(gap)} />);
    expect(screen.getByTestId("group-payment-note")).toHaveTextContent("set by staff after a review");
  });

  it("sends three sessions and overlapping sessions to staff review", () => {
    const { unmount } = render(
      <GroupPaymentNote sessions={[...pairWithGap(0), session("three", FIRST_START + 5 * 60 * 60_000)]} />
    );
    expect(screen.getByTestId("group-payment-note")).toHaveTextContent("three or more sessions");
    unmount();

    render(<GroupPaymentNote sessions={pairWithGap(-30)} />);
    expect(screen.getByTestId("group-payment-note")).toHaveTextContent("overlap");
  });
});

describe("PaymentAmountFields (staff approval)", () => {
  const baseProps = {
    formId: "review-form",
    sameDayPaymentCount: 0,
    schoolName: "QA School",
    skipPayment: false,
    onSkipPaymentChange: vi.fn()
  };

  it("shows the base amount and preselects the add-on for the report's tier", () => {
    render(
      <>
        <form id="review-form" />
        <PaymentAmountFields
          {...baseProps}
          standardAmountCents={25000}
          additionalSessionCents={0}
          paymentTier="pair_120_to_240"
        />
      </>
    );

    expect(screen.getByRole("combobox")).toHaveValue("pair_120_to_240");
    expect(screen.getByText(/\$250 standard \+ \$100 add-on = \$350 final total/)).toBeInTheDocument();
    expect(document.querySelector('[name="extraAmount"]')).toHaveValue("100");
    expect(document.querySelector('[name="paymentNote"]')).toHaveValue("Extra session (2 to 4 hours apart)");
    expect(screen.queryByTestId("custom-review-panel")).toBeNull();
  });

  it("requires explicit staff confirmation for a flagged payment, including zero add-on", () => {
    render(
      <>
        <form id="review-form" />
        <PaymentAmountFields
          {...baseProps}
          standardAmountCents={25000}
          additionalSessionCents={0}
          paymentTier="custom_review"
          customReview={{ reason: "gap_240_or_more", gapMinutes: 270 }}
        />
      </>
    );

    const choice = screen.getByRole("combobox");
    expect(choice).toHaveValue("none");
    const confirmation = screen.getByRole("checkbox", { name: /these sessions need a custom payment review/i });
    expect(confirmation).toBeRequired();
    expect(confirmation).not.toBeChecked();
    expect(new FormData(document.getElementById("review-form") as HTMLFormElement).has("customReviewConfirmed")).toBe(false);
    fireEvent.click(confirmation);
    expect(new FormData(document.getElementById("review-form") as HTMLFormElement).get("customReviewConfirmed")).toBe("yes");
    expect(document.querySelector('[name="extraAmount"]')).toHaveValue("0");
    expect(document.querySelector('[name="paymentNote"]')).toHaveValue("No add-on");

    fireEvent.change(choice, { target: { value: "other" } });
    expect(screen.getByRole("spinbutton")).toBeRequired();
    expect(screen.getByPlaceholderText(/third session/i)).toBeRequired();
  });

  it("offers no payment for a review payment without asking for an amount", () => {
    render(
      <PaymentAmountFields
        {...baseProps}
        skipPayment
        standardAmountCents={25000}
        additionalSessionCents={0}
        paymentTier="custom_review"
        customReview={{ reason: "three_or_more_sessions" }}
      />
    );

    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
