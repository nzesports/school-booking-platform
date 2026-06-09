"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { submitAmbassadorSignup, submitBookingRequest } from "@/lib/services/bookings";

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
});

export async function submitBookingRequestAction(formData: FormData) {
  const count = Number(formData.get("sessionsCount") || 0);
  const firstSessionRegion = String(formData.get("session-0-regionSlug") || "");

  const parsed = bookingSchema.parse({
    schoolName: formData.get("schoolName"),
    contactName: formData.get("contactName"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
    regionSlug: formData.get("regionSlug") || firstSessionRegion,
    schoolNotes: formData.get("schoolNotes") || undefined,
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
  revalidatePath("/staff");
  redirect(`/booking/confirmation/${booking.id}`);
}

export async function submitAmbassadorSignupAction(formData: FormData) {
  const result = await submitAmbassadorSignup({
    fullName: String(formData.get("fullName") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    regionSlug: String(formData.get("regionSlug") || ""),
    experience: String(formData.get("experience") || ""),
    openToTravel: formData.get("openToTravel") === "on",
    travelRegions: String(formData.get("travelRegions") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  });

  redirect(`/ambassador-signup?submitted=${result.id}`);
}

export async function requestMagicLinkAction(formData: FormData) {
  const email = String(formData.get("email") || "");
  redirect(`/magic-link?sent=${encodeURIComponent(email)}`);
}

export async function submitPortalAction(formData: FormData) {
  const scope = String(formData.get("scope") || "saved");
  const id = String(formData.get("id") || randomUUID().slice(0, 8));

  redirect(`/${scope}?updated=${id}` as `/${string}`);
}
