"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { PLATFORM_DATA_TAG } from "@/lib/services/cache-tags";
import { submitBookingRequest } from "@/lib/services/bookings";

const bookingSchema = z.object({
  schoolName: z.string().min(2),
  contactName: z.string().min(2),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(5),
  regionSlug: z.string().min(1),
  schoolNotes: z.string().optional(),
  marketingConsent: z.boolean(),
  sessions: z
    .array(
      z.object({
        presentationSlug: z.string().min(1),
        regionSlug: z.string().min(1),
        date: z.string().min(1),
        startTime: z.string().min(1),
        endTime: z.string().min(1),
        yearLevels: z.string().min(1),
        expectedStudentCount: z.number().int().positive()
      })
    )
    .min(1)
    .max(5)
});

export async function submitBookingRequestAction(formData: FormData) {
  if (String(formData.get("website2") || "").trim()) {
    redirect("/booking/confirmation/received");
  }

  const count = Number(formData.get("sessionsCount") || 0);
  const firstSessionRegion = String(formData.get("session-0-regionSlug") || "");
  const customRegions = Array.from(
    new Set(
      Array.from({ length: count }, (_, index) =>
        String(formData.get(`session-${index}-customRegion`) || "").trim()
      ).filter(Boolean)
    )
  );
  const schoolNotes = [
    String(formData.get("schoolNotes") || "").trim(),
    customRegions.length > 0 ? `Requested region: ${customRegions.join(", ")}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const parsed = bookingSchema.parse({
    schoolName: formData.get("schoolName"),
    contactName: formData.get("contactName"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
    regionSlug: formData.get("regionSlug") || firstSessionRegion,
    schoolNotes: schoolNotes || undefined,
    marketingConsent: formData.get("marketingConsent") === "on",
    sessions: Array.from({ length: count }, (_, index) => ({
      presentationSlug: String(formData.get(`session-${index}-presentationSlug`) || ""),
      regionSlug: String(
        formData.get(`session-${index}-regionSlug`) ||
          formData.get("regionSlug") ||
          firstSessionRegion
      ),
      date: String(formData.get(`session-${index}-date`) || ""),
      startTime: String(formData.get(`session-${index}-startTime`) || ""),
      endTime: String(formData.get(`session-${index}-endTime`) || ""),
      yearLevels: String(formData.get(`session-${index}-yearLevels`) || ""),
      expectedStudentCount: Number(
        formData.get(`session-${index}-expectedStudentCount`) || 0
      )
    }))
  });

  const booking = await submitBookingRequest(parsed);
  updateTag(PLATFORM_DATA_TAG);
  revalidatePath("/staff");
  redirect(`/booking/confirmation/${booking.id}`);
}
