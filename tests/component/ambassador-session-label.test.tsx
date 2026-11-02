// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AmbassadorOpenBookingsExplorer } from "@/components/dashboard/ambassador-open-bookings-explorer";
import type { BookingSessionView } from "@/lib/domain/types";

vi.mock("@/components/dashboard/session-details-dialog", () => ({ SessionDetailsButton: () => null }));

afterEach(cleanup);

describe("same-day booking labels", () => {
  it.each([2, 3])("describes %i separated sessions without claiming they are back-to-back", (count) => {
    const sessions = Array.from({ length: count }, (_, i) => ({
      id: `session-${i}`, bookingRequestId: "one-booking", schoolName: "QA School",
      presentationTitle: "Digital Wellbeing", regionSlug: "auckland", regionName: "Auckland",
      startsAt: `2026-11-03T0${i * 2}:00:00Z`, endsAt: `2026-11-03T0${i * 2}:30:00Z`,
      yearLevels: "Years 9 to 10", expectedStudentCount: 60, status: "requested", presentationSlug: "digital-wellbeing", reportStatus: "not_submitted", paymentStatus: "not_eligible"
    })) as BookingSessionView[];
    render(<AmbassadorOpenBookingsExplorer mode="open" sessions={sessions}
      applyAction={vi.fn()} withdrawAction={vi.fn()} requestWithdrawalAction={vi.fn()}
      returnTo="/ambassador/bookings" emptyMessage="No bookings" />);
    expect(screen.getByText(`${count} sessions · one booking, one report`)).toBeInTheDocument();
    expect(screen.queryByText(/back-to-back/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View and apply/i }));
    expect(screen.getByText(new RegExp(`${count} sessions · one booking, one report\\. Applying or withdrawing`))).toBeInTheDocument();
    expect(screen.queryByText(/back-to-back/i)).not.toBeInTheDocument();
  });
});
