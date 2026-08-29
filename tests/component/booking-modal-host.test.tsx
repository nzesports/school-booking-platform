// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BookingModalHost } from "@/components/site/booking-modal-host";
import type { PresentationType, Region } from "@/lib/domain/types";
import { nextBookableDates } from "@/lib/services/availability";

const presentation: PresentationType = {
  id: "presentation-1",
  slug: "digital-wellbeing",
  title: "Digital Wellbeing",
  shortSummary: "Healthy gaming habits.",
  fullDescription: "Healthy gaming habits for students.",
  durationMinutes: 10,
  yearLevels: "Years 7 to 8",
  deliveryFormats: ["In person"],
  learningOutcomes: [],
  requiredEquipment: [],
  active: true,
  public: true
};

const region: Region = {
  id: "region-1",
  slug: "auckland",
  name: "Auckland",
  isActive: true
};

describe("BookingModalHost", () => {
  it("submits and preserves the expected student count after a server validation error", async () => {
    const submittedValues: Record<string, FormDataEntryValue> = {};
    const action = vi.fn(async (_state, formData: FormData) => {
      for (const [key, value] of formData.entries()) {
        submittedValues[key] = value;
      }

      return { error: "Please complete every required booking field before sending your request." };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ defaults: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    const date = nextBookableDates(30)[0];
    expect(date).toBeDefined();

    render(
      <BookingModalHost
        request={{
          id: 1,
          initialStep: "review",
          sessions: [
            {
              id: "session-1",
              presentationSlug: presentation.slug,
              date,
              startTime: "09:00",
              timeText: "9:00 am",
              regionSlug: region.slug,
              yearLevels: presentation.yearLevels,
              expectedStudentCount: 0
            }
          ]
        }}
        onClose={vi.fn()}
        presentations={[presentation]}
        regions={[region]}
        action={action}
      />
    );

    const schoolName = screen.getByRole("textbox", { name: /School name/i });
    await waitFor(() => expect(schoolName).toBeEnabled());

    const expectedStudents = screen.getByRole("spinbutton", {
      name: "Expected students for session 1"
    });
    fireEvent.change(expectedStudents, { target: { value: "120" } });
    fireEvent.change(schoolName, { target: { value: "Harbour College" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Primary contact name/i }), {
      target: { value: "Aroha Rangi" }
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: /Primary contact email/i }),
      { target: { value: "aroha@example.nz" } }
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: /Primary contact phone/i }),
      { target: { value: "021 123 4567" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /Send request/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("required booking field");
    expect(submittedValues["session-0-expectedStudentCount"]).toBe("120");
    expect(expectedStudents).toHaveValue(120);
  });
});
