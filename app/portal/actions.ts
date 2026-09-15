"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath as nextRevalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { buildAuthConfirmUrl, requirePortalAccess } from "@/lib/services/auth";
import {
  isBookableDate,
  isBookableSessionTime,
  isWithinBookingWindow
} from "@/lib/services/availability";
import { loadAvailabilityConfig } from "@/lib/services/availability-server";
import {
  AVAILABILITY_DATA_TAG,
  PLATFORM_DATA_TAG,
  PUBLIC_CONTENT_TAG
} from "@/lib/services/cache-tags";
import { syncSessionToCalendar } from "@/lib/services/calendar-triggers";
import {
  sendAmbassadorApprovedEmail,
  sendAmbassadorAssignedEmail,
  sendAmbassadorWithdrawalResolvedEmail,
  sendPaymentApprovalToFinanceEmail
} from "@/lib/services/email-triggers";
import {
  createFinanceConfirmationToken,
  generateInvoiceNumber,
  getPaymentSettings,
  loadPaymentDetails
} from "@/lib/services/payment-automation";
import { sendTransactionalEmail } from "@/lib/services/email";
import { substituteSampleValues } from "@/lib/services/email-samples";
import { notifyStaff, notifyUser } from "@/lib/services/notifications";
import { sanitizeEmailHtml, sanitizeRichText } from "@/lib/services/sanitize";
import {
  deletePrivateResourceFile,
  uploadPrivateReportMedia,
  uploadPrivateResourceFile,
  uploadPublicAsset
} from "@/lib/services/storage";
import { sendSchoolSessionEmails } from "@/lib/services/school-session-email";
import { scheduleEmail } from "@/lib/services/email-background";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDateTime, nzDateTimeToIso, slugify, splitCommaList } from "@/lib/utils";

// Every path revalidation in this module accompanies a data write, so bust the
// shared platform-data cache (lib/services/portal.ts) at the same time. This
// keeps the 60s cache from ever serving stale data after a portal action.
function revalidatePath(path: string) {
  updateTag(PLATFORM_DATA_TAG);
  updateTag(AVAILABILITY_DATA_TAG);
  nextRevalidatePath(path);
}

const inviteSchema = z
  .object({
    email: z.string().email(),
    fullName: z.string().min(2),
    role: z.enum(["staff", "super_admin", "ambassador"]),
    regionSlug: z.string().trim().optional()
  })
  .refine((value) => value.role !== "ambassador" || Boolean(value.regionSlug), {
    message: "Ambassador invites need a primary region."
  });

const userRoleSchema = z.object({
  userId: z.uuid(),
  role: z.enum(["school", "ambassador", "staff", "super_admin"])
});

const userStatusSchema = z.object({
  userId: z.uuid(),
  status: z.enum(["active", "inactive"])
});

const userDeleteSchema = z.object({
  userId: z.uuid(),
  confirmationText: z.string().trim().min(1),
  returnTo: z.string().min(1)
});

const ambassadorReviewSchema = z.object({
  ambassadorProfileId: z.uuid(),
  status: z.enum(["approved", "declined", "inactive"]),
  returnTo: z.string().min(1).default("/staff/ambassadors")
});

const ambassadorDeleteSchema = z.object({
  ambassadorProfileId: z.uuid(),
  confirmationText: z.literal("DELETE"),
  returnTo: z.string().min(1).default("/staff/ambassadors")
});

const ambassadorPortalConnectSchema = z.object({
  ambassadorProfileId: z.uuid(),
  email: z.string().trim().email(),
  fullName: z.string().trim().min(2),
  returnTo: z.string().min(1).default("/staff/ambassadors")
});

const manualSchoolSchema = z.object({
  name: z.string().min(2),
  regionId: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  website: z.string().optional(),
  rollSize: z.coerce.number().int().nonnegative().optional(),
  notes: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  contactPosition: z.string().optional(),
  marketingConsent: z.boolean().optional(),
  returnTo: z.string().min(1)
});

const schoolMergeSchema = z.object({
  duplicateSchoolId: z.uuid(),
  targetSchoolId: z.uuid(),
  returnTo: z.string().min(1).default("/staff/schools")
});

const manualBookingSchema = z.object({
  schoolId: z.uuid().optional(),
  schoolName: z.string().trim().min(2).max(200).optional(),
  newSchoolRegionId: z.uuid().optional(),
  presentationTypeId: z.uuid(),
  assignedAmbassadorId: z.string().optional(),
  outreachAmbassadorId: z.string().optional(),
  status: z.enum([
    "tentative",
    "applied",
    "ambassador_assigned",
    "confirmed",
    "reschedule_requested",
    "completed_pending_report",
    "report_submitted",
    "cancelled"
  ]),
  date: z.string().min(1),
  startTime: z.string().min(1),
  durationMinutes: z.coerce.number().int().positive(),
  yearLevels: z.string().min(1),
  expectedStudentCount: z.coerce.number().int().positive(),
  actualStudentCount: z.coerce.number().int().nonnegative().optional(),
  internalNotes: z.string().optional(),
  returnTo: z.string().min(1)
}).superRefine((value, context) => {
  if (!value.schoolId && (!value.schoolName || !value.newSchoolRegionId)) {
    context.addIssue({
      code: "custom",
      path: ["schoolName"],
      message: "Choose an existing school or enter a new school and region."
    });
  }
});

const ambassadorManualBookingSchema = z.object({
  schoolId: z.uuid().optional(),
  schoolName: z.string().trim().min(2).max(200).optional(),
  newSchoolRegionId: z.uuid().optional(),
  presentationTypeId: z.uuid(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
    }),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .refine((value) => {
      const [hours, minutes] = value.split(":").map(Number);
      return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
    }),
  durationMinutes: z.coerce.number().int().min(1).max(480),
  yearLevels: z.string().trim().min(1).max(100),
  expectedStudentCount: z.coerce.number().int().min(1).max(10000),
  internalNotes: z.string().trim().max(5000).optional(),
  schoolSource: z.enum(["sourced", "existing"]),
  confirmBooking: z.boolean(),
  returnTo: z.string().min(1).default("/ambassador/upcoming")
}).superRefine((value, context) => {
  if (!value.schoolId && (!value.schoolName || !value.newSchoolRegionId)) {
    context.addIssue({
      code: "custom",
      path: ["schoolName"],
      message: "Choose an existing school or enter a new school and region."
    });
  }
});

const AMBASSADOR_BOOKING_SOURCE = "ambassador_booked";
const AMBASSADOR_DELIVERY_PAYMENT_CENTS = 25_000;
const AMBASSADOR_SOURCING_BONUS_CENTS = 5_000;
const AMBASSADOR_BOOKED_PAYMENT_CENTS =
  AMBASSADOR_DELIVERY_PAYMENT_CENTS + AMBASSADOR_SOURCING_BONUS_CENTS;

const ambassadorReportSubmitSchema = z.object({
  bookingSessionId: z.uuid(),
  presenterName: z.string().min(2),
  schoolName: z.string().optional(),
  primaryContactName: z.string().optional(),
  primaryContactEmail: z.union([z.literal(""), z.string().email()]).optional(),
  regionLocation: z.string().optional(),
  deliveredDate: z.string().min(1),
  deliveredTime: z.string().min(1),
  studentsCompeted: z.enum(["yes", "no"]),
  attendeeCount: z.coerce.number().int().nonnegative(),
  ageGroups: z.string().min(1),
  parentsPresent: z.enum(["yes", "no"]),
  attendeeQuotes: z.string().optional(),
  attendanceRating: z.coerce.number().int().min(1).max(5),
  studentEngagementRating: z.coerce.number().int().min(1).max(5),
  teacherResponseRating: z.coerce.number().int().min(1).max(5),
  presentationEnergyRating: z.coerce.number().int().min(1).max(5),
  presentationFeedback: z.string().optional(),
  notableQuestions: z.string().optional(),
  additionalNotes: z.string().optional(),
  mediaConsentObtained: z.boolean().optional(),
  returnTo: z.string().min(1).default("/ambassador/completed")
});

const staffFeedbackSubmitSchema = z
  .object({
    sessionMode: z.enum(["existing", "manual"]),
    bookingSessionId: z.string().trim().optional(),
    manualSchoolName: z.string().trim().max(200).optional(),
    manualPresentationTypeId: z.string().trim().optional(),
    presenterName: z.string().trim().min(2).max(200),
    schoolRollSize: z.coerce.number().int().nonnegative().optional(),
    primaryContactName: z.string().trim().max(200).optional(),
    primaryContactEmail: z.union([z.literal(""), z.string().trim().email()]).optional(),
    deliveredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    deliveredTime: z.string().regex(/^\d{2}:\d{2}$/),
    studentsCompeted: z.enum(["yes", "no"]),
    attendeeCount: z.coerce.number().int().nonnegative(),
    ageGroups: z.string().trim().min(1).max(200),
    parentsPresent: z.enum(["yes", "no"]),
    attendeeQuotes: z.string().trim().max(5000).optional(),
    attendanceRating: z.coerce.number().int().min(1).max(5),
    studentEngagementRating: z.coerce.number().int().min(1).max(5),
    teacherResponseRating: z.coerce.number().int().min(1).max(5),
    presentationEnergyRating: z.coerce.number().int().min(1).max(5),
    presentationFeedback: z.string().trim().min(1).max(5000),
    notableQuestions: z.string().trim().max(5000).optional(),
    additionalNotes: z.string().trim().max(5000).optional(),
    mediaConsentObtained: z.boolean().optional(),
    returnTo: z.string().min(1).default("/staff/feedback")
  })
  .superRefine((value, context) => {
    if (value.sessionMode === "existing" && !z.uuid().safeParse(value.bookingSessionId).success) {
      context.addIssue({
        code: "custom",
        path: ["bookingSessionId"],
        message: "Choose a completed session."
      });
    }

    if (
      value.sessionMode === "manual" &&
      (!value.manualSchoolName || !z.uuid().safeParse(value.manualPresentationTypeId).success)
    ) {
      context.addIssue({
        code: "custom",
        path: ["manualSchoolName"],
        message: "Enter the school and presentation for the manual session."
      });
    }
  });

const sessionApplicationSchema = z.object({
  bookingSessionId: z.uuid(),
  message: z.string().optional(),
  returnTo: z.string().min(1).default("/ambassador/open-bookings")
});

const applicationWithdrawSchema = z.object({
  bookingSessionId: z.uuid(),
  reason: z.string().trim().min(5).max(2000),
  returnTo: z.string().min(1).default("/ambassador/open-bookings")
});

const sessionWithdrawalRequestSchema = z.object({
  bookingSessionId: z.uuid(),
  reason: z.string().trim().min(5).max(2000),
  returnTo: z.string().min(1).default("/ambassador/upcoming")
});

const sessionWithdrawalResolveSchema = z.object({
  bookingSessionId: z.uuid(),
  decision: z.enum(["approve", "decline"]),
  note: z.string().trim().max(2000).optional(),
  returnTo: z.string().min(1).default("/staff/bookings")
});

const schoolReviewSchema = z.object({
  bookingSessionId: z.uuid(),
  attribution: z.string().trim().min(2),
  studentsCompeted: z.enum(["yes", "no"]),
  attendeeFeedback: z.string().trim().min(1),
  attendanceRating: z.coerce.number().int().min(1).max(5),
  studentResponseRating: z.coerce.number().int().min(1).max(5),
  contentRating: z.coerce.number().int().min(1).max(5),
  presenterEnergyRating: z.coerce.number().int().min(1).max(5),
  quote: z.string().trim().min(10),
  hadEsportsClub: z.enum(["yes", "no"]),
  consideringClub: z.enum(["yes", "no"]),
  mailingListOptIn: z.enum(["yes", "no"]).optional(),
  isPublic: z.literal(true),
  returnTo: z.string().min(1).default("/school/bookings")
});

const schoolFeedbackDecisionSchema = z.object({
  reviewId: z.uuid(),
  decision: z.enum(["approve", "unapprove"]),
  makePublic: z.boolean().optional(),
  returnTo: z.string().min(1).default("/admin/feedback")
});

const schoolBookingChangeSchema = z.object({
  bookingRequestId: z.uuid(),
  intent: z.literal("cancel"),
  notes: z.string().optional(),
  returnTo: z.string().min(1).default("/school/bookings")
});

const schoolSessionRescheduleSchema = z.object({
  bookingRequestId: z.uuid(),
  bookingSessionId: z.uuid(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().min(3),
  returnTo: z.string().min(1).default("/school/bookings")
});

const sessionRescheduleResolutionSchema = z.object({
  bookingSessionId: z.uuid(),
  decision: z.enum(["approve", "decline"]),
  finalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  finalTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .refine((value) => {
      const [hours, minutes] = value.split(":").map(Number);
      return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
    })
    .optional(),
  returnTo: z.string().min(1).default("/staff/bookings")
});

const assignAmbassadorSchema = z.object({
  bookingSessionId: z.uuid(),
  ambassadorProfileId: z.union([z.uuid(), z.literal("")]),
  returnTo: z.string().min(1)
});

const updateBookingStatusSchema = z.object({
  bookingRequestId: z.uuid(),
  status: z.enum([
    "requested",
    "tentative",
    "applied",
    "ambassador_assigned",
    "confirmed",
    "reschedule_requested",
    "completed_pending_report",
    "report_submitted",
    "payment_pending",
    "paid",
    "closed",
    "cancelled",
    "declined"
  ]),
  reason: z.string().optional(),
  returnTo: z.string().min(1)
});

const bulkUpdateBookingStatusSchema = z.object({
  bookingRequestIds: z.array(z.uuid()).min(1).max(100),
  status: z.enum([
    "requested",
    "tentative",
    "applied",
    "ambassador_assigned",
    "confirmed",
    "reschedule_requested",
    "closed",
    "cancelled",
    "declined"
  ]),
  returnTo: z.string().min(1)
});

const removeBookingInternalNoteSchema = z.object({
  bookingRequestId: z.uuid(),
  noteIndex: z.coerce.number().int().nonnegative(),
  returnTo: z.string().min(1)
});

// Sessions in these states are still "in flight" and safe to rewrite when the
// parent booking is cancelled or declined. Delivered/terminal sessions
// (completed_pending_report, report_submitted, payment_pending, paid, closed,
// cancelled, declined) must never be rewritten — this mirrors the
// school-initiated cancellation's exclusion list in
// requestSchoolBookingChangeAction.
const NON_TERMINAL_SESSION_STATUSES = [
  "requested",
  "tentative",
  "applied",
  "ambassador_assigned",
  "confirmed",
  "withdrawal_requested",
  "reschedule_requested"
];

const SESSION_CASCADE: Partial<Record<string, { to: string; onlyFrom?: string[] }>> = {
  confirmed: {
    to: "confirmed",
    onlyFrom: [
      "tentative",
      "applied",
      "ambassador_assigned"
    ]
  },
  cancelled: { to: "cancelled", onlyFrom: NON_TERMINAL_SESSION_STATUSES },
  // Declining a booking closes out its open sessions so they leave the
  // ambassador open pool and stop reading as "pending approval" for schools.
  declined: { to: "declined", onlyFrom: NON_TERMINAL_SESSION_STATUSES }
};

const resourceSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().min(2),
    description: z.string().optional(),
    audiences: z.array(z.enum(["public", "school", "ambassador", "staff"])).min(1),
    sharingScope: z.enum(["internal", "public"]).default("internal"),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    resourceType: z.string().min(1),
    category: z.enum(["resource", "training", "presentation_material"]).default("resource"),
    trainingPackId: z.uuid().optional(),
    presentationTypeId: z.uuid().optional(),
    versionLabel: z.string().optional(),
    youtubeUrl: z.string().optional(),
    externalUrl: z.string().optional(),
    isCurrent: z.boolean().optional(),
    isActive: z.boolean().optional(),
    returnTo: z.string().min(1)
  })
  .refine(
    (value) => value.category !== "presentation_material" || Boolean(value.presentationTypeId),
    {
      message: "Presentation materials must be linked to a presentation.",
      path: ["presentationTypeId"]
    }
  );

const presentationSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().min(2),
  slug: z.string().optional(),
  shortSummary: z.string().optional(),
  contentSnippet: z.string().optional(),
  fullDescription: z.string().optional(),
  yearLevels: z.string().optional(),
  durationMinutes: z.coerce.number().int().positive(),
  deliveryFormats: z.string().optional(),
  learningOutcomes: z.string().optional(),
  requiredEquipment: z.string().optional(),
  youtubeUrl: z
    .union([z.literal(""), z.string().url().refine(isYouTubeUrl, "Enter a YouTube link")])
    .optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#18A83B"),
  isPublic: z.boolean().optional(),
  isActive: z.boolean().optional(),
  returnTo: z.string().min(1)
});

function isYouTubeUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return hostname.includes("youtube.com") || hostname.includes("youtu.be");
  } catch {
    return false;
  }
}

const homepageSectionSchema = z.object({
  id: z.uuid(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  body: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0)
});

const emailTemplateSchema = z.object({
  id: z.uuid(),
  subject: z.string().min(2),
  bodyHtml: z.string().min(2),
  bodyText: z.string().optional(),
  isActive: z.boolean().optional()
});

const notificationSchema = z.object({
  notificationId: z.uuid(),
  redirectTo: z.string().min(1)
});

const nzBankAccountPattern = /^\d{2}[- ]?\d{4}[- ]?\d{7}[- ]?\d{2,3}$/;

const retryFinanceEmailSchema = z.object({
  paymentId: z.uuid(),
  returnTo: z.string().min(1).default("/staff/payments")
});

function getAdminClientOrThrow() {
  const admin = createAdminClient();

  if (!admin) {
    throw new Error("Supabase admin access is not configured.");
  }

  return admin;
}

// Deactivated users must lose platform access immediately, not just at their
// next login. The installed Supabase admin API cannot revoke another user's
// sessions directly (auth.admin.signOut requires that user's own JWT), so we
// apply a long ban via updateUserById instead: banned users cannot refresh
// their session tokens or sign in until the ban is lifted when staff restore
// them.
const DEACTIVATED_ACCESS_BAN = "87600h"; // ~10 years

async function setUserPlatformAccess(userId: string, active: boolean) {
  const admin = getAdminClientOrThrow();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : DEACTIVATED_ACCESS_BAN
  });

  return error;
}

function appendSearchParam(path: string, key: string, value: string) {
  // Keep any #anchor at the end so redirects can land back at the element the
  // user was working on (e.g. a specific booking card).
  const [base, hash] = path.split("#");
  const suffix = hash ? `#${hash}` : "";

  return `${base}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}${suffix}`;
}

function sanitizeReturnTo(path: string, fallback: string) {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\")
    ? path
    : fallback;
}

async function logAuditEvent(actorId: string, action: string, entityType: string, entityId?: string) {
  const admin = getAdminClientOrThrow();

  await admin.from("audit_logs").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null
  });
}

type AdminClient = ReturnType<typeof getAdminClientOrThrow>;

async function resolveManualBookingSchool(
  admin: AdminClient,
  selection: { schoolId?: string; schoolName?: string; newSchoolRegionId?: string }
) {
  if (selection.schoolId) {
    const { data: school } = await admin
      .from("schools")
      .select("id, name, region_id, status")
      .eq("id", selection.schoolId)
      .maybeSingle();

    return school;
  }

  const schoolName = selection.schoolName?.trim();

  if (!schoolName || !selection.newSchoolRegionId) {
    return null;
  }

  const escapedSchoolName = schoolName.replace(/[\\%_]/g, "\\$&");
  const { data: schools } = await admin
    .from("schools")
    .select("id, name, region_id, status")
    .ilike("name", escapedSchoolName)
    .limit(25);
  const existingSchool = (schools ?? []).find(
    (school) => String(school.name).localeCompare(schoolName, undefined, { sensitivity: "accent" }) === 0
  );

  if (existingSchool) {
    return existingSchool;
  }

  const { data: region } = await admin
    .from("regions")
    .select("id")
    .eq("id", selection.newSchoolRegionId)
    .eq("is_active", true)
    .maybeSingle();

  if (!region) {
    return null;
  }

  const { data: school } = await admin
    .from("schools")
    .insert({
      name: schoolName,
      region_id: region.id,
      status: "active"
    })
    .select("id, name, region_id, status")
    .single();

  return school;
}

const PRE_CONFIRMATION_BOOKING_STATUSES = new Set([
  "requested",
  "tentative",
  "applied",
  "ambassador_assigned"
]);
const INACTIVE_ROLLUP_SESSION_STATUSES = new Set([
  "cancelled",
  "declined",
  "completed_pending_report",
  "report_submitted",
  "payment_pending",
  "paid",
  "closed"
]);

async function refreshPreConfirmationBookingStatus({
  admin,
  bookingRequestId,
  actorId,
  actorType,
  reason
}: {
  admin: AdminClient;
  bookingRequestId: string;
  actorId: string;
  actorType: "ambassador" | "staff";
  reason: string;
}) {
  const [{ data: booking }, { data: sessions }] = await Promise.all([
    admin.from("booking_requests").select("id, status").eq("id", bookingRequestId).maybeSingle(),
    admin
      .from("booking_sessions")
      .select("id, status, assigned_ambassador_id")
      .eq("booking_request_id", bookingRequestId)
  ]);

  if (!booking || !PRE_CONFIRMATION_BOOKING_STATUSES.has(String(booking.status))) {
    return;
  }

  const activeSessions = (sessions ?? []).filter(
    (session) => !INACTIVE_ROLLUP_SESSION_STATUSES.has(String(session.status))
  );

  if (!activeSessions.length) {
    return;
  }

  const unassignedIds = activeSessions
    .filter((session) => !session.assigned_ambassador_id)
    .map((session) => session.id as string);
  const { count: applicationCount } = unassignedIds.length
    ? await admin
        .from("booking_session_applications")
        .select("id", { count: "exact", head: true })
        .in("booking_session_id", unassignedIds)
        .eq("status", "applied")
    : { count: 0 };
  const nextStatus = activeSessions.every((session) => Boolean(session.assigned_ambassador_id))
    ? "ambassador_assigned"
    : (applicationCount ?? 0) > 0
      ? "applied"
      : "tentative";

  if (nextStatus === booking.status) {
    return;
  }

  await Promise.all([
    admin.from("booking_requests").update({ status: nextStatus }).eq("id", bookingRequestId),
    admin.from("booking_status_history").insert({
      booking_request_id: bookingRequestId,
      old_status: booking.status,
      new_status: nextStatus,
      changed_by: actorId,
      reason
    }),
    admin.from("booking_activity_logs").insert({
      booking_request_id: bookingRequestId,
      action: "booking.status_rolled_up",
      actor_id: actorId,
      actor_type: actorType,
      details: { old_status: booking.status, new_status: nextStatus }
    })
  ]);
}

async function isLastActiveSuperAdmin(userId: string) {
  const admin = getAdminClientOrThrow();
  const { data: target } = await admin
    .from("profiles")
    .select("role, status")
    .eq("id", userId)
    .maybeSingle();

  if (!target || target.role !== "super_admin" || target.status !== "active") {
    return false;
  }

  const { count } = await admin
    .from("profiles")
    .select("id", { head: true, count: "exact" })
    .eq("role", "super_admin")
    .eq("status", "active");

  return (count ?? 0) <= 1;
}

async function clearNullableProfileReferences(userId: string) {
  const admin = getAdminClientOrThrow();
  const references = [
    { table: "ambassador_profiles", column: "approved_by" },
    { table: "availability_overrides", column: "created_by" },
    { table: "booking_requests", column: "submitted_by_user_id" },
    { table: "booking_requests", column: "staff_owner_id" },
    { table: "booking_session_applications", column: "reviewed_by" },
    { table: "booking_status_history", column: "changed_by" },
    { table: "booking_activity_logs", column: "actor_id" },
    { table: "ambassador_reports", column: "reviewed_for_payment_by" },
    { table: "media_library", column: "uploaded_by" },
    { table: "media_library", column: "approved_by" },
    { table: "payments", column: "updated_by" },
    { table: "presentation_resources", column: "created_by" },
    { table: "homepage_sections", column: "updated_by" },
    { table: "email_templates", column: "updated_by" },
    { table: "settings", column: "updated_by" },
    { table: "audit_logs", column: "actor_id" }
  ] as const;

  for (const reference of references) {
    const { error } = await admin
      .from(reference.table)
      .update({ [reference.column]: null })
      .eq(reference.column, userId);

    if (error) {
      throw error;
    }
  }
}

