import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAdminPortalData as getLiveAdminPortalData,
  getAmbassadorPortalData as getLiveAmbassadorPortalData,
  getSchoolPortalData as getLiveSchoolPortalData,
  getStaffPortalData as getLiveStaffPortalData
} from "@/lib/services/portal";
import type { BookingRequestInput } from "@/lib/domain/types";
import { sendBookingRequestReceivedEmail } from "@/lib/services/email-triggers";
import { notifyStaff } from "@/lib/services/notifications";
import { nzDateTimeToIso, slugify } from "@/lib/utils";

export async function submitBookingRequest(input: BookingRequestInput) {
  const admin = createAdminClient();

  if (!admin) {
    return {
      id: `booking-${randomUUID().slice(0, 8)}`,
      mode: "demo" as const
    };
  }

  const regionSlug = input.regionSlug;
  const schoolSlug = slugify(input.schoolName);
  const now = new Date().toISOString();

  const { data: region } = await admin
    .from("regions")
    .select("id")
    .eq("slug", regionSlug)
    .maybeSingle();
  const resolvedRegionId = (region?.id as string | undefined) ?? null;

  const { data: existingSchool } = await admin
    .from("schools")
    .select("id")
    .ilike("name", input.schoolName)
    .maybeSingle();

  let schoolId = existingSchool?.id as string | undefined;

  if (!schoolId) {
    const { data: createdSchool, error: schoolError } = await admin
      .from("schools")
      .insert({
        name: input.schoolName,
        city: "Pending",
        region_id: resolvedRegionId,
        status: "pending_review"
      })
      .select("id")
      .single();

    if (schoolError) {
      throw schoolError;
    }

    schoolId = createdSchool.id as string;
  }

  const { data: contact, error: contactError } = await admin
    .from("school_contacts")
    .insert({
      school_id: schoolId,
      full_name: input.contactName,
      email: input.contactEmail,
      phone: input.contactPhone,
      is_primary: true,
      can_access_portal: true,
      marketing_consent: input.marketingConsent
    })
    .select("id")
    .single();

  if (contactError) {
    throw contactError;
  }

  const { data: bookingRequest, error: bookingError } = await admin
    .from("booking_requests")
    .insert({
      school_id: schoolId,
      primary_contact_id: contact.id,
      region_id: resolvedRegionId,
      status: "tentative",
      source: "public",
      school_notes: input.schoolNotes ?? null,
      marketing_consent: input.marketingConsent,
      created_at: now,
      updated_at: now
    })
    .select("id")
    .single();

  if (bookingError) {
    throw bookingError;
  }

  for (const session of input.sessions) {
    const { data: presentationType } = await admin
      .from("presentation_types")
      .select("id")
      .eq("slug", session.presentationSlug)
      .maybeSingle();

    await admin.from("booking_sessions").insert({
      booking_request_id: bookingRequest.id,
      school_id: schoolId,
      region_id: resolvedRegionId,
      presentation_type_id: (presentationType?.id as string | undefined) ?? null,
      status: "ambassador_needed",
      starts_at: nzDateTimeToIso(session.date, session.startTime),
      ends_at: nzDateTimeToIso(session.date, session.endTime),
      year_levels: session.yearLevels,
      expected_student_count: session.expectedStudentCount
    });
  }

  await admin.from("booking_activity_logs").insert({
    booking_request_id: bookingRequest.id,
    action: "booking_request.submitted",
    actor_type: "school",
    details: {
      source: "public_form",
      school_name: input.schoolName
    }
  });

  void sendBookingRequestReceivedEmail({
    contactEmail: input.contactEmail,
    contactName: input.contactName,
    schoolName: input.schoolName,
    bookingId: bookingRequest.id as string
  }).catch(() => {});
  void notifyStaff({
    title: `New booking request from ${input.schoolName}`,
    body: `${input.contactName} submitted ${input.sessions.length} requested session${input.sessions.length === 1 ? "" : "s"}.`,
    type: "booking_request_submitted",
    relatedUrl: `/staff/bookings?status=all&range=all&booking=${bookingRequest.id}#booking-${bookingRequest.id}`
  }).catch(() => {});

  return {
    id: bookingRequest.id as string,
    mode: "supabase" as const,
    regionSlug,
    schoolSlug
  };
}

export async function getSchoolPortalData() {
  return getLiveSchoolPortalData();
}

export async function getAmbassadorPortalData() {
  return getLiveAmbassadorPortalData();
}

export async function getStaffPortalData() {
  return getLiveStaffPortalData();
}

export async function getAdminPortalData() {
  return getLiveAdminPortalData();
}
