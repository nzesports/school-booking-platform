// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { BookingSessionView } from "@/lib/domain/types";
vi.mock("@/components/dashboard/report-media-upload", () => ({ ReportMediaUpload: () => null }));
import { AmbassadorReportsWorkspace } from "@/components/dashboard/ambassador-reports-workspace";
import { AmbassadorReportForm } from "@/components/dashboard/ambassador-report-form";

// jsdom has no layout observer; real browser hydration is checked separately.
beforeAll(() => vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
}));
afterAll(() => vi.unstubAllGlobals());

describe("grouped ambassador report", () => {
  it("shows both presentations and prefills the combined attendance, including when each session is below the payment threshold", () => {
    const sessions = [
      { id: "one", bookingRequestId: "visit", schoolName: "QA School", presentationTitle: "Digital Wellbeing", startsAt: "2026-10-26T21:00:00Z", endsAt: "2026-10-26T21:10:00Z", yearLevels: "Years 7 to 8", expectedStudentCount: 60 },
      { id: "two", bookingRequestId: "visit", schoolName: "QA School", presentationTitle: "Esports Pathways", startsAt: "2026-10-26T21:10:00Z", endsAt: "2026-10-26T21:20:00Z", yearLevels: "Years 9 to 10", expectedStudentCount: 60 }
    ] as BookingSessionView[];
    render(<AmbassadorReportForm sessions={sessions} presenterName="QA Ambassador" action={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Digital Wellbeing + Esports Pathways at QA School" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toHaveValue(120);
    expect(screen.getByRole("textbox", { name: "What age groups were presented to? *" })).toHaveValue("Years 7 to 8 / Years 9 to 10");
  });
});


describe("outstanding report list", () => {
  it("shows one report link for a multi-session booking and keeps separate bookings separate", () => {
    const sessions = [
      { id: "a", bookingRequestId: "visit", schoolName: "Grouped QA School", presentationTitle: "Digital Wellbeing", startsAt: "2026-10-26T21:00:00Z", endsAt: "2026-10-26T21:10:00Z", reportStatus: "not_submitted" },
      { id: "b", bookingRequestId: "visit", schoolName: "Grouped QA School", presentationTitle: "Esports Pathways", startsAt: "2026-10-27T00:10:00Z", endsAt: "2026-10-27T00:20:00Z", reportStatus: "not_submitted" },
      { id: "c", bookingRequestId: "another", schoolName: "Separate QA School", presentationTitle: "Digital Wellbeing", startsAt: "2026-10-27T02:00:00Z", endsAt: "2026-10-27T02:10:00Z", reportStatus: "not_submitted" }
    ] as BookingSessionView[];
    render(<AmbassadorReportsWorkspace completedSessions={sessions} reports={[]} />);
    expect(screen.getAllByRole("link", { name: "Submit report" })).toHaveLength(2);
    expect(screen.getByText("Digital Wellbeing + Esports Pathways")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Grouped QA School" })).toHaveLength(1);
  });
});