export async function invitePortalUserAction(formData: FormData) {
  const actor = await requirePortalAccess("super_admin");
  const parsed = inviteSchema.safeParse({
    email: String(formData.get("email") || ""),
    fullName: String(formData.get("fullName") || ""),
    role: String(formData.get("role") || ""),
    regionSlug: String(formData.get("regionSlug") || "") || undefined
  });

  if (!parsed.success) {
    redirect("/admin/users?compose=1&error=invalid-invite");
  }

  const admin = getAdminClientOrThrow();
  // For ambassador invites the handle_new_auth_user trigger reads this metadata
  // and creates the ambassador_profiles row (status "applied") plus travel data.
  const inviteMetadata =
    parsed.data.role === "ambassador"
      ? {
          role: "ambassador",
          full_name: parsed.data.fullName,
          region_slug: parsed.data.regionSlug,
          open_to_travel: false
        }
      : {
          role: parsed.data.role,
          full_name: parsed.data.fullName
        };
  const { data: inviteData, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: inviteMetadata,
    redirectTo: buildAuthConfirmUrl("/reset-password")
  });

  if (error) {
    redirect("/admin/users?compose=1&error=invite-failed");
  }

  const roleUpdateQuery = inviteData.user?.id
    ? admin
        .from("profiles")
        .update({ role: parsed.data.role, full_name: parsed.data.fullName })
        .eq("id", inviteData.user.id)
    : admin
        .from("profiles")
        .update({ role: parsed.data.role, full_name: parsed.data.fullName })
        .eq("email", parsed.data.email);
  const { error: roleUpdateError } = await roleUpdateQuery;

  if (roleUpdateError) {
    redirect("/admin/users?compose=1&error=invite-role-failed");
  }

  if (parsed.data.role === "ambassador") {
    let invitedUserId: string | null = inviteData.user?.id ?? null;

    if (!invitedUserId) {
      const { data: invitedProfile } = await admin
        .from("profiles")
        .select("id")
        .eq("email", parsed.data.email)
        .maybeSingle();
      invitedUserId = (invitedProfile?.id as string | undefined) ?? null;
    }

    const { data: ambassadorProfile } = invitedUserId
      ? await admin
          .from("ambassador_profiles")
          .select("id, status")
          .eq("user_id", invitedUserId)
          .maybeSingle()
      : { data: null };

    if (!ambassadorProfile) {
      redirect("/admin/users?compose=1&error=invite-ambassador-failed");
    }

    // Platform-created ambassadors skip the application review queue.
    const { error: approveError } = await admin
      .from("ambassador_profiles")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: actor.id
      })
      .eq("id", ambassadorProfile.id);

    if (approveError) {
      redirect("/admin/users?compose=1&error=invite-ambassador-failed");
    }

    await admin
      .from("notifications")
      .update({
        read_at: new Date().toISOString(),
        resolved_at: new Date().toISOString()
      })
      .eq("notification_type", "ambassador_application_submitted")
      .eq("related_url", `/staff/ambassadors/${ambassadorProfile.id}`)
      .is("resolved_at", null);

    await logAuditEvent(actor.id, "ambassador.approved", "ambassador_profile", ambassadorProfile.id as string);
  }

  await logAuditEvent(actor.id, "user.invited", "profile");
  revalidatePath("/admin");
  revalidatePath("/staff");
  redirect("/admin/users?invited=1");
}

export async function deletePortalUserAction(formData: FormData) {
  const actor = await requirePortalAccess("super_admin");
  const parsed = userDeleteSchema.safeParse({
    userId: String(formData.get("userId") || ""),
    confirmationText: String(formData.get("confirmationText") || ""),
    returnTo: sanitizeReturnTo(String(formData.get("returnTo") || "/admin/users"), "/admin/users")
  });

  const fallbackUserId = String(formData.get("userId") || "");
  const errorRedirect = `${parsed.success ? parsed.data.returnTo : "/admin/users"}?delete=${fallbackUserId}`;

  if (!parsed.success) {
    redirect(`${errorRedirect}&error=invalid-delete`);
  }

  if (parsed.data.confirmationText !== "DELETE") {
    redirect(`${errorRedirect}&error=invalid-delete-confirmation`);
  }

  if (parsed.data.userId === actor.id) {
    redirect(`${errorRedirect}&error=cannot-delete-self`);
  }

  if (await isLastActiveSuperAdmin(parsed.data.userId)) {
    redirect(`${errorRedirect}&error=last-super-admin`);
  }

  const admin = getAdminClientOrThrow();
  const { data: target } = await admin
    .from("profiles")
    .select("id")
    .eq("id", parsed.data.userId)
    .maybeSingle();

  if (!target) {
    redirect(`${parsed.data.returnTo}?error=user-not-found`);
  }

  try {
    await clearNullableProfileReferences(parsed.data.userId);
    const { error } = await admin.auth.admin.deleteUser(parsed.data.userId);

    if (error) {
      throw error;
    }
  } catch {
    redirect(`${errorRedirect}&error=delete-failed`);
  }

  await logAuditEvent(actor.id, "user.deleted", "profile", parsed.data.userId);
  revalidatePath("/admin");
  redirect(`${parsed.data.returnTo}?deleted=1`);
}

async function resolveAmbassadorApplicationNotifications(ambassadorProfileId: string) {
  const admin = getAdminClientOrThrow();

  await admin
    .from("notifications")
    .update({
      read_at: new Date().toISOString(),
      resolved_at: new Date().toISOString()
    })
    .eq("notification_type", "ambassador_application_submitted")
    .eq("related_url", `/staff/ambassadors/${ambassadorProfileId}`)
    .is("resolved_at", null);
}

async function applyUserRoleChange(
  actorId: string,
  userId: string,
  role: "staff" | "super_admin" | "ambassador" | "school"
): Promise<string | null> {
  const admin = getAdminClientOrThrow();
  const { data: target } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (!target) {
    return "user-not-found";
  }

  // Grant the ambassador profile before the role flips: an ambassador role
  // without an approved profile row cannot access the ambassador portal.
  if (role === "ambassador" && target.role !== "ambassador") {
    const { data: ambassadorProfile } = await admin
      .from("ambassador_profiles")
      .select("id, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (!ambassadorProfile) {
      const { error: createError } = await admin.from("ambassador_profiles").insert({
        user_id: userId,
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: actorId
      });

      if (createError) {
        return "ambassador-sync-failed";
      }
    } else if (ambassadorProfile.status !== "approved") {
      const { error: approveError } = await admin
        .from("ambassador_profiles")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: actorId
        })
        .eq("id", ambassadorProfile.id);

      if (approveError) {
        return "ambassador-sync-failed";
      }

      await resolveAmbassadorApplicationNotifications(ambassadorProfile.id as string);
    }
  }

  const { error } = await admin.from("profiles").update({ role }).eq("id", userId);

  if (error) {
    return "role-update-failed";
  }

  if (target.role === "ambassador" && role !== "ambassador") {
    const { data: ambassadorProfile } = await admin
      .from("ambassador_profiles")
      .select("id, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (ambassadorProfile && ["approved", "applied"].includes(ambassadorProfile.status as string)) {
      const { error: deactivateError } = await admin
        .from("ambassador_profiles")
        .update({ status: "inactive" })
        .eq("id", ambassadorProfile.id);

      if (deactivateError) {
        return "ambassador-sync-failed";
      }

      await resolveAmbassadorApplicationNotifications(ambassadorProfile.id as string);
    }
  }

  return null;
}

export async function updateUserRoleAction(formData: FormData) {
  const actor = await requirePortalAccess("super_admin");
  const parsed = userRoleSchema.safeParse({
    userId: String(formData.get("userId") || ""),
    role: String(formData.get("role") || "")
  });

  if (!parsed.success) {
    redirect("/admin/users?error=invalid-role");
  }

  if (parsed.data.role !== "super_admin" && (await isLastActiveSuperAdmin(parsed.data.userId))) {
    redirect("/admin/users?error=last-super-admin");
  }

  const errorKey = await applyUserRoleChange(actor.id, parsed.data.userId, parsed.data.role);

  if (errorKey) {
    redirect(`/admin/users?error=${errorKey}`);
  }

  await logAuditEvent(actor.id, "user.role_updated", "profile", parsed.data.userId);
  revalidatePath("/admin");
  revalidatePath("/staff");
  redirect("/admin/users?updated=role");
}

export async function updateUserAccessAction(formData: FormData) {
  const actor = await requirePortalAccess("super_admin");
  const parsedRole = userRoleSchema.safeParse({
    userId: String(formData.get("userId") || ""),
    role: String(formData.get("role") || "")
  });
  const parsedStatus = userStatusSchema.safeParse({
    userId: String(formData.get("userId") || ""),
    status: String(formData.get("status") || "")
  });

  if (!parsedRole.success || !parsedStatus.success) {
    redirect("/admin/users?error=invalid-role");
  }

  if (
    (parsedRole.data.role !== "super_admin" || parsedStatus.data.status !== "active") &&
    (await isLastActiveSuperAdmin(parsedRole.data.userId))
  ) {
    redirect("/admin/users?error=last-super-admin");
  }

  const admin = getAdminClientOrThrow();
  const { error: statusError } = await admin
    .from("profiles")
    .update({ status: parsedStatus.data.status })
    .eq("id", parsedStatus.data.userId);

  if (statusError) {
    redirect("/admin/users?error=status-update-failed");
  }

  const accessError = await setUserPlatformAccess(
    parsedStatus.data.userId,
    parsedStatus.data.status === "active"
  );

  if (accessError) {
    redirect("/admin/users?error=status-update-failed");
  }

  const errorKey = await applyUserRoleChange(actor.id, parsedRole.data.userId, parsedRole.data.role);

  if (errorKey) {
    redirect(`/admin/users?error=${errorKey}`);
  }

  await logAuditEvent(actor.id, "user.access_updated", "profile", parsedRole.data.userId);
  revalidatePath("/admin");
  revalidatePath("/staff");

  const tabSuffix =
    String(formData.get("tab") || "") === "ambassadors" ? "&tab=ambassadors" : "";
  redirect(`/admin/users?updated=access${tabSuffix}`);
}

export async function updateUserStatusAction(formData: FormData) {
  const actor = await requirePortalAccess("super_admin");
  const parsed = userStatusSchema.safeParse({
    userId: String(formData.get("userId") || ""),
    status: String(formData.get("status") || "")
  });

  if (!parsed.success) {
    redirect("/admin/users?error=invalid-status");
  }

  if (parsed.data.status !== "active" && (await isLastActiveSuperAdmin(parsed.data.userId))) {
    redirect("/admin/users?error=last-super-admin");
  }

  const admin = getAdminClientOrThrow();
  const { error } = await admin
    .from("profiles")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.userId);

  if (error) {
    redirect("/admin/users?error=status-update-failed");
  }

  const accessError = await setUserPlatformAccess(
    parsed.data.userId,
    parsed.data.status === "active"
  );

  if (accessError) {
    redirect("/admin/users?error=status-update-failed");
  }

  await logAuditEvent(actor.id, "user.status_updated", "profile", parsed.data.userId);
  revalidatePath("/admin");
  redirect("/admin/users?updated=status");
}

export async function reviewAmbassadorAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/ambassadors"),
    "/staff/ambassadors"
  );
  const parsed = ambassadorReviewSchema.safeParse({
    ambassadorProfileId: String(formData.get("ambassadorProfileId") || ""),
    status: String(formData.get("status") || ""),
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-review"));
  }

  const admin = getAdminClientOrThrow();
  const { data: ambassador } = await admin
    .from("ambassador_profiles")
    .select("id, user_id, status, approved_at, approved_by")
    .eq("id", parsed.data.ambassadorProfileId)
    .maybeSingle();

  if (!ambassador) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "ambassador-not-found"));
  }

  const updatePayload =
    parsed.data.status === "approved"
      ? {
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: actor.id
        }
      : parsed.data.status === "inactive"
        ? // Temporary restriction keeps the approval record so access can be restored.
          { status: "inactive" }
        : {
            status: "declined",
            approved_at: null,
            approved_by: null
          };

  let previousUserStatus: string | null = null;

  if (ambassador.user_id) {
    const { data: linkedUser } = await admin
      .from("profiles")
      .select("status")
      .eq("id", ambassador.user_id)
      .maybeSingle();
    previousUserStatus = (linkedUser?.status as string | null) ?? null;

    const { error: userStatusError } = await admin
      .from("profiles")
      .update({ status: parsed.data.status === "approved" ? "active" : "inactive" })
      .eq("id", ambassador.user_id);

    if (userStatusError) {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "review-failed"));
    }

    // Deactivating (or declining) revokes the user's live sessions; approving
    // lifts the ban so a restored ambassador can simply log in again.
    const accessError = await setUserPlatformAccess(
      ambassador.user_id as string,
      parsed.data.status === "approved"
    );

    if (accessError) {
      if (previousUserStatus) {
        await admin
          .from("profiles")
          .update({ status: previousUserStatus })
          .eq("id", ambassador.user_id);
      }
      redirect(appendSearchParam(parsed.data.returnTo, "error", "review-failed"));
    }
  }

  const { error } = await admin
    .from("ambassador_profiles")
    .update(updatePayload)
    .eq("id", parsed.data.ambassadorProfileId);

  if (error) {
    if (ambassador.user_id && previousUserStatus) {
      await admin
        .from("profiles")
        .update({ status: previousUserStatus })
        .eq("id", ambassador.user_id);
      // Best-effort: put session access back in line with the restored status.
      await setUserPlatformAccess(
        ambassador.user_id as string,
        previousUserStatus === "active"
      );
    }
    redirect(appendSearchParam(parsed.data.returnTo, "error", "review-failed"));
  }

  await admin
    .from("notifications")
    .update({
      read_at: new Date().toISOString(),
      resolved_at: new Date().toISOString()
    })
    .eq("notification_type", "ambassador_application_submitted")
    .eq("related_url", `/staff/ambassadors/${parsed.data.ambassadorProfileId}`)
    .is("resolved_at", null);

  // Let the ambassador know their portal access is unlocked.
  if (parsed.data.status === "approved") {
    const { data: approvedProfile } = await admin
      .from("ambassador_profiles")
      .select("user_id")
      .eq("id", parsed.data.ambassadorProfileId)
      .maybeSingle();
    const { data: approvedUser } = approvedProfile?.user_id
      ? await admin
          .from("profiles")
          .select("email, full_name")
          .eq("id", approvedProfile.user_id)
          .maybeSingle()
      : { data: null };

    if (approvedUser?.email) {
      scheduleEmail(() => sendAmbassadorApprovedEmail({
        ambassadorEmail: approvedUser.email as string,
        ambassadorName: (approvedUser.full_name as string | null) ?? "there"
      }));
    }
  }

  await logAuditEvent(
    actor.id,
    parsed.data.status === "approved"
      ? ["applied", "declined"].includes(ambassador.status as string)
        ? "ambassador.approved"
        : "ambassador.activated"
      : parsed.data.status === "inactive"
        ? "ambassador.deactivated"
        : "ambassador.declined",
    "ambassador_profile",
    parsed.data.ambassadorProfileId
  );

  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(parsed.data.returnTo, "reviewed", parsed.data.status));
}

export async function connectAmbassadorPortalAccountAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/ambassadors"),
    "/staff/ambassadors"
  );
  const parsed = ambassadorPortalConnectSchema.safeParse({
    ambassadorProfileId: String(formData.get("ambassadorProfileId") || ""),
    email: String(formData.get("email") || ""),
    fullName: String(formData.get("fullName") || ""),
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-ambassador-connect"));
  }

  const admin = getAdminClientOrThrow();
  const { data: ambassador } = await admin
    .from("ambassador_profiles")
    .select("id, user_id, region_id, deleted_at")
    .eq("id", parsed.data.ambassadorProfileId)
    .maybeSingle();

  if (!ambassador || ambassador.deleted_at) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "ambassador-not-found"));
  }

  if (ambassador.user_id) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "ambassador-already-connected"));
  }

  const { data: existingUser } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", parsed.data.email)
    .maybeSingle();

  if (existingUser) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "ambassador-email-in-use"));
  }

  const { data: region } = ambassador.region_id
    ? await admin
        .from("regions")
        .select("slug")
        .eq("id", ambassador.region_id)
        .maybeSingle()
    : { data: null };
  let invitedUserId: string | null = null;
  let generatedAmbassadorProfileId: string | null = null;
  let connectionFailed = false;

  try {
    const { data: inviteData, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
        data: {
          role: "ambassador",
          full_name: parsed.data.fullName,
          region_slug: (region?.slug as string | undefined) ?? undefined,
          open_to_travel: false
        },
        redirectTo: buildAuthConfirmUrl("/reset-password")
      });

    invitedUserId = inviteData.user?.id ?? null;

    if (inviteError || !invitedUserId) {
      throw inviteError ?? new Error("The invited user was not returned.");
    }

    const { data: generatedProfile, error: generatedProfileError } = await admin
      .from("ambassador_profiles")
      .select("id")
      .eq("user_id", invitedUserId)
      .maybeSingle();

    if (generatedProfileError || !generatedProfile) {
      throw generatedProfileError ?? new Error("The invited ambassador profile was not created.");
    }

    generatedAmbassadorProfileId = generatedProfile.id as string;

    const { error: userUpdateError } = await admin
      .from("profiles")
      .update({
        role: "ambassador",
        status: "active",
        full_name: parsed.data.fullName
      })
      .eq("id", invitedUserId);

    if (userUpdateError) {
      throw userUpdateError;
    }

    const { error: generatedProfileDeleteError } = await admin
      .from("ambassador_profiles")
      .delete()
      .eq("id", generatedAmbassadorProfileId);

    if (generatedProfileDeleteError) {
      throw generatedProfileDeleteError;
    }

    const { data: connectedProfile, error: connectError } = await admin
      .from("ambassador_profiles")
      .update({
        user_id: invitedUserId,
        display_name: parsed.data.fullName,
        contact_email: parsed.data.email,
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: actor.id
      })
      .eq("id", ambassador.id)
      .is("user_id", null)
      .select("id")
      .maybeSingle();

    if (connectError || !connectedProfile) {
      throw connectError ?? new Error("The existing volunteer profile could not be connected.");
    }
  } catch {
    connectionFailed = true;

    if (invitedUserId) {
      const { data: targetAfterFailure } = await admin
        .from("ambassador_profiles")
        .select("user_id")
        .eq("id", ambassador.id)
        .maybeSingle();

      // A transport error can occur after the final database update commits.
      // Never delete the auth user in that case: the FK cascade would also
      // remove the operational volunteer record we just connected.
      if (targetAfterFailure?.user_id === invitedUserId) {
        connectionFailed = false;
      } else {
        if (generatedAmbassadorProfileId) {
          await resolveAmbassadorApplicationNotifications(generatedAmbassadorProfileId);
        }
        await admin.auth.admin.deleteUser(invitedUserId);
      }
    }
  }

  if (connectionFailed) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "ambassador-connect-failed"));
  }

  if (generatedAmbassadorProfileId) {
    await resolveAmbassadorApplicationNotifications(generatedAmbassadorProfileId);
  }
  await logAuditEvent(
    actor.id,
    "ambassador.portal_connected",
    "ambassador_profile",
    ambassador.id as string
  );
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/ambassador");
  redirect(appendSearchParam(parsed.data.returnTo, "connected", "platform"));
}

export async function deleteAmbassadorRecordAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/ambassadors"),
    "/staff/ambassadors"
  );
  const parsed = ambassadorDeleteSchema.safeParse({
    ambassadorProfileId: String(formData.get("ambassadorProfileId") || ""),
    confirmationText: String(formData.get("confirmationText") || ""),
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-ambassador-delete"));
  }

  const admin = getAdminClientOrThrow();
  const { data: ambassador } = await admin
    .from("ambassador_profiles")
    .select("id, user_id, status, display_name")
    .eq("id", parsed.data.ambassadorProfileId)
    .maybeSingle();

  if (!ambassador) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "ambassador-not-found"));
  }

  const [sessions, sourcedBookings, reports, payments] = await Promise.all([
    admin
      .from("booking_sessions")
      .select("id", { count: "exact", head: true })
      .eq("assigned_ambassador_id", ambassador.id),
    admin
      .from("booking_requests")
      .select("id", { count: "exact", head: true })
      .eq("ambassador_outreach_by", ambassador.id),
    admin
      .from("ambassador_reports")
      .select("id", { count: "exact", head: true })
      .eq("ambassador_profile_id", ambassador.id),
    admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("ambassador_profile_id", ambassador.id)
  ]);
  const hasOperationalHistory = [sessions, sourcedBookings, reports, payments].some(
    (result) => (result.count ?? 0) > 0
  );
  const recordType = ["applied", "declined"].includes(String(ambassador.status))
    ? "application"
    : "volunteer";

  try {
    if (hasOperationalHistory) {
      const { error: archiveError } = await admin
        .from("ambassador_profiles")
        .update({
          status: "inactive",
          deleted_at: new Date().toISOString()
        })
        .eq("id", ambassador.id);

      if (archiveError) {
        throw archiveError;
      }

      if (ambassador.user_id) {
        await admin
          .from("profiles")
          .update({ status: "inactive" })
          .eq("id", ambassador.user_id);

        // Archived ambassadors lose platform access immediately — revoke the
        // user's live sessions rather than waiting for their token to expire.
        // Profiles without a linked auth user (nullable since migration 0026)
        // have no sessions to revoke.
        const accessError = await setUserPlatformAccess(
          ambassador.user_id as string,
          false
        );

        if (accessError) {
          throw accessError;
        }
      }
    } else if (ambassador.user_id) {
      await clearNullableProfileReferences(ambassador.user_id as string);
      const { error: userDeleteError } = await admin.auth.admin.deleteUser(
        ambassador.user_id as string
      );

      if (userDeleteError) {
        throw userDeleteError;
      }
    } else {
      const { error: profileDeleteError } = await admin
        .from("ambassador_profiles")
        .delete()
        .eq("id", ambassador.id);

      if (profileDeleteError) {
        throw profileDeleteError;
      }
    }
  } catch {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "ambassador-delete-failed"));
  }

  await resolveAmbassadorApplicationNotifications(ambassador.id as string);
  await logAuditEvent(
    actor.id,
    hasOperationalHistory ? "ambassador.archived" : "ambassador.deleted",
    "ambassador_profile",
    ambassador.id as string
  );
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/ambassador");
  redirect(
    appendSearchParam(
      parsed.data.returnTo,
      "deleted",
      hasOperationalHistory ? `${recordType}-history-preserved` : recordType
    )
  );
}

export async function markNotificationReadAction(formData: FormData) {
  const fallbackRedirectTo = sanitizeReturnTo(
    String(formData.get("redirectTo") || "/staff/activity"),
    "/staff/activity"
  );
  const parsed = notificationSchema.safeParse({
    notificationId: String(formData.get("notificationId") || ""),
    redirectTo: fallbackRedirectTo
  });

  if (!parsed.success) {
    redirect("/staff/activity?error=invalid-notification");
  }

  const supabase = await createClient();

  if (!supabase) {
    redirect(`${parsed.data.redirectTo}?error=supabase-unavailable`);
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=auth-required");
  }

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data.notificationId)
    .eq("user_id", user.id);

  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(parsed.data.redirectTo);
}

