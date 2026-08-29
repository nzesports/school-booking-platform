import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedPortalUser: vi.fn(),
  loadAvailabilityConfig: vi.fn(),
  submitBookingRequest: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  updateTag: mocks.updateTag
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("@/lib/services/auth", () => ({
  getAuthenticatedPortalUser: mocks.getAuthenticatedPortalUser
}));

vi.mock("@/lib/services/availability-server", () => ({
  loadAvailabilityConfig: mocks.loadAvailabilityConfig
}));

vi.mock("@/lib/services/bookings", () => ({
  submitBookingRequest: mocks.submitBookingRequest
}));

vi.mock("@/lib/services/brevo-contacts", () => ({
  addContactToTeachersList: vi.fn()
}));

import { submitBookingRequestAction } from "@/app/actions";
import { nextBookableDates } from "@/lib/services/availability";

function validBookingFormData() {
  const date = nextBookableDates(30)[0];
  expect(date).toBeDefined();

  const formData = new FormData();
  formData.set("sessionsCount", "1");
  formData.set("regionSlug", "auckland");
  formData.set("schoolName", "Harbour College");
  formData.set("contactName", "Aroha Rangi");
  formData.set("contactEmail", "aroha@example.nz");
  formData.set("contactPhone", "021 123 4567");
  formData.set("session-0-presentationSlug", "digital-wellbeing");
  formData.set("session-0-regionSlug", "auckland");
  formData.set("session-0-date", date);
  formData.set("session-0-startTime", "09:00");
  formData.set("session-0-endTime", "09:10");
  formData.set("session-0-yearLevels", "Years 7 to 8");
  formData.set("session-0-expectedStudentCount", "120");
  return formData;
}

describe("submitBookingRequestAction", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.loadAvailabilityConfig.mockResolvedValue({ rules: [], overrides: [] });
    mocks.getAuthenticatedPortalUser.mockResolvedValue(null);
    mocks.submitBookingRequest.mockResolvedValue({ id: "booking-1" });
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
  });

  it("accepts the complete front-page booking payload", async () => {
    await expect(submitBookingRequestAction(null, validBookingFormData())).rejects.toThrow(
      "REDIRECT:/booking/confirmation/booking-1"
    );

    expect(mocks.submitBookingRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolName: "Harbour College",
        sessions: [
          expect.objectContaining({
            presentationSlug: "digital-wellbeing",
            expectedStudentCount: 120
          })
        ]
      })
    );
  });

  it("returns a specific error when a student count is missing", async () => {
    const formData = validBookingFormData();
    formData.delete("session-0-expectedStudentCount");

    await expect(submitBookingRequestAction(null, formData)).resolves.toEqual({
      error: "Enter the expected number of students for every session."
    });
    expect(mocks.submitBookingRequest).not.toHaveBeenCalled();
  });

  it("returns a specific error for invalid school contact details", async () => {
    const formData = validBookingFormData();
    formData.set("contactEmail", "not-an-email");

    await expect(submitBookingRequestAction(null, formData)).resolves.toEqual({
      error: "Please complete the school contact details with a valid email and phone number."
    });
    expect(mocks.submitBookingRequest).not.toHaveBeenCalled();
  });
});
