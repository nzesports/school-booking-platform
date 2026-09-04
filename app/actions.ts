"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { AVAILABILITY_DATA_TAG, PLATFORM_DATA_TAG } from "@/lib/services/cache-tags";
import { addContactToTeachersList } from "@/lib/services/brevo-contacts";
import { getAuthenticatedPortalUser } from "@/lib/services/auth";
import {
  isBookableDate,
  isBookableSessionTime,
  isWithinBookingWindow
} from "@/lib/services/availability";
import { loadAvailabilityConfig } from "@/lib/services/availability-server";
import { BookingConfigurationError, submitBookingRequest } from "@/lib/services/bookings";

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

const footerSubscribeSchema = z.object({
  email: z.string().trim().email(),
  startedAt: z.coerce.number().int().positive(),
  returnTo: z.string().min(1).default("/#contact")
});

function appendSearchParam(path: string, key: string, value: string) {
  const [base, hash] = path.split("#");
  const suffix = hash ? `#${hash}` : "";

  return `${base}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}${suffix}`;
}

function sanitizeReturnTo(path: string) {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\")
    ? path
    : "/#contact";
}

export type BookingFormState = { error: string } | null;

export async function submitBookingRequestAction(
  _previousState: BookingFormState,
  formData: FormData
): Promise<BookingFormState> {
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

  const parsed = bookingSchema.safeParse({
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

  if (!parsed.success) {
    const invalidPaths = parsed.error.issues.map((issue) => issue.path.join("."));

    if (invalidPaths.some((path) => path.endsWith("expectedStudentCount"))) {
      return { error: "Enter the expected number of students for every session." };
    }

    if (
      invalidPaths.some((path) =>
        ["schoolName", "contactName", "contactEmail", "contactPhone"].includes(path)
      )
    ) {
      return { error: "Please complete the school contact details with a valid email and phone number." };
    }

    return { error: "Please review every session detail before sending your request." };
  }

  const availabilityConfig = await loadAvailabilityConfig();
  const invalidDate = parsed.data.sessions.find(
    (session) =>
      !isWithinBookingWindow(session.date) ||
      !isBookableDate(session.date, availabilityConfig) ||
      !isBookableSessionTime(
        session.date,
        session.startTime,
        session.endTime,
        availabilityConfig
      )
  );

  if (invalidDate) {
    return {
      error:
        "One of your selected dates is no longer available. Choose a date at least seven days away and try again."
    };
  }

  const user = await getAuthenticatedPortalUser();
  let booking: Awaited<ReturnType<typeof submitBookingRequest>>;

  try {
    booking = await submitBookingRequest({
      ...parsed.data,
      submittedByUserId: user?.role === "school" ? user.id : undefined
    });
  } catch (error) {
    if (error instanceof BookingConfigurationError) {
      return {
        error:
          "Your booking could not be submitted because of a configuration issue on our side. Please contact the NZ Esports team directly so we don't miss your request."
      };
    }

    return { error: "We couldn't send your booking request. Please try again." };
  }

  updateTag(PLATFORM_DATA_TAG);
  updateTag(AVAILABILITY_DATA_TAG);
  revalidatePath("/staff");
  revalidatePath("/school");
  redirect(`/booking/confirmation/${booking.id}`);
}

export async function subscribeFooterAction(formData: FormData) {
  const returnTo = sanitizeReturnTo(String(formData.get("returnTo") || "/#contact"));

  if (String(formData.get("website2") || "").trim()) {
    redirect(returnTo);
  }

  const parsed = footerSubscribeSchema.safeParse({
    email: String(formData.get("email") || ""),
    startedAt: String(formData.get("startedAt") || ""),
    returnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(returnTo, "error", "invalid-email"));
  }

  if (Date.now() - parsed.data.startedAt < 800) {
    redirect(appendSearchParam(returnTo, "error", "subscribe-too-fast"));
  }

  const result = await addContactToTeachersList({
    email: parsed.data.email,
    source: "Footer subscribe"
  });

  if (result.status === "failed") {
    redirect(appendSearchParam(returnTo, "error", "subscribe-failed"));
  }

  redirect(appendSearchParam(parsed.data.returnTo, "subscribed", "1"));
}