export async function saveManualSchoolAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/schools"),
    "/staff/schools"
  );
  const parsed = manualSchoolSchema.safeParse({
    name: String(formData.get("name") || ""),
    regionId: String(formData.get("regionId") || "") || undefined,
    address: String(formData.get("address") || "") || undefined,
    city: String(formData.get("city") || "") || undefined,
    postcode: String(formData.get("postcode") || "") || undefined,
    website: String(formData.get("website") || "") || undefined,
    rollSize: formData.get("rollSize") || undefined,
    notes: String(formData.get("notes") || "") || undefined,
    contactName: String(formData.get("contactName") || "") || undefined,
    contactEmail: String(formData.get("contactEmail") || "") || undefined,
    contactPhone: String(formData.get("contactPhone") || "") || undefined,
    contactPosition: String(formData.get("contactPosition") || "") || undefined,
    marketingConsent: formData.get("marketingConsent") === "on",
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-school"));
  }

  const admin = getAdminClientOrThrow();
  const { data: school, error: schoolError } = await admin
    .from("schools")
    .insert({
      name: parsed.data.name,
      region_id: parsed.data.regionId || null,
      address: parsed.data.address || null,
      city: parsed.data.city || null,
      postcode: parsed.data.postcode || null,
      website: parsed.data.website || null,
      roll_size: parsed.data.rollSize ?? null,
      notes: parsed.data.notes || null,
      status: "active"
    })
    .select("id")
    .single();

  if (schoolError || !school) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "school-save-failed"));
  }

  if (parsed.data.contactName && parsed.data.contactEmail) {
    const { error: contactError } = await admin.from("school_contacts").insert({
      school_id: school.id,
      full_name: parsed.data.contactName,
      email: parsed.data.contactEmail,
      phone: parsed.data.contactPhone || null,
      position: parsed.data.contactPosition || null,
      is_primary: true,
      marketing_consent: parsed.data.marketingConsent ?? false
    });

    if (contactError) {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "school-contact-save-failed"));
    }
  }

  await logAuditEvent(actor.id, "school.created", "school", school.id);
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(parsed.data.returnTo, "created", "school"));
}

export async function mergeSchoolAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/schools"),
    "/staff/schools"
  );
  const parsed = schoolMergeSchema.safeParse({
    duplicateSchoolId: String(formData.get("duplicateSchoolId") || ""),
    targetSchoolId: String(formData.get("targetSchoolId") || ""),
    returnTo: fallbackReturnTo
  });

  if (!parsed.success || parsed.data.duplicateSchoolId === parsed.data.targetSchoolId) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-school-merge"));
  }

  const admin = getAdminClientOrThrow();
  const { data: duplicate } = await admin
    .from("schools")
    .select("id, status")
    .eq("id", parsed.data.duplicateSchoolId)
    .maybeSingle();
  const { data: target } = await admin
    .from("schools")
    .select("id")
    .eq("id", parsed.data.targetSchoolId)
    .maybeSingle();

  if (!duplicate || !target || duplicate.status !== "pending_review") {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "school-merge-not-allowed"));
  }

  const reassignments = [
    admin
      .from("school_contacts")
      .update({ school_id: parsed.data.targetSchoolId })
      .eq("school_id", parsed.data.duplicateSchoolId),
    admin
      .from("booking_requests")
      .update({ school_id: parsed.data.targetSchoolId })
      .eq("school_id", parsed.data.duplicateSchoolId),
    admin
      .from("booking_sessions")
      .update({ school_id: parsed.data.targetSchoolId })
      .eq("school_id", parsed.data.duplicateSchoolId),
    admin
      .from("presentation_reviews")
      .update({ school_id: parsed.data.targetSchoolId })
      .eq("school_id", parsed.data.duplicateSchoolId)
  ];
  const results = await Promise.all(reassignments);

  if (results.some((result) => result.error)) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "school-merge-failed"));
  }

  const { error: deleteError } = await admin
    .from("schools")
    .delete()
    .eq("id", parsed.data.duplicateSchoolId);

  if (deleteError) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "school-merge-delete-failed"));
  }

  await logAuditEvent(actor.id, "school.merged", "school", parsed.data.duplicateSchoolId);
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(parsed.data.returnTo, "merged", "school"));
}

export async function saveManualBookingAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/bookings"),
    "/staff/bookings"
  );
  const parsed = manualBookingSchema.safeParse({
    schoolId: String(formData.get("schoolId") || "") || undefined,
    schoolName: String(formData.get("schoolName") || "") || undefined,
    newSchoolRegionId: String(formData.get("newSchoolRegionId") || "") || undefined,
    presentationTypeId: String(formData.get("presentationTypeId") || ""),
    assignedAmbassadorId: String(formData.get("assignedAmbassadorId") || "") || undefined,
    outreachAmbassadorId: String(formData.get("outreachAmbassadorId") || "") || undefined,
    status: String(formData.get("status") || "tentative"),
    date: String(formData.get("date") || ""),
    startTime: String(formData.get("startTime") || ""),
    durationMinutes: formData.get("durationMinutes") || 60,
    yearLevels: String(formData.get("yearLevels") || ""),
    expectedStudentCount: formData.get("expectedStudentCount") || 0,
    actualStudentCount: formData.get("actualStudentCount") || undefined,
    internalNotes: String(formData.get("internalNotes") || "") || undefined,
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-booking"));
  }

  const admin = getAdminClientOrThrow();
  const school = await resolveManualBookingSchool(admin, parsed.data);

  if (!school) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-school-missing"));
  }

  const startsAt = new Date(nzDateTimeToIso(parsed.data.date, parsed.data.startTime));
  const endsAt = new Date(startsAt.getTime() + parsed.data.durationMinutes * 60 * 1000);
  // Manual entries never carry an actual ambassador_reports row, so a session
  // must not be persisted as "report submitted" — that would exclude it from
  // the feedback-logging queue and block the ambassador from ever submitting
  // the real report. Map that choice to completed_pending_report so the
  // session enters the normal report flow instead.
  const effectiveStatus =
    parsed.data.status === "report_submitted" ? "completed_pending_report" : parsed.data.status;

  const { data: booking, error: bookingError } = await admin
    .from("booking_requests")
    .insert({
      school_id: school.id,
      region_id: school.region_id ?? null,
      status: effectiveStatus,
      source: parsed.data.outreachAmbassadorId ? "ambassador" : "staff",
      ambassador_outreach_by: parsed.data.outreachAmbassadorId || null,
      staff_owner_id: actor.id,
      internal_notes: parsed.data.internalNotes || null
    })
    .select("id")
    .single();

  if (bookingError || !booking) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-save-failed"));
  }

  const { data: session, error: sessionError } = await admin
    .from("booking_sessions")
    .insert({
      booking_request_id: booking.id,
      presentation_type_id: parsed.data.presentationTypeId,
      region_id: school.region_id ?? null,
      school_id: school.id,
      assigned_ambassador_id: parsed.data.assignedAmbassadorId || null,
      share_contact_with_ambassador: Boolean(parsed.data.assignedAmbassadorId),
      status: effectiveStatus,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      year_levels: parsed.data.yearLevels,
      expected_student_count: parsed.data.expectedStudentCount,
      actual_student_count: parsed.data.actualStudentCount ?? null,
      internal_notes: parsed.data.internalNotes || null,
      report_status: "not_submitted",
      payment_status: "not_eligible"
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-session-save-failed"));
  }

  await admin.from("booking_status_history").insert({
    booking_request_id: booking.id,
    booking_session_id: session.id,
    new_status: effectiveStatus,
    changed_by: actor.id,
    reason: "Manual staff entry"
  });

  if (effectiveStatus === "confirmed") {
    scheduleEmail(() => sendSchoolSessionEmails(booking.id as string, [session.id as string], "confirmed"));
  }
  await logAuditEvent(actor.id, "booking.manually_created", "booking_request", booking.id);
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(parsed.data.returnTo, "created", "booking"));
}

export async function saveAmbassadorBookingAction(formData: FormData) {
  const actor = await requirePortalAccess("ambassador");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/ambassador/upcoming"),
    "/ambassador/upcoming"
  );
  const parsed = ambassadorManualBookingSchema.safeParse({
    schoolId: String(formData.get("schoolId") || "") || undefined,
    schoolName: String(formData.get("schoolName") || "") || undefined,
    newSchoolRegionId: String(formData.get("newSchoolRegionId") || "") || undefined,
    presentationTypeId: String(formData.get("presentationTypeId") || ""),
    date: String(formData.get("date") || ""),
    startTime: String(formData.get("startTime") || ""),
    durationMinutes: formData.get("durationMinutes") || 45,
    yearLevels: String(formData.get("yearLevels") || ""),
    expectedStudentCount: formData.get("expectedStudentCount") || 0,
    internalNotes: String(formData.get("internalNotes") || "") || undefined,
    schoolSource: String(formData.get("schoolSource") || ""),
    confirmBooking: formData.get("confirmBooking") === "on",
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-ambassador-booking"));
  }

  const admin = getAdminClientOrThrow();
  const [{ data: ambassadorProfile }, school, { data: presentation }] =
    await Promise.all([
      admin
        .from("ambassador_profiles")
        .select("id, status")
        .eq("user_id", actor.id)
        .maybeSingle(),
      resolveManualBookingSchool(admin, parsed.data),
      admin
        .from("presentation_types")
        .select("id, title, is_active")
        .eq("id", parsed.data.presentationTypeId)
        .maybeSingle()
    ]);

  if (!ambassadorProfile || ambassadorProfile.status !== "approved") {
    redirect(
      appendSearchParam(parsed.data.returnTo, "error", "ambassador-booking-profile-missing")
    );
  }

  if (!school || school.status !== "active") {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-school-missing"));
  }

  if (!presentation || !presentation.is_active) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-presentation-missing"));
  }

  const { data: primaryContact } = await admin
    .from("school_contacts")
    .select("id")
    .eq("school_id", school.id)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  const startsAt = new Date(nzDateTimeToIso(parsed.data.date, parsed.data.startTime));

  if (Number.isNaN(startsAt.getTime())) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "invalid-ambassador-booking"));
  }

  const endsAt = new Date(startsAt.getTime() + parsed.data.durationMinutes * 60 * 1000);
  const status = parsed.data.confirmBooking ? "confirmed" : "ambassador_assigned";
  const wasSourcedByAmbassador = parsed.data.schoolSource === "sourced";
  const { data: booking, error: bookingError } = await admin
    .from("booking_requests")
    .insert({
      school_id: school.id,
      primary_contact_id: primaryContact?.id ?? null,
      region_id: school.region_id ?? null,
      status,
      source: wasSourcedByAmbassador ? AMBASSADOR_BOOKING_SOURCE : "ambassador",
      submitted_by_user_id: actor.id,
      ambassador_outreach_by: wasSourcedByAmbassador ? ambassadorProfile.id : null,
      internal_notes: parsed.data.internalNotes || null
    })
    .select("id")
    .single();

  if (bookingError || !booking) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-save-failed"));
  }

  const { data: session, error: sessionError } = await admin
    .from("booking_sessions")
    .insert({
      booking_request_id: booking.id,
      presentation_type_id: presentation.id,
      region_id: school.region_id ?? null,
      school_id: school.id,
      assigned_ambassador_id: ambassadorProfile.id,
      share_contact_with_ambassador: true,
      status,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      year_levels: parsed.data.yearLevels,
      expected_student_count: parsed.data.expectedStudentCount,
      internal_notes: parsed.data.internalNotes || null,
      report_status: "not_submitted",
      payment_status: "not_eligible"
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    await admin.from("booking_requests").delete().eq("id", booking.id);
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-session-save-failed"));
  }

  await Promise.all([
    admin.from("booking_status_history").insert({
      booking_request_id: booking.id,
      booking_session_id: session.id,
      new_status: status,
      changed_by: actor.id,
      reason: "Ambassador manually booked"
    }),
    admin.from("booking_activity_logs").insert({
      booking_request_id: booking.id,
      booking_session_id: session.id,
      action: "booking.ambassador_created",
      actor_id: actor.id,
      actor_type: "ambassador",
      details: {
        source: wasSourcedByAmbassador ? AMBASSADOR_BOOKING_SOURCE : "ambassador",
        sourced_by_ambassador: wasSourcedByAmbassador,
        status,
        ambassador_profile_id: ambassadorProfile.id,
        delivery_payment_cents: AMBASSADOR_DELIVERY_PAYMENT_CENTS,
        sourcing_bonus_cents: wasSourcedByAmbassador
          ? AMBASSADOR_SOURCING_BONUS_CENTS
          : 0,
        payment_amount_cents: wasSourcedByAmbassador
          ? AMBASSADOR_BOOKED_PAYMENT_CENTS
          : AMBASSADOR_DELIVERY_PAYMENT_CENTS
      }
    })
  ]);

  void notifyStaff({
    title: `${actor.fullName} logged an ambassador booking`,
    body: `${presentation.title as string} at ${school.name as string} on ${formatDateTime(startsAt)}${wasSourcedByAmbassador ? " · school sourced by ambassador" : ""}${parsed.data.confirmBooking ? " (confirmed)" : ""}.`,
    type: "ambassador_booking_created",
    relatedUrl: `/staff/bookings?booking=${booking.id}`
  }).catch(() => {});

  if (status === "confirmed") {
    scheduleEmail(() => sendSchoolSessionEmails(booking.id as string, [session.id as string], "confirmed"));
  }
  await logAuditEvent(actor.id, "booking.ambassador_created", "booking_request", booking.id);
  revalidatePath("/ambassador");
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/school");
  redirect(appendSearchParam(parsed.data.returnTo, "created", "ambassador-booking"));
}

export async function submitAmbassadorReportAction(formData: FormData) {
  const actor = await requirePortalAccess("ambassador");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/ambassador/completed"),
    "/ambassador/completed"
  );
  const parsed = ambassadorReportSubmitSchema.safeParse({
    bookingSessionId: String(formData.get("bookingSessionId") || ""),
    presenterName: String(formData.get("presenterName") || ""),
    schoolName: String(formData.get("schoolName") || ""),
    primaryContactName: String(formData.get("primaryContactName") || ""),
    primaryContactEmail: String(formData.get("primaryContactEmail") || ""),
    regionLocation: String(formData.get("regionLocation") || "") || undefined,
    deliveredDate: String(formData.get("deliveredDate") || ""),
    deliveredTime: String(formData.get("deliveredTime") || ""),
    studentsCompeted: String(formData.get("studentsCompeted") || ""),
    attendeeCount: formData.get("attendeeCount"),
    ageGroups: String(formData.get("ageGroups") || ""),
    parentsPresent: String(formData.get("parentsPresent") || ""),
    attendeeQuotes: String(formData.get("attendeeQuotes") || "") || undefined,
    attendanceRating: formData.get("attendanceRating"),
    studentEngagementRating: formData.get("studentEngagementRating"),
    teacherResponseRating: formData.get("teacherResponseRating"),
    presentationEnergyRating: formData.get("presentationEnergyRating"),
    presentationFeedback: String(formData.get("presentationFeedback") || "") || undefined,
    notableQuestions: String(formData.get("notableQuestions") || "") || undefined,
    additionalNotes: String(formData.get("additionalNotes") || "") || undefined,
    mediaConsentObtained: formData.get("mediaConsentObtained") === "on",
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-report"));
  }

  const mediaFiles = formData
    .getAll("mediaFiles")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (mediaFiles.length > 15 || mediaFiles.some((file) => file.size > 5 * 1024 * 1024)) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "report-media-invalid"));
  }

  // The form supplies NZ wall-clock values; interpret them in Pacific/Auckland
  // (like the staff feedback path) rather than the server's zone, which is UTC
  // on Vercel and would skew delivered_at by ~12-13 hours.
  let deliveredAtIso: string | null = null;

  try {
    deliveredAtIso = nzDateTimeToIso(parsed.data.deliveredDate, parsed.data.deliveredTime);
  } catch {
    deliveredAtIso = null;
  }

  const admin = getAdminClientOrThrow();
  const { data: ambassadorProfile } = await admin
    .from("ambassador_profiles")
    .select("id")
    .eq("user_id", actor.id)
    .maybeSingle();

  if (!ambassadorProfile) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "ambassador-not-found"));
  }

  const { data: session } = await admin
    .from("booking_sessions")
    .select("id, booking_request_id, assigned_ambassador_id, starts_at, ends_at, school_id, status, report_status")
    .eq("id", parsed.data.bookingSessionId)
    .maybeSingle();

  if (!session || session.assigned_ambassador_id !== ambassadorProfile.id) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-assigned"));
  }

  if (
    !session.ends_at ||
    new Date(session.ends_at as string).getTime() > Date.now() ||
    session.status === "cancelled" ||
    session.report_status !== "not_submitted"
  ) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-finished"));
  }

  const [
    { data: existingReport },
    { data: bookingRequest },
    { data: schoolRecord },
    { data: schoolContact }
  ] = await Promise.all([
    admin
      .from("ambassador_reports")
      .select("id")
      .eq("booking_session_id", parsed.data.bookingSessionId)
      .maybeSingle(),
    admin
      .from("booking_requests")
      .select("source, ambassador_outreach_by")
      .eq("id", session.booking_request_id)
      .maybeSingle(),
    admin
      .from("schools")
      .select("name, roll_size, address, suburb, city, postcode")
      .eq("id", session.school_id)
      .maybeSingle(),
    admin
      .from("school_contacts")
      .select("full_name, email")
      .eq("school_id", session.school_id)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (existingReport) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "report-already-submitted"));
  }

  const canonicalSchoolName = String(schoolRecord?.name ?? parsed.data.schoolName ?? "School");
  const canonicalContactName = String(
    schoolContact?.full_name ?? parsed.data.primaryContactName ?? ""
  );
  const canonicalContactEmail = String(
    schoolContact?.email ?? parsed.data.primaryContactEmail ?? ""
  );
  const canonicalLocation = [
    schoolRecord?.address,
    schoolRecord?.suburb,
    schoolRecord?.city,
    schoolRecord?.postcode
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");

  const { data: report, error: reportError } = await admin
    .from("ambassador_reports")
    .insert({
      booking_session_id: parsed.data.bookingSessionId,
      ambassador_profile_id: ambassadorProfile.id,
      presenter_name: parsed.data.presenterName,
      school_roll_size: schoolRecord?.roll_size ?? null,
      primary_contact_name: canonicalContactName || null,
      primary_contact_email: canonicalContactEmail || null,
      delivered_at: deliveredAtIso ?? session.starts_at ?? new Date().toISOString(),
      students_competed_in_esports: parsed.data.studentsCompeted === "yes",
      attendee_count: parsed.data.attendeeCount,
      year_levels: parsed.data.ageGroups,
      age_groups: parsed.data.ageGroups,
      parents_present: parsed.data.parentsPresent === "yes",
      attendee_quotes: parsed.data.attendeeQuotes || null,
      attendance_rating: parsed.data.attendanceRating,
      student_response_rating: parsed.data.studentEngagementRating,
      teacher_response_rating: parsed.data.teacherResponseRating,
      presentation_energy_rating: parsed.data.presentationEnergyRating,
      presentation_feedback: parsed.data.presentationFeedback || null,
      student_questions_themes: parsed.data.notableQuestions || null,
      additional_notes: [
        parsed.data.additionalNotes?.trim(),
        canonicalLocation || parsed.data.regionLocation?.trim()
          ? `Region / location: ${canonicalLocation || parsed.data.regionLocation?.trim()}`
          : "",
        canonicalSchoolName ? `School: ${canonicalSchoolName}` : ""
      ]
        .filter(Boolean)
        .join("\n") || null,
      media_consent_confirmed: parsed.data.mediaConsentObtained ?? false,
      submitted_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (reportError || !report) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "report-save-failed"));
  }

  // Presentation photos/videos and signed media release forms go into the
  // media library, linked to this report for staff review. They can contain
  // identifiable students, so they upload to the private `report-media`
  // bucket and only surface through the auth-gated
  // /portal/report-media/[mediaId] route (stored as the row's public_url so
  // existing consumers keep a renderable link).
  for (const file of mediaFiles) {
    try {
      const upload = await uploadPrivateReportMedia(file, "report-media");
      const mediaId = randomUUID();
      await admin.from("media_library").insert({
        id: mediaId,
        title: file.name,
        media_type: file.type.startsWith("video/")
          ? "video"
          : file.type === "application/pdf"
            ? "document"
            : "image",
        storage_path: upload.storagePath,
        public_url: `/portal/report-media/${mediaId}`,
        uploaded_by: actor.id,
        school_id: session.school_id ?? null,
        booking_session_id: parsed.data.bookingSessionId,
        report_id: report.id,
        consent_status: parsed.data.mediaConsentObtained ? "consent_confirmed" : "needs_consent_check"
      });
    } catch {
      // A failed media upload shouldn't lose the whole report submission.
    }
  }

  const eligibleThreshold = 100;
  const isPaymentEligible = parsed.data.attendeeCount >= eligibleThreshold;
  const isAmbassadorSourced =
    bookingRequest?.ambassador_outreach_by === ambassadorProfile.id &&
    ["ambassador", AMBASSADOR_BOOKING_SOURCE].includes(String(bookingRequest?.source));
  const paymentStatus = isPaymentEligible ? "eligible" : "not_eligible";
  const eligibilityReason = isPaymentEligible
    ? `Attendee count ${parsed.data.attendeeCount} meets threshold of ${eligibleThreshold}.${isAmbassadorSourced ? ` ${formatCurrency(AMBASSADOR_DELIVERY_PAYMENT_CENTS)} delivery fee + ${formatCurrency(AMBASSADOR_SOURCING_BONUS_CENTS)} sourcing bonus.` : ""}`
    : `Attendee count ${parsed.data.attendeeCount} below threshold of ${eligibleThreshold}.`;

  await admin
    .from("booking_sessions")
    .update({
      report_status: "submitted",
      payment_status: paymentStatus,
      actual_student_count: parsed.data.attendeeCount,
      status: "report_submitted"
    })
    .eq("id", parsed.data.bookingSessionId);

  if (isPaymentEligible) {
    await admin.from("payments").insert({
      booking_session_id: parsed.data.bookingSessionId,
      ambassador_profile_id: ambassadorProfile.id,
      status: "pending",
      eligibility_reason: eligibilityReason,
      amount_cents: isAmbassadorSourced
        ? AMBASSADOR_BOOKED_PAYMENT_CENTS
        : AMBASSADOR_DELIVERY_PAYMENT_CENTS,
      base_amount_cents: AMBASSADOR_DELIVERY_PAYMENT_CENTS,
      sourcing_bonus_cents: isAmbassadorSourced ? AMBASSADOR_SOURCING_BONUS_CENTS : 0
    });
  }

  if (session.booking_request_id) {
    await admin
      .from("booking_requests")
      .update({ status: "report_submitted" })
      .eq("id", session.booking_request_id);
  }

  await admin.from("booking_activity_logs").insert({
    booking_session_id: parsed.data.bookingSessionId,
    action: "report.submitted",
    actor_id: actor.id,
    actor_type: "ambassador",
    details: {
      attendee_count: parsed.data.attendeeCount,
      payment_status: paymentStatus,
      sourced_by_ambassador: isAmbassadorSourced,
      delivery_payment_cents: isPaymentEligible ? AMBASSADOR_DELIVERY_PAYMENT_CENTS : 0,
      sourcing_bonus_cents:
        isPaymentEligible && isAmbassadorSourced ? AMBASSADOR_SOURCING_BONUS_CENTS : 0
    }
  });

  const { data: reportSchool } = session.school_id
    ? await admin.from("schools").select("name").eq("id", session.school_id).maybeSingle()
    : { data: null };
  void notifyStaff({
    title: `Report submitted for ${(reportSchool?.name as string | null) ?? "a school"}`,
    body: `${actor.fullName} submitted a session report with ${parsed.data.attendeeCount} attendees.`,
    type: "ambassador_report_submitted",
    relatedUrl: "/staff/reports"
  }).catch(() => {});

  await logAuditEvent(actor.id, "report.submitted", "ambassador_report", report.id);
  revalidatePath("/ambassador");
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(parsed.data.returnTo, "submitted", "report"));
}

