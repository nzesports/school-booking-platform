import {
  ambassadors as demoAmbassadors,
  auditLogs as demoAuditLogs,
  bookingRequests as demoBookingRequests,
  emailTemplates as demoEmailTemplates,
  faqs as demoFaqs,
  paymentRecords as demoPayments,
  presentations as demoPresentations,
  regions as demoRegions,
  reportSummaries as demoReports,
  resources as demoResources,
  schools as demoSchools,
  tasks as demoTasks,
  testimonials as demoTestimonials,
  trainingModules as demoTrainingModules
} from "@/lib/domain/demo-data";
import type {
  AmbassadorProfile,
  BookingActivityLogSummary,
  BookingRequestView,
  BookingSessionView,
  EmailTemplateSummary,
  HomepageSectionRecord,
  PaymentRecord,
  PortalNotification,
  PresentationType,
  Region,
  ReportSummary,
  Role,
  School,
  SchoolFeedbackSummary,
  TrainingModule,
  UserSummary
} from "@/lib/domain/types";
import { splitContentLines } from "@/lib/services/presentations";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCurrency, toYouTubeEmbedUrl } from "@/lib/utils";

export type ResourceRecord = {
  id: string;
  title: string;
  description: string;
  type: string;
  audience: "school" | "ambassador" | "staff";
  audiences: Array<"school" | "ambassador" | "staff">;
  tags: string[];
  presentationTypeId?: string;
  presentationSlug?: string;
  presentationTitle?: string;
  storagePath?: string;
  externalUrl?: string;
  youtubeUrl?: string;
  downloadUrl?: string;
  embedUrl?: string;
  versionLabel?: string;
  isCurrent: boolean;
  isActive: boolean;
  updatedAt?: string;
  createdByName?: string;
};

type RoleSummary = {
  id: string;
  name: string;
  description: string;
  isSystemRole: boolean;
  memberCount: number;
};

type AuditLogRecord = {
  id: string;
  action: string;
  entityType: string;
  actor: string;
  createdAt: string;
};

export type StaffPortalData = {
  bookings: BookingRequestView[];
  schools: School[];
  ambassadors: AmbassadorProfile[];
  presentations: PresentationType[];
  regions: Array<{ id: string; name: string; slug: string; isActive: boolean }>;
  reports: ReportSummary[];
  schoolReviews: SchoolFeedbackSummary[];
  payments: PaymentRecord[];
  resources: ResourceRecord[];
  notifications: PortalNotification[];
  activityLogs: BookingActivityLogSummary[];
  upcomingSessions: BookingSessionView[];
  settings: Array<{ key: string; value: string }>;
  tasks: Array<{ id: string; title: string; value: string; detail: string }>;
};

export type AdminPortalData = {
  bookings: BookingRequestView[];
  schools: School[];
  ambassadors: AmbassadorProfile[];
  presentations: PresentationType[];
  presentationsCount: number;
  regions: Array<{ id: string; name: string; slug: string; isActive: boolean }>;
  resources: ResourceRecord[];
  notifications: PortalNotification[];
  activityLogs: BookingActivityLogSummary[];
  reports: ReportSummary[];
  schoolReviews: SchoolFeedbackSummary[];
  payments: PaymentRecord[];
  upcomingSessions: BookingSessionView[];
  users: UserSummary[];
  roles: RoleSummary[];
  homepageSections: HomepageSectionRecord[];
  emailTemplates: EmailTemplateSummary[];
  auditLogs: AuditLogRecord[];
  faqs: Array<{ id: string; question: string; answer: string }>;
};

export type SchoolPortalData = {
  school: { id: string; name: string; city: string } | null;
  bookings: BookingRequestView[];
  resources: ResourceRecord[];
  myReviews: SchoolFeedbackSummary[];
};

export type AmbassadorPortalData = {
  ambassador: AmbassadorProfile;
  openSessions: BookingSessionView[];
  assignedSessions: BookingSessionView[];
  reports: ReportSummary[];
  resources: ResourceRecord[];
  payments: PaymentRecord[];
  trainingModules: TrainingModule[];
  regions: Region[];
};

type RawPlatformData = Awaited<ReturnType<typeof loadPlatformData>>;

