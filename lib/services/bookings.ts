import { randomUUID } from "node:crypto";

import { config } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAdminPortalData as getLiveAdminPortalData,
  getAmbassadorPortalData as getLiveAmbassadorPortalData,
  getSchoolPortalData as getLiveSchoolPortalData,
  getStaffPortalData as getLiveStaffPortalData
} from "@/lib/services/portal";
import type { BookingContactDefaults, BookingRequestInput } from "@/lib/domain/types";
import { sendBookingRequestReceivedEmail } from "@/lib/services/email-triggers";
import { addContactToTeachersList } from "@/lib/services/brevo-contacts";
import { notifyStaff } from "@/lib/services/notifications";
import { nzDateTimeToIso, slugify } from "@/lib/utils";

// Thrown when Supabase is configured but the service-role key is missing, so
// the public form fails loudly instead of showing a fabricated confirmation.
// Mirrors the ConfigGate distinction used by the portals: a fully unconfigured
// environment (no Supabase env at all) is a deliberate local demo, while a
// partially configured one is a production misconfiguration.
export class BookingConfigurationError extends Error {
  constructor() {
    super("Supabase is configured but the service-role key is missing; booking submissions cannot be stored.");
    this.name = "BookingConfigurationError";
  }
}

export async function submitBookingRequest(input: BookingRequestInput) {
  const admin = createAdminClient();

  if (!admin) {
    if (config.isSupabaseConfigured) {
      throw new BookingConfigurationError();
    }

    // Full demo mode only: nothing is stored, matching the demo data used
    // across the rest of the public site when Supabase is absent.
    return {
      id: `booking-${randomUUID().slice(0, 8)}`,
      referenceCode: String(Math.floor(100000 + Math.random() * 900000)),
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

  const linkedIdentity = input.submittedByUserId
    ? await loadLinkedSchoolIdentity(input.submittedByUserId)
    : null;
  const usesLinkedSchool =
    linkedIdentity && linkedIdentity.schoolName.trim().toLowerCase() === input.schoolName.trim().toLowerCase();
  const { data: existingSchool } = usesLinkedSchool
    ? { data: { id: linkedIdentity.schoolId } }
    : await admin
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

  const usesLinkedContact =
    usesLinkedSchool &&
    linkedIdentity &&
    linkedIdentity.contactName.trim() === input.contactName.trim() &&
    linkedIdentity.contactEmail.trim().toLowerCase() === input.contactEmail.trim().toLowerCase() &&
    linkedIdentity.contactPhone.trim() === input.contactPhone.trim();
  const contactResult = usesLinkedContact
    ? { data: { id: linkedIdentity.contactId }, error: null }
    : await admin
        .from("school_contacts")
        .insert({
          school_id: schoolId,
          full_name: input.contactName,
          email: input.contactEmail,
          phone: input.contactPhone,
          is_primary: !usesLinkedSchool,
          can_access_portal: !usesLinkedSchool,
          marketing_consent: input.marketingConsent
        })
        .select("id")
        .single();
  const { data: contact, error: contactError } = contactResult;

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
      submitted_by_user_id: input.submittedByUserId ?? null,
      created_at: now,
      updated_at: now
    })
    .select("id, reference_code")
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
      status: "tentative",
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
      school_name: input.schoolName,
      submitted_by_user_id: input.submittedByUserId ?? null
    }
  });

  void sendBookingRequestReceivedEmail({
    contactEmail: input.contactEmail,
    contactName: input.contactName,
    schoolName: input.schoolName,
    bookingId: bookingRequest.id as string,
    referenceCode: (bookingRequest.reference_code as string | null) ?? undefined
  }).catch(() => {});
  void notifyStaff({
    title: `New booking request from ${input.schoolName}`,
    body: `${input.contactName} submitted ${input.sessions.length} requested session${input.sessions.length === 1 ? "" : "s"}.`,
    type: "booking_request_submitted",
    relatedUrl: `/staff/bookings?status=all&range=all&booking=${bookingRequest.id}#booking-${bookingRequest.id}`
  }).catch(() => {});

  if (input.marketingConsent) {
    void addContactToTeachersList({
      email: input.contactEmail,
      name: input.contactName,
      schoolName: input.schoolName
    }).catch(() => {});
  }

  return {
    id: bookingRequest.id as string,
    referenceCode: bookingRequest.reference_code as string,
    mode: "supabase" as const,
    regionSlug,
    schoolSlug
  };
}

type LinkedSchoolIdentity = BookingContactDefaults & {
  schoolId: string;
  contactId: string;
};

async function loadLinkedSchoolIdentity(userId: string): Promise<LinkedSchoolIdentity | null> {
  const admin = createAdminClient();

  if (!admin) {
    return null;
  }

  const { data: mappings } = await admin
    .from("school_contact_users")
    .select("school_contact_id")
    .eq("user_id", userId);
  const contactIds = (mappings ?? []).map((mapping) => mapping.school_contact_id as string);

  if (contactIds.length === 0) {
    return null;
  }

  const { data: contacts } = await admin
    .from("school_contacts")
    .select("id, school_id, full_name, email, phone, is_primary")
    .in("id", contactIds);
  const contact = [...(contacts ?? [])].sort(
    (a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary))
  )[0];

  if (!contact) {
    return null;
  }

  const { data: school } = await admin
    .from("schools")
    .select("id, name, region_id")
    .eq("id", contact.school_id)
    .maybeSingle();

  if (!school) {
    return null;
  }

  const { data: region } = school.region_id
    ? await admin.from("regions").select("slug").eq("id", school.region_id).maybeSingle()
    : { data: null };

  return {
    schoolId: school.id as string,
    contactId: contact.id as string,
    schoolName: school.name as string,
    contactName: (contact.full_name as string | null) ?? "",
    contactEmail: (contact.email as string | null) ?? "",
    contactPhone: (contact.phone as string | null) ?? "",
    regionSlug: (region?.slug as string | null) ?? ""
  };
}

export async function getBookingContactDefaults(userId: string) {
  const identity = await loadLinkedSchoolIdentity(userId);

  if (!identity) {
    return null;
  }

  return {
    schoolName: identity.schoolName,
    contactName: identity.contactName,
    contactEmail: identity.contactEmail,
    contactPhone: identity.contactPhone,
    regionSlug: identity.regionSlug
  } satisfies BookingContactDefaults;
}

export async function getBookingConfirmation(bookingId: string) {
  const admin = createAdminClient();

  if (!admin) {
    return null;
  }

  const { data } = await admin
    .from("booking_requests")
    .select("id, reference_code, submitted_by_user_id")
    .eq("id", bookingId)
    .maybeSingle();

  return data
    ? {
        id: data.id as string,
        referenceCode: data.reference_code as string,
        submittedByUserId: (data.submitted_by_user_id as string | null) ?? null
      }
    : null;
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