export async function logStaffFeedbackAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/feedback"),
    "/staff/feedback"
  );
  const parsed = staffFeedbackSubmitSchema.safeParse({
    sessionMode: String(formData.get("sessionMode") || "existing"),
    bookingSessionId: String(formData.get("bookingSessionId") || ""),
    manualSchoolName: String(formData.get("manualSchoolName") || "") || undefined,
    manualPresentationTypeId:
      String(formData.get("manualPresentationTypeId") || "") || undefined,
    presenterName: String(formData.get("presenterName") || ""),
    schoolRollSize: String(formData.get("schoolRollSize") || "") || undefined,
    primaryContactName: String(formData.get("primaryContactName") || "") || undefined,
    primaryContactEmail: String(formData.get("primaryContactEmail") || ""),
    deliveredDate: String(formData.get("deliveredDate") || ""),
    deliveredTime: String(formData.get("deliveredTime") || ""),
    studentsCompeted: String(formData.get("studentsCompeted") || ""),
    attendeeCount: formData.get("attendeeCount"),
    ageGroups: String(formData.get("ageGroups") || ""),
    parentsPresent: String(formData.get("parentsPresent") || ""),
    attendeeQuotes: String(formData.get("attendeeQuotes") || "") || undefined,
    attendanceRating: formData.get("attendanceRating"),
    studentEngagementRating: formData.get("studentEngagementRating"),
    teacherResponseRating: formData.get("teacherResponseRating"),
    presentationEnergyRating: formData.get("presentationEnergyRating"),
    presentationFeedback: String(formData.get("presentationFeedback") || ""),
    notableQuestions: String(formData.get("notableQuestions") || "") || undefined,
    additionalNotes: String(formData.get("additionalNotes") || "") || undefined,
    mediaConsentObtained: formData.get("mediaConsentObtained") === "on",
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-staff-feedback"));
  }

  const mediaFiles = formData
    .getAll("mediaFiles")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (mediaFiles.length > 15 || mediaFiles.some((file) => file.size > 5 * 1024 * 1024)) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-staff-feedback"));
  }

  let deliveredAt: string;

  try {
    deliveredAt = nzDateTimeToIso(parsed.data.deliveredDate, parsed.data.deliveredTime);
  } catch {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "invalid-delivery-time"));
  }

  if (new Date(deliveredAt).getTime() > Date.now()) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-finished"));
  }

  const admin = getAdminClientOrThrow();
  type FeedbackSessionRow = {
    id: string;
    booking_request_id: string | null;
    status: string | null;
    starts_at: string | null;
    school_id: string | null;
  };
  let session: FeedbackSessionRow | null = null;
  let existingReport: { id: string } | null = null;
  let createdManualBookingId: string | null = null;

  if (parsed.data.sessionMode === "existing") {
    const [sessionResult, reportResult] = await Promise.all([
      admin
        .from("booking_sessions")
        .select("id, booking_request_id, status, starts_at, school_id")
        .eq("id", parsed.data.bookingSessionId as string)
        .maybeSingle(),
      admin
        .from("ambassador_reports")
        .select("id")
        .eq("booking_session_id", parsed.data.bookingSessionId as string)
        .maybeSingle()
    ]);

    session = sessionResult.data as FeedbackSessionRow | null;
    existingReport = reportResult.data as { id: string } | null;
  } else {
    const [{ data: presentation }, { data: schools }] = await Promise.all([
      admin
        .from("presentation_types")
        .select("id, duration_minutes")
        .eq("id", parsed.data.manualPresentationTypeId as string)
        .maybeSingle(),
      admin.from("schools").select("id, name, region_id").limit(2000)
    ]);

    if (!presentation) {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "presentation-not-found"));
    }

    const normalizedSchoolName = parsed.data.manualSchoolName?.trim().toLocaleLowerCase();
    let school = (schools ?? []).find(
      (candidate) =>
        String(candidate.name).trim().toLocaleLowerCase() === normalizedSchoolName
    );
    let createdNewSchool = false;

    if (!school) {
      const { data: createdSchool, error: schoolError } = await admin
        .from("schools")
        .insert({
          name: parsed.data.manualSchoolName,
          roll_size: parsed.data.schoolRollSize ?? null,
          status: "active",
          notes: "Created from a manually logged presentation session."
        })
        .select("id, name, region_id")
        .single();

      if (schoolError || !createdSchool) {
        redirect(appendSearchParam(parsed.data.returnTo, "error", "school-save-failed"));
      }

      school = createdSchool;
      createdNewSchool = true;
    }

    let primaryContactId: string | null = null;
    if (parsed.data.primaryContactName && parsed.data.primaryContactEmail) {
      const { data: existingContact } = await admin
        .from("school_contacts")
        .select("id")
        .eq("school_id", school.id)
        .ilike("email", parsed.data.primaryContactEmail)
        .maybeSingle();
      const { data: contact } = existingContact
        ? { data: existingContact }
        : await admin
        .from("school_contacts")
        .insert({
          school_id: school.id,
          full_name: parsed.data.primaryContactName,
          email: parsed.data.primaryContactEmail,
          is_primary: createdNewSchool
        })
        .select("id")
        .single();
      primaryContactId = (contact?.id as string | undefined) ?? null;
    }

    const { data: booking, error: bookingError } = await admin
      .from("booking_requests")
      .insert({
        school_id: school.id,
        primary_contact_id: primaryContactId,
        region_id: school.region_id ?? null,
        status: "closed",
        source: "staff",
        submitted_by_user_id: actor.id,
        staff_owner_id: actor.id,
        internal_notes: "Manual session created while logging feedback."
      })
      .select("id")
      .single();

    if (bookingError || !booking) {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-save-failed"));
    }

    createdManualBookingId = booking.id as string;
    const startsAt = new Date(deliveredAt);
    const endsAt = new Date(
      startsAt.getTime() + Number(presentation.duration_minutes ?? 60) * 60_000
    );
    const { data: createdSession, error: sessionError } = await admin
      .from("booking_sessions")
      .insert({
        booking_request_id: booking.id,
        presentation_type_id: presentation.id,
        region_id: school.region_id ?? null,
        school_id: school.id,
        status: "closed",
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        year_levels: parsed.data.ageGroups,
        expected_student_count: parsed.data.attendeeCount,
        actual_student_count: parsed.data.attendeeCount,
        report_status: "reviewed",
        payment_status: "not_eligible"
      })
      .select("id, booking_request_id, status, starts_at, school_id")
      .single();

    if (sessionError || !createdSession) {
      await admin.from("booking_requests").delete().eq("id", booking.id);
      redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-session-save-failed"));
    }

    session = createdSession as FeedbackSessionRow;
  }

  if (!session) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-found"));
  }

  if (existingReport) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "report-already-submitted"));
  }

  if (session.starts_at && new Date(session.starts_at as string).getTime() > Date.now()) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-finished"));
  }

  const { data: siblingSessions } = session.booking_request_id
    ? await admin
        .from("booking_sessions")
        .select("id, status")
        .eq("booking_request_id", session.booking_request_id)
    : { data: [] };
  const terminalSessionStatuses = new Set([
    "report_submitted",
    "payment_pending",
    "paid",
    "closed",
    "cancelled",
    "declined"
  ]);
  const closesWholeBooking = (siblingSessions ?? []).every(
    (sibling) =>
      sibling.id === session.id ||
      terminalSessionStatuses.has(String(sibling.status))
  );

  const submittedAt = new Date().toISOString();
  const { data: report, error: reportError } = await admin
    .from("ambassador_reports")
    .insert({
      booking_session_id: session.id,
      ambassador_profile_id: null,
      presenter_name: parsed.data.presenterName,
      school_roll_size: parsed.data.schoolRollSize ?? null,
      primary_contact_name: parsed.data.primaryContactName || null,
      primary_contact_email: parsed.data.primaryContactEmail || null,
      delivered_at: deliveredAt,
      students_competed_in_esports: parsed.data.studentsCompeted === "yes",
      attendee_count: parsed.data.attendeeCount,
      year_levels: parsed.data.ageGroups,
      age_groups: parsed.data.ageGroups,
      parents_present: parsed.data.parentsPresent === "yes",
      media_consent_confirmed: parsed.data.mediaConsentObtained ?? false,
      attendee_quotes: parsed.data.attendeeQuotes || null,
      attendance_rating: parsed.data.attendanceRating,
      student_response_rating: parsed.data.studentEngagementRating,
      teacher_response_rating: parsed.data.teacherResponseRating,
      presentation_energy_rating: parsed.data.presentationEnergyRating,
      presentation_feedback: parsed.data.presentationFeedback,
      student_questions_themes: parsed.data.notableQuestions || null,
      additional_notes: parsed.data.additionalNotes || null,
      submitted_at: submittedAt,
      reviewed_for_payment_at: submittedAt,
      reviewed_for_payment_by: actor.id
    })
    .select("id")
    .single();

  if (reportError || !report) {
    if (createdManualBookingId) {
      await admin.from("booking_requests").delete().eq("id", createdManualBookingId);
    }
    redirect(appendSearchParam(parsed.data.returnTo, "error", "report-save-failed"));
  }

  for (const file of mediaFiles) {
    try {
      // Private bucket + auth-gated route: see submitAmbassadorReportAction.
      const upload = await uploadPrivateReportMedia(file, "report-media");
      const mediaId = randomUUID();
      await admin.from("media_library").insert({
        id: mediaId,
        title: file.name,
        media_type: file.type.startsWith("video/")
          ? "video"
          : file.type === "application/pdf"
            ? "document"
            : "image",
        storage_path: upload.storagePath,
        public_url: `/portal/report-media/${mediaId}`,
        uploaded_by: actor.id,
        school_id: session.school_id ?? null,
        booking_session_id: session.id,
        report_id: report.id,
        consent_status: parsed.data.mediaConsentObtained
          ? "consent_confirmed"
          : "needs_consent_check"
      });
    } catch {
      // Keep the feedback report even if an individual media upload fails.
    }
  }

  await Promise.all([
    admin
      .from("booking_sessions")
      .update({
        report_status: "reviewed",
        payment_status: "not_eligible",
        actual_student_count: parsed.data.attendeeCount,
        status: "closed"
      })
      .eq("id", session.id),
    session.booking_request_id && closesWholeBooking
      ? admin
          .from("booking_requests")
          .update({ status: "closed" })
          .eq("id", session.booking_request_id)
      : Promise.resolve(),
    admin.from("booking_status_history").insert({
      booking_request_id: session.booking_request_id ?? null,
      booking_session_id: session.id,
      old_status: session.status ?? null,
      new_status: "closed",
      changed_by: actor.id,
      reason: "Feedback logged by staff"
    }),
    admin.from("booking_activity_logs").insert({
      booking_request_id: session.booking_request_id ?? null,
      booking_session_id: session.id,
      action: "report.logged_by_staff",
      actor_id: actor.id,
      actor_type: actor.role,
      details: {
        presenter_name: parsed.data.presenterName,
        attendee_count: parsed.data.attendeeCount,
        payment_status: "not_eligible"
      }
    })
  ]);

  await logAuditEvent(actor.id, "report.logged_by_staff", "ambassador_report", report.id);
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/school");
  redirect(appendSearchParam(parsed.data.returnTo, "logged", "feedback"));
}

export async function applyToSessionAction(formData: FormData) {
  const actor = await requirePortalAccess("ambassador");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/ambassador/open-bookings"),
    "/ambassador/open-bookings"
  );
  const parsed = sessionApplicationSchema.safeParse({
    bookingSessionId: String(formData.get("bookingSessionId") || ""),
    message: String(formData.get("message") || "") || undefined,
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-application"));
  }

  const admin = getAdminClientOrThrow();
  const { data: ambassadorProfile } = await admin
    .from("ambassador_profiles")
    .select("id")
    .eq("user_id", actor.id)
    .maybeSingle();

  if (!ambassadorProfile) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "ambassador-not-found"));
  }

  const { data: session } = await admin
    .from("booking_sessions")
    .select("id, booking_request_id, status, assigned_ambassador_id")
    .eq("id", parsed.data.bookingSessionId)
    .maybeSingle();

  if (
    !session ||
    session.assigned_ambassador_id ||
    !["tentative", "applied"].includes(String(session.status))
  ) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-open"));
  }

  const { data: existing } = await admin
    .from("booking_session_applications")
    .select("id, status")
    .eq("booking_session_id", parsed.data.bookingSessionId)
    .eq("ambassador_profile_id", ambassadorProfile.id)
    .maybeSingle();

  if (existing && existing.status !== "withdrawn") {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "already-applied"));
  }

  const { error } = existing
    ? await admin
        .from("booking_session_applications")
        .update({
          status: "applied",
          message: parsed.data.message || null,
          applied_at: new Date().toISOString(),
          reviewed_at: null,
          reviewed_by: null
        })
        .eq("id", existing.id)
    : await admin.from("booking_session_applications").insert({
        booking_session_id: parsed.data.bookingSessionId,
        ambassador_profile_id: ambassadorProfile.id,
        status: "applied",
        message: parsed.data.message || null
      });

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "application-failed"));
  }

  if (session.status !== "applied") {
    await Promise.all([
      admin
        .from("booking_sessions")
        .update({ status: "applied" })
        .eq("id", parsed.data.bookingSessionId)
        .eq("status", "tentative"),
      admin.from("booking_status_history").insert({
        booking_request_id: session.booking_request_id,
        booking_session_id: parsed.data.bookingSessionId,
        old_status: session.status,
        new_status: "applied",
        changed_by: actor.id,
        reason: "Ambassador applied"
      })
    ]);
  }

  await refreshPreConfirmationBookingStatus({
    admin,
    bookingRequestId: session.booking_request_id as string,
    actorId: actor.id,
    actorType: "ambassador",
    reason: "Booking application state changed"
  });

  await admin.from("booking_activity_logs").insert({
    booking_session_id: parsed.data.bookingSessionId,
    action: "session.applied",
    actor_id: actor.id,
    actor_type: "ambassador",
    details: { ambassador_profile_id: ambassadorProfile.id }
  });

  await logAuditEvent(actor.id, "session.applied", "booking_session_application");
  revalidatePath("/ambassador");
  revalidatePath("/staff");
  redirect(appendSearchParam(parsed.data.returnTo, "applied", "1"));
}

export async function withdrawApplicationAction(formData: FormData) {
  const actor = await requirePortalAccess("ambassador");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/ambassador/open-bookings"),
    "/ambassador/open-bookings"
  );
  const parsed = applicationWithdrawSchema.safeParse({
    bookingSessionId: String(formData.get("bookingSessionId") || ""),
    reason: String(formData.get("reason") || ""),
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-withdrawal"));
  }

  const admin = getAdminClientOrThrow();
  const { data: ambassadorProfile } = await admin
    .from("ambassador_profiles")
    .select("id")
    .eq("user_id", actor.id)
    .maybeSingle();

  if (!ambassadorProfile) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "ambassador-not-found"));
  }

  const { data: application, error: applicationError } = await admin
    .from("booking_session_applications")
    .update({
      status: "withdrawn",
      reviewed_at: new Date().toISOString(),
      reviewed_by: actor.id
    })
    .eq("booking_session_id", parsed.data.bookingSessionId)
    .eq("ambassador_profile_id", ambassadorProfile.id)
    .eq("status", "applied")
    .select("id")
    .maybeSingle();

  if (applicationError || !application) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "application-not-found"));
  }

  const { data: session } = await admin
    .from("booking_sessions")
    .select("id, booking_request_id, status, school_id, presentation_type_id, assigned_ambassador_id")
    .eq("id", parsed.data.bookingSessionId)
    .maybeSingle();

  const { count: remainingApplications } = await admin
    .from("booking_session_applications")
    .select("id", { count: "exact", head: true })
    .eq("booking_session_id", parsed.data.bookingSessionId)
    .eq("status", "applied");

  if (
    session &&
    !session.assigned_ambassador_id &&
    (remainingApplications ?? 0) === 0 &&
    ["applied", "tentative"].includes(session.status as string)
  ) {
    const { data: reopenedSession } = await admin
      .from("booking_sessions")
      .update({ status: "tentative" })
      .eq("id", parsed.data.bookingSessionId)
      .in("status", ["applied", "tentative"])
      .select("id")
      .maybeSingle();

    if (reopenedSession) {
      await admin.from("booking_status_history").insert({
        booking_request_id: session.booking_request_id,
        booking_session_id: parsed.data.bookingSessionId,
        old_status: session.status,
        new_status: "tentative",
        changed_by: actor.id,
        reason: "Last ambassador application was withdrawn"
      });
    }
  }

  if (session?.booking_request_id) {
    await refreshPreConfirmationBookingStatus({
      admin,
      bookingRequestId: session.booking_request_id as string,
      actorId: actor.id,
      actorType: "ambassador",
      reason: "Booking application state changed"
    });
  }

  await admin.from("booking_activity_logs").insert({
    booking_request_id: session?.booking_request_id ?? null,
    booking_session_id: parsed.data.bookingSessionId,
    action: "session.application_withdrawn",
    actor_id: actor.id,
    actor_type: "ambassador",
    details: {
      ambassador_profile_id: ambassadorProfile.id,
      reason: parsed.data.reason,
      remaining_applications: remainingApplications ?? 0
    }
  });

  const [{ data: school }, { data: presentation }] = await Promise.all([
    session?.school_id
      ? admin.from("schools").select("name").eq("id", session.school_id).maybeSingle()
      : Promise.resolve({ data: null }),
    session?.presentation_type_id
      ? admin
          .from("presentation_types")
          .select("title")
          .eq("id", session.presentation_type_id)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  void notifyStaff({
    title: `${actor.fullName} withdrew an application`,
    body: `${actor.fullName} withdrew from ${(presentation?.title as string | null) ?? "a session"} at ${(school?.name as string | null) ?? "a school"}. Reason: ${parsed.data.reason}`,
    type: "session_application_withdrawn",
    relatedUrl: session?.booking_request_id
      ? `/staff/bookings?status=all&range=all&booking=${session.booking_request_id}#booking-${session.booking_request_id}`
      : "/staff/bookings"
  }).catch(() => {});

  await logAuditEvent(actor.id, "session.application_withdrawn", "booking_session", parsed.data.bookingSessionId);
  revalidatePath("/ambassador");
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/school");
  redirect(appendSearchParam(parsed.data.returnTo, "withdrawn", "application"));
}

export async function requestSessionWithdrawalAction(formData: FormData) {
  const actor = await requirePortalAccess("ambassador");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/ambassador/upcoming"),
    "/ambassador/upcoming"
  );
  const parsed = sessionWithdrawalRequestSchema.safeParse({
    bookingSessionId: String(formData.get("bookingSessionId") || ""),
    reason: String(formData.get("reason") || ""),
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-withdrawal"));
  }

  const admin = getAdminClientOrThrow();
  const { data: ambassadorProfile } = await admin
    .from("ambassador_profiles")
    .select("id")
    .eq("user_id", actor.id)
    .maybeSingle();

  if (!ambassadorProfile) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "ambassador-not-found"));
  }

  const { data: session } = await admin
    .from("booking_sessions")
    .select(
      "id, booking_request_id, assigned_ambassador_id, status, starts_at, school_id, presentation_type_id, withdrawal_requested_at"
    )
    .eq("id", parsed.data.bookingSessionId)
    .maybeSingle();

  if (!session || session.assigned_ambassador_id !== ambassadorProfile.id) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "not-your-session"));
  }

  if (new Date(session.starts_at as string).getTime() <= Date.now()) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-already-started"));
  }

  if (session.status === "withdrawal_requested" || session.withdrawal_requested_at) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "withdrawal-already-requested"));
  }

  if (!["ambassador_assigned", "confirmed"].includes(session.status as string)) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "withdrawal-not-allowed"));
  }

  const requestedAt = new Date().toISOString();
  const priorStatus = session.status as string;
  const { data: updatedSession, error } = await admin
    .from("booking_sessions")
    .update({
      status: "withdrawal_requested",
      withdrawal_reason: parsed.data.reason,
      withdrawal_requested_at: requestedAt
    })
    .eq("id", parsed.data.bookingSessionId)
    .eq("assigned_ambassador_id", ambassadorProfile.id)
    .in("status", ["ambassador_assigned", "confirmed"])
    .select("id")
    .maybeSingle();

  if (error || !updatedSession) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "withdrawal-not-allowed"));
  }

  await admin.from("booking_status_history").insert({
    booking_request_id: session.booking_request_id,
    booking_session_id: parsed.data.bookingSessionId,
    old_status: priorStatus,
    new_status: "withdrawal_requested",
    changed_by: actor.id,
    reason: parsed.data.reason
  });

  await admin.from("booking_activity_logs").insert({
    booking_request_id: session.booking_request_id,
    booking_session_id: parsed.data.bookingSessionId,
    action: "session.withdrawal_requested",
    actor_id: actor.id,
    actor_type: "ambassador",
    details: {
      reason: parsed.data.reason,
      prior_status: priorStatus,
      ambassador_profile_id: ambassadorProfile.id
    }
  });

  const [{ data: school }, { data: presentation }] = await Promise.all([
    session.school_id
      ? admin.from("schools").select("name").eq("id", session.school_id).maybeSingle()
      : Promise.resolve({ data: null }),
    session.presentation_type_id
      ? admin
          .from("presentation_types")
          .select("title")
          .eq("id", session.presentation_type_id)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  void notifyStaff({
    title: `${actor.fullName} asked to withdraw`,
    body: `${(presentation?.title as string | null) ?? "Session"} at ${(school?.name as string | null) ?? "a school"}: ${parsed.data.reason}`,
    type: "session_withdrawal_requested",
    relatedUrl: session.booking_request_id
      ? `/staff/bookings?status=all&range=all&booking=${session.booking_request_id}#booking-${session.booking_request_id}`
      : "/staff/bookings"
  }).catch(() => {});

  await logAuditEvent(actor.id, "session.withdrawal_requested", "booking_session", parsed.data.bookingSessionId);
  revalidatePath("/ambassador");
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/school");
  redirect(appendSearchParam(parsed.data.returnTo, "requested", "withdrawal"));
}

function parseSchoolReviewForm(formData: FormData, fallbackReturnTo: string) {
  return schoolReviewSchema.safeParse({
    bookingSessionId: String(formData.get("bookingSessionId") || ""),
    attribution: String(formData.get("attribution") || ""),
    studentsCompeted: String(formData.get("studentsCompeted") || ""),
    attendeeFeedback: String(formData.get("attendeeFeedback") || ""),
    attendanceRating: formData.get("attendanceRating"),
    studentResponseRating: formData.get("studentResponseRating"),
    contentRating: formData.get("contentRating"),
    presenterEnergyRating: formData.get("presenterEnergyRating"),
    quote: String(formData.get("quote") || ""),
    hadEsportsClub: String(formData.get("hadEsportsClub") || ""),
    consideringClub: String(formData.get("consideringClub") || ""),
    mailingListOptIn: formData.has("mailingListOptIn")
      ? String(formData.get("mailingListOptIn") || "")
      : undefined,
    isPublic: formData.get("isPublic") === "on",
    returnTo: fallbackReturnTo
  });
}

// Shared by the portal and public feedback actions: computes the overall
// rating, inserts the review, and retries without the details column for
// environments that haven't run migration 0012 yet.
async function insertSchoolReview(
  admin: ReturnType<typeof getAdminClientOrThrow>,
  parsedData: z.infer<typeof schoolReviewSchema>,
  session: { school_id: unknown; presentation_type_id: unknown }
) {
  // One-decimal precision: 5,4,5,4 stores as 4.5, not a rounded-up 5.
  const overallRating =
    Math.round(
      ((parsedData.attendanceRating +
        parsedData.studentResponseRating +
        parsedData.contentRating +
        parsedData.presenterEnergyRating) /
        4) *
        10
    ) / 10;
  const basePayload = {
    booking_session_id: parsedData.bookingSessionId,
    presentation_type_id: session.presentation_type_id,
    school_id: session.school_id,
    quote: parsedData.quote,
    attribution: parsedData.attribution,
    rating: overallRating,
    is_public: parsedData.isPublic,
    is_approved: false
  };
  const details = {
    studentsCompeted: parsedData.studentsCompeted,
    attendeeFeedback: parsedData.attendeeFeedback,
    attendanceRating: parsedData.attendanceRating,
    studentResponseRating: parsedData.studentResponseRating,
    contentRating: parsedData.contentRating,
    presenterEnergyRating: parsedData.presenterEnergyRating,
    hadEsportsClub: parsedData.hadEsportsClub,
    consideringClub: parsedData.consideringClub,
    mailingListOptIn: parsedData.mailingListOptIn
  };

  let insertResult = await admin
    .from("presentation_reviews")
    .insert({ ...basePayload, details })
    .select("id")
    .single();

  if (insertResult.error?.message?.includes("details")) {
    insertResult = await admin
      .from("presentation_reviews")
      .insert(basePayload)
      .select("id")
      .single();
  }

  return insertResult;
}

export async function submitSchoolReviewAction(formData: FormData) {
  const actor = await requirePortalAccess("school");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/school/bookings"),
    "/school/bookings"
  );
  const parsed = parseSchoolReviewForm(formData, fallbackReturnTo);

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-review"));
  }

  const admin = getAdminClientOrThrow();
  const { data: session } = await admin
    .from("booking_sessions")
    .select("id, booking_request_id, school_id, presentation_type_id, status, ends_at")
    .eq("id", parsed.data.bookingSessionId)
    .maybeSingle();

  if (!session) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-found"));
  }

  // Feedback only opens once the session has genuinely been delivered: its
  // time has passed (mirroring submitPublicFeedbackAction) AND it reached a
  // delivered-capable status — never for declined/cancelled or still-pending
  // sessions whose date merely elapsed.
  const deliveredCapableStatuses = new Set([
    "confirmed",
    "ambassador_assigned",
    "completed_pending_report",
    "report_submitted",
    "payment_pending",
    "paid",
    "closed"
  ]);

  if (
    !session.ends_at ||
    new Date(session.ends_at as string).getTime() > Date.now() ||
    !deliveredCapableStatuses.has(String(session.status))
  ) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-delivered"));
  }

  const [{ data: contactUsers }, { data: bookingRequest }] = await Promise.all([
    admin.from("school_contact_users").select("school_contact_id").eq("user_id", actor.id),
    session.booking_request_id
      ? admin
          .from("booking_requests")
          .select("submitted_by_user_id")
          .eq("id", session.booking_request_id)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ]);
  const contactIds = (contactUsers ?? []).map((contact) => contact.school_contact_id as string);
  const { data: contacts } = contactIds.length
    ? await admin.from("school_contacts").select("school_id").in("id", contactIds)
    : { data: [] };
  const schoolIds = new Set((contacts ?? []).map((contact) => contact.school_id as string));

  // Ownership mirrors the school-portal visibility predicate: a booking is
  // theirs when it belongs to one of their schools OR they submitted it.
  if (
    !schoolIds.has(session.school_id as string) &&
    bookingRequest?.submitted_by_user_id !== actor.id
  ) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-owned"));
  }

  const { data: existingReview } = await admin
    .from("presentation_reviews")
    .select("id")
    .eq("booking_session_id", parsed.data.bookingSessionId)
    .maybeSingle();

  if (existingReview) {
    redirect(appendSearchParam(parsed.data.returnTo, "submitted", "review"));
  }

  const insertResult = await insertSchoolReview(admin, parsed.data, session);
  const review = insertResult.data;

  if (insertResult.error || !review) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "review-save-failed"));
  }

  void notifyStaff({
    title: "New school review",
    body: `${actor.fullName} submitted feedback for a completed session.`,
    type: "school_review_submitted",
    // Staff paths are canonical for notification links: staff users land on
    // them directly, and the notifications bell rewrites them to /admin for
    // super_admins.
    relatedUrl: "/staff/feedback"
  }).catch(() => {});

  await logAuditEvent(actor.id, "review.submitted", "presentation_review", review.id);
  revalidatePath("/school");
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(parsed.data.returnTo, "submitted", "review"));
}