async function loadPlatformData() {
  const admin = createAdminClient();

  if (!admin) {
    return null;
  }

  const [
    profilesResult,
    regionsResult,
    schoolsResult,
    contactsResult,
    schoolContactUsersResult,
    requestsResult,
    sessionsResult,
    presentationsResult,
    ambassadorProfilesResult,
    ambassadorTravelRegionsResult,
    sessionApplicationsResult,
    reportsResult,
    reportMediaResult,
    schoolReviewsResult,
    paymentsResult,
    resourcesResult,
    notificationsResult,
    settingsResult,
    rolesResult,
    homepageSectionsResult,
    emailTemplatesResult,
    auditLogsResult,
    faqsResult,
    bookingActivityLogsResult,
    trainingModulesResult,
    trainingLessonsResult,
    trainingProgressResult
  ] = await Promise.all([
    admin.from("profiles").select("id, email, full_name, phone, role, status, created_at"),
    admin
      .from("regions")
      .select("id, name, slug, is_active, sort_order")
      .order("sort_order", { ascending: true }),
    admin
      .from("schools")
      .select("id, name, city, roll_size, status, region_id, address, suburb, postcode"),
    admin.from("school_contacts").select("id, school_id, full_name, email, phone, is_primary"),
    admin.from("school_contact_users").select("school_contact_id, user_id"),
    admin
      .from("booking_requests")
      .select(
        "id, school_id, primary_contact_id, region_id, status, source, school_notes, internal_notes, created_at, updated_at, staff_owner_id"
      )
      .order("created_at", { ascending: false }),
    admin
      .from("booking_sessions")
      .select(
        "id, booking_request_id, presentation_type_id, region_id, school_id, assigned_ambassador_id, status, starts_at, ends_at, year_levels, expected_student_count, actual_student_count, report_status, payment_status, location_address, share_contact_with_ambassador"
      )
      .order("starts_at", { ascending: true }),
    admin.from("presentation_types").select("*"),
    // Select * so optional columns added by later migrations (profile_details)
    // don't break the whole portal query before the migration runs.
    admin.from("ambassador_profiles").select("*"),
    admin.from("ambassador_travel_regions").select("ambassador_profile_id, region_id"),
    admin
      .from("booking_session_applications")
      .select("id, booking_session_id, ambassador_profile_id, status"),
    admin.from("ambassador_reports").select("*").order("submitted_at", { ascending: false }),
    admin
      .from("media_library")
      .select("id, report_id, public_url, media_type, title")
      .not("report_id", "is", null),
    admin
      .from("presentation_reviews")
      .select("id, presentation_type_id, school_id, quote, attribution, rating, is_approved, is_public, created_at")
      .order("created_at", { ascending: false }),
    admin
      .from("payments")
      .select(
        "id, booking_session_id, ambassador_profile_id, amount_cents, status, eligibility_reason, created_at, paid_at, invoice_number, invoice_submitted_at, sent_to_finance_at, sent_to_email, sent_cc_email, bank_account_number, gst_number, invoice_notes"
      ),
    // Select * so environments missing the 0006 columns (audiences/tags)
    // still load resources instead of failing the whole query.
    admin.from("presentation_resources").select("*").order("created_at", { ascending: false }),
    admin
      .from("notifications")
      .select(
        "id, user_id, title, body, notification_type, related_url, read_at, resolved_at, created_at"
      )
      .order("created_at", { ascending: false }),
    admin.from("settings").select("setting_key, setting_value"),
    admin.from("roles").select("id, name, description, is_system_role"),
    admin
      .from("homepage_sections")
      .select("id, section_key, title, subtitle, body, image_url, is_active, sort_order")
      .order("sort_order", { ascending: true }),
    admin
      .from("email_templates")
      .select("id, template_key, subject, body_html, body_text, is_active")
      .order("updated_at", { ascending: false }),
    admin
      .from("audit_logs")
      .select("id, action, entity_type, actor_id, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    admin.from("faqs").select("id, question, answer").order("sort_order", { ascending: true }),
    admin
      .from("booking_activity_logs")
      .select("booking_request_id, booking_session_id, action, details, created_at, actor_type")
      .order("created_at", { ascending: false })
      .limit(500),
    // Select * so environments missing the 0004 columns (is_published etc.)
    // still load training modules.
    admin.from("training_modules").select("*").order("sort_order", { ascending: true }),
    admin
      .from("training_lessons")
      .select("id, training_module_id, title, lesson_type, content, youtube_url, sort_order")
      .order("sort_order", { ascending: true }),
    admin
      .from("training_progress")
      .select("id, ambassador_profile_id, training_module_id, training_lesson_id, status, completed_at")
  ]);

  return {
    profiles: profilesResult.data ?? [],
    regions: regionsResult.data ?? [],
    schools: schoolsResult.data ?? [],
    contacts: contactsResult.data ?? [],
    schoolContactUsers: schoolContactUsersResult.data ?? [],
    bookingRequests: requestsResult.data ?? [],
    bookingSessions: sessionsResult.data ?? [],
    presentations: presentationsResult.data ?? [],
    ambassadorProfiles: ambassadorProfilesResult.data ?? [],
    ambassadorTravelRegions: ambassadorTravelRegionsResult.data ?? [],
    sessionApplications: sessionApplicationsResult.data ?? [],
    reports: reportsResult.data ?? [],
    reportMedia: reportMediaResult.data ?? [],
    schoolReviews: schoolReviewsResult.data ?? [],
    payments: paymentsResult.data ?? [],
    resources: resourcesResult.data ?? [],
    notifications: notificationsResult.data ?? [],
    settings: settingsResult.data ?? [],
    roles: rolesResult.data ?? [],
    homepageSections: homepageSectionsResult.data ?? [],
    emailTemplates: emailTemplatesResult.data ?? [],
    auditLogs: auditLogsResult.data ?? [],
    faqs: faqsResult.data ?? [],
    bookingActivityLogs: bookingActivityLogsResult.data ?? [],
    trainingModules: trainingModulesResult.data ?? [],
    trainingLessons: trainingLessonsResult.data ?? [],
    trainingProgress: trainingProgressResult.data ?? []
  };
}

function buildLookups(data: NonNullable<RawPlatformData>) {
  const profilesById = new Map(data.profiles.map((profile) => [profile.id as string, profile]));
  const regionsById = new Map(data.regions.map((region) => [region.id as string, region]));
  const schoolsById = new Map(data.schools.map((school) => [school.id as string, school]));
  const contactsById = new Map(data.contacts.map((contact) => [contact.id as string, contact]));
  const presentationsById = new Map(
    data.presentations.map((presentation) => [presentation.id as string, presentation])
  );
  const ambassadorProfilesById = new Map(
    data.ambassadorProfiles.map((ambassador) => [ambassador.id as string, ambassador])
  );

  return {
    profilesById,
    regionsById,
    schoolsById,
    contactsById,
    presentationsById,
    ambassadorProfilesById
  };
}

async function mapResources(data: NonNullable<RawPlatformData>) {
  const { presentationsById, profilesById } = buildLookups(data);

  return Promise.all(
    data.resources.map(async (resource) => {
      const presentation = presentationsById.get(resource.presentation_type_id as string);
      const downloadUrl =
        (resource.public_url as string | null) ??
        (resource.storage_path ? `/portal/download/${resource.id}` : null);
      const legacyAudience = resource.audience as "school" | "ambassador" | "staff" | undefined;
      const audiences =
        Array.isArray(resource.audiences) && resource.audiences.length > 0
          ? (resource.audiences as Array<"school" | "ambassador" | "staff">)
          : [legacyAudience ?? ("staff" as const)];

      return {
        id: resource.id as string,
        title: resource.title as string,
        description: (resource.description as string | null) ?? "",
        type: resource.resource_type as string,
        audience: audiences[0] ?? "staff",
        audiences,
        tags: Array.isArray(resource.tags) ? (resource.tags as string[]) : [],
        presentationTypeId: (resource.presentation_type_id as string | null) ?? undefined,
        presentationSlug: (presentation?.slug as string | undefined) ?? undefined,
        presentationTitle: (presentation?.title as string | undefined) ?? undefined,
        storagePath: (resource.storage_path as string | null) ?? undefined,
        externalUrl: (resource.public_url as string | null) ?? undefined,
        youtubeUrl: (resource.youtube_url as string | null) ?? undefined,
        downloadUrl: downloadUrl ?? undefined,
        embedUrl: toYouTubeEmbedUrl(resource.youtube_url as string | null) ?? undefined,
        versionLabel: (resource.version_label as string | null) ?? undefined,
        isCurrent: Boolean(resource.is_current),
        isActive: Boolean(resource.is_active),
        updatedAt:
          (resource.updated_at as string | null) ??
          (resource.created_at as string | null) ??
          undefined,
        createdByName:
          (profilesById.get(resource.created_by as string)?.full_name as string | undefined) ??
          undefined
      } satisfies ResourceRecord;
    })
  );
}

function mapBookingRequests(data: NonNullable<RawPlatformData>) {
  const {
    profilesById,
    regionsById,
    schoolsById,
    contactsById,
    presentationsById,
    ambassadorProfilesById
  } = buildLookups(data);

  const sessionsByBookingId = new Map<string, BookingSessionView[]>();
  const applicantsBySessionId = new Map<string, Array<{ id: string; name: string }>>();

  for (const application of data.sessionApplications) {
    const ambassadorProfile = data.ambassadorProfiles.find(
      (profile) => profile.id === application.ambassador_profile_id
    );
    const user = ambassadorProfile
      ? data.profiles.find((profile) => profile.id === ambassadorProfile.user_id)
      : null;

    if (!ambassadorProfile) {
      continue;
    }

    const sessionId = application.booking_session_id as string;
    applicantsBySessionId.set(sessionId, [
      ...(applicantsBySessionId.get(sessionId) ?? []),
      {
        id: ambassadorProfile.id as string,
        name: (user?.full_name as string | undefined) ?? "Ambassador"
      }
    ]);
  }

  const requestStatusById = new Map(
    data.bookingRequests.map((request) => [request.id as string, request.status as string])
  );
  const primaryContactBySchoolId = new Map<string, (typeof data.contacts)[number]>();

  for (const contact of data.contacts) {
    const schoolId = contact.school_id as string;
    const existing = primaryContactBySchoolId.get(schoolId);

    if (!existing || (contact.is_primary && !existing.is_primary)) {
      primaryContactBySchoolId.set(schoolId, contact);
    }
  }

  for (const session of data.bookingSessions) {
    const bookingId = session.booking_request_id as string;
    const region = regionsById.get(session.region_id as string);
    const school = schoolsById.get(session.school_id as string);
    const presentation = presentationsById.get(session.presentation_type_id as string);
    const ambassadorProfile = ambassadorProfilesById.get(session.assigned_ambassador_id as string);
    const ambassadorUser = ambassadorProfile
      ? profilesById.get(ambassadorProfile.user_id as string)
      : null;
    const schoolAddress = school
      ? [school.address, school.suburb, school.city, school.postcode]
          .map((part) => (part as string | null)?.trim())
          .filter(Boolean)
          .join(", ")
      : "";
    const sharedContact = session.share_contact_with_ambassador
      ? primaryContactBySchoolId.get(session.school_id as string)
      : undefined;

    const mappedSession: BookingSessionView = {
      id: session.id as string,
      presentationTypeId: (session.presentation_type_id as string | null) ?? undefined,
      presentationSlug: (presentation?.slug as string | undefined) ?? "presentation",
      presentationTitle: (presentation?.title as string | undefined) ?? "Presentation",
      regionSlug: (region?.slug as string | undefined) ?? "unassigned",
      regionName: (region?.name as string | undefined) ?? undefined,
      schoolId: (session.school_id as string | null) ?? undefined,
      schoolName: (school?.name as string | undefined) ?? "School",
      schoolAddress: schoolAddress || undefined,
      locationAddress: (session.location_address as string | null) ?? undefined,
      contactName: (sharedContact?.full_name as string | undefined) ?? undefined,
      contactEmail: (sharedContact?.email as string | undefined) ?? undefined,
      contactPhone: (sharedContact?.phone as string | undefined) ?? undefined,
      startsAt: session.starts_at as string,
      endsAt: session.ends_at as string,
      yearLevels: (session.year_levels as string | null) ?? "Years 7 to 13",
      expectedStudentCount: Number(session.expected_student_count ?? 0),
      actualStudentCount: session.actual_student_count
        ? Number(session.actual_student_count)
        : undefined,
      status: session.status as BookingSessionView["status"],
      assignedAmbassadorName: (ambassadorUser?.full_name as string | undefined) ?? undefined,
      reportStatus: session.report_status as BookingSessionView["reportStatus"],
      paymentStatus: session.payment_status as BookingSessionView["paymentStatus"],
      applicants: applicantsBySessionId.get(session.id as string) ?? [],
      bookingRequestId: bookingId,
      bookingStatus:
        (requestStatusById.get(bookingId) as BookingSessionView["bookingStatus"]) ?? undefined
    };

    sessionsByBookingId.set(bookingId, [...(sessionsByBookingId.get(bookingId) ?? []), mappedSession]);
  }

  return data.bookingRequests.map((request) => {
    const school = schoolsById.get(request.school_id as string);
    const contact = contactsById.get(request.primary_contact_id as string);
    const region = regionsById.get(request.region_id as string) ?? regionsById.get(school?.region_id as string);

    return {
      id: request.id as string,
      schoolName: (school?.name as string | undefined) ?? "School",
      primaryContactName: (contact?.full_name as string | undefined) ?? "Primary contact",
      primaryContactEmail: (contact?.email as string | undefined) ?? "",
      regionSlug: (region?.slug as string | undefined) ?? "unassigned",
      status: request.status as BookingRequestView["status"],
      source: request.source as BookingRequestView["source"],
      schoolNotes: (request.school_notes as string | null) ?? undefined,
      internalNotes: (request.internal_notes as string | null) ?? undefined,
      createdAt: request.created_at as string,
      sessions: sessionsByBookingId.get(request.id as string) ?? []
    } satisfies BookingRequestView;
  });
}

function mapSchools(data: NonNullable<RawPlatformData>) {
  const { regionsById } = buildLookups(data);

  return data.schools.map((school) => ({
    id: school.id as string,
    name: school.name as string,
    regionSlug: (regionsById.get(school.region_id as string)?.slug as string | undefined) ?? "unassigned",
    city: (school.city as string | null) ?? "Pending",
    rollSize: Number(school.roll_size ?? 0),
    status: ((school.status as string) === "active" ? "active" : "pending_review") as School["status"]
  }));
}

// Payments still owed to an ambassador: awaiting invoice, invoiced, or with finance.
const outstandingPaymentStatuses = ["pending", "invoiced", "submitted_for_payment"];

function mapAmbassadors(data: NonNullable<RawPlatformData>) {
  const { profilesById, regionsById } = buildLookups(data);
  const travelRegionsByAmbassador = new Map<string, string[]>();

  for (const travelRegion of data.ambassadorTravelRegions) {
    const mapped = regionsById.get(travelRegion.region_id as string);

    if (!mapped) {
      continue;
    }

    travelRegionsByAmbassador.set(
      travelRegion.ambassador_profile_id as string,
      [...(travelRegionsByAmbassador.get(travelRegion.ambassador_profile_id as string) ?? []), mapped.slug as string]
    );
  }

  return data.ambassadorProfiles.map((profile) => {
    const user = profilesById.get(profile.user_id as string);
    const payments = data.payments.filter(
      (payment) => payment.ambassador_profile_id === profile.id
    );

    const region = regionsById.get(profile.region_id as string);

    return {
      id: profile.id as string,
      name: (user?.full_name as string | undefined) ?? "Ambassador",
      email: (user?.email as string | undefined) ?? "",
      phone: (user?.phone as string | undefined) ?? undefined,
      regionSlug: (region?.slug as string | undefined) ?? "unassigned",
      regionName: (region?.name as string | undefined) ?? undefined,
      status: profile.status as AmbassadorProfile["status"],
      openToTravel: Boolean(profile.open_to_travel),
      travelRegions: travelRegionsByAmbassador.get(profile.id as string) ?? [],
      bio: (profile.bio as string | null) ?? undefined,
      experience: (profile.experience as string | null) ?? undefined,
      referredBy: (profile.referred_by as string | null) ?? undefined,
      estimatedEarningsCents: payments.reduce((total, payment) => total + Number(payment.amount_cents ?? 0), 0),
      pendingPaymentsCents: payments
        .filter((payment) => outstandingPaymentStatuses.includes(payment.status as string))
        .reduce((total, payment) => total + Number(payment.amount_cents ?? 0), 0),
      paidPaymentsCents: payments
        .filter((payment) => payment.status === "paid")
        .reduce((total, payment) => total + Number(payment.amount_cents ?? 0), 0),
      bankAccountName: (profile.bank_account_name as string | null) ?? undefined,
      bankAccountNumber: (profile.bank_account_number as string | null) ?? undefined,
      gstNumber: (profile.gst_number as string | null) ?? undefined,
      details: (profile.profile_details as AmbassadorProfile["details"] | null) ?? undefined
    } satisfies AmbassadorProfile;
  });
}

function mapReports(data: NonNullable<RawPlatformData>) {
  const { schoolsById, presentationsById, ambassadorProfilesById, profilesById } = buildLookups(data);
  const sessionsById = new Map(data.bookingSessions.map((session) => [session.id as string, session]));
  const requestsById = new Map(
    data.bookingRequests.map((request) => [request.id as string, request])
  );
  const mediaByReportId = new Map<string, Array<{ url: string; type: string; title?: string }>>();

  for (const media of data.reportMedia) {
    const reportId = media.report_id as string;
    const url = media.public_url as string | null;

    if (!url) {
      continue;
    }

    mediaByReportId.set(reportId, [
      ...(mediaByReportId.get(reportId) ?? []),
      {
        url,
        type: (media.media_type as string | null) ?? "image",
        title: (media.title as string | null) ?? undefined
      }
    ]);
  }

  const optionalNumber = (value: unknown) =>
    value === null || value === undefined ? undefined : Number(value);
  const optionalBoolean = (value: unknown) =>
    value === null || value === undefined ? undefined : Boolean(value);

  return data.reports.map((report) => {
    const session = sessionsById.get(report.booking_session_id as string);
    const school = session ? schoolsById.get(session.school_id as string) : null;
    const presentation = session ? presentationsById.get(session.presentation_type_id as string) : null;
    const ambassadorProfile = ambassadorProfilesById.get(report.ambassador_profile_id as string);
    const ambassadorUser = ambassadorProfile
      ? profilesById.get(ambassadorProfile.user_id as string)
      : null;

    return {
      id: report.id as string,
      schoolId: (session?.school_id as string | null) ?? undefined,
      schoolName: (school?.name as string | undefined) ?? "School",
      presentationTypeId: (session?.presentation_type_id as string | null) ?? undefined,
      presentationTitle: (presentation?.title as string | undefined) ?? "Presentation",
      submittedAt: report.submitted_at as string,
      attendeeCount: Number(report.attendee_count ?? 0),
      status: report.reviewed_for_payment_at ? "reviewed" : "submitted",
      ambassadorName: (ambassadorUser?.full_name as string | undefined) ?? undefined,
      presenterName: (report.presenter_name as string | null) ?? undefined,
      schoolRollSize: optionalNumber(report.school_roll_size),
      primaryContactName: (report.primary_contact_name as string | null) ?? undefined,
      primaryContactEmail: (report.primary_contact_email as string | null) ?? undefined,
      deliveredAt: (report.delivered_at as string | null) ?? undefined,
      firstPresentationToSchool: optionalBoolean(report.first_presentation_to_school),
      studentsCompetedInEsports: optionalBoolean(report.students_competed_in_esports),
      parentsPresent: optionalBoolean(report.parents_present),
      ageGroups: (report.age_groups as string | null) ?? undefined,
      mediaConsentConfirmed: optionalBoolean(report.media_consent_confirmed),
      attendeeQuotes: (report.attendee_quotes as string | null) ?? undefined,
      attendanceRating: optionalNumber(report.attendance_rating),
      teacherResponseRating: optionalNumber(report.teacher_response_rating),
      studentEngagementRating: optionalNumber(report.student_response_rating),
      presentationEnergyRating: optionalNumber(report.presentation_energy_rating),
      notableQuestions: (report.student_questions_themes as string | null) ?? undefined,
      presentationFeedback: (report.presentation_feedback as string | null) ?? undefined,
      additionalNotes: (report.additional_notes as string | null) ?? undefined,
      yearLevels:
        (report.year_levels as string | null) ??
        (session?.year_levels as string | null) ??
        undefined,
      sessionStartsAt: (session?.starts_at as string | undefined) ?? undefined,
      media: mediaByReportId.get(report.id as string) ?? [],
      bookingRequestId: (session?.booking_request_id as string | null) ?? undefined,
      bookingRequestedAt:
        (requestsById.get(session?.booking_request_id as string)?.created_at as
          | string
          | undefined) ?? undefined,
      reviewedAt: (report.reviewed_for_payment_at as string | null) ?? undefined
    } satisfies ReportSummary;
  });
}

function mapSchoolReviews(data: NonNullable<RawPlatformData>) {
  const { schoolsById, presentationsById } = buildLookups(data);

  return data.schoolReviews.map((review) => {
    const school = schoolsById.get(review.school_id as string);
    const presentation = presentationsById.get(review.presentation_type_id as string);

    return {
      id: review.id as string,
      schoolId: (review.school_id as string | null) ?? undefined,
      schoolName: (school?.name as string | undefined) ?? "School",
      presentationTypeId: (review.presentation_type_id as string | null) ?? undefined,
      presentationTitle: (presentation?.title as string | undefined) ?? "Presentation",
      quote: review.quote as string,
      attribution: (review.attribution as string | null) ?? undefined,
      rating:
        review.rating === null || review.rating === undefined ? undefined : Number(review.rating),
      createdAt: review.created_at as string,
      isApproved: Boolean(review.is_approved),
      isPublic: Boolean(review.is_public)
    } satisfies SchoolFeedbackSummary;
  });
}

function mapPayments(data: NonNullable<RawPlatformData>) {
  const { profilesById, ambassadorProfilesById } = buildLookups(data);

  return data.payments.map((payment) => {
    const ambassadorProfile = ambassadorProfilesById.get(payment.ambassador_profile_id as string);
    const ambassadorUser = ambassadorProfile
      ? profilesById.get(ambassadorProfile.user_id as string)
      : null;

    return {
      id: payment.id as string,
      ambassadorName: (ambassadorUser?.full_name as string | undefined) ?? "Unassigned",
      bookingSessionId: payment.booking_session_id as string,
      amountCents: Number(payment.amount_cents ?? 0),
      status: payment.status as PaymentRecord["status"],
      eligibilityReason: (payment.eligibility_reason as string | null) ?? "Pending review",
      createdAt: (payment.created_at as string | null) ?? new Date(0).toISOString(),
      paidAt: (payment.paid_at as string | null) ?? undefined,
      invoiceNumber: (payment.invoice_number as string | null) ?? undefined,
      invoiceSubmittedAt: (payment.invoice_submitted_at as string | null) ?? undefined,
      sentToFinanceAt: (payment.sent_to_finance_at as string | null) ?? undefined,
      sentToEmail: (payment.sent_to_email as string | null) ?? undefined,
      sentCcEmail: (payment.sent_cc_email as string | null) ?? undefined,
      bankAccountNumber: (payment.bank_account_number as string | null) ?? undefined,
      gstNumber: (payment.gst_number as string | null) ?? undefined,
      invoiceNotes: (payment.invoice_notes as string | null) ?? undefined
    } satisfies PaymentRecord;
  });
}

function mapNotificationsForUser(data: NonNullable<RawPlatformData>, userId: string) {
  return data.notifications
    .filter((notification) => notification.user_id === userId)
    .map((notification) => ({
      id: notification.id as string,
      title: notification.title as string,
      body: (notification.body as string | null) ?? "",
      notificationType: notification.notification_type as string,
      relatedUrl: (notification.related_url as string | null) ?? undefined,
      readAt: (notification.read_at as string | null) ?? null,
      resolvedAt: (notification.resolved_at as string | null) ?? null,
      createdAt: notification.created_at as string
    })) satisfies PortalNotification[];
}

function mapActivityLogs(data: NonNullable<RawPlatformData>) {
  return data.bookingActivityLogs.map((log) => ({
    bookingRequestId: (log.booking_request_id as string | null) ?? undefined,
    bookingSessionId: (log.booking_session_id as string | null) ?? undefined,
    action: log.action as string,
    details: ((log.details as Record<string, unknown> | null) ?? {}) satisfies Record<string, unknown>,
    createdAt: log.created_at as string,
    actorType: (log.actor_type as string | null) ?? undefined
  })) satisfies BookingActivityLogSummary[];
}

function mapPresentations(data: NonNullable<RawPlatformData>) {
  return data.presentations.map((presentation) => ({
    id: presentation.id as string,
    slug: presentation.slug as string,
    title: presentation.title as string,
    shortSummary: (presentation.short_summary as string | null) ?? "",
    fullDescription: (presentation.full_description as string | null) ?? "",
    contentSnippet: (presentation.content_snippet as string | null) ?? undefined,
    durationMinutes: Number(presentation.duration_minutes ?? 45),
    yearLevels: (presentation.year_levels as string | null) ?? "Years 7 to 13",
    deliveryFormats: (presentation.delivery_formats as string[] | null) ?? [],
    learningOutcomes: splitContentLines(presentation.learning_outcomes),
    requiredEquipment: splitContentLines(presentation.required_equipment),
    youtubeUrl: (presentation.youtube_url as string | null) ?? undefined,
    imageUrl: (presentation.image_url as string | null) ?? undefined,
    active: Boolean(presentation.is_active),
    public: Boolean(presentation.is_public)
  })) satisfies PresentationType[];
}

function mapHomepageSections(data: NonNullable<RawPlatformData>) {
  return data.homepageSections.map((section) => ({
    id: section.id as string,
    sectionKey: section.section_key as string,
    title: (section.title as string | null) ?? undefined,
    subtitle: (section.subtitle as string | null) ?? undefined,
    body: (section.body as string | null) ?? undefined,
    imageUrl: (section.image_url as string | null) ?? undefined,
    isActive: Boolean(section.is_active),
    sortOrder: Number(section.sort_order ?? 0)
  })) satisfies HomepageSectionRecord[];
}

function mapEmailTemplates(data: NonNullable<RawPlatformData>) {
  return data.emailTemplates.map((template) => ({
    id: template.id as string,
    key: template.template_key as string,
    subject: template.subject as string,
    status: template.is_active ? "active" : "draft",
    bodyHtml: (template.body_html as string | null) ?? undefined,
    bodyText: (template.body_text as string | null) ?? undefined
  })) satisfies EmailTemplateSummary[];
}

function mapUsers(data: NonNullable<RawPlatformData>) {
  const ambassadorProfilesByUserId = new Map(
    data.ambassadorProfiles.map((profile) => [profile.user_id as string, profile])
  );

  return data.profiles.map((profile) => {
    const ambassadorProfile = ambassadorProfilesByUserId.get(profile.id as string);

    return {
      id: profile.id as string,
      email: profile.email as string,
      fullName: (profile.full_name as string | null) ?? "Unknown user",
      role: profile.role as Role,
      status: profile.status as UserSummary["status"],
      phone: (profile.phone as string | null) ?? undefined,
      createdAt: (profile.created_at as string | null) ?? undefined,
      ambassadorProfileId: (ambassadorProfile?.id as string | undefined) ?? undefined,
      ambassadorStatus: (ambassadorProfile?.status as UserSummary["ambassadorStatus"]) ?? undefined
    } satisfies UserSummary;
  });
}

function mapRoles(data: NonNullable<RawPlatformData>) {
  return data.roles.map((role) => ({
    id: role.id as string,
    name: role.name as string,
    description: (role.description as string | null) ?? "",
    isSystemRole: Boolean(role.is_system_role),
    memberCount: data.profiles.filter((profile) => profile.role === role.name).length
  }));
}

function mapAuditLogs(data: NonNullable<RawPlatformData>) {
  const { profilesById } = buildLookups(data);

  return data.auditLogs.map((log) => ({
    id: log.id as string,
    action: log.action as string,
    entityType: log.entity_type as string,
    actor: (profilesById.get(log.actor_id as string)?.full_name as string | undefined) ?? "System",
    createdAt: log.created_at as string
  }));
}

function mapTrainingModules(data: NonNullable<RawPlatformData>, ambassadorProfileId?: string) {
  const completedProgress = new Set(
    data.trainingProgress
      .filter((progress) => {
        if (ambassadorProfileId && progress.ambassador_profile_id !== ambassadorProfileId) {
          return false;
        }

        return progress.status === "completed";
      })
      .map((progress) =>
        progress.training_lesson_id
          ? `lesson:${progress.training_lesson_id}`
          : `module:${progress.training_module_id}`
      )
  );

  return data.trainingModules
    .filter((module) => module.is_active !== false && module.is_published !== false)
    .map((module) => {
      const lessons = data.trainingLessons
        .filter((lesson) => lesson.training_module_id === module.id)
        .map((lesson) => ({
          id: lesson.id as string,
          title: lesson.title as string,
          type: (lesson.lesson_type as TrainingModule["lessons"][number]["type"]) ?? "video",
          durationMinutes: 0
        }));
      const completedLessons = lessons.filter((lesson) => completedProgress.has(`lesson:${lesson.id}`));
      const moduleCompleted = completedProgress.has(`module:${module.id}`);
      const progress =
        lessons.length > 0
          ? Math.round((completedLessons.length / lessons.length) * 100)
          : moduleCompleted
            ? 100
            : 0;

      return {
        id: module.id as string,
        title: module.title as string,
        description: (module.description as string | null) ?? "",
        progress,
        lessons
      } satisfies TrainingModule;
    });
}

const demoSchoolReviews = demoTestimonials.map((testimonial) => ({
  id: testimonial.id,
  schoolName: testimonial.school,
  presentationTitle: testimonial.presentationTitle ?? "Presentation",
  quote: testimonial.quote,
  attribution: testimonial.attribution,
  rating: testimonial.rating,
  createdAt: "2026-06-01T00:00:00.000Z",
  isApproved: true,
  isPublic: true
})) satisfies SchoolFeedbackSummary[];

export async function getStaffPortalData(userId?: string): Promise<StaffPortalData> {
  const data = await loadPlatformData();

  if (!data) {
    return {
      bookings: demoBookingRequests,
      schools: demoSchools,
      ambassadors: demoAmbassadors,
      presentations: demoPresentations,
      regions: demoRegions.map((region) => ({ ...region, isActive: region.isActive })),
      reports: demoReports,
      schoolReviews: demoSchoolReviews,
      payments: demoPayments,
      resources: demoResources.map((resource) => ({
        ...resource,
        type: resource.type,
        audiences: [resource.audience],
        tags: [],
        isActive: true,
        downloadUrl: resource.downloadUrl,
        embedUrl: resource.embedUrl
      })),
      notifications: [],
      activityLogs: [],
      upcomingSessions: demoBookingRequests.flatMap((booking) => booking.sessions),
      settings: [
        { key: "booking_defaults", value: "08:00 - 16:00 / 60 min slots" },
        { key: "payments", value: "NZD 250 default payout" }
      ],
      tasks: demoTasks.map((task) => ({
        id: task.id,
        title: task.title,
        value: task.owner,
        detail: task.status
      }))
    };
  }

  const bookings = mapBookingRequests(data);
  const schools = mapSchools(data);
  const ambassadors = mapAmbassadors(data);
  const reports = mapReports(data);
  const schoolReviews = mapSchoolReviews(data);
  const payments = mapPayments(data);
  const resources = await mapResources(data);
  const activityLogs = mapActivityLogs(data);
  const regions = data.regions.map((region) => ({
    id: region.id as string,
    name: region.name as string,
    slug: region.slug as string,
    isActive: Boolean(region.is_active),
    sortOrder: Number(region.sort_order ?? 0)
  }));
  const upcomingSessions = bookings
    .flatMap((booking) => booking.sessions)
    .filter((session) => new Date(session.startsAt).getTime() >= Date.now())
    .slice(0, 8);

  return {
    bookings,
    schools,
    ambassadors,
    presentations: mapPresentations(data),
    regions,
    reports,
    schoolReviews,
    payments,
    resources,
    notifications: userId ? mapNotificationsForUser(data, userId) : [],
    activityLogs,
    upcomingSessions,
    settings: data.settings.map((setting) => ({
      key: setting.setting_key as string,
      value:
        typeof setting.setting_value === "string"
          ? (setting.setting_value as string)
          : JSON.stringify(setting.setting_value)
    })),
    tasks: [
      {
        id: "applications",
        title: "New applications",
        value: String(ambassadors.filter((ambassador) => ambassador.status === "applied").length),
        detail: "Awaiting staff review"
      },
      {
        id: "approved",
        title: "Approved ambassadors",
        value: String(ambassadors.filter((ambassador) => ambassador.status === "approved").length),
        detail: "Ready for bookings"
      },
      {
        id: "pending-payments",
        title: "Pending payments",
        value: formatCurrency(
          payments
            .filter((payment) => outstandingPaymentStatuses.includes(payment.status))
            .reduce((total, payment) => total + payment.amountCents, 0)
        ),
        detail: "Waiting on invoice or finance"
      }
    ]
  };
}

export async function getAdminPortalData(userId?: string): Promise<AdminPortalData> {
  const data = await loadPlatformData();

  if (!data) {
    return {
      bookings: demoBookingRequests,
      schools: demoSchools,
      ambassadors: demoAmbassadors,
      presentations: demoPresentations,
      presentationsCount: demoPresentations.length,
      regions: demoRegions.map((region) => ({ ...region, isActive: region.isActive })),
      resources: demoResources.map((resource) => ({
        ...resource,
        type: resource.type,
        audiences: [resource.audience],
        tags: [],
        isActive: true
      })),
      notifications: [],
      activityLogs: [],
      reports: demoReports,
      schoolReviews: demoSchoolReviews,
      payments: demoPayments,
      upcomingSessions: demoBookingRequests.flatMap((booking) => booking.sessions),
      users: [],
      roles: [],
      homepageSections: [],
      emailTemplates: demoEmailTemplates,
      auditLogs: demoAuditLogs,
      faqs: demoFaqs
    };
  }

  const bookings = mapBookingRequests(data);
  const schools = mapSchools(data);
  const ambassadors = mapAmbassadors(data);
  const presentations = mapPresentations(data);
  const resources = await mapResources(data);
  const activityLogs = mapActivityLogs(data);
  const regions = data.regions.map((region) => ({
    id: region.id as string,
    name: region.name as string,
    slug: region.slug as string,
    isActive: Boolean(region.is_active),
    sortOrder: Number(region.sort_order ?? 0)
  }));
  const emailTemplates = mapEmailTemplates(data);
  const auditLogs = mapAuditLogs(data);
  const reports = mapReports(data);
  const schoolReviews = mapSchoolReviews(data);
  const upcomingSessions = bookings
    .flatMap((booking) => booking.sessions)
    .filter((session) => new Date(session.startsAt).getTime() >= Date.now())
    .slice(0, 8);

  return {
    bookings,
    schools,
    ambassadors,
    presentations,
    presentationsCount: presentations.length,
    regions,
    resources,
    notifications: userId ? mapNotificationsForUser(data, userId) : [],
    activityLogs,
    reports,
    schoolReviews,
    payments: mapPayments(data),
    upcomingSessions,
    users: mapUsers(data),
    roles: mapRoles(data),
    homepageSections: mapHomepageSections(data),
    emailTemplates,
    auditLogs,
    faqs: data.faqs.map((faq) => ({
      id: faq.id as string,
      question: faq.question as string,
      answer: faq.answer as string
    }))
  };
}

export async function getSchoolPortalData(userId?: string): Promise<SchoolPortalData> {
  const data = await loadPlatformData();

  if (!data || !userId) {
    return {
      school: demoSchools[0]
        ? { id: demoSchools[0].id, name: demoSchools[0].name, city: demoSchools[0].city }
        : null,
      bookings: demoBookingRequests.filter((booking) => booking.source === "public"),
      resources: demoResources.filter((resource) => resource.audience === "school").map((resource) => ({
        ...resource,
        type: resource.type,
        audiences: [resource.audience],
        tags: [],
        isActive: true
      })),
      myReviews: demoSchoolReviews
    };
  }

  const mappedBookings = mapBookingRequests(data);
  const mappedReviews = mapSchoolReviews(data);
  const schoolContactIds = data.schoolContactUsers
    .filter((mapping) => mapping.user_id === userId)
    .map((mapping) => mapping.school_contact_id as string);
  const schoolIds = data.contacts
    .filter((contact) => schoolContactIds.includes(contact.id as string))
    .map((contact) => contact.school_id as string);
  const school = data.schools.find((item) => schoolIds.includes(item.id as string));

  return {
    school: school
      ? {
          id: school.id as string,
          name: school.name as string,
          city: (school.city as string | null) ?? "Pending"
        }
      : null,
    bookings: mappedBookings.filter((booking) => {
      const request = data.bookingRequests.find((item) => item.id === booking.id);
      return schoolIds.includes(request?.school_id as string);
    }),
    resources: (await mapResources(data)).filter(
      (resource) => resource.audiences.includes("school") && resource.isActive
    ),
    myReviews: mappedReviews.filter((review) => review.schoolId && schoolIds.includes(review.schoolId))
  };
}

export async function getAmbassadorPortalData(userId?: string): Promise<AmbassadorPortalData> {
  const data = await loadPlatformData();

  if (!data || !userId) {
    return {
      ambassador: demoAmbassadors[0],
      openSessions: demoBookingRequests.flatMap((booking) =>
        booking.sessions.filter((session) =>
          ["ambassador_needed", "ambassador_applied"].includes(session.status)
        )
      ),
      assignedSessions: demoBookingRequests.flatMap((booking) =>
        booking.sessions.filter((session) => session.assignedAmbassadorName)
      ),
      reports: demoReports,
      resources: demoResources.filter((resource) => resource.audience === "ambassador").map((resource) => ({
        ...resource,
        type: resource.type,
        audiences: [resource.audience],
        tags: [],
        isActive: true
      })),
      payments: demoPayments,
      trainingModules: demoTrainingModules,
      regions: demoRegions.filter((region) => region.isActive)
    };
  }

  const ambassadors = mapAmbassadors(data);
  const ambassador = ambassadors.find(
    (item) => data.ambassadorProfiles.find((profile) => profile.id === item.id)?.user_id === userId
  );
  const rawAmbassador = data.ambassadorProfiles.find((profile) => profile.user_id === userId);
  const bookings = mapBookingRequests(data);
  const reports = mapReports(data);
  const myApplicationStatusBySessionId = new Map(
    data.sessionApplications
      .filter((application) => application.ambassador_profile_id === rawAmbassador?.id)
      .map((application) => [
        application.booking_session_id as string,
        application.status as string
      ])
  );
  const openSessions = bookings.flatMap((booking) =>
    booking.sessions
      .filter((session) =>
        ["ambassador_needed", "ambassador_applied"].includes(session.status)
      )
      .map((session) => ({
        ...session,
        myApplicationStatus: myApplicationStatusBySessionId.get(session.id)
      }))
  );
  const assignedSessions = bookings.flatMap((booking) =>
    booking.sessions.filter((session) => {
      const rawSession = data.bookingSessions.find((item) => item.id === session.id);
      const rawAmbassador = data.ambassadorProfiles.find(
        (profile) => profile.id === rawSession?.assigned_ambassador_id
      );

      return rawAmbassador?.user_id === userId;
    })
  );

  return {
    ambassador: ambassador ?? demoAmbassadors[0],
    openSessions,
    assignedSessions,
    reports: rawAmbassador
      ? reports.filter((report) => {
          const rawReport = data.reports.find((item) => item.id === report.id);
          return rawReport?.ambassador_profile_id === rawAmbassador.id;
        })
      : [],
    resources: (await mapResources(data)).filter(
      (resource) => resource.audiences.includes("ambassador") && resource.isActive
    ),
    payments: mapPayments(data).filter((payment) => {
      const rawPayment = data.payments.find((item) => item.id === payment.id);
      const rawAmbassador = data.ambassadorProfiles.find(
        (profile) => profile.id === rawPayment?.ambassador_profile_id
      );

      return rawAmbassador?.user_id === userId;
    }),
    trainingModules: mapTrainingModules(data, rawAmbassador?.id as string | undefined),
    regions: data.regions
      .filter((region) => region.is_active !== false)
      .map((region) => ({
        id: region.id as string,
        name: region.name as string,
        slug: region.slug as string,
        isActive: Boolean(region.is_active)
      }))
  };
}
