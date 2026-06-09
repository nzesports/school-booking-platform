import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  ambassadors,
  bookingRequests,
  presentations,
  schools
} from "@/lib/domain/demo-data";
import type {
  AmbassadorSignupInput,
  BookingRequestInput,
  BookingRequestView
} from "@/lib/domain/types";
import { slugify } from "@/lib/utils";

export async function listBookingRequests() {
  return bookingRequests;
}

export async function getBookingRequestById(id: string) {
  return bookingRequests.find((booking) => booking.id === id) ?? null;
}

export async function listOpenAmbassadorSessions() {
  return bookingRequests.flatMap((booking) =>
    booking.sessions.filter((session) =>
      ["ambassador_needed", "ambassador_applied"].includes(session.status)
    )
  );
}

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

  const { data: existingSchool } = await admin
    .from("schools")
    .select("id")
    .eq("name", input.schoolName)
    .maybeSingle();

  let schoolId = existingSchool?.id as string | undefined;

  if (!schoolId) {
    const { data: createdSchool, error: schoolError } = await admin
      .from("schools")
      .insert({
        name: input.schoolName,
        city: "Pending",
        region_id: null,
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
      region_id: null,
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
    const presentation = presentations.find(
      (item) => item.slug === session.presentationSlug
    );

    await admin.from("booking_sessions").insert({
      booking_request_id: bookingRequest.id,
      school_id: schoolId,
      region_id: null,
      presentation_type_id: presentation?.id ?? null,
      status: "ambassador_needed",
      starts_at: `${session.date}T${session.startTime}:00+12:00`,
      ends_at: `${session.date}T${session.endTime}:00+12:00`,
      year_levels: session.yearLevels,
      expected_student_count: session.expectedStudentCount
    });
  }

  return {
    id: bookingRequest.id as string,
    mode: "supabase" as const,
    regionSlug,
    schoolSlug
  };
}

export async function submitAmbassadorSignup(input: AmbassadorSignupInput) {
  const admin = createAdminClient();

  if (!admin) {
    return {
      id: `ambassador-${randomUUID().slice(0, 8)}`,
      mode: "demo" as const
    };
  }

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName,
      role: "ambassador"
    }
  });

  if (authError || !authUser.user) {
    throw authError ?? new Error("Unable to create ambassador user.");
  }

  await admin.from("profiles").insert({
    id: authUser.user.id,
    email: input.email,
    full_name: input.fullName,
    phone: input.phone,
    role: "ambassador",
    status: "active"
  });

  await admin.from("ambassador_profiles").insert({
    user_id: authUser.user.id,
    bio: input.experience,
    open_to_travel: input.openToTravel,
    status: "applied"
  });

  return {
    id: authUser.user.id,
    mode: "supabase" as const
  };
}

export async function getSchoolPortalData() {
  return bookingRequests.filter((booking) => booking.source === "public");
}

export async function getAmbassadorPortalData() {
  return {
    ambassador: ambassadors[0],
    openSessions: await listOpenAmbassadorSessions(),
    assignedSessions: bookingRequests.flatMap((booking) =>
      booking.sessions.filter((session) => session.assignedAmbassadorName)
    )
  };
}

export async function getStaffPortalData() {
  return {
    bookings: bookingRequests,
    schools,
    ambassadors
  };
}

export async function getAdminPortalData(): Promise<{
  bookings: BookingRequestView[];
  presentationsCount: number;
}> {
  return {
    bookings: bookingRequests,
    presentationsCount: presentations.length
  };
}