// Public variant used by the emailed /feedback/[sessionId] link — no portal
// login required. The unguessable session UUID acts as the capability token,
// and the unique index on booking_session_id blocks duplicate submissions.
export async function submitPublicFeedbackAction(formData: FormData) {
  const sessionIdRaw = String(formData.get("bookingSessionId") || "");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || `/feedback/${sessionIdRaw}`),
    "/"
  );
  const parsed = parseSchoolReviewForm(formData, fallbackReturnTo);

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-review"));
  }

  const admin = getAdminClientOrThrow();
  const { data: session } = await admin
    .from("booking_sessions")
    .select("id, school_id, presentation_type_id, ends_at, status")
    .eq("id", parsed.data.bookingSessionId)
    .maybeSingle();

  if (!session) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-found"));
  }

  const feedbackEligibleStatuses = new Set([
    "confirmed",
    "ambassador_assigned",
    "completed_pending_report",
    "report_submitted",
    "payment_pending",
    "paid",
    "closed"
  ]);

  // Public links only open after sessions that genuinely went ahead.
  if (
    new Date(session.ends_at as string).getTime() > Date.now() ||
    !feedbackEligibleStatuses.has(String(session.status))
  ) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-delivered"));
  }

  const { data: existingReview } = await admin
    .from("presentation_reviews")
    .select("id")
    .eq("booking_session_id", parsed.data.bookingSessionId)
    .maybeSingle();

  if (existingReview) {
    redirect(appendSearchParam(parsed.data.returnTo, "submitted", "1"));
  }

  const insertResult = await insertSchoolReview(admin, parsed.data, session);
  const review = insertResult.data;

  if (insertResult.error || !review) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "review-save-failed"));
  }

  void notifyStaff({
    title: "New school review",
    body: `${parsed.data.attribution} submitted feedback via the public form.`,
    type: "school_review_submitted",
    relatedUrl: "/staff/feedback"
  }).catch(() => {});

  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(parsed.data.returnTo, "submitted", "1"));
}

const schoolProfileSchema = z.object({
  name: z.string().trim().min(2),
  address: z.string().trim().max(200).optional(),
  suburb: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  postcode: z.string().trim().max(20).optional(),
  contactName: z.string().trim().min(2),
  contactEmail: z.string().email(),
  contactPhone: z.string().trim().max(40).optional(),
  profileNotes: z.string().trim().max(2000).optional()
});

const portalProfileSchema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().trim().max(40).optional(),
  returnTo: z.string().min(1).default("/staff/profile")
});

export async function savePortalProfileAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || (actor.role === "super_admin" ? "/admin/profile" : "/staff/profile")),
    actor.role === "super_admin" ? "/admin/profile" : "/staff/profile"
  );
  const parsed = portalProfileSchema.safeParse({
    fullName: String(formData.get("fullName") || ""),
    phone: String(formData.get("phone") || "") || undefined,
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-profile"));
  }

  const avatarFile = formData.get("avatar");
  let avatarUrl: string | null = null;

  if (avatarFile instanceof File && avatarFile.size > 0) {
    try {
      const upload = await uploadPublicAsset(avatarFile, "avatars");
      avatarUrl = upload.publicUrl;
    } catch {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "avatar-upload-failed"));
    }
  }

  const payload: Record<string, unknown> = {
    full_name: parsed.data.fullName,
    phone: parsed.data.phone ?? null
  };

  if (avatarUrl) {
    payload.avatar_url = avatarUrl;
  }

  const admin = getAdminClientOrThrow();
  const { error } = await admin.from("profiles").update(payload).eq("id", actor.id);

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "profile-save-failed"));
  }

  await logAuditEvent(actor.id, "profile.updated", "profile", actor.id);
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(parsed.data.returnTo, "saved", "profile"));
}

// School-managed profile: details, primary contact info, logo, and notes for
// the delivery team. Surfaced on the staff/admin Schools tab.
export async function saveSchoolProfileAction(formData: FormData) {
  const actor = await requirePortalAccess("school");
  const returnTo = "/school/profile";
  const parsed = schoolProfileSchema.safeParse({
    name: String(formData.get("name") || ""),
    address: String(formData.get("address") || "") || undefined,
    suburb: String(formData.get("suburb") || "") || undefined,
    city: String(formData.get("city") || "") || undefined,
    postcode: String(formData.get("postcode") || "") || undefined,
    contactName: String(formData.get("contactName") || ""),
    contactEmail: String(formData.get("contactEmail") || ""),
    contactPhone: String(formData.get("contactPhone") || "") || undefined,
    profileNotes: String(formData.get("profileNotes") || "") || undefined
  });

  if (!parsed.success) {
    redirect(appendSearchParam(returnTo, "error", "invalid-profile"));
  }

  const admin = getAdminClientOrThrow();
  // Resolve the school this account belongs to (same ownership chain as the
  // review action): user -> school_contact_users -> school_contacts -> school.
  const { data: contactUsers } = await admin
    .from("school_contact_users")
    .select("school_contact_id")
    .eq("user_id", actor.id);
  const contactIds = (contactUsers ?? []).map((contact) => contact.school_contact_id as string);
  const { data: contacts } = contactIds.length
    ? await admin
        .from("school_contacts")
        .select("id, school_id, is_primary")
        .in("id", contactIds)
    : { data: [] };
  const schoolId = (contacts ?? [])[0]?.school_id as string | undefined;

  if (!schoolId) {
    redirect(appendSearchParam(returnTo, "error", "school-not-found"));
  }

  let logoUrl: string | null = null;
  const logoFile = formData.get("logo");

  if (logoFile instanceof File && logoFile.size > 0) {
    try {
      const upload = await uploadPublicAsset(logoFile, "school-logos");
      logoUrl = upload.publicUrl;
    } catch {
      redirect(appendSearchParam(returnTo, "error", "logo-upload-failed"));
    }
  }

  const basePayload = {
    name: parsed.data.name,
    address: parsed.data.address ?? null,
    suburb: parsed.data.suburb ?? null,
    city: parsed.data.city ?? null,
    postcode: parsed.data.postcode ?? null
  };
  const profileColumns = {
    profile_notes: parsed.data.profileNotes ?? null,
    ...(logoUrl ? { logo_url: logoUrl } : {})
  };

  let updateResult = await admin
    .from("schools")
    .update({ ...basePayload, ...profileColumns })
    .eq("id", schoolId);

  // Environments that haven't run migration 0013 yet miss logo_url and
  // profile_notes — keep the core details rather than failing the save.
  if (
    updateResult.error?.message?.includes("profile_notes") ||
    updateResult.error?.message?.includes("logo_url")
  ) {
    updateResult = await admin.from("schools").update(basePayload).eq("id", schoolId);
  }

  if (updateResult.error) {
    redirect(appendSearchParam(returnTo, "error", "profile-save-failed"));
  }

  // Update the school's primary contact record (falls back to the user's own
  // linked contact when no primary is flagged). Login email is unaffected.
  const primaryContactId =
    ((contacts ?? []).find((contact) => contact.is_primary)?.id as string | undefined) ??
    ((contacts ?? [])[0]?.id as string | undefined);

  if (primaryContactId) {
    await admin
      .from("school_contacts")
      .update({
        full_name: parsed.data.contactName,
        email: parsed.data.contactEmail,
        phone: parsed.data.contactPhone ?? null
      })
      .eq("id", primaryContactId);
  }

  // Keep the login profile in sync so the sidebar and "Welcome back" greeting
  // pick up the new name immediately.
  await admin
    .from("profiles")
    .update({
      full_name: parsed.data.contactName,
      phone: parsed.data.contactPhone ?? null
    })
    .eq("id", actor.id);

  await logAuditEvent(actor.id, "school.profile_updated", "school", schoolId);
  revalidatePath("/school");
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(returnTo, "saved", "profile"));
}

export async function reviewSchoolFeedbackAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/admin/feedback"),
    "/admin/feedback"
  );
  const parsed = schoolFeedbackDecisionSchema.safeParse({
    reviewId: String(formData.get("reviewId") || ""),
    decision: String(formData.get("decision") || ""),
    makePublic: formData.get("makePublic") === "on",
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-feedback-review"));
  }

  const admin = getAdminClientOrThrow();
  const isApproved = parsed.data.decision === "approve";
  const { error } = await admin
    .from("presentation_reviews")
    .update({
      is_approved: isApproved,
      is_public: isApproved ? parsed.data.makePublic ?? false : false
    })
    .eq("id", parsed.data.reviewId);

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "feedback-review-failed"));
  }

  await logAuditEvent(
    actor.id,
    isApproved ? "review.approved" : "review.unapproved",
    "presentation_review",
    parsed.data.reviewId
  );
  updateTag(PUBLIC_CONTENT_TAG);
  revalidatePath("/admin");
  revalidatePath("/staff");
  revalidatePath("/");
  redirect(appendSearchParam(parsed.data.returnTo, "reviewed", parsed.data.decision));
}

export async function requestSchoolBookingChangeAction(formData: FormData) {
  const actor = await requirePortalAccess("school");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/school/bookings"),
    "/school/bookings"
  );
  const parsed = schoolBookingChangeSchema.safeParse({
    bookingRequestId: String(formData.get("bookingRequestId") || ""),
    intent: String(formData.get("intent") || ""),
    notes: String(formData.get("reason") || "") || undefined,
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-change-request"));
  }

  const admin = getAdminClientOrThrow();
  const { data: booking } = await admin
    .from("booking_requests")
    .select("id, reference_code, school_id, primary_contact_id, status, submitted_by_user_id")
    .eq("id", parsed.data.bookingRequestId)
    .maybeSingle();

  if (!booking) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-not-found"));
  }

  const { data: contactUsers } = await admin
    .from("school_contact_users")
    .select("school_contact_id")
    .eq("user_id", actor.id);
  const contactIds = (contactUsers ?? []).map((contact) => contact.school_contact_id as string);
  const { data: contacts } = contactIds.length
    ? await admin.from("school_contacts").select("school_id").in("id", contactIds)
    : { data: [] };
  const schoolIds = new Set((contacts ?? []).map((contact) => contact.school_id as string));

  // Ownership mirrors the school-portal visibility predicate: a booking is
  // theirs when it belongs to one of their schools OR they submitted it.
  if (
    !schoolIds.has(booking.school_id as string) &&
    booking.submitted_by_user_id !== actor.id
  ) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-not-owned"));
  }

  const nextStatus = "cancelled";
  const noteParts = [parsed.data.notes].filter(Boolean);
  const { data: activeSessions } = await admin
    .from("booking_sessions")
    .select(
      "id, status, assigned_ambassador_id, starts_at, ends_at, presentation_type_id"
    )
    .eq("booking_request_id", parsed.data.bookingRequestId)
    .not(
      "status",
      "in",
      "(cancelled,declined,completed_pending_report,report_submitted,payment_pending,paid,closed)"
    );
  const { error } = await admin
    .from("booking_requests")
    .update({
      status: nextStatus,
      requested_different_time: false,
      requested_time_notes: noteParts.join("\n") || null
    })
    .eq("id", parsed.data.bookingRequestId);

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "change-request-failed"));
  }

  if (activeSessions?.length) {
    const { error: sessionError } = await admin
      .from("booking_sessions")
      .update({ status: nextStatus, share_contact_with_ambassador: false })
      .in(
        "id",
        activeSessions.map((session) => session.id as string)
      );

    if (sessionError) {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "change-request-failed"));
    }
  }

  await admin.from("booking_status_history").insert([
    {
      booking_request_id: parsed.data.bookingRequestId,
      old_status: booking.status,
      new_status: nextStatus,
      changed_by: actor.id,
      reason: noteParts.join(" ") || "School cancelled booking"
    },
    ...(activeSessions ?? []).map((session) => ({
      booking_request_id: parsed.data.bookingRequestId,
      booking_session_id: session.id,
      old_status: session.status,
      new_status: nextStatus,
      changed_by: actor.id,
      reason: noteParts.join(" ") || "School cancelled booking"
    }))
  ]);

  await admin.from("booking_activity_logs").insert([
    {
      booking_request_id: parsed.data.bookingRequestId,
      action: "booking.cancelled_by_school",
      actor_id: actor.id,
      actor_type: "school",
      details: { notes: parsed.data.notes ?? null }
    },
    ...(activeSessions ?? []).map((session) => ({
      booking_request_id: parsed.data.bookingRequestId,
      booking_session_id: session.id,
      action: "session.cancelled_by_school",
      actor_id: actor.id,
      actor_type: "school",
      details: { notes: parsed.data.notes ?? null }
    }))
  ]);

  const { data: changeSchool } = await admin.from("schools").select("name")
    .eq("id", booking.school_id).maybeSingle();
  void notifyStaff({
    title: `${(changeSchool?.name as string | null) ?? "A school"} cancelled a booking`,
    body: parsed.data.notes ?? "The school cancelled its booking.",
    type: "booking_cancelled",
    relatedUrl: "/staff/bookings"
  }).catch(() => {});

  scheduleEmail(() => sendSchoolSessionEmails(parsed.data.bookingRequestId,
    (activeSessions ?? []).map((session) => session.id as string), "cancelled"));

  const ambassadorIds = [
    ...new Set(
      (activeSessions ?? [])
        .map((session) => session.assigned_ambassador_id as string | null)
        .filter((id): id is string => Boolean(id))
    )
  ];
  const { data: ambassadorProfiles } = ambassadorIds.length
    ? await admin.from("ambassador_profiles").select("user_id").in("id", ambassadorIds)
    : { data: [] };

  for (const ambassadorProfile of ambassadorProfiles ?? []) {
    if (!ambassadorProfile.user_id) {
      continue;
    }

    void notifyUser(ambassadorProfile.user_id as string, {
      title: "Booking cancelled",
      body: `${(changeSchool?.name as string | null) ?? "A school"} cancelled an assigned booking.`,
      type: "booking_cancelled",
      relatedUrl: "/ambassador/upcoming"
    }).catch(() => {});
  }

  await logAuditEvent(
    actor.id,
    "booking.cancelled_by_school",
    "booking_request",
    parsed.data.bookingRequestId
  );
  revalidatePath("/school");
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/ambassador");
  redirect(appendSearchParam(parsed.data.returnTo, "cancelled", "1"));
}

export async function requestSchoolSessionRescheduleAction(formData: FormData) {
  const actor = await requirePortalAccess("school");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/school/bookings"),
    "/school/bookings"
  );
  const parsed = schoolSessionRescheduleSchema.safeParse({
    bookingRequestId: String(formData.get("bookingRequestId") || ""),
    bookingSessionId: String(formData.get("bookingSessionId") || ""),
    preferredDate: String(formData.get("preferredDate") || ""),
    notes: String(formData.get("notes") || ""),
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-reschedule-request"));
  }

  const availability = await loadAvailabilityConfig();

  if (
    !isWithinBookingWindow(parsed.data.preferredDate) ||
    !isBookableDate(parsed.data.preferredDate, availability)
  ) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "reschedule-date-unavailable"));
  }

  const admin = getAdminClientOrThrow();
  const { data: session } = await admin
    .from("booking_sessions")
    .select("id, booking_request_id, school_id, status, starts_at")
    .eq("id", parsed.data.bookingSessionId)
    .maybeSingle();

  const requestableStatuses = new Set([
    "requested",
    "tentative",
    "applied",
    "ambassador_assigned",
    "confirmed"
  ]);

  if (
    !session ||
    session.booking_request_id !== parsed.data.bookingRequestId ||
    !requestableStatuses.has(session.status as string) ||
    new Date(session.starts_at as string).getTime() <= Date.now()
  ) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-reschedulable"));
  }

  const [{ data: contactUsers }, { data: rescheduleBooking }] = await Promise.all([
    admin.from("school_contact_users").select("school_contact_id").eq("user_id", actor.id),
    admin
      .from("booking_requests")
      .select("submitted_by_user_id")
      .eq("id", parsed.data.bookingRequestId)
      .maybeSingle()
  ]);
  const contactIds = (contactUsers ?? []).map((contact) => contact.school_contact_id as string);
  const { data: contacts } = contactIds.length
    ? await admin.from("school_contacts").select("school_id").in("id", contactIds)
    : { data: [] };
  const schoolIds = new Set((contacts ?? []).map((contact) => contact.school_id as string));

  // Ownership mirrors the school-portal visibility predicate: a booking is
  // theirs when it belongs to one of their schools OR they submitted it.
  if (
    !schoolIds.has(session.school_id as string) &&
    rescheduleBooking?.submitted_by_user_id !== actor.id
  ) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-not-owned"));
  }

  const requestedAt = new Date().toISOString();
  const previousStatus = session.status as string;
  const { error } = await admin
    .from("booking_sessions")
    .update({
      status: "reschedule_requested",
      reschedule_requested_date: parsed.data.preferredDate,
      reschedule_request_notes: parsed.data.notes,
      reschedule_requested_at: requestedAt,
      reschedule_previous_status: previousStatus
    })
    .eq("id", parsed.data.bookingSessionId)
    .eq("status", previousStatus);

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "change-request-failed"));
  }

  await Promise.all([
    admin.from("booking_status_history").insert({
      booking_request_id: parsed.data.bookingRequestId,
      booking_session_id: parsed.data.bookingSessionId,
      old_status: previousStatus,
      new_status: "reschedule_requested",
      changed_by: actor.id,
      reason: `${parsed.data.preferredDate}: ${parsed.data.notes}`
    }),
    admin.from("booking_activity_logs").insert({
      booking_request_id: parsed.data.bookingRequestId,
      booking_session_id: parsed.data.bookingSessionId,
      action: "session.reschedule_requested",
      actor_id: actor.id,
      actor_type: "school",
      details: {
        preferred_date: parsed.data.preferredDate,
        notes: parsed.data.notes,
        previous_status: previousStatus
      }
    })
  ]);

  const { data: school } = await admin
    .from("schools")
    .select("name")
    .eq("id", session.school_id)
    .maybeSingle();

  void notifyStaff({
    title: `${(school?.name as string | null) ?? "A school"} requested a reschedule`,
    body: `Preferred date ${parsed.data.preferredDate}. ${parsed.data.notes}`,
    type: "booking_reschedule_requested",
    relatedUrl: `/staff/bookings?booking=${parsed.data.bookingRequestId}`
  }).catch(() => {});

  scheduleEmail(() => sendSchoolSessionEmails(parsed.data.bookingRequestId,
    [parsed.data.bookingSessionId], "reschedule_requested", parsed.data.preferredDate));

  await logAuditEvent(
    actor.id,
    "session.reschedule_requested",
    "booking_session",
    parsed.data.bookingSessionId
  );
  revalidatePath("/school");
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(parsed.data.returnTo, "requested", "reschedule"));
}

export async function resolveSessionRescheduleAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/bookings"),
    "/staff/bookings"
  );
  const parsed = sessionRescheduleResolutionSchema.safeParse({
    bookingSessionId: String(formData.get("bookingSessionId") || ""),
    decision: String(formData.get("decision") || ""),
    finalDate: String(formData.get("finalDate") || "") || undefined,
    finalTime: String(formData.get("finalTime") || "") || undefined,
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-reschedule-resolution"));
  }

  const admin = getAdminClientOrThrow();
  const { data: session } = await admin
    .from("booking_sessions")
    .select(
      "id, booking_request_id, school_id, presentation_type_id, assigned_ambassador_id, status, starts_at, ends_at, reschedule_previous_status"
    )
    .eq("id", parsed.data.bookingSessionId)
    .maybeSingle();

  if (!session || session.status !== "reschedule_requested") {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "no-reschedule-pending"));
  }

  const previousStatus = String(
    session.reschedule_previous_status ||
      (session.assigned_ambassador_id ? "ambassador_assigned" : "tentative")
  );
  const updatePayload: Record<string, string | null> = {
    status: previousStatus,
    reschedule_requested_date: null,
    reschedule_request_notes: null,
    reschedule_requested_at: null,
    reschedule_previous_status: null
  };
  let finalStartsAt = session.starts_at as string;
  let finalEndsAt = session.ends_at as string;

  if (parsed.data.decision === "approve") {
    if (!parsed.data.finalDate || !parsed.data.finalTime) {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "reschedule-date-required"));
    }

    const availability = await loadAvailabilityConfig();

    if (
      !isWithinBookingWindow(parsed.data.finalDate) ||
      !isBookableDate(parsed.data.finalDate, availability)
    ) {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "reschedule-date-unavailable"));
    }

    finalStartsAt = nzDateTimeToIso(parsed.data.finalDate, parsed.data.finalTime);
    const oldDuration = Math.max(
      10 * 60 * 1000,
      new Date(session.ends_at as string).getTime() - new Date(session.starts_at as string).getTime()
    );
    finalEndsAt = new Date(new Date(finalStartsAt).getTime() + oldDuration).toISOString();
    const finalEndTime = new Intl.DateTimeFormat("en-NZ", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "Pacific/Auckland"
    })
      .format(new Date(finalEndsAt))
      .replace("24:", "00:");

    if (
      !isBookableSessionTime(
        parsed.data.finalDate,
        parsed.data.finalTime,
        finalEndTime,
        availability
      )
    ) {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "reschedule-time-unavailable"));
    }

    updatePayload.starts_at = finalStartsAt;
    updatePayload.ends_at = finalEndsAt;
  }

  const { error } = await admin
    .from("booking_sessions")
    .update(updatePayload)
    .eq("id", parsed.data.bookingSessionId)
    .eq("status", "reschedule_requested");

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "reschedule-resolution-failed"));
  }

  await Promise.all([
    admin.from("booking_status_history").insert({
      booking_request_id: session.booking_request_id,
      booking_session_id: session.id,
      old_status: "reschedule_requested",
      new_status: previousStatus,
      changed_by: actor.id,
      reason: `Reschedule request ${parsed.data.decision}d`
    }),
    admin.from("booking_activity_logs").insert({
      booking_request_id: session.booking_request_id,
      booking_session_id: session.id,
      action: `session.reschedule_${parsed.data.decision}d`,
      actor_id: actor.id,
      actor_type: "staff",
      details: {
        previous_starts_at: session.starts_at,
        previous_ends_at: session.ends_at,
        starts_at: finalStartsAt,
        ends_at: finalEndsAt,
        restored_status: previousStatus
      }
    })
  ]);

  const [
    { data: school },
    { data: contact }
  ] = await Promise.all([
    admin.from("schools").select("name, address").eq("id", session.school_id).maybeSingle(),
    admin
      .from("school_contacts")
      .select("id, full_name, email")
      .eq("school_id", session.school_id)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (contact?.id) {
    const { data: contactLinks } = await admin
      .from("school_contact_users")
      .select("user_id")
      .eq("school_contact_id", contact.id);

    for (const link of contactLinks ?? []) {
      void notifyUser(link.user_id as string, {
        title:
          parsed.data.decision === "approve"
            ? "Your reschedule request was approved"
            : "Your reschedule request was declined",
        body:
          parsed.data.decision === "approve"
            ? `Your session is now scheduled for ${formatDateTime(finalStartsAt)}.`
            : "The original session date and time are unchanged.",
        type: `session_reschedule_${parsed.data.decision}d`,
        relatedUrl: `/school/bookings/${session.booking_request_id}`
      }).catch(() => {});
    }
  }

  scheduleEmail(() => sendSchoolSessionEmails(session.booking_request_id as string,
    [session.id as string], parsed.data.decision === "approve" ? "rescheduled" : "reschedule_declined"));

  if (parsed.data.decision === "approve") {
    void syncSessionToCalendar({
      bookingSessionId: session.id as string,
      title: `Esports Session - ${(school?.name as string | null) ?? "School"}`,
      startsAt: finalStartsAt,
      endsAt: finalEndsAt,
      schoolName: (school?.name as string | null) ?? "School",
      schoolAddress: (school?.address as string | null) ?? "",
      ambassadorName: "Assigned ambassador"
    }).catch(() => {});
  }

  await logAuditEvent(
    actor.id,
    `session.reschedule_${parsed.data.decision}d`,
    "booking_session",
    parsed.data.bookingSessionId
  );
  updateTag(AVAILABILITY_DATA_TAG);
  revalidatePath("/school");
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(parsed.data.returnTo, "resolved", parsed.data.decision));
}

export async function resolveSessionWithdrawalAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/bookings"),
    "/staff/bookings"
  );
  const parsed = sessionWithdrawalResolveSchema.safeParse({
    bookingSessionId: String(formData.get("bookingSessionId") || ""),
    decision: String(formData.get("decision") || ""),
    note: String(formData.get("note") || "") || undefined,
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-withdrawal-resolution"));
  }

  const admin = getAdminClientOrThrow();
  const { data: session } = await admin
    .from("booking_sessions")
    .select(
      "id, booking_request_id, assigned_ambassador_id, status, starts_at, school_id, presentation_type_id, withdrawal_reason"
    )
    .eq("id", parsed.data.bookingSessionId)
    .maybeSingle();

  if (!session || session.status !== "withdrawal_requested") {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "no-withdrawal-pending"));
  }

  const { data: latestWithdrawalHistory } = await admin
    .from("booking_status_history")
    .select("old_status")
    .eq("booking_session_id", parsed.data.bookingSessionId)
    .eq("new_status", "withdrawal_requested")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const priorStatus =
    typeof latestWithdrawalHistory?.old_status === "string" &&
    ["ambassador_assigned", "confirmed"].includes(latestWithdrawalHistory.old_status)
      ? latestWithdrawalHistory.old_status
      : "ambassador_assigned";
  const assignedAmbassadorId = session.assigned_ambassador_id as string | null;
  const [{ data: ambassadorProfile }, { data: school }, { data: presentation }] = await Promise.all([
    assignedAmbassadorId
      ? admin
          .from("ambassador_profiles")
          .select("id, user_id")
          .eq("id", assignedAmbassadorId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    session.school_id
      ? admin.from("schools").select("name").eq("id", session.school_id).maybeSingle()
      : Promise.resolve({ data: null }),
    session.presentation_type_id
      ? admin
          .from("presentation_types")
          .select("title")
          .eq("id", session.presentation_type_id)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ]);
  const { data: ambassadorUser } = ambassadorProfile?.user_id
    ? await admin
        .from("profiles")
        .select("email, full_name")
        .eq("id", ambassadorProfile.user_id)
        .maybeSingle()
    : { data: null };

  const approved = parsed.data.decision === "approve";
  const nextStatus = approved ? "tentative" : priorStatus;
  const { data: updatedSession, error: updateError } = await admin
    .from("booking_sessions")
    .update({
      status: nextStatus,
      assigned_ambassador_id: approved ? null : assignedAmbassadorId,
      ...(approved ? { share_contact_with_ambassador: false } : {}),
      withdrawal_reason: null,
      withdrawal_requested_at: null
    })
    .eq("id", parsed.data.bookingSessionId)
    .eq("status", "withdrawal_requested")
    .select("id")
    .maybeSingle();

  if (updateError || !updatedSession) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "no-withdrawal-pending"));
  }

  if (approved && assignedAmbassadorId) {
    await admin
      .from("booking_session_applications")
      .update({
        status: "withdrawn",
        reviewed_at: new Date().toISOString(),
        reviewed_by: actor.id
      })
      .eq("booking_session_id", parsed.data.bookingSessionId)
      .eq("ambassador_profile_id", assignedAmbassadorId);
  }

  await admin.from("booking_status_history").insert({
    booking_request_id: session.booking_request_id,
    booking_session_id: parsed.data.bookingSessionId,
    old_status: "withdrawal_requested",
    new_status: nextStatus,
    changed_by: actor.id,
    reason:
      parsed.data.note ||
      (approved ? "Withdrawal approved by staff" : "Withdrawal declined by staff")
  });

  await admin.from("booking_activity_logs").insert({
    booking_request_id: session.booking_request_id,
    booking_session_id: parsed.data.bookingSessionId,
    action: approved ? "session.withdrawal_approved" : "session.withdrawal_declined",
    actor_id: actor.id,
    actor_type: "staff",
    details: {
      ambassador_profile_id: assignedAmbassadorId,
      original_reason: session.withdrawal_reason,
      note: parsed.data.note ?? null,
      restored_status: approved ? null : priorStatus
    }
  });

  if (ambassadorProfile?.user_id) {
    void notifyUser(ambassadorProfile.user_id as string, {
      title: approved ? "Withdrawal approved" : "Withdrawal declined",
      body: approved
        ? `${(presentation?.title as string | null) ?? "Your session"} has been reopened for another ambassador.`
        : `You remain assigned to ${(presentation?.title as string | null) ?? "the session"}.${parsed.data.note ? ` Note from staff: ${parsed.data.note}` : ""}`,
      type: approved ? "session_withdrawal_approved" : "session_withdrawal_declined",
      relatedUrl: approved ? "/ambassador/open-bookings" : "/ambassador/upcoming"
    }).catch(() => {});
  }

  if (ambassadorUser?.email) {
    scheduleEmail(() => sendAmbassadorWithdrawalResolvedEmail({
      ambassadorEmail: ambassadorUser.email as string,
      ambassadorName: (ambassadorUser.full_name as string | null) ?? "Ambassador",
      schoolName: (school?.name as string | null) ?? "School",
      sessionDate: formatDateTime(session.starts_at as string),
      presentationTitle: (presentation?.title as string | null) ?? "Presentation",
      decision: approved ? "approved" : "declined",
      staffNote: parsed.data.note,
      bookingSessionId: parsed.data.bookingSessionId
    }));
  }

  await logAuditEvent(
    actor.id,
    approved ? "session.withdrawal_approved" : "session.withdrawal_declined",
    "booking_session",
    parsed.data.bookingSessionId
  );
  if (approved && session.booking_request_id) {
    await refreshPreConfirmationBookingStatus({
      admin,
      bookingRequestId: session.booking_request_id as string,
      actorId: actor.id,
      actorType: "staff",
      reason: "Ambassador withdrawal changed assignment coverage"
    });
  }
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/ambassador");
  revalidatePath("/school");
  redirect(appendSearchParam(parsed.data.returnTo, "withdrawal", approved ? "approved" : "declined"));
}

export async function assignAmbassadorAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/bookings"),
    "/staff/bookings"
  );
  const ambassadorProfileIds = formData.getAll("ambassadorProfileId");
  const parsed = assignAmbassadorSchema.safeParse({
    bookingSessionId: String(formData.get("bookingSessionId") || ""),
    ambassadorProfileId: String(ambassadorProfileIds.at(-1) || ""),
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-assign"));
  }

  const admin = getAdminClientOrThrow();
  const { data: currentSession } = await admin
    .from("booking_sessions")
    .select(
      "id, booking_request_id, status, assigned_ambassador_id, starts_at, ends_at, school_id, presentation_type_id"
    )
    .eq("id", parsed.data.bookingSessionId)
    .maybeSingle();

  if (!currentSession) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-found"));
  }

  const previousAmbassadorId = (currentSession.assigned_ambassador_id as string | null) ?? null;

  if (!parsed.data.ambassadorProfileId) {
    if (!previousAmbassadorId) {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-assigned"));
    }

    const { count: activeApplicationCount } = await admin
      .from("booking_session_applications")
      .select("id", { count: "exact", head: true })
      .eq("booking_session_id", parsed.data.bookingSessionId)
      .eq("status", "applied");
    const nextStatus = (activeApplicationCount ?? 0) > 0 ? "applied" : "tentative";
    const { data: unassignedSession, error: unassignError } = await admin
      .from("booking_sessions")
      .update({
        assigned_ambassador_id: null,
        share_contact_with_ambassador: false,
        status: nextStatus,
        withdrawal_reason: null,
        withdrawal_requested_at: null
      })
      .eq("id", parsed.data.bookingSessionId)
      .eq("assigned_ambassador_id", previousAmbassadorId)
      .select("id")
      .maybeSingle();

    if (unassignError || !unassignedSession) {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "unassign-failed"));
    }

    await Promise.all([
      admin
        .from("booking_session_applications")
        .update({
          status: "withdrawn",
          reviewed_at: new Date().toISOString(),
          reviewed_by: actor.id
        })
        .eq("booking_session_id", parsed.data.bookingSessionId)
        .eq("ambassador_profile_id", previousAmbassadorId)
        .eq("status", "accepted"),
      admin.from("booking_status_history").insert({
        booking_request_id: currentSession.booking_request_id,
        booking_session_id: parsed.data.bookingSessionId,
        old_status: currentSession.status,
        new_status: nextStatus,
        changed_by: actor.id,
        reason: "Ambassador unassigned by staff"
      }),
      admin.from("booking_activity_logs").insert({
        booking_request_id: currentSession.booking_request_id,
        booking_session_id: parsed.data.bookingSessionId,
        action: "session.ambassador_unassigned",
        actor_id: actor.id,
        actor_type: "staff",
        details: { previous_ambassador_profile_id: previousAmbassadorId }
      })
    ]);

    const [{ data: previousProfile }, { data: school }, { data: presentation }] =
      await Promise.all([
        admin
          .from("ambassador_profiles")
          .select("user_id")
          .eq("id", previousAmbassadorId)
          .maybeSingle(),
        currentSession.school_id
          ? admin
              .from("schools")
              .select("name")
              .eq("id", currentSession.school_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        currentSession.presentation_type_id
          ? admin
              .from("presentation_types")
              .select("title")
              .eq("id", currentSession.presentation_type_id)
              .maybeSingle()
          : Promise.resolve({ data: null })
      ]);

    if (previousProfile?.user_id) {
      void notifyUser(previousProfile.user_id as string, {
        title: "You are no longer assigned",
        body: `${(presentation?.title as string | null) ?? "The session"} at ${(school?.name as string | null) ?? "a school"} was removed from your assignments.`,
        type: "session_unassigned",
        relatedUrl: "/ambassador/upcoming"
      }).catch(() => {});
    }

    await refreshPreConfirmationBookingStatus({
      admin,
      bookingRequestId: currentSession.booking_request_id as string,
      actorId: actor.id,
      actorType: "staff",
      reason: "Ambassador assignment changed"
    });
    await logAuditEvent(
      actor.id,
      "session.ambassador_unassigned",
      "booking_session",
      parsed.data.bookingSessionId
    );
    revalidatePath("/staff");
    revalidatePath("/admin");
    revalidatePath("/ambassador");
    revalidatePath("/school");
    redirect(appendSearchParam(parsed.data.returnTo, "unassigned", "1"));
  }

  const replacingPendingWithdrawal =
    currentSession.status === "withdrawal_requested" &&
    previousAmbassadorId &&
    previousAmbassadorId !== parsed.data.ambassadorProfileId;
  const { data: appliedApplications } = await admin
    .from("booking_session_applications")
    .select("ambassador_profile_id")
    .eq("booking_session_id", parsed.data.bookingSessionId)
    .eq("status", "applied")
    .neq("ambassador_profile_id", parsed.data.ambassadorProfileId);
  const declinedApplicantIds = [
    ...new Set((appliedApplications ?? []).map((application) => application.ambassador_profile_id as string))
  ];
  const { data: declinedApplicantProfiles } = declinedApplicantIds.length
    ? await admin
        .from("ambassador_profiles")
        .select("id, user_id")
        .in("id", declinedApplicantIds)
    : { data: [] };

  const assignableStatuses = [
    "tentative",
    "applied",
    "ambassador_assigned",
    "confirmed",
    "withdrawal_requested",
    "reschedule_requested"
  ];
  const assignedStatus = ["confirmed", "reschedule_requested"].includes(
    String(currentSession.status)
  )
    ? String(currentSession.status)
    : "ambassador_assigned";
  const { data: assignedSession, error } = await admin
    .from("booking_sessions")
    .update({
      assigned_ambassador_id: parsed.data.ambassadorProfileId,
      share_contact_with_ambassador: true,
      status: assignedStatus,
      withdrawal_reason: null,
      withdrawal_requested_at: null
    })
    .eq("id", parsed.data.bookingSessionId)
    .in("status", assignableStatuses)
    .select("id")
    .maybeSingle();

  if (error || !assignedSession) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "assign-failed"));
  }

  await admin
    .from("booking_session_applications")
    .update({
      status: "accepted",
      reviewed_at: new Date().toISOString(),
      reviewed_by: actor.id
    })
    .eq("booking_session_id", parsed.data.bookingSessionId)
    .eq("ambassador_profile_id", parsed.data.ambassadorProfileId);

  await admin
    .from("booking_session_applications")
    .update({
      status: "declined",
      reviewed_at: new Date().toISOString(),
      reviewed_by: actor.id
    })
    .eq("booking_session_id", parsed.data.bookingSessionId)
    .eq("status", "applied")
    .neq("ambassador_profile_id", parsed.data.ambassadorProfileId);

  if (replacingPendingWithdrawal && previousAmbassadorId) {
    await admin
      .from("booking_session_applications")
      .update({
        status: "withdrawn",
        reviewed_at: new Date().toISOString(),
        reviewed_by: actor.id
      })
      .eq("booking_session_id", parsed.data.bookingSessionId)
      .eq("ambassador_profile_id", previousAmbassadorId);
  }

  await admin.from("booking_status_history").insert({
    booking_request_id: currentSession.booking_request_id,
    booking_session_id: parsed.data.bookingSessionId,
    old_status: currentSession.status,
    new_status: assignedStatus,
    changed_by: actor.id,
    reason: "Ambassador manually assigned by staff"
  });

  await admin.from("booking_activity_logs").insert({
    booking_session_id: parsed.data.bookingSessionId,
    action: "session.ambassador_assigned",
    actor_id: actor.id,
    actor_type: "staff",
    details: {
      ambassador_profile_id: parsed.data.ambassadorProfileId,
      previous_ambassador_profile_id: previousAmbassadorId
    }
  });

  const { data: session } = await admin
    .from("booking_sessions")
    .select("id, booking_request_id, starts_at, ends_at, school_id, presentation_type_id")
    .eq("id", parsed.data.bookingSessionId)
    .maybeSingle();
  const { data: school } = session?.school_id
    ? await admin.from("schools").select("name, address").eq("id", session.school_id).maybeSingle()
    : { data: null };
  const { data: presentation } = session?.presentation_type_id
    ? await admin.from("presentation_types").select("title").eq("id", session.presentation_type_id).maybeSingle()
    : { data: null };
  const { data: ambassadorProfile } = await admin
    .from("ambassador_profiles")
    .select("user_id")
    .eq("id", parsed.data.ambassadorProfileId)
    .maybeSingle();
  const { data: ambassadorUser } = ambassadorProfile?.user_id
    ? await admin
        .from("profiles")
        .select("email, full_name")
        .eq("id", ambassadorProfile.user_id)
        .maybeSingle()
    : { data: null };
  const { data: previousAmbassadorProfile } = replacingPendingWithdrawal && previousAmbassadorId
    ? await admin
        .from("ambassador_profiles")
        .select("user_id")
        .eq("id", previousAmbassadorId)
        .maybeSingle()
    : { data: null };

  if (session && school && presentation && ambassadorUser?.email) {
    scheduleEmail(() => sendAmbassadorAssignedEmail({
      ambassadorEmail: ambassadorUser.email as string,
      ambassadorName: (ambassadorUser.full_name as string | null) ?? "Ambassador",
      schoolName: (school.name as string | null) ?? "School",
      sessionDate: formatDateTime(session.starts_at as string),
      sessionAddress: (school.address as string | null) ?? "",
      presentationTitle: (presentation.title as string | null) ?? "Presentation",
      bookingSessionId: parsed.data.bookingSessionId
    }));

    void syncSessionToCalendar({
      bookingSessionId: parsed.data.bookingSessionId,
      title: `Esports Session - ${(school.name as string | null) ?? "School"}`,
      startsAt: session.starts_at as string,
      endsAt: session.ends_at as string,
      schoolName: (school.name as string | null) ?? "School",
      schoolAddress: (school.address as string | null) ?? "",
      ambassadorName: (ambassadorUser.full_name as string | null) ?? "Ambassador"
    }).catch(() => {});
  }

  if (ambassadorProfile?.user_id) {
    void notifyUser(ambassadorProfile.user_id as string, {
      title: `You've been assigned: ${(presentation?.title as string | null) ?? "Presentation"}`,
      body: `${(school?.name as string | null) ?? "A school"} on ${session?.starts_at ? formatDateTime(session.starts_at as string) : "the scheduled date"}.`,
      type: "session_assigned",
      relatedUrl: "/ambassador/upcoming"
    }).catch(() => {});
  }

  for (const declinedProfile of declinedApplicantProfiles ?? []) {
    const userId = declinedProfile.user_id as string | null;

    if (!userId) {
      continue;
    }

    void notifyUser(userId, {
      title: "Session filled",
      body: `${(presentation?.title as string | null) ?? "This session"} at ${(school?.name as string | null) ?? "a school"} has been assigned to another ambassador.`,
      type: "session_application_declined",
      relatedUrl: "/ambassador/open-bookings"
    }).catch(() => {});
  }

  if (previousAmbassadorProfile?.user_id) {
    void notifyUser(previousAmbassadorProfile.user_id as string, {
      title: "Withdrawal approved through reassignment",
      body: `${(presentation?.title as string | null) ?? "Your session"} has been assigned to another ambassador.`,
      type: "session_withdrawal_approved",
      relatedUrl: "/ambassador/open-bookings"
    }).catch(() => {});
  }

  await logAuditEvent(
    actor.id,
    "session.ambassador_assigned",
    "booking_session",
    parsed.data.bookingSessionId
  );
  await refreshPreConfirmationBookingStatus({
    admin,
    bookingRequestId: currentSession.booking_request_id as string,
    actorId: actor.id,
    actorType: "staff",
    reason: "Ambassador assignment changed"
  });
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/ambassador");
  revalidatePath("/school");
  redirect(appendSearchParam(parsed.data.returnTo, "assigned", "1"));
}

export async function updateBookingStatusAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/bookings"),
    "/staff/bookings"
  );
  const parsed = updateBookingStatusSchema.safeParse({
    bookingRequestId: String(formData.get("bookingRequestId") || ""),
    status: String(formData.get("status") || ""),
    reason: String(formData.get("reason") || "").trim() || undefined,
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-status"));
  }

  const admin = getAdminClientOrThrow();
  const { data: existingBooking } = await admin
    .from("booking_requests")
    .select("id, reference_code, status, school_id, primary_contact_id, internal_notes")
    .eq("id", parsed.data.bookingRequestId)
    .maybeSingle();

  if (!existingBooking) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-not-found"));
  }

  // A booking can't be marked delivered/completed before its sessions have
  // actually happened.
  const completionStatuses = [
    "completed_pending_report",
    "report_submitted",
    "payment_pending",
    "paid",
    "closed"
  ];

  if (completionStatuses.includes(parsed.data.status)) {
    const { data: lastSession } = await admin
      .from("booking_sessions")
      .select("ends_at")
      .eq("booking_request_id", parsed.data.bookingRequestId)
      .not("status", "in", "(cancelled,declined)")
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastSession && new Date(lastSession.ends_at as string).getTime() > Date.now()) {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "cannot-complete-future"));
    }
  }

  const bookingUpdate: Record<string, string> = { status: parsed.data.status };

  if (parsed.data.reason) {
    const existingInternalNotes = String(existingBooking.internal_notes || "").trim();
    bookingUpdate.internal_notes = existingInternalNotes
      ? `${existingInternalNotes}\n${parsed.data.reason}`
      : parsed.data.reason;
  }

  const { error } = await admin
    .from("booking_requests")
    .update(bookingUpdate)
    .eq("id", parsed.data.bookingRequestId);

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "status-update-failed"));
  }

  const cascade = SESSION_CASCADE[parsed.data.status];
  let affectedSessionIds: string[] = [];

  if (cascade) {
    let sessionUpdate = admin
      .from("booking_sessions")
      .update({ status: cascade.to })
      .eq("booking_request_id", parsed.data.bookingRequestId);

    if (cascade.onlyFrom) {
      sessionUpdate = sessionUpdate.in("status", cascade.onlyFrom);
    }

    const { data: changedSessions, error: cascadeError } = await sessionUpdate.select("id");
    affectedSessionIds = (changedSessions ?? []).map((session) => session.id as string);

    if (cascadeError) {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "status-update-failed"));
    }
  }

  await admin.from("booking_status_history").insert({
    booking_request_id: parsed.data.bookingRequestId,
    new_status: parsed.data.status,
    changed_by: actor.id,
    reason: parsed.data.reason || `Status updated to ${parsed.data.status}`
  });

  await admin.from("booking_activity_logs").insert({
    booking_request_id: parsed.data.bookingRequestId,
    action: "booking.status_updated",
    actor_id: actor.id,
    actor_type: "staff",
    details: { status: parsed.data.status }
  });

  if (parsed.data.status === "confirmed" || parsed.data.status === "cancelled") {
    const event = parsed.data.status === "cancelled" ? "cancelled"
      : existingBooking.status === "reschedule_requested" ? "rescheduled" : "confirmed";
    scheduleEmail(() => sendSchoolSessionEmails(parsed.data.bookingRequestId, affectedSessionIds, event));
  }
  if (parsed.data.status === "completed_pending_report" && existingBooking.status !== parsed.data.status) {
    const { data: sessions } = await admin.from("booking_sessions").select("id")
      .eq("booking_request_id", parsed.data.bookingRequestId)
      .not("status", "in", "(cancelled,declined)");
    scheduleEmail(() => sendSchoolSessionEmails(parsed.data.bookingRequestId,
      (sessions ?? []).map((session) => session.id as string), "feedback"));
  }

  await logAuditEvent(
    actor.id,
    "booking.status_updated",
    "booking_request",
    parsed.data.bookingRequestId
  );
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/school");
  redirect(appendSearchParam(parsed.data.returnTo, "updated", "status"));
}

export async function bulkUpdateBookingStatusAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/bookings"),
    "/staff/bookings"
  );
  const parsed = bulkUpdateBookingStatusSchema.safeParse({
    bookingRequestIds: formData
      .getAll("bookingRequestId")
      .map((value) => String(value))
      .filter(Boolean),
    status: String(formData.get("status") || ""),
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-bulk-status"));
  }

  const admin = getAdminClientOrThrow();
  const { data: existingBookings, error: bookingReadError } = await admin
    .from("booking_requests")
    .select("id")
    .in("id", parsed.data.bookingRequestIds);

  if (bookingReadError || existingBookings.length !== parsed.data.bookingRequestIds.length) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-not-found"));
  }

  if (parsed.data.status === "closed") {
    const { data: futureSessions, error: futureSessionError } = await admin
      .from("booking_sessions")
      .select("id")
      .in("booking_request_id", parsed.data.bookingRequestIds)
      .not("status", "in", "(cancelled,declined)")
      .gt("ends_at", new Date().toISOString())
      .limit(1);

    if (futureSessionError || futureSessions.length > 0) {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "cannot-complete-future"));
    }
  }

  const { error: updateError } = await admin
    .from("booking_requests")
    .update({ status: parsed.data.status })
    .in("id", parsed.data.bookingRequestIds);

  if (updateError) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "status-update-failed"));
  }

  const cascade = SESSION_CASCADE[parsed.data.status];

  if (cascade) {
    let sessionUpdate = admin
      .from("booking_sessions")
      .update({ status: cascade.to })
      .in("booking_request_id", parsed.data.bookingRequestIds);

    if (cascade.onlyFrom) {
      sessionUpdate = sessionUpdate.in("status", cascade.onlyFrom);
    }

    const { data: changedSessions, error: cascadeError } = await sessionUpdate.select("id, booking_request_id");

    if (cascadeError) {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "status-update-failed"));
    }

    if (parsed.data.status === "confirmed" || parsed.data.status === "cancelled") {
      const event = parsed.data.status;
      for (const bookingId of parsed.data.bookingRequestIds) {
        const ids = (changedSessions ?? []).filter((session) => session.booking_request_id === bookingId)
          .map((session) => session.id as string);
        if (ids.length) scheduleEmail(() => sendSchoolSessionEmails(bookingId, ids, event));
      }
    }
  }

  const changedAt = new Date().toISOString();
  const { error: historyError } = await admin.from("booking_status_history").insert(
    parsed.data.bookingRequestIds.map((bookingRequestId) => ({
      booking_request_id: bookingRequestId,
      new_status: parsed.data.status,
      changed_by: actor.id,
      reason: `Bulk status update to ${parsed.data.status}`,
      created_at: changedAt
    }))
  );
  const { error: activityError } = await admin.from("booking_activity_logs").insert(
    parsed.data.bookingRequestIds.map((bookingRequestId) => ({
      booking_request_id: bookingRequestId,
      action: "booking.status_updated",
      actor_id: actor.id,
      actor_type: "staff",
      details: { status: parsed.data.status, bulk: true },
      created_at: changedAt
    }))
  );

  if (historyError || activityError) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "status-update-failed"));
  }

  await Promise.all(
    parsed.data.bookingRequestIds.map((bookingRequestId) =>
      logAuditEvent(actor.id, "booking.status_updated", "booking_request", bookingRequestId)
    )
  );
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/school");
  redirect(appendSearchParam(parsed.data.returnTo, "updated", "bulk-status"));
}

export async function removeBookingInternalNoteAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/bookings"),
    "/staff/bookings"
  );
  const parsed = removeBookingInternalNoteSchema.safeParse({
    bookingRequestId: String(formData.get("bookingRequestId") || ""),
    noteIndex: String(formData.get("noteIndex") || ""),
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-note"));
  }

  const admin = getAdminClientOrThrow();
  const { data: booking } = await admin
    .from("booking_requests")
    .select("id, internal_notes")
    .eq("id", parsed.data.bookingRequestId)
    .maybeSingle();

  if (!booking) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-not-found"));
  }

  const notes = String(booking.internal_notes || "")
    .split(/\r?\n/)
    .map((note) => note.trim())
    .filter(Boolean);

  if (parsed.data.noteIndex >= notes.length) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "note-not-found"));
  }

  notes.splice(parsed.data.noteIndex, 1);

  const { error } = await admin
    .from("booking_requests")
    .update({ internal_notes: notes.length ? notes.join("\n") : null })
    .eq("id", parsed.data.bookingRequestId);

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "note-remove-failed"));
  }

  await admin.from("booking_activity_logs").insert({
    booking_request_id: parsed.data.bookingRequestId,
    action: "booking.internal_note_removed",
    actor_id: actor.id,
    actor_type: "staff",
    details: { noteIndex: parsed.data.noteIndex }
  });

  await logAuditEvent(
    actor.id,
    "booking.internal_note_removed",
    "booking_request",
    parsed.data.bookingRequestId
  );
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(parsed.data.returnTo, "removed", "note"));
}

export async function saveResourceAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/resources"),
    "/staff/resources"
  );

  if (formData.get("intent") === "delete") {
    const resourceId = z.uuid().safeParse(String(formData.get("id") || ""));

    if (!resourceId.success) {
      redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-resource"));
    }

    const admin = getAdminClientOrThrow();
    const { data: resource, error: resourceError } = await admin
      .from("presentation_resources")
      .select("storage_path")
      .eq("id", resourceId.data)
      .maybeSingle();

    if (resourceError || !resource) {
      redirect(appendSearchParam(fallbackReturnTo, "error", "resource-delete-failed"));
    }

    const { error: deleteError } = await admin
      .from("presentation_resources")
      .delete()
      .eq("id", resourceId.data);

    if (deleteError) {
      redirect(appendSearchParam(fallbackReturnTo, "error", "resource-delete-failed"));
    }

    if (resource.storage_path) {
      await deletePrivateResourceFile(resource.storage_path as string);
    }

    await logAuditEvent(
      actor.id,
      "resource.deleted",
      "presentation_resource",
      resourceId.data
    );
    updateTag(PUBLIC_CONTENT_TAG);
    revalidatePath("/staff");
    revalidatePath("/admin");
    redirect(appendSearchParam(fallbackReturnTo, "deleted", "resource"));
  }

  const lifecycle = String(formData.get("lifecycle") || "");
  const parsed = resourceSchema.safeParse({
    id: String(formData.get("id") || "") || undefined,
    title: String(formData.get("title") || ""),
    description: String(formData.get("description") || ""),
    audiences: formData.getAll("audiences").map(String),
    sharingScope: String(formData.get("sharingScope") || "internal"),
    tags: splitCommaList(String(formData.get("tags") || "")),
    resourceType: String(formData.get("resourceType") || ""),
    category: String(formData.get("category") || "resource"),
    trainingPackId: String(formData.get("trainingPackId") || "") || undefined,
    presentationTypeId: String(formData.get("presentationTypeId") || "") || undefined,
    versionLabel: String(formData.get("versionLabel") || "") || undefined,
    youtubeUrl: String(formData.get("youtubeUrl") || "") || undefined,
    externalUrl: String(formData.get("externalUrl") || "") || undefined,
    isCurrent: lifecycle ? lifecycle !== "archived" : formData.get("isCurrent") === "on",
    isActive: lifecycle ? lifecycle !== "draft" : formData.get("isActive") === "on",
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-resource"));
  }

  const normalizedCategory = parsed.data.category;
  const normalizedAudiences = ["training", "presentation_material"].includes(normalizedCategory)
    ? parsed.data.audiences.filter(
        (audience) =>
          audience !== "public" &&
          audience !== "staff" &&
          (parsed.data.sharingScope === "public" || audience !== "school")
      )
    : parsed.data.audiences.filter((audience) => audience !== "staff");

  // A resource must keep at least one selectable audience after normalization.
  // Surface the problem instead of silently defaulting to ambassadors, which
  // would publish to an audience the editor never chose. (Reuses the generic
  // invalid-resource code because the error-copy mapping lives in the portal
  // page files.) Checked before the file upload so a rejected submit does not
  // orphan an uploaded file.
  if (normalizedAudiences.length === 0) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "invalid-resource"));
  }

  const file = formData.get("file");
  let storagePath: string | null = null;

  if (file instanceof File && file.size > 0) {
    try {
      const upload = await uploadPrivateResourceFile(file);
      storagePath = upload.storagePath;
    } catch {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "resource-upload-failed"));
    }
  }

  const admin = getAdminClientOrThrow();
  const payload: Record<string, unknown> = {
    title: parsed.data.title,
    description: parsed.data.description || null,
    audiences: normalizedAudiences,
    sharing_scope: parsed.data.sharingScope,
    tags: parsed.data.tags,
    resource_type: parsed.data.resourceType,
    category: normalizedCategory,
    training_pack_id: parsed.data.trainingPackId || null,
    presentation_type_id: parsed.data.presentationTypeId || null,
    version_label: parsed.data.versionLabel || null,
    youtube_url: parsed.data.youtubeUrl || null,
    public_url: parsed.data.externalUrl || null,
    is_current: parsed.data.isCurrent ?? false,
    is_active: parsed.data.isActive ?? false
  };

  if (storagePath || !parsed.data.id) {
    payload.storage_path = storagePath;
  }

  if (!parsed.data.id) {
    payload.created_by = actor.id;
  }

  const runSave = (savePayload: Record<string, unknown>) =>
    parsed.data.id
      ? admin
          .from("presentation_resources")
          .update(savePayload)
          .eq("id", parsed.data.id)
          .select("id")
          .single()
      : admin.from("presentation_resources").insert(savePayload).select("id").single();

  const savePayload = { ...payload };
  let { data, error } = await runSave(savePayload);

  // Environments that haven't run migration 0015 yet lack the category
  // column — retry without it rather than failing the whole save.
  if (error?.message?.includes("category")) {
    delete savePayload.category;
    ({ data, error } = await runSave(savePayload));
  }

  if (error?.message?.includes("training_pack_id")) {
    delete savePayload.training_pack_id;
    ({ data, error } = await runSave(savePayload));
  }

  // Allow saves to continue in local environments that have not applied the
  // sharing-scope migration yet. The portal will treat those rows as internal.
  if (error?.message?.includes("sharing_scope")) {
    delete savePayload.sharing_scope;
    ({ data, error } = await runSave(savePayload));
  }

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "resource-save-failed"));
  }

  const resourceId = parsed.data.id ?? data?.id;
  await logAuditEvent(
    actor.id,
    parsed.data.id ? "resource.updated" : "resource.created",
    "presentation_resource",
    resourceId
  );
  updateTag(PUBLIC_CONTENT_TAG);
  revalidatePath("/staff");
  revalidatePath("/admin");

  if (!parsed.data.id && resourceId && parsed.data.returnTo.endsWith("/new")) {
    redirect(`${parsed.data.returnTo.replace(/\/new$/, `/${resourceId}`)}?saved=resource`);
  }

  redirect(appendSearchParam(parsed.data.returnTo, "saved", "resource"));
}

export async function createTrainingPackAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const returnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/admin/training"),
    "/admin/training"
  );
  const parsed = z
    .object({
      title: z.string().trim().min(2).max(120),
      presentationTypeId: z.uuid().optional()
    })
    .safeParse({
      title: String(formData.get("title") || ""),
      presentationTypeId: String(formData.get("presentationTypeId") || "") || undefined
    });

  if (!parsed.success) {
    redirect(appendSearchParam(returnTo, "error", "invalid-training-pack"));
  }

  const admin = getAdminClientOrThrow();
  const insertPayload = {
    title: parsed.data.title,
    created_by: actor.id,
    ...(parsed.data.presentationTypeId
      ? { presentation_type_id: parsed.data.presentationTypeId }
      : {})
  };
  const { data, error } = await admin
    .from("training_resource_packs")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error?.code === "23505" && parsed.data.presentationTypeId) {
    redirect(appendSearchParam(returnTo, "error", "training-pack-presentation-in-use"));
  }

  if (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    error?.message.toLowerCase().includes("training_resource_packs")
  ) {
    redirect(appendSearchParam(returnTo, "error", "training-pack-storage-missing"));
  }

  if (
    error?.code === "23502" &&
    error.message.toLowerCase().includes("presentation_type_id")
  ) {
    redirect(appendSearchParam(returnTo, "error", "training-pack-optional-link-pending"));
  }

  if (error || !data) {
    redirect(appendSearchParam(returnTo, "error", "training-pack-save-failed"));
  }

  await logAuditEvent(actor.id, "training_pack.created", "training_resource_pack", data.id);
  updateTag(PUBLIC_CONTENT_TAG);
  revalidatePath("/admin/training");
  revalidatePath("/staff/training");
  redirect(appendSearchParam(returnTo, "saved", "training-pack"));
}

export async function deleteTrainingPackAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const returnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/admin/training"),
    "/admin/training"
  );
  const parsed = z
    .object({
      packId: z.uuid(),
      confirmDelete: z.string().trim().min(1).max(20)
    })
    .safeParse({
      packId: String(formData.get("packId") || ""),
      confirmDelete: String(formData.get("confirmDelete") || "")
    });

  if (!parsed.success) {
    redirect(appendSearchParam(returnTo, "error", "invalid-training-pack"));
  }

  const admin = getAdminClientOrThrow();
  const { data: pack, error: packError } = await admin
    .from("training_resource_packs")
    .select("id")
    .eq("id", parsed.data.packId)
    .maybeSingle();

  if (packError || !pack) {
    redirect(appendSearchParam(returnTo, "error", "training-pack-delete-failed"));
  }

  if (parsed.data.confirmDelete.toLowerCase() !== "delete") {
    redirect(appendSearchParam(returnTo, "error", "training-pack-confirmation-mismatch"));
  }

  const { count, error: resourceError } = await admin
    .from("presentation_resources")
    .select("id", { count: "exact", head: true })
    .eq("training_pack_id", parsed.data.packId);

  if (resourceError) {
    redirect(appendSearchParam(returnTo, "error", "training-pack-delete-failed"));
  }

  if ((count ?? 0) > 0) {
    redirect(appendSearchParam(returnTo, "error", "training-pack-not-empty"));
  }

  const { error } = await admin
    .from("training_resource_packs")
    .delete()
    .eq("id", parsed.data.packId);

  if (error) {
    redirect(appendSearchParam(returnTo, "error", "training-pack-delete-failed"));
  }

  await logAuditEvent(
    actor.id,
    "training_pack.deleted",
    "training_resource_pack",
    parsed.data.packId
  );
  updateTag(PUBLIC_CONTENT_TAG);
  revalidatePath("/admin/training");
  revalidatePath("/staff/training");
  redirect(appendSearchParam(returnTo, "deleted", "training-pack"));
}

export async function savePresentationAction(formData: FormData) {
  const actor = await requirePortalAccess("super_admin");
  const intent = String(formData.get("intent") || "publish");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/admin/presentations"),
    "/admin/presentations"
  );
  const parsed = presentationSchema.safeParse({
    id: String(formData.get("id") || "") || undefined,
    title: String(formData.get("title") || ""),
    slug: String(formData.get("slug") || "") || undefined,
    shortSummary: String(formData.get("shortSummary") || ""),
    contentSnippet: String(formData.get("contentSnippet") || ""),
    fullDescription: String(formData.get("fullDescription") || ""),
    yearLevels: String(formData.get("yearLevels") || ""),
    durationMinutes: formData.get("durationMinutes"),
    deliveryFormats: String(formData.get("deliveryFormats") || ""),
    learningOutcomes: String(formData.get("learningOutcomes") || ""),
    requiredEquipment: String(formData.get("requiredEquipment") || ""),
    youtubeUrl: String(formData.get("youtubeUrl") || "").trim(),
    accentColor: String(formData.get("accentColor") || "#18A83B"),
    isPublic: formData.get("isPublic") === "on",
    isActive: formData.get("isActive") === "on",
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(`${fallbackReturnTo}?error=invalid-presentation`);
  }

  const imageFile = formData.get("image");
  let imageUrl: string | null = String(formData.get("existingImageUrl") || "") || null;

  if (imageFile instanceof File && imageFile.size > 0) {
    try {
      const upload = await uploadPublicAsset(imageFile, "presentations");
      imageUrl = upload.publicUrl;
    } catch {
      redirect(`${parsed.data.returnTo}?error=presentation-upload-failed`);
    }
  }

  const admin = getAdminClientOrThrow();
  const slug = slugify(parsed.data.slug || parsed.data.title);
  const payload = {
      title: parsed.data.title,
      slug,
      short_summary: parsed.data.shortSummary || null,
      content_snippet: parsed.data.contentSnippet || null,
      full_description: parsed.data.fullDescription
        ? sanitizeRichText(parsed.data.fullDescription)
        : null,
      year_levels: parsed.data.yearLevels || null,
      duration_minutes: parsed.data.durationMinutes,
      delivery_formats: splitCommaList(parsed.data.deliveryFormats ?? ""),
      learning_outcomes: parsed.data.learningOutcomes?.trim() || null,
      required_equipment: parsed.data.requiredEquipment?.trim() || null,
      youtube_url: parsed.data.youtubeUrl || null,
      accent_color: parsed.data.accentColor,
      is_public: intent === "draft" ? false : (parsed.data.isPublic ?? false),
      is_active: intent === "draft" ? false : (parsed.data.isActive ?? false),
      image_url: imageUrl
    };

  const runSave = (body: Record<string, unknown>) =>
    parsed.data.id
      ? admin.from("presentation_types").update(body).eq("id", parsed.data.id).select("id").single()
      : admin.from("presentation_types").insert(body).select("id").single();

  let { data, error } = await runSave(payload);

  if (error && error.message.includes("youtube_url")) {
    // The 0009_presentation_video migration hasn't been applied yet — save
    // everything except the video link rather than failing the whole edit.
    const withoutVideo: Record<string, unknown> = { ...payload };
    delete withoutVideo.youtube_url;
    ({ data, error } = await runSave(withoutVideo));
  }

  if (error) {
    redirect(`${parsed.data.returnTo}?error=save-failed`);
  }

  const presentationId = parsed.data.id ?? data?.id;
  await logAuditEvent(
    actor.id,
    parsed.data.id ? "presentation.updated" : "presentation.created",
    "presentation_type",
    presentationId
  );
  updateTag(PUBLIC_CONTENT_TAG);
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath(`/presentations/${slug}`);

  if (!parsed.data.id && presentationId && parsed.data.returnTo.endsWith("/new")) {
    redirect(`${parsed.data.returnTo.replace(/\/new$/, `/${presentationId}`)}?saved=presentation`);
  }

  redirect(`${parsed.data.returnTo}?saved=presentation`);
}

export async function saveHomepageSectionAction(formData: FormData) {
  const actor = await requirePortalAccess("super_admin");
  const parsed = homepageSectionSchema.safeParse({
    id: String(formData.get("id") || ""),
    title: String(formData.get("title") || ""),
    subtitle: String(formData.get("subtitle") || ""),
    body: String(formData.get("body") || ""),
    isActive: formData.get("isActive") === "on",
    sortOrder: formData.get("sortOrder")
  });

  if (!parsed.success) {
    redirect("/admin/pages-content?error=invalid-section");
  }

  const imageFile = formData.get("image");
  let imageUrl: string | null = String(formData.get("existingImageUrl") || "") || null;

  if (imageFile instanceof File && imageFile.size > 0) {
    const upload = await uploadPublicAsset(imageFile, "homepage");
    imageUrl = upload.publicUrl;
  }

  const admin = getAdminClientOrThrow();
  const { error } = await admin
    .from("homepage_sections")
    .update({
      title: parsed.data.title || null,
      subtitle: parsed.data.subtitle || null,
      body: parsed.data.body ? sanitizeRichText(parsed.data.body) : null,
      image_url: imageUrl,
      is_active: parsed.data.isActive ?? false,
      sort_order: parsed.data.sortOrder,
      updated_by: actor.id
    })
    .eq("id", parsed.data.id);

  if (error) {
    redirect("/admin/pages-content?error=section-save-failed");
  }

  await logAuditEvent(actor.id, "homepage_section.updated", "homepage_section", parsed.data.id);
  updateTag(PUBLIC_CONTENT_TAG);
  revalidatePath("/admin");
  redirect("/admin/pages-content?saved=section");
}

export async function saveEmailTemplateAction(formData: FormData) {
  const actor = await requirePortalAccess("super_admin");
  const parsed = emailTemplateSchema.safeParse({
    id: String(formData.get("id") || ""),
    subject: String(formData.get("subject") || ""),
    bodyHtml: String(formData.get("bodyHtml") || ""),
    bodyText: String(formData.get("bodyText") || ""),
    isActive: formData.get("isActive") === "on"
  });

  if (!parsed.success) {
    redirect("/admin/email-templates?error=invalid-template");
  }

  const admin = getAdminClientOrThrow();
  const { error } = await admin
    .from("email_templates")
    .update({
      subject: parsed.data.subject,
      // Email-specific sanitizer: keeps button/colour inline styles and hosted
      // images (capped at 560px wide) while stripping anything unsafe.
      body_html: sanitizeEmailHtml(parsed.data.bodyHtml),
      body_text: parsed.data.bodyText || null,
      is_active: parsed.data.isActive ?? false,
      updated_by: actor.id
    })
    .eq("id", parsed.data.id);

  if (error) {
    redirect("/admin/email-templates?error=template-save-failed");
  }

  await logAuditEvent(actor.id, "email_template.updated", "email_template", parsed.data.id);
  revalidatePath("/admin");
  redirect("/admin/email-templates?saved=template");
}

const createEmailTemplateSchema = z.object({
  name: z.string().trim().min(3).max(80),
  subject: z.string().trim().min(3),
  bodyHtml: z.string().min(3),
  isActive: z.boolean().optional()
});

export async function createEmailTemplateAction(formData: FormData) {
  const actor = await requirePortalAccess("super_admin");
  const returnTo = "/admin/email-templates";
  const parsed = createEmailTemplateSchema.safeParse({
    name: String(formData.get("name") || ""),
    subject: String(formData.get("subject") || ""),
    bodyHtml: String(formData.get("bodyHtml") || ""),
    isActive: formData.get("isActive") === "on"
  });

  if (!parsed.success) {
    redirect(appendSearchParam(returnTo, "error", "invalid-template"));
  }

  const templateKey = slugify(parsed.data.name).replaceAll("-", "_");
  const admin = getAdminClientOrThrow();
  const { data: existing } = await admin
    .from("email_templates")
    .select("id")
    .eq("template_key", templateKey)
    .maybeSingle();

  if (existing) {
    redirect(appendSearchParam(returnTo, "error", "template-key-exists"));
  }

  const { data: created, error } = await admin
    .from("email_templates")
    .insert({
      template_key: templateKey,
      name: parsed.data.name,
      subject: parsed.data.subject,
      body_html: sanitizeEmailHtml(parsed.data.bodyHtml),
      is_active: parsed.data.isActive ?? false,
      updated_by: actor.id
    })
    .select("id")
    .single();

  if (error || !created) {
    redirect(appendSearchParam(returnTo, "error", "template-save-failed"));
  }

  await logAuditEvent(actor.id, "email_template.created", "email_template", created.id);
  revalidatePath("/admin");
  redirect(appendSearchParam(returnTo, "saved", "template-created"));
}

// Sends the selected template to the logged-in super admin with sample values,
// through the normal Brevo pipeline — so it exercises the branded layout,
// delivery, and email_logs exactly like a real send.
export async function sendTestEmailAction(formData: FormData) {
  const actor = await requirePortalAccess("super_admin");
  const templateKey = String(formData.get("templateKey") || "");
  const returnTo = "/admin/email-templates";

  if (!templateKey) {
    redirect(appendSearchParam(returnTo, "error", "template-not-found"));
  }

  const admin = getAdminClientOrThrow();
  const { data: template } = await admin
    .from("email_templates")
    .select("subject, body_html")
    .eq("template_key", templateKey)
    .maybeSingle();

  if (!template) {
    redirect(appendSearchParam(returnTo, "error", "template-not-found"));
  }

  const result = await sendTransactionalEmail({
    bookingReference: [
      "booking_request_received", "school_booking_confirmed", "school_booking_cancelled",
      "school_booking_rescheduled", "school_session_reminder", "school_feedback_request",
      "school_reschedule_requested", "school_reschedule_declined", "ambassador_assignment_confirmation",
      "ambassador_withdrawal_approved", "ambassador_withdrawal_declined", "invoice_to_finance"
    ].includes(templateKey) ? "100011" : undefined,
    templateKey: `${templateKey}_test`,
    recipientEmail: actor.email,
    subject: `[Test] ${substituteSampleValues(template.subject as string)}`,
    html: substituteSampleValues((template.body_html as string | null) ?? "<p>(empty template)</p>")
  });

  await logAuditEvent(actor.id, "email_template.test_sent", "email_template", templateKey);

  if (result.status === "sent") {
    redirect(appendSearchParam(returnTo, "saved", "test-sent"));
  }

  redirect(
    appendSearchParam(
      returnTo,
      "error",
      result.status === "skipped_unconfigured" ? "brevo-not-configured" : "test-failed"
    )
  );
}

async function sendPaymentApprovalToFinance({
  paymentId,
  confirmationToken,
  financeEmail,
  actorId
}: {
  paymentId: string;
  confirmationToken: string;
  financeEmail: string;
  actorId: string;
}) {
  const admin = getAdminClientOrThrow();
  const [{ data: payment }, details] = await Promise.all([
    admin
      .from("payments")
      .select("finance_email_attempts")
      .eq("id", paymentId)
      .maybeSingle(),
    loadPaymentDetails(paymentId)
  ]);

  if (!details) {
    await admin
      .from("payments")
      .update({
        finance_email_status: "failed",
        finance_email_error: "Approved payment details could not be loaded.",
        finance_email_last_attempt_at: new Date().toISOString(),
        finance_email_attempts: Number(payment?.finance_email_attempts ?? 0) + 1,
        updated_by: actorId
      })
      .eq("id", paymentId);
    return false;
  }

  const emailResult = await sendPaymentApprovalToFinanceEmail({
    toEmail: financeEmail,
    invoiceNumber: details.invoiceNumber,
    ambassadorName: details.ambassadorName,
    sessionDescription: details.sessionDescription,
    amountLabel: formatCurrency(details.amountCents, details.currency),
    bankAccountName: details.bankAccountName,
    bankAccountNumber: details.bankAccountNumber,
    gstNumber: details.gstNumber,
    confirmationToken,
    bookingSessionId: details.bookingSessionId
  });
  const sent = emailResult.status === "sent";
  const attemptedAt = new Date().toISOString();

  const { error: statusUpdateError } = await admin
    .from("payments")
    .update({
      finance_email_status: sent ? "sent" : "failed",
      finance_email_attempts: Number(payment?.finance_email_attempts ?? 0) + 1,
      finance_email_last_attempt_at: attemptedAt,
      finance_email_error: sent
        ? null
        : "error" in emailResult
          ? emailResult.error
          : "Brevo email delivery is not configured.",
      sent_to_finance_at: sent ? attemptedAt : null,
      sent_to_email: financeEmail,
      updated_by: actorId
    })
    .eq("id", paymentId);

  return sent && !statusUpdateError;
}

export async function markReportReviewedAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const returnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/reports"),
    "/staff/reports"
  );
  const reportId = String(formData.get("reportId") || "");

  if (!reportId) {
    redirect(appendSearchParam(returnTo, "error", "invalid-report"));
  }

  const admin = getAdminClientOrThrow();
  let financeEmailFailed = false;
  const { data: report } = await admin
    .from("ambassador_reports")
    .select("id, booking_session_id, ambassador_profile_id, reviewed_for_payment_at")
    .eq("id", reportId)
    .maybeSingle();

  if (!report) {
    redirect(appendSearchParam(returnTo, "error", "report-review-failed"));
  }

  if (report.reviewed_for_payment_at) {
    redirect(appendSearchParam(returnTo, "approved", "report"));
  }

  const [{ data: payment }, { data: ambassadorProfile }] = await Promise.all([
    report.ambassador_profile_id
      ? admin
          .from("payments")
          .select("id, status")
          .eq("booking_session_id", report.booking_session_id as string)
          .eq("ambassador_profile_id", report.ambassador_profile_id as string)
          .in("status", ["pending", "eligible"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    report.ambassador_profile_id
      ? admin
          .from("ambassador_profiles")
          .select("id, user_id, bank_account_name, bank_account_number, gst_number")
          .eq("id", report.ambassador_profile_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  if (payment) {
    const bankAccountName = String(ambassadorProfile?.bank_account_name ?? "").trim();
    const bankAccountNumber = String(ambassadorProfile?.bank_account_number ?? "").trim();
    const hasValidPaymentDetails =
      bankAccountName.length >= 2 && nzBankAccountPattern.test(bankAccountNumber);

    if (!hasValidPaymentDetails) {
      if (ambassadorProfile?.user_id) {
        const { data: existingNotification } = await admin
          .from("notifications")
          .select("id")
          .eq("user_id", ambassadorProfile.user_id as string)
          .eq("notification_type", "payment_details_required")
          .eq("related_url", "/ambassador/profile")
          .is("read_at", null)
          .limit(1)
          .maybeSingle();

        if (!existingNotification) {
          void notifyUser(ambassadorProfile.user_id as string, {
            title: "Payment details required",
            body: "Add your account name and bank account number so your approved report can be sent to finance.",
            type: "payment_details_required",
            relatedUrl: "/ambassador/profile"
          }).catch(() => {});
        }
      }

      redirect(appendSearchParam(returnTo, "error", "payment-details-required"));
    }

    const approvedAt = new Date();
    const invoiceNumber = generateInvoiceNumber(payment.id as string, approvedAt);
    const confirmation = createFinanceConfirmationToken(approvedAt);
    const paymentSettings = await getPaymentSettings();
    const { data: approvalRows, error: approvalError } = await admin.rpc(
      "approve_ambassador_report_payment",
      {
        p_report_id: report.id,
        p_actor_id: actor.id,
        p_invoice_number: invoiceNumber,
        p_bank_account_name: bankAccountName,
        p_bank_account_number: bankAccountNumber,
        p_gst_number: String(ambassadorProfile?.gst_number ?? "").trim() || null,
        p_token_hash: confirmation.tokenHash,
        p_token_expires_at: confirmation.expiresAt,
        p_finance_email: paymentSettings.financeEmail
      }
    );

    const approval = Array.isArray(approvalRows) ? approvalRows[0] : null;

    if (approvalError) {
      redirect(appendSearchParam(returnTo, "error", "report-review-failed"));
    }

    if (!approval?.did_approve) {
      redirect(appendSearchParam(returnTo, "approved", "report"));
    }

    const emailSent = await sendPaymentApprovalToFinance({
      paymentId: payment.id as string,
      confirmationToken: confirmation.token,
      financeEmail: paymentSettings.financeEmail,
      actorId: actor.id
    });
    financeEmailFailed = !emailSent;

    await admin.from("booking_activity_logs").insert({
      booking_session_id: report.booking_session_id,
      action: "payment.approved_for_finance",
      actor_id: actor.id,
      actor_type: actor.role,
      details: {
        invoice_number: invoiceNumber,
        finance_email_status: emailSent ? "sent" : "failed"
      }
    });

    if (ambassadorProfile?.user_id) {
      void notifyUser(ambassadorProfile.user_id as string, {
        title: "Report approved for payment",
        body: `Your report has been approved. Finance will use invoice ${invoiceNumber} to process your payment.`,
        type: "payment_approved",
        relatedUrl: "/ambassador/earnings"
      }).catch(() => {});
    }

    await logAuditEvent(actor.id, "payment.approved_for_finance", "payment", payment.id as string);
  } else {
    const { data: approvalRows, error: approvalError } = await admin.rpc(
      "approve_ambassador_report_payment",
      {
        p_report_id: report.id,
        p_actor_id: actor.id
      }
    );

    if (approvalError) {
      redirect(appendSearchParam(returnTo, "error", "report-review-failed"));
    }

    const approval = Array.isArray(approvalRows) ? approvalRows[0] : null;

    if (!approval?.did_approve) {
      redirect(appendSearchParam(returnTo, "approved", "report"));
    }
  }

  await logAuditEvent(actor.id, "report.approved", "ambassador_report", reportId);
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/ambassador");
  const approvedReturnTo = appendSearchParam(returnTo, "approved", "report");
  redirect(
    financeEmailFailed
      ? appendSearchParam(approvedReturnTo, "financeEmail", "failed")
      : approvedReturnTo
  );
}

const bookingDefaultsSettingSchema = z.object({
  startHour: z.string().regex(/^\d{2}:\d{2}$/),
  endHour: z.string().regex(/^\d{2}:\d{2}$/),
  slotIntervalMinutes: z.coerce.number().int().min(5).max(240)
});

const brandingSettingSchema = z.object({
  senderEmail: z.string().email(),
  primaryDomain: z.string().trim().min(3)
});

const paymentsSettingSchema = z.object({
  currency: z.string().trim().toUpperCase().length(3),
  financeEmail: z.string().email(),
  defaultAmountDollars: z.coerce.number().min(0),
  eligibleAttendeeThreshold: z.coerce.number().int().min(0)
});

export async function savePlatformSettingsAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const returnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/settings"),
    "/staff/settings"
  );
  const section = String(formData.get("section") || "");
  let settingValue: Record<string, unknown> | null = null;

  if (section === "booking_defaults") {
    const parsed = bookingDefaultsSettingSchema.safeParse({
      startHour: String(formData.get("startHour") || ""),
      endHour: String(formData.get("endHour") || ""),
      slotIntervalMinutes: formData.get("slotIntervalMinutes") || 0
    });

    if (parsed.success) {
      settingValue = {
        ...parsed.data,
        publicHolidayBlock: formData.get("publicHolidayBlock") === "on"
      };
    }
  } else if (section === "branding") {
    const parsed = brandingSettingSchema.safeParse({
      senderEmail: String(formData.get("senderEmail") || ""),
      primaryDomain: String(formData.get("primaryDomain") || "")
    });

    if (parsed.success) {
      settingValue = parsed.data;
    }
  } else if (section === "payments") {
    const parsed = paymentsSettingSchema.safeParse({
      currency: String(formData.get("currency") || ""),
      financeEmail: String(formData.get("financeEmail") || ""),
      defaultAmountDollars: formData.get("defaultAmountDollars") || 0,
      eligibleAttendeeThreshold: formData.get("eligibleAttendeeThreshold") || 0
    });

    if (parsed.success) {
      const { defaultAmountDollars, ...rest } = parsed.data;

      settingValue = {
        ...rest,
        defaultAmountCents: Math.round(defaultAmountDollars * 100)
      };
    }
  }

  if (!settingValue) {
    redirect(appendSearchParam(returnTo, "error", "invalid-settings"));
  }

  const admin = getAdminClientOrThrow();
  const { error } = await admin.from("settings").upsert(
    {
      setting_key: section,
      setting_value: settingValue,
      updated_by: actor.id,
      updated_at: new Date().toISOString()
    },
    { onConflict: "setting_key" }
  );

  if (error) {
    redirect(appendSearchParam(returnTo, "error", "settings-save-failed"));
  }

  // The public booking widget reads its hours from availability_rules, so
  // keep those rows in sync with the saved booking defaults.
  if (section === "booking_defaults") {
    await admin
      .from("availability_rules")
      .update({
        start_time: settingValue.startHour,
        end_time: settingValue.endHour,
        slot_interval_minutes: settingValue.slotIntervalMinutes
      })
      .eq("is_active", true);
  }

  await logAuditEvent(actor.id, "settings.updated", "setting", section);
  updateTag(PUBLIC_CONTENT_TAG);
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/");
  redirect(appendSearchParam(returnTo, "saved", "settings"));
}

export async function saveRegionAction(formData: FormData) {
  const actor = await requirePortalAccess("super_admin");
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const sortOrder = Number(formData.get("sortOrder") || 0);
  const isActive = formData.get("isActive") === "on";

  if (name.length < 2 || !Number.isFinite(sortOrder)) {
    redirect("/admin/regions?error=invalid-region");
  }

  const admin = getAdminClientOrThrow();

  if (id) {
    const { error } = await admin
      .from("regions")
      .update({ name, sort_order: Math.round(sortOrder), is_active: isActive })
      .eq("id", id);

    if (error) {
      redirect("/admin/regions?error=region-save-failed");
    }

    await logAuditEvent(actor.id, "region.updated", "region", id);
  } else {
    // New regions keep a stable slug derived from the name.
    const slug = slugify(name);
    const { data: existing } = await admin
      .from("regions")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (existing) {
      redirect("/admin/regions?error=region-exists");
    }

    const { data: created, error } = await admin
      .from("regions")
      .insert({ name, slug, sort_order: Math.round(sortOrder), is_active: true })
      .select("id")
      .single();

    if (error || !created) {
      redirect("/admin/regions?error=region-save-failed");
    }

    await logAuditEvent(actor.id, "region.created", "region", created.id);
  }

  updateTag(PUBLIC_CONTENT_TAG);
  revalidatePath("/admin");
  revalidatePath("/staff");
  revalidatePath("/");
  redirect("/admin/regions?saved=region");
}

export async function deleteRegionAction(formData: FormData) {
  const actor = await requirePortalAccess("super_admin");
  const id = String(formData.get("id") || "");

  if (!id) {
    redirect("/admin/regions?error=invalid-region");
  }

  const admin = getAdminClientOrThrow();

  // Regions referenced by schools, bookings, or ambassadors can't be deleted
  // safely — they should be deactivated instead.
  const referenceChecks = await Promise.all(
    ["schools", "booking_requests", "booking_sessions", "ambassador_profiles", "ambassador_travel_regions"].map(
      (table) =>
        admin.from(table).select("id", { count: "exact", head: true }).eq("region_id", id)
    )
  );

  if (referenceChecks.some((result) => (result.count ?? 0) > 0)) {
    redirect("/admin/regions?error=region-in-use");
  }

  const { error } = await admin.from("regions").delete().eq("id", id);

  if (error) {
    redirect("/admin/regions?error=region-delete-failed");
  }

  await logAuditEvent(actor.id, "region.deleted", "region", id);
  updateTag(PUBLIC_CONTENT_TAG);
  revalidatePath("/admin");
  revalidatePath("/staff");
  revalidatePath("/");
  redirect("/admin/regions?saved=region-deleted");
}

export async function saveAmbassadorProfileAction(formData: FormData) {
  const actor = await requirePortalAccess("ambassador");
  const returnTo = "/ambassador/profile";
  const admin = getAdminClientOrThrow();

  const { data: ambassadorProfile } = await admin
    .from("ambassador_profiles")
    .select("id, profile_details")
    .eq("user_id", actor.id)
    .maybeSingle();

  if (!ambassadorProfile) {
    redirect(appendSearchParam(returnTo, "error", "ambassador-not-found"));
  }

  const fullName = String(formData.get("fullName") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const regionSlug = String(formData.get("regionSlug") || "").trim();
  const travelRegions = splitCommaList(String(formData.get("travelRegions") || ""));

  if (fullName.length < 2) {
    redirect(appendSearchParam(returnTo, "error", "profile-save-failed"));
  }

  const bankAccountName = String(formData.get("bankAccountName") || "").trim();
  const bankAccountNumber = String(formData.get("bankAccountNumber") || "").trim();
  const hasAnyPaymentDetails = Boolean(bankAccountName || bankAccountNumber);

  if (
    hasAnyPaymentDetails &&
    (bankAccountName.length < 2 || !nzBankAccountPattern.test(bankAccountNumber))
  ) {
    redirect(appendSearchParam(returnTo, "error", "invalid-payment-details"));
  }

  const weeklyAvailability: Record<string, string> = {};
  for (const day of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
    const value = String(formData.get(`availability-${day}`) || "").trim();

    if (value) {
      weeklyAvailability[day] = value;
    }
  }

  const existingProfileDetails =
    ambassadorProfile.profile_details && typeof ambassadorProfile.profile_details === "object"
      ? (ambassadorProfile.profile_details as Record<string, unknown>)
      : {};
  const profileDetails = {
    ...existingProfileDetails,
    mailingAddress: String(formData.get("mailingAddress") || "").trim(),
    payoutEmail: String(formData.get("payoutEmail") || "").trim(),
    payoutMethod: String(formData.get("payoutMethod") || "bank_transfer").trim(),
    invoiceName: String(formData.get("invoiceName") || "").trim(),
    irdNumber: String(formData.get("irdNumber") || "").trim(),
    billingNote: String(formData.get("billingNote") || "").trim(),
    bookingTypes: splitCommaList(String(formData.get("bookingTypes") || "")),
    preferredTimes: String(formData.get("preferredTimes") || "").trim(),
    weeklyAvailability,
    unavailableDates: splitCommaList(String(formData.get("unavailableDates") || "")),
    availabilityNote: String(formData.get("availabilityNote") || "").trim()
  };

  const avatarFile = formData.get("avatar");
  let avatarUrl: string | null = null;

  if (avatarFile instanceof File && avatarFile.size > 0) {
    try {
      const upload = await uploadPublicAsset(avatarFile, "avatars");
      avatarUrl = upload.publicUrl;
    } catch {
      redirect(appendSearchParam(returnTo, "error", "avatar-upload-failed"));
    }
  }

  const profilePayload: Record<string, unknown> = {
    full_name: fullName,
    phone: phone || null
  };

  if (avatarUrl) {
    profilePayload.avatar_url = avatarUrl;
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update(profilePayload)
    .eq("id", actor.id);

  if (profileError) {
    redirect(appendSearchParam(returnTo, "error", "profile-save-failed"));
  }

  let regionId: string | null = null;

  if (regionSlug) {
    const { data: region } = await admin
      .from("regions")
      .select("id")
      .eq("slug", regionSlug)
      .maybeSingle();
    regionId = (region?.id as string | undefined) ?? null;
  }

  const ambassadorPayload: Record<string, unknown> = {
    bio: String(formData.get("bio") || "").trim() || null,
    bank_account_name: bankAccountName || null,
    bank_account_number: bankAccountNumber || null,
    gst_number: String(formData.get("gstNumber") || "").trim() || null,
    open_to_travel: formData.get("openToTravel") === "on",
    profile_details: profileDetails
  };

  if (regionId) {
    ambassadorPayload.region_id = regionId;
  }

  let { error: ambassadorError } = await admin
    .from("ambassador_profiles")
    .update(ambassadorPayload)
    .eq("id", ambassadorProfile.id);

  if (ambassadorError && ambassadorError.message.includes("profile_details")) {
    // The 0011 migration hasn't been applied yet — save everything else.
    const withoutDetails = { ...ambassadorPayload };
    delete withoutDetails.profile_details;
    ({ error: ambassadorError } = await admin
      .from("ambassador_profiles")
      .update(withoutDetails)
      .eq("id", ambassadorProfile.id));
  }

  if (ambassadorError) {
    redirect(appendSearchParam(returnTo, "error", "profile-save-failed"));
  }

  // Replace preferred/travel regions with the submitted set.
  await admin
    .from("ambassador_travel_regions")
    .delete()
    .eq("ambassador_profile_id", ambassadorProfile.id);

  if (travelRegions.length > 0) {
    const { data: regionRows } = await admin
      .from("regions")
      .select("id, slug")
      .in("slug", travelRegions);

    if (regionRows?.length) {
      await admin.from("ambassador_travel_regions").insert(
        regionRows.map((region) => ({
          ambassador_profile_id: ambassadorProfile.id,
          region_id: region.id
        }))
      );
    }
  }

  await logAuditEvent(actor.id, "ambassador.profile_updated", "ambassador_profile", ambassadorProfile.id);
  revalidatePath("/ambassador");
  redirect(appendSearchParam(returnTo, "saved", "profile"));
}

export async function acceptAmbassadorMaterialsConsentAction(formData: FormData) {
  const actor = await requirePortalAccess("ambassador");
  const returnTo = "/ambassador/materials";
  const signedName = String(formData.get("signedName") || "").trim();
  const accepted = formData.get("accepted") === "on";

  if (!accepted || signedName.length < 2) {
    redirect(appendSearchParam(returnTo, "error", "materials-consent-required"));
  }

  const admin = getAdminClientOrThrow();
  const { data: ambassadorProfile } = await admin
    .from("ambassador_profiles")
    .select("id, profile_details")
    .eq("user_id", actor.id)
    .maybeSingle();

  if (!ambassadorProfile) {
    redirect(appendSearchParam(returnTo, "error", "ambassador-not-found"));
  }

  const existingDetails =
    ambassadorProfile.profile_details && typeof ambassadorProfile.profile_details === "object"
      ? (ambassadorProfile.profile_details as Record<string, unknown>)
      : {};
  const acceptedAt = new Date().toISOString();
  const { error } = await admin
    .from("ambassador_profiles")
    .update({
      profile_details: {
        ...existingDetails,
        materialsConsentAcceptedAt: acceptedAt,
        materialsConsentSignedName: signedName,
        materialsConsentVersion: "2026-09-03"
      }
    })
    .eq("id", ambassadorProfile.id);

  if (error) {
    redirect(appendSearchParam(returnTo, "error", "materials-consent-save-failed"));
  }

  await logAuditEvent(
    actor.id,
    "ambassador.materials_consent_accepted",
    "ambassador_profile",
    ambassadorProfile.id
  );
  revalidatePath("/ambassador");
  revalidatePath("/staff/ambassadors");
  revalidatePath("/admin/ambassadors");
  redirect(appendSearchParam(returnTo, "saved", "materials-consent"));
}

export async function retryFinancePaymentEmailAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/payments"),
    "/staff/payments"
  );
  const parsed = retryFinanceEmailSchema.safeParse({
    paymentId: String(formData.get("paymentId") || ""),
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-payment"));
  }

  const admin = getAdminClientOrThrow();
  const { data: payment } = await admin
    .from("payments")
    .select(
      "id, booking_session_id, status, invoice_number, finance_email_status, finance_confirmation_expires_at"
    )
    .eq("id", parsed.data.paymentId)
    .maybeSingle();

  const linkExpired =
    payment?.finance_confirmation_expires_at &&
    new Date(payment.finance_confirmation_expires_at as string).getTime() <= Date.now();

  if (
    !payment ||
    payment.status !== "approved" ||
    !payment.invoice_number ||
    (!["failed", "pending"].includes(String(payment.finance_email_status)) && !linkExpired)
  ) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "finance-email-not-retryable"));
  }

  const paymentSettings = await getPaymentSettings();
  const confirmation = createFinanceConfirmationToken();
  const { data: preparedPayment, error: prepareError } = await admin
    .from("payments")
    .update({
      finance_email_status: "pending",
      finance_email_error: null,
      finance_confirmation_token_hash: confirmation.tokenHash,
      finance_confirmation_expires_at: confirmation.expiresAt,
      sent_to_email: paymentSettings.financeEmail,
      updated_by: actor.id
    })
    .eq("id", payment.id)
    .eq("status", "approved")
    .eq("finance_email_status", payment.finance_email_status as string)
    .select("id")
    .maybeSingle();

  if (prepareError || !preparedPayment) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "finance-email-not-retryable"));
  }

  const emailSent = await sendPaymentApprovalToFinance({
    paymentId: payment.id as string,
    confirmationToken: confirmation.token,
    financeEmail: paymentSettings.financeEmail,
    actorId: actor.id
  });

  await admin.from("booking_activity_logs").insert({
    booking_session_id: payment.booking_session_id,
    action: "payment.finance_email_retried",
    actor_id: actor.id,
    actor_type: actor.role,
    details: {
      invoice_number: payment.invoice_number,
      finance_email_status: emailSent ? "sent" : "failed"
    }
  });

  await logAuditEvent(actor.id, "payment.finance_email_retried", "payment", payment.id as string);
  revalidatePath("/ambassador");
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(
    appendSearchParam(
      parsed.data.returnTo,
      emailSent ? "sent" : "error",
      emailSent ? "finance-email" : "invoice-email-failed"
    )
  );
}

export async function revokeBookingGuestAccessAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const bookingId = z.uuid().parse(String(formData.get("bookingRequestId") || ""));
  const returnTo = sanitizeReturnTo(String(formData.get("returnTo") || "/staff/bookings"), "/staff/bookings");
  const admin = getAdminClientOrThrow();
  const { data, error } = await admin.rpc("revoke_booking_guest_access", { p_booking_id: bookingId });
  if (error || !data) throw new Error("Could not end guest access. Please try again.");
  await logAuditEvent(actor.id, "booking.guest_access_revoked", "booking_request", bookingId);
  revalidatePath("/manage-booking");
  redirect(appendSearchParam(returnTo, "updated", "guest-access-ended"));
}
