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
import { bookingEmailPolicy } from "@/lib/services/booking-email-policy";
import { createTeamsMeetingForSession } from "@/lib/services/calendar-triggers";
import {
  collectCalendarEventIdsForBookings,
  reconcileCalendar,
  scheduleCalendarSync,
  scheduleOutlookEventRemoval
} from "@/lib/services/calendar-sync";
import { createOrUpdateTeamsMeeting, deleteOutlookCalendarEvent } from "@/lib/services/calendar";
import {
  sendAmbassadorApprovedEmail,
  sendAmbassadorAssignedEmail,
  sendAmbassadorLateCancellationEmail,
  sendAmbassadorWithdrawalResolvedEmail,
  sendPaymentApprovalToFinanceEmail
} from "@/lib/services/email-triggers";
import {
  createFinanceConfirmationToken,
  FINANCE_EMAIL_CLAIM_STALE_SECONDS,
  generateInvoiceNumber,
  getPaymentSettings,
  loadPaymentDetails
} from "@/lib/services/payment-automation";
import { describePaymentAmount, parseExtraAmountCents } from "@/lib/payment-breakdown";
import { findOverlappingSession } from "@/lib/session-overlap";
import { sendTransactionalEmail } from "@/lib/services/email";
import { substituteSampleValues } from "@/lib/services/email-samples";
import { notifyStaff, notifyUser } from "@/lib/services/notifications";
import { sanitizeEmailHtml, sanitizeRichText } from "@/lib/services/sanitize";
import {
  deletePrivateResourceFile,
  prepareReportMediaUpload,
  REPORT_MEDIA_MAX_FILES,
  uploadPrivateResourceFile,
  prepareResourceUpload,
  validateUploadedReportMedia,
  validateUploadedResource,
  uploadPublicAsset
} from "@/lib/services/storage";
import { emailDeliveryContext } from "@/lib/services/email-delivery-context";
import { statusEmailEvent } from "@/lib/services/status-email-choice";
import {
  sessionActionResult,
  type SessionActionState
} from "@/components/dashboard/session-update-notices";
import {
  sendMeetingLinkNotifications,
  sendSchoolSessionEmails,
  sendSchoolStatusChangeEmails
} from "@/lib/services/school-session-email";
import { feedbackPath, feedbackUrl, isValidFeedbackLinkToken } from "@/lib/services/feedback-links";
import {
  getOnlineBookingLinkVersion,
  ONLINE_BOOKING_LINK_SETTING_KEY
} from "@/lib/services/online-booking-link";
import { allowPublicRequest } from "@/lib/services/public-rate-limit";
import { scheduleEmail } from "@/lib/services/email-background";
import { createAdminClient } from "@/lib/supabase/admin";
import { relationOne } from "@/lib/supabase/relation";
import { createClient } from "@/lib/supabase/server";
import { safeLocalPath } from "@/lib/safe-redirect";
import {
  formatCurrency,
  formatDateOnly,
  formatDateTime,
  nzDateTimeToIso,
  slugify,
  splitCommaList
} from "@/lib/utils";

// Every path revalidation in this module accompanies a data write, so bust the
// shared platform-data cache (lib/services/portal.ts) at the same time. This
// keeps the 60s cache from ever serving stale data after a portal action.
// The portals are catch-all routes (/ambassador/[[...slug]] etc.), so the
// path is revalidated as a layout: "/ambassador" alone would refresh only the
// dashboard and leave e.g. /ambassador/bookings showing withdrawn applications.
function revalidatePath(path: string) {
  updateTag(PLATFORM_DATA_TAG);
  updateTag(AVAILABILITY_DATA_TAG);
  nextRevalidatePath(path, "layout");
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

const ambassadorInviteResendSchema = z.object({
  ambassadorProfileId: z.uuid(),
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
  submissionId: z.uuid(),
  schoolId: z.uuid().optional(),
  schoolName: z.string().trim().min(2).max(200).optional(),
  newSchoolRegionId: z.uuid().optional(),
  presentationTypeId: z.uuid(),
  contactName: z.string().trim().min(2).max(200),
  contactEmail: z.string().trim().email().toLowerCase(),
  contactPhone: z.string().trim().max(100).optional(),
  contactPosition: z.string().trim().max(200).optional(),
  assignedAmbassadorId: z.uuid().optional(),
  outreachAmbassadorId: z.uuid().optional(),
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
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.coerce.number().int().positive(),
  yearLevels: z.string().min(1),
  expectedStudentCount: z.coerce.number().int().positive(),
  actualStudentCount: z.coerce.number().int().nonnegative().optional(),
  internalNotes: z.string().optional(),
  // Record only: no emails of any kind for this booking, and a past session
  // is saved as already reported and settled (used to backlog history).
  recordOnly: z.boolean().default(false),
  // Online sessions have no region and can carry a video-call link.
  deliveryMode: z.enum(["in_person", "online"]).default("in_person"),
  meetingUrl: z
    .string()
    .trim()
    .max(2000)
    .url()
    .refine((value) => value.startsWith("https://"))
    .optional(),
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
// Payout amounts and the attendee threshold come from Settings → Payments.
// A sourced booking pays the sourced amount instead of the default; the
// difference is recorded as the sourcing bonus.
async function loadPayoutRates() {
  const settings = await getPaymentSettings();
  const deliveryCents = settings.defaultAmountCents;
  const sourcedCents = Math.max(settings.sourcedAmountCents, deliveryCents);

  return {
    deliveryCents,
    sourcedCents,
    sourcingBonusCents: sourcedCents - deliveryCents,
    eligibleThreshold: settings.eligibleAttendeeThreshold
  };
}

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
  message: z.string().trim().max(2000).optional(),
  returnTo: z.string().min(1).default("/ambassador/open-bookings")
});

const applicationWithdrawSchema = z.object({
  bookingSessionId: z.uuid(),
  reason: z.string().trim().min(5).max(2000),
  returnTo: z.string().min(1).default("/ambassador/open-bookings")
});

const sessionWithdrawalRequestSchema = z.object({
  bookingSessionId: z.uuid(),
  reasonType: z.enum(["school_rescheduled", "unavailable", "other"]),
  reason: z.string().trim().min(5).max(2000),
  returnTo: z.string().min(1).default("/ambassador/upcoming")
});

const sessionWithdrawalResolveSchema = z.object({
  bookingSessionId: z.uuid(),
  // keep: ambassador stays assigned. reopen: back to the open pool.
  // cancel_rebooked: the school was rebooked elsewhere, so cancel this session.
  // approve/decline are the old names, still accepted from open tabs.
  decision: z
    .enum(["keep", "reopen", "cancel_rebooked", "approve", "decline"])
    .transform((value) => (value === "approve" ? "reopen" : value === "decline" ? "keep" : value)),
  note: z.string().trim().max(2000).optional(),
  returnTo: z.string().min(1).default("/staff/bookings")
});

const schoolReviewSchema = z.object({
  bookingSessionId: z.uuid(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  role: z.string().trim().min(1).max(150),
  studentsAttended: z.string().trim().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)),
  studentsCompeted: z.enum(["yes", "no"]),
  attendeeFeedback: z.string().trim().min(1).max(2000),
  attendanceRating: z.coerce.number().int().min(1).max(5),
  studentResponseRating: z.coerce.number().int().min(1).max(5),
  contentRating: z.coerce.number().int().min(1).max(5),
  presenterEnergyRating: z.coerce.number().int().min(1).max(5),
  quote: z.string().trim().min(10).max(2000),
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

// Blank inputs clear the number (stored as null).
const optionalStudentCount = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.coerce.number().int().min(0).max(10000).nullable()
);

// Video-call links must be https; blank clears the link.
const updateSessionMeetingLinkSchema = z.object({
  sessionId: z.uuid(),
  meetingUrl: z.union([
    z.literal(""),
    z.string().trim().max(2000).url().refine((value) => value.startsWith("https://"))
  ])
});

const updateSessionStudentCountsSchema = z.object({
  sessionId: z.uuid(),
  expectedStudentCount: optionalStudentCount,
  actualStudentCount: optionalStudentCount
});

// A booking-level status cascades to its sessions (and un-cancelling brings
// sessions back) inside update_booking_status_batch (0055), in the same
// transaction as the booking itself. School cancellations use
// cancel_school_booking. Delivered/terminal sessions are never rewritten.

// Links rendered as hrefs: only web URLs, never javascript:/data: schemes.
const httpUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), "Enter a web link starting with https://");

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
    youtubeUrl: httpUrlSchema.optional(),
    externalUrl: httpUrlSchema.optional(),
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
  return safeLocalPath(path, fallback);
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
  selection: { schoolId?: string; schoolName?: string; newSchoolRegionId?: string },
  newSchoolStatus: "active" | "pending_review" = "active"
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
      status: newSchoolStatus
    })
    .select("id, name, region_id, status")
    .single();

  return school;
}

// Sessions whose school may leave feedback through the public link.
const PUBLIC_FEEDBACK_ELIGIBLE_STATUSES = new Set([
  "confirmed",
  "ambassador_assigned",
  "completed_pending_report",
  "report_submitted",
  "payment_pending",
  "paid",
  "closed"
]);

// Cancelling inside this window is still allowed, but flagged as late.
const LATE_CANCELLATION_HOURS = 24;

// Sessions an assigned ambassador may report on once they have ended.
const AMBASSADOR_REPORTABLE_SESSION_STATUSES = ["confirmed", "completed_pending_report"];
// Outcomes of submit_ambassador_report_group (0054) shown to the ambassador.
const REPORT_SUBMISSION_ERRORS = new Set([
  "session-not-assigned",
  "session-not-finished",
  "report-already-submitted",
  "report-day-not-finished",
  "payment-already-exists"
]);
// Sessions that need no further report, so a sibling in one of these does not
// hold its parent booking open.
const REPORT_TERMINAL_SESSION_STATUSES = new Set([
  "report_submitted",
  "payment_pending",
  "paid",
  "closed",
  "cancelled",
  "declined"
]);

// The pre-confirmation booking roll-up (tentative / applied / ambassador
// assigned) now runs inside the 0055 group functions, under the booking row
// lock: see rollup_pre_confirmation_booking_status.

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

  // Always target the invited auth user by id. profiles.email is not a
  // reliable key (it can be stale or duplicated), and matching on it could
  // grant the invited role to a different account.
  if (!inviteData.user?.id) {
    redirect("/admin/users?compose=1&error=invite-role-failed");
  }

  const { error: roleUpdateError } = await admin
    .from("profiles")
    .update({ role: parsed.data.role, full_name: parsed.data.fullName })
    .eq("id", inviteData.user.id);

  if (roleUpdateError) {
    redirect("/admin/users?compose=1&error=invite-role-failed");
  }

  if (parsed.data.role === "ambassador") {
    const { data: ambassadorProfile } = await admin
      .from("ambassador_profiles")
      .select("id, status")
      .eq("user_id", inviteData.user.id)
      .maybeSingle();

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

// An ambassador_profiles row outlives a role change (applyUserRoleChange only
// marks it inactive), so its user_id can point at a staff or super_admin
// account. Staff-level ambassador actions may only change the login of a user
// who is still an ambassador; otherwise they touch the ambassador record alone.
async function ambassadorManagedUserId(userId: string | null | undefined) {
  if (!userId) {
    return null;
  }

  const { data } = await getAdminClientOrThrow()
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  return data?.role === "ambassador" ? userId : null;
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

  const managedUserId = await ambassadorManagedUserId(ambassador.user_id as string | null);

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

  if (managedUserId) {
    const { data: linkedUser } = await admin
      .from("profiles")
      .select("status")
      .eq("id", managedUserId)
      .maybeSingle();
    previousUserStatus = (linkedUser?.status as string | null) ?? null;

    const { error: userStatusError } = await admin
      .from("profiles")
      .update({ status: parsed.data.status === "approved" ? "active" : "inactive" })
      .eq("id", managedUserId);

    if (userStatusError) {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "review-failed"));
    }

    // Deactivating (or declining) revokes the user's live sessions; approving
    // lifts the ban so a restored ambassador can simply log in again.
    const accessError = await setUserPlatformAccess(
      managedUserId,
      parsed.data.status === "approved"
    );

    if (accessError) {
      if (previousUserStatus) {
        await admin
          .from("profiles")
          .update({ status: previousUserStatus })
          .eq("id", managedUserId);
      }
      redirect(appendSearchParam(parsed.data.returnTo, "error", "review-failed"));
    }
  }

  const { error } = await admin
    .from("ambassador_profiles")
    .update(updatePayload)
    .eq("id", parsed.data.ambassadorProfileId);

  if (error) {
    if (managedUserId && previousUserStatus) {
      await admin
        .from("profiles")
        .update({ status: previousUserStatus })
        .eq("id", managedUserId);
      // Best-effort: put session access back in line with the restored status.
      await setUserPlatformAccess(
        managedUserId,
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

// Emails an ambassador a fresh way into their portal login: a new invite if
// they never accepted (e.g. the link expired), otherwise a password setup
// link (e.g. an email scanner used up the invite, or they forgot it).
export async function resendAmbassadorPortalInviteAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/ambassadors"),
    "/staff/ambassadors"
  );
  const parsed = ambassadorInviteResendSchema.safeParse({
    ambassadorProfileId: String(formData.get("ambassadorProfileId") || ""),
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "ambassador-invite-failed"));
  }

  const admin = getAdminClientOrThrow();
  const { data: ambassador } = await admin
    .from("ambassador_profiles")
    .select("id, user_id, deleted_at")
    .eq("id", parsed.data.ambassadorProfileId)
    .maybeSingle();

  if (!ambassador || ambassador.deleted_at || !ambassador.user_id) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "ambassador-not-found"));
  }

  const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(
    ambassador.user_id as string
  );

  if (authUserError || !authUser.user?.email) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "ambassador-invite-failed"));
  }

  const alreadyAccepted = Boolean(authUser.user.email_confirmed_at);
  // Supabase re-sends the invite for an existing, unconfirmed user and
  // replaces the previous link. It refuses to re-invite a confirmed user, so
  // they get a password reset link instead, which works the same way.
  const { error: sendError } = alreadyAccepted
    ? await admin.auth.resetPasswordForEmail(authUser.user.email, {
        redirectTo: buildAuthConfirmUrl("/reset-password")
      })
    : await admin.auth.admin.inviteUserByEmail(authUser.user.email, {
        data: authUser.user.user_metadata,
        redirectTo: buildAuthConfirmUrl("/reset-password")
      });

  if (sendError) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "ambassador-invite-failed"));
  }

  await logAuditEvent(
    actor.id,
    alreadyAccepted ? "ambassador.password_link_sent" : "ambassador.invite_resent",
    "ambassador_profile",
    ambassador.id as string
  );
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(
    appendSearchParam(parsed.data.returnTo, "invite", alreadyAccepted ? "password-link" : "resent")
  );
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

  const managedUserId = await ambassadorManagedUserId(ambassador.user_id as string | null);

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

      if (managedUserId) {
        await admin
          .from("profiles")
          .update({ status: "inactive" })
          .eq("id", managedUserId);

        // Archived ambassadors lose platform access immediately — revoke the
        // user's live sessions rather than waiting for their token to expire.
        // Profiles without a linked auth user (nullable since migration 0026)
        // have no sessions to revoke.
        const accessError = await setUserPlatformAccess(
          managedUserId,
          false
        );

        if (accessError) {
          throw accessError;
        }
      }
    } else if (managedUserId) {
      await clearNullableProfileReferences(managedUserId);
      const { error: userDeleteError } = await admin.auth.admin.deleteUser(
        managedUserId
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

const ambassadorNoteSchema = z.object({
  ambassadorProfileId: z.uuid(),
  parentId: z.uuid().optional(),
  body: z.string().trim().min(1).max(4000),
  returnTo: z.string().min(1)
});

// Staff-only discussion notes on an ambassador profile. Ambassadors never see
// these; the table is service-role only.
export async function addAmbassadorNoteAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/ambassadors"),
    "/staff/ambassadors"
  );
  const parsed = ambassadorNoteSchema.safeParse({
    ambassadorProfileId: String(formData.get("ambassadorProfileId") || ""),
    parentId: String(formData.get("parentId") || "") || undefined,
    body: String(formData.get("body") || ""),
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "note-invalid"));
  }

  const admin = getAdminClientOrThrow();

  // Replies attach to a top-level note on the same ambassador only.
  if (parsed.data.parentId) {
    const { data: parent } = await admin
      .from("ambassador_notes")
      .select("id")
      .eq("id", parsed.data.parentId)
      .eq("ambassador_profile_id", parsed.data.ambassadorProfileId)
      .is("parent_id", null)
      .maybeSingle();

    if (!parent) {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "note-invalid"));
    }
  }

  const { error } = await admin.from("ambassador_notes").insert({
    ambassador_profile_id: parsed.data.ambassadorProfileId,
    parent_id: parsed.data.parentId ?? null,
    author_id: actor.id,
    body: parsed.data.body
  });

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "note-save-failed"));
  }

  redirect(appendSearchParam(parsed.data.returnTo, "note", "saved"));
}

// Authors can remove their own notes; super admins can remove any.
export async function deleteAmbassadorNoteAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const returnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/ambassadors"),
    "/staff/ambassadors"
  );
  const noteId = String(formData.get("noteId") || "");

  if (!z.uuid().safeParse(noteId).success) {
    redirect(appendSearchParam(returnTo, "error", "note-invalid"));
  }

  const admin = getAdminClientOrThrow();
  let deletion = admin.from("ambassador_notes").delete().eq("id", noteId);

  if (actor.role !== "super_admin") {
    deletion = deletion.eq("author_id", actor.id);
  }

  const { data: deleted, error } = await deletion.select("id");

  if (error || !deleted?.length) {
    redirect(appendSearchParam(returnTo, "error", "note-delete-failed"));
  }

  redirect(appendSearchParam(returnTo, "note", "deleted"));
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
      .eq("school_id", parsed.data.duplicateSchoolId),
    // media_library.school_id has no ON DELETE action, so leftover rows would
    // make the delete below fail after everything else has moved.
    admin
      .from("media_library")
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

type CheckedSessionFields = {
  presentation_type_id: string;
  assigned_ambassador_id: string | null;
  delivery_mode: "in_person" | "online";
  meeting_url: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  year_levels: string;
  expected_student_count: number;
  actual_student_count: number | null;
  internal_notes: string | null;
  report_status: "not_submitted" | "reviewed";
};

// Adds the first session of a booking the actor has just created, through
// insert_booking_session_checked (0055): table lock, ownership, target
// ambassador and overlap checks, then the insert, in one transaction.
async function insertBookingSessionChecked(
  admin: AdminClient,
  actorId: string,
  bookingId: string,
  fields: CheckedSessionFields
): Promise<{ ok: true; sessionId: string } | { ok: false; code: string }> {
  const { data: rows, error } = await admin.rpc("insert_booking_session_checked", {
    p_actor_id: actorId,
    p_booking_id: bookingId,
    p_session: fields
  });
  const row = Array.isArray(rows)
    ? (rows[0] as { outcome?: string; session_id?: string | null } | undefined)
    : undefined;

  if (error || !row?.outcome) {
    logGroupFailure("insert_booking_session_checked", bookingId, error);
    return { ok: false, code: "insert-failed" };
  }

  return row.outcome === "inserted" && row.session_id
    ? { ok: true, sessionId: row.session_id }
    : { ok: false, code: row.outcome };
}

export async function saveManualBookingAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/bookings"),
    "/staff/bookings"
  );
  const parsed = manualBookingSchema.safeParse({
    submissionId: String(formData.get("submissionId") || ""),
    schoolId: String(formData.get("schoolId") || "") || undefined,
    schoolName: String(formData.get("schoolName") || "") || undefined,
    newSchoolRegionId: String(formData.get("newSchoolRegionId") || "") || undefined,
    presentationTypeId: String(formData.get("presentationTypeId") || ""),
    contactPosition: String(formData.get("contactPosition") || "") || undefined,
    contactName: String(formData.get("contactName") || ""),
    contactEmail: String(formData.get("contactEmail") || ""),
    contactPhone: String(formData.get("contactPhone") || "") || undefined,
    assignedAmbassadorId: String(formData.get("assignedAmbassadorId") || "") || undefined,
    outreachAmbassadorId: String(formData.get("outreachAmbassadorId") || "") || undefined,
    status: String(formData.get("status") || "tentative"),
    date: String(formData.get("date") || ""),
    startTime: String(formData.get("startTime") || ""),
    durationMinutes: formData.get("durationMinutes") || 10,
    yearLevels: String(formData.get("yearLevels") || ""),
    expectedStudentCount: formData.get("expectedStudentCount") || 0,
    actualStudentCount: formData.get("actualStudentCount") || undefined,
    internalNotes: String(formData.get("internalNotes") || "") || undefined,
    recordOnly: formData.get("recordOnly") === "on",
    deliveryMode: formData.get("deliveryMode") === "online" ? "online" : "in_person",
    meetingUrl: String(formData.get("meetingUrl") || "").trim() || undefined,
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-booking"));
  }

  const admin = getAdminClientOrThrow();
  const successUrl = (bookingId: string, referenceCode: string) => {
    const [pathname, query] = parsed.data.returnTo.split("?");
    const params = new URLSearchParams(query);
    params.set("status", "all");
    params.set("created", "booking");
    params.set("booking", bookingId);
    params.set("reference", referenceCode);
    return `${pathname}?${params.toString()}`;
  };
  const replayExistingBooking = async () => {
    const { data: existing } = await admin.from("booking_requests")
      .select("id, reference_code, booking_sessions(id)")
      .eq("id", parsed.data.submissionId).eq("staff_owner_id", actor.id).maybeSingle();
    if (!existing) return;
    if (!existing.booking_sessions?.length) {
      redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-in-progress"));
    }
    revalidatePath("/staff");
    revalidatePath("/admin");
    redirect(successUrl(existing.id, existing.reference_code));
  };
  // A stable ID per opened form makes repeated submissions the same booking.
  // The database primary key also protects concurrent requests.
  await replayExistingBooking();
  const school = await resolveManualBookingSchool(admin, parsed.data);

  if (!school) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-school-missing"));
  }

  const { data: contact, error: contactError } = await admin
    .from("school_contacts")
    .insert({
      school_id: school.id,
      full_name: parsed.data.contactName,
      email: parsed.data.contactEmail,
      phone: parsed.data.contactPhone || null,
      position: parsed.data.contactPosition || null,
      is_primary: false,
      marketing_consent: false
    })
    .select("id")
    .single();

  if (contactError || !contact) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-save-failed"));
  }

  const startsAt = new Date(nzDateTimeToIso(parsed.data.date, parsed.data.startTime));
  const endsAt = new Date(startsAt.getTime() + parsed.data.durationMinutes * 60 * 1000);
  // Manual entries never carry an actual ambassador_reports row, so a session
  // must not be persisted as "report submitted" — that would exclude it from
  // the feedback-logging queue and block the ambassador from ever submitting
  // the real report. Map that choice to completed_pending_report so the
  // session enters the normal report flow instead.
  const requestedStatus =
    parsed.data.status === "report_submitted" ? "completed_pending_report" : parsed.data.status;
  // A record-only booking in the past is history that was already reported
  // and paid outside the platform: save it settled (like staff-logged
  // feedback) so it never asks the ambassador for a report or creates a
  // payment. Future record-only bookings follow the normal flow, silently.
  const settlesAsHistory =
    parsed.data.recordOnly && startsAt.getTime() <= Date.now() && requestedStatus !== "cancelled";
  const effectiveStatus = settlesAsHistory ? "closed" : requestedStatus;

  const { data: booking, error: bookingError } = await admin
    .from("booking_requests")
    .insert({
      id: parsed.data.submissionId,
      school_id: school.id,
      primary_contact_id: contact.id,
      contact_position: parsed.data.contactPosition || null,
      region_id: parsed.data.deliveryMode === "online" ? null : school.region_id ?? null,
      status: effectiveStatus,
      source: parsed.data.outreachAmbassadorId ? "ambassador" : "staff",
      ambassador_outreach_by: parsed.data.outreachAmbassadorId || null,
      staff_owner_id: actor.id,
      internal_notes: parsed.data.internalNotes || null,
      manual_email_only: parsed.data.recordOnly
    })
    .select("id, reference_code")
    .single();

  if (bookingError?.code === "23505") await replayExistingBooking();

  if (bookingError || !booking) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-save-failed"));
  }

  // Inserted under the assignment table lock with the ambassador's overlap
  // check (0055). The school, and the region for in-person sessions, come
  // from the booking.
  const sessionResult = await insertBookingSessionChecked(admin, actor.id, booking.id as string, {
    presentation_type_id: parsed.data.presentationTypeId,
    assigned_ambassador_id: parsed.data.assignedAmbassadorId || null,
    delivery_mode: parsed.data.deliveryMode,
    meeting_url: parsed.data.deliveryMode === "online" ? parsed.data.meetingUrl ?? null : null,
    status: effectiveStatus,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    year_levels: parsed.data.yearLevels,
    expected_student_count: parsed.data.expectedStudentCount,
    actual_student_count: parsed.data.actualStudentCount ?? null,
    internal_notes: parsed.data.internalNotes || null,
    report_status: settlesAsHistory ? "reviewed" : "not_submitted"
  });

  if (!sessionResult.ok) {
    await admin.from("booking_requests").delete().eq("id", booking.id);
    redirect(
      appendSearchParam(
        parsed.data.returnTo,
        "error",
        sessionResult.code === "ambassador-conflict" || sessionResult.code === "ambassador-not-approved"
          ? sessionResult.code
          : "booking-session-save-failed"
      )
    );
  }

  const session = { id: sessionResult.sessionId };

  await admin.from("booking_status_history").insert({
    booking_request_id: booking.id,
    booking_session_id: session.id,
    new_status: effectiveStatus,
    changed_by: actor.id,
    reason: parsed.data.recordOnly ? "Manual staff entry (record only, no emails)" : "Manual staff entry"
  });

  // Record-only bookings are also blocked at the email sender; skipping here
  // just avoids queueing sends that would be suppressed.
  if (!parsed.data.recordOnly && effectiveStatus === "confirmed") {
    scheduleEmail(() => sendSchoolStatusChangeEmails(booking.id as string, [session.id as string], "confirmed"));
  } else if (
    !parsed.data.recordOnly &&
    (effectiveStatus === "tentative" || effectiveStatus === "applied") &&
    !parsed.data.assignedAmbassadorId
  ) {
    scheduleEmail(() => sendSchoolStatusChangeEmails(booking.id as string, [session.id as string], "tentative"));
  }
  await logAuditEvent(actor.id, "booking.manually_created", "booking_request", booking.id);
  scheduleCalendarSync({ bookingIds: [booking.id as string] });
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(successUrl(booking.id, booking.reference_code));
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

  // This form is for sessions an ambassador has arranged with a school, so
  // the session must still be ahead. Logging past sessions here would let a
  // report (and payment) follow for a session nobody at NZ Esports scheduled.
  const requestedStart = new Date(nzDateTimeToIso(parsed.data.date, parsed.data.startTime));

  if (Number.isNaN(requestedStart.getTime())) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "invalid-ambassador-booking"));
  }

  if (requestedStart.getTime() <= Date.now()) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-date-in-past"));
  }

  const admin = getAdminClientOrThrow();
  const [{ data: ambassadorProfile }, { data: presentation }] = await Promise.all([
    admin
      .from("ambassador_profiles")
      .select("id, status")
      .eq("user_id", actor.id)
      .maybeSingle(),
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

  if (!presentation || !presentation.is_active) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-presentation-missing"));
  }

  // Resolved only after the checks above so a rejected request never leaves
  // a school behind. Schools an ambassador adds go to staff review like any
  // other school not created by staff.
  const school = await resolveManualBookingSchool(admin, parsed.data, "pending_review");

  if (!school || !["active", "pending_review"].includes(String(school.status))) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-school-missing"));
  }

  const { data: primaryContact } = await admin
    .from("school_contacts")
    .select("id")
    .eq("school_id", school.id)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  const startsAt = requestedStart;
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

  // The database only accepts the ambassador themselves, upcoming and free
  // at that time (0055); otherwise the booking is removed again.
  const sessionResult = await insertBookingSessionChecked(admin, actor.id, booking.id as string, {
    presentation_type_id: presentation.id as string,
    assigned_ambassador_id: ambassadorProfile.id as string,
    delivery_mode: "in_person",
    meeting_url: null,
    status,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    year_levels: parsed.data.yearLevels,
    expected_student_count: parsed.data.expectedStudentCount,
    actual_student_count: null,
    internal_notes: parsed.data.internalNotes || null,
    report_status: "not_submitted"
  });

  if (!sessionResult.ok) {
    await admin.from("booking_requests").delete().eq("id", booking.id);
    redirect(
      appendSearchParam(
        parsed.data.returnTo,
        "error",
        sessionResult.code === "ambassador-conflict" ? "ambassador-booking-conflict" : "booking-session-save-failed"
      )
    );
  }

  const session = { id: sessionResult.sessionId };

  const payoutRates = await loadPayoutRates();
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
        delivery_payment_cents: payoutRates.deliveryCents,
        sourcing_bonus_cents: wasSourcedByAmbassador ? payoutRates.sourcingBonusCents : 0,
        payment_amount_cents: wasSourcedByAmbassador
          ? payoutRates.sourcedCents
          : payoutRates.deliveryCents
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
    scheduleEmail(() => sendSchoolStatusChangeEmails(booking.id as string, [session.id as string], "confirmed"));
  }
  await logAuditEvent(actor.id, "booking.ambassador_created", "booking_request", booking.id);
  scheduleCalendarSync({ bookingIds: [booking.id as string] });
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

  const mediaUploads = await readUploadedReportMedia(formData, actor.id);

  if (!mediaUploads) {
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
    !AMBASSADOR_REPORTABLE_SESSION_STATUSES.includes(String(session.status)) ||
    session.report_status !== "not_submitted"
  ) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-finished"));
  }

  const [
    { data: bookingRequest },
    { data: schoolRecord },
    { data: schoolContact }
  ] = await Promise.all([
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

  const reportFields = {
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
    media_consent_confirmed: parsed.data.mediaConsentObtained ?? false
  };

  const payoutRates = await loadPayoutRates();
  const eligibleThreshold = payoutRates.eligibleThreshold;
  const isAmbassadorSourced =
    bookingRequest?.ambassador_outreach_by === ambassadorProfile.id &&
    ["ambassador", AMBASSADOR_BOOKING_SOURCE].includes(String(bookingRequest?.source));

  // One transaction writes the report, marks the ambassador's other finished
  // sessions of this booking that NZ day as covered, and creates the single
  // payment: the delivery fee plus the sourcing bonus when sourced. The
  // second-session add-on (+$50 / +$100) is chosen by staff at approval, so
  // the tier amounts are passed as 0 here; the tier is still recorded and
  // preselects that add-on. If any part fails nothing is saved, so the
  // ambassador can simply resubmit.
  const { data: submissionRows, error: submissionError } = await admin.rpc(
    "submit_ambassador_report_group",
    {
      p_session_id: parsed.data.bookingSessionId,
      p_ambassador_profile_id: ambassadorProfile.id,
      p_actor_id: actor.id,
      p_report: reportFields,
      p_delivery_cents: payoutRates.deliveryCents,
      p_sourcing_bonus_cents: payoutRates.sourcingBonusCents,
      p_short_pair_cents: 0,
      p_extended_pair_cents: 0,
      p_eligible_threshold: eligibleThreshold,
      p_is_sourced: isAmbassadorSourced
    }
  );
  const submission = Array.isArray(submissionRows) ? submissionRows[0] : null;

  if (submissionError || !submission) {
    console.error("[report] Grouped report submission failed", {
      bookingSessionId: parsed.data.bookingSessionId,
      code: submissionError?.code
    });
    redirect(appendSearchParam(parsed.data.returnTo, "error", "report-save-failed"));
  }

  if (submission.outcome !== "submitted" || !submission.report_id) {
    redirect(
      appendSearchParam(
        parsed.data.returnTo,
        "error",
        REPORT_SUBMISSION_ERRORS.has(String(submission.outcome))
          ? String(submission.outcome)
          : "report-save-failed"
      )
    );
  }

  const report = { id: submission.report_id as string };
  const paymentStatus = String(submission.payment_status);
  const isPaymentEligible = paymentStatus === "eligible";
  const coveredSessionIds = (submission.covered_session_ids as string[] | null) ?? [];

  // Presentation photos/videos and signed media release forms go into the
  // media library, linked to this report for staff review. They can contain
  // identifiable students, so they upload to the private `report-media`
  // bucket and only surface through the auth-gated
  // /portal/report-media/[mediaId] route (stored as the row's public_url so
  // existing consumers keep a renderable link).
  for (const media of mediaUploads) {
    try {
      const mediaId = randomUUID();
      await admin.from("media_library").insert({
        id: mediaId,
        title: media.title,
        media_type: media.mediaType,
        storage_path: media.storagePath,
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

  await admin.from("booking_activity_logs").insert({
    booking_session_id: parsed.data.bookingSessionId,
    action: "report.submitted",
    actor_id: actor.id,
    actor_type: "ambassador",
    details: {
      attendee_count: parsed.data.attendeeCount,
      payment_status: paymentStatus,
      sourced_by_ambassador: isAmbassadorSourced,
      covered_session_ids: coveredSessionIds,
      payment_tier: isPaymentEligible ? (submission.payment_tier ?? null) : null,
      payment_review_required: isPaymentEligible ? Boolean(submission.review_required) : false,
      payment_review_reason: isPaymentEligible ? (submission.review_reason ?? null) : null,
      // For a custom-review payment this is only the recognised part.
      payment_amount_cents: isPaymentEligible ? Number(submission.amount_cents ?? 0) : 0,
      delivery_payment_cents: isPaymentEligible ? payoutRates.deliveryCents : 0,
      sourcing_bonus_cents:
        isPaymentEligible && isAmbassadorSourced ? payoutRates.sourcingBonusCents : 0
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

  const mediaUploads = await readUploadedReportMedia(formData, actor.id);

  if (!mediaUploads) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "report-media-invalid"));
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

  // A cancelled or declined session was never delivered, so it cannot be
  // closed out with feedback.
  if (["cancelled", "declined"].includes(String(session.status))) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-finished"));
  }

  const { data: siblingSessions } = session.booking_request_id
    ? await admin
        .from("booking_sessions")
        .select("id, status")
        .eq("booking_request_id", session.booking_request_id)
    : { data: [] };
  const closesWholeBooking = (siblingSessions ?? []).every(
    (sibling) =>
      sibling.id === session.id ||
      REPORT_TERMINAL_SESSION_STATUSES.has(String(sibling.status))
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

  for (const media of mediaUploads) {
    try {
      // Uploaded straight to the private bucket; see readUploadedReportMedia.
      const mediaId = randomUUID();
      await admin.from("media_library").insert({
        id: mediaId,
        title: media.title,
        media_type: media.mediaType,
        storage_path: media.storagePath,
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

// Back-to-back sessions of one booking on the same NZ day are a single
// opportunity for ambassadors. Applying, withdrawing and assigning change the
// whole day's group in one database transaction (0055 *_group functions), or
// nothing; each returns an outcome code the action shows as-is. Emails and
// notifications go out once per group, after the call has committed.
type GroupResult = {
  outcome: string;
  booking_request_id: string | null;
  session_ids: string[] | null;
  [column: string]: unknown;
};

function groupResult(rows: unknown) {
  const row = Array.isArray(rows) ? (rows[0] as GroupResult | undefined) : undefined;
  return row && typeof row.outcome === "string" ? row : null;
}

function groupSessionIds(result: GroupResult) {
  return (result.session_ids ?? []).filter(Boolean);
}

function logGroupFailure(rpc: string, sessionId: string, error: { code?: string; message?: string } | null) {
  console.error(`[same-day] ${rpc} failed`, { sessionId, code: error?.code, message: error?.message });
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
  const { data: rows, error } = await admin.rpc("apply_to_session_group", {
    p_session_id: parsed.data.bookingSessionId,
    p_actor_id: actor.id,
    p_message: parsed.data.message || null
  });
  const result = groupResult(rows);

  if (error || !result) {
    logGroupFailure("apply_to_session_group", parsed.data.bookingSessionId, error);
    redirect(appendSearchParam(parsed.data.returnTo, "error", "application-failed"));
  }

  if (result.outcome !== "applied") {
    redirect(appendSearchParam(parsed.data.returnTo, "error", result.outcome));
  }

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
  const { data: rows, error } = await admin.rpc("withdraw_application_group", {
    p_session_id: parsed.data.bookingSessionId,
    p_actor_id: actor.id,
    p_reason: parsed.data.reason
  });
  const result = groupResult(rows);

  if (error || !result) {
    logGroupFailure("withdraw_application_group", parsed.data.bookingSessionId, error);
    redirect(appendSearchParam(parsed.data.returnTo, "error", "application-not-found"));
  }

  if (result.outcome !== "withdrawn") {
    redirect(appendSearchParam(parsed.data.returnTo, "error", result.outcome));
  }

  const bookingRequestId = result.booking_request_id;
  const { school, presentation } = await loadSessionLabels(admin, parsed.data.bookingSessionId);

  void notifyStaff({
    title: `${actor.fullName} withdrew an application`,
    body: `${actor.fullName} withdrew from ${presentation?.title ?? "a session"} at ${school?.name ?? "a school"}. Reason: ${parsed.data.reason}`,
    type: "session_application_withdrawn",
    relatedUrl: bookingRequestId
      ? `/staff/bookings?status=all&range=all&booking=${bookingRequestId}#booking-${bookingRequestId}`
      : "/staff/bookings"
  }).catch(() => {});

  for (const sessionId of groupSessionIds(result)) {
    await logAuditEvent(actor.id, "session.application_withdrawn", "booking_session", sessionId);
  }
  revalidatePath("/ambassador");
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/school");
  redirect(appendSearchParam(parsed.data.returnTo, "withdrawn", "application"));
}

// School name, address and presentation title of a session, for the
// notification and email text sent after a group change has committed.
async function loadSessionLabels(admin: AdminClient, sessionId: string) {
  const { data: session } = await admin
    .from("booking_sessions")
    .select("id, starts_at, ends_at, school_id, presentation_type_id")
    .eq("id", sessionId)
    .maybeSingle();
  const [{ data: school }, { data: presentation }] = await Promise.all([
    session?.school_id
      ? admin.from("schools").select("name, address").eq("id", session.school_id).maybeSingle()
      : Promise.resolve({ data: null }),
    session?.presentation_type_id
      ? admin.from("presentation_types").select("title").eq("id", session.presentation_type_id).maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  return {
    session: session as { id: string; starts_at: string; ends_at: string } | null,
    school: school as { name: string | null; address: string | null } | null,
    presentation: presentation as { title: string | null } | null
  };
}

// The user behind an ambassador profile, for notifications and emails.
async function loadAmbassadorContact(admin: AdminClient, ambassadorProfileId: string | null) {
  if (!ambassadorProfileId) {
    return { userId: null, email: null, fullName: null };
  }

  const { data: profile } = await admin
    .from("ambassador_profiles")
    .select("user_id")
    .eq("id", ambassadorProfileId)
    .maybeSingle();
  const userId = (profile?.user_id as string | null) ?? null;
  const { data: user } = userId
    ? await admin.from("profiles").select("email, full_name").eq("id", userId).maybeSingle()
    : { data: null };

  return {
    userId,
    email: (user?.email as string | null) ?? null,
    fullName: (user?.full_name as string | null) ?? null
  };
}

export async function requestSessionWithdrawalAction(formData: FormData) {
  const actor = await requirePortalAccess("ambassador");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/ambassador/upcoming"),
    "/ambassador/upcoming"
  );
  const parsed = sessionWithdrawalRequestSchema.safeParse({
    bookingSessionId: String(formData.get("bookingSessionId") || ""),
    reasonType: String(formData.get("reasonType") || ""),
    reason: String(formData.get("reason") || ""),
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-withdrawal"));
  }

  const admin = getAdminClientOrThrow();
  const { data: rows, error } = await admin.rpc("request_session_withdrawal_group", {
    p_session_id: parsed.data.bookingSessionId,
    p_actor_id: actor.id,
    p_reason_type: parsed.data.reasonType,
    p_reason: parsed.data.reason
  });
  const result = groupResult(rows);

  if (error || !result) {
    logGroupFailure("request_session_withdrawal_group", parsed.data.bookingSessionId, error);
    redirect(appendSearchParam(parsed.data.returnTo, "error", "withdrawal-not-allowed"));
  }

  if (result.outcome !== "requested") {
    redirect(appendSearchParam(parsed.data.returnTo, "error", result.outcome));
  }

  const bookingRequestId = result.booking_request_id;
  const { school, presentation } = await loadSessionLabels(admin, parsed.data.bookingSessionId);

  void notifyStaff({
    title: `${actor.fullName} asked to withdraw`,
    body: `${presentation?.title ?? "Session"} at ${school?.name ?? "a school"}: ${parsed.data.reason}`,
    type: "session_withdrawal_requested",
    relatedUrl: bookingRequestId
      ? `/staff/bookings?status=all&range=all&booking=${bookingRequestId}#booking-${bookingRequestId}`
      : "/staff/bookings"
  }).catch(() => {});

  for (const sessionId of groupSessionIds(result)) {
    await logAuditEvent(actor.id, "session.withdrawal_requested", "booking_session", sessionId);
  }
  revalidatePath("/ambassador");
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/school");
  redirect(appendSearchParam(parsed.data.returnTo, "requested", "withdrawal"));
}

function parseSchoolReviewForm(formData: FormData, fallbackReturnTo: string) {
  return schoolReviewSchema.safeParse({
    bookingSessionId: String(formData.get("bookingSessionId") || ""),
    firstName: String(formData.get("firstName") || ""),
    lastName: String(formData.get("lastName") || ""),
    role: String(formData.get("role") || ""),
    studentsAttended: String(formData.get("studentsAttended") ?? ""),
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
// rating and saves the review together with all structured answers.
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
    attribution: `${parsedData.firstName} ${parsedData.lastName}, ${parsedData.role}`,
    rating: overallRating,
    is_public: parsedData.isPublic,
    is_approved: false
  };
  const details = {
    firstName: parsedData.firstName,
    lastName: parsedData.lastName,
    role: parsedData.role,
    studentsAttended: parsedData.studentsAttended,
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

  const insertResult = await admin
    .from("presentation_reviews")
    .insert({ ...basePayload, details })
    .select("id")
    .single();

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
// login required. The session UUID alone is not enough (ambassadors can see
// it): the link's server-issued signature must match, so only someone holding
// the school's email link can submit. The unique index on booking_session_id
// blocks duplicate submissions.
export async function submitPublicFeedbackAction(formData: FormData) {
  const sessionIdRaw = String(formData.get("bookingSessionId") || "");

  if (!z.uuid().safeParse(sessionIdRaw).success) {
    redirect("/");
  }

  if (!isValidFeedbackLinkToken(sessionIdRaw, String(formData.get("feedbackToken") || ""))) {
    redirect(`/feedback/${sessionIdRaw}`);
  }

  const fallbackReturnTo = feedbackPath(sessionIdRaw);
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

  // Public links only open after sessions that genuinely went ahead.
  if (
    new Date(session.ends_at as string).getTime() > Date.now() ||
    !PUBLIC_FEEDBACK_ELIGIBLE_STATUSES.has(String(session.status))
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
    body: `${parsed.data.firstName} ${parsed.data.lastName}, ${parsed.data.role} submitted feedback via the public form.`,
    type: "school_review_submitted",
    relatedUrl: "/staff/feedback"
  }).catch(() => {});

  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(parsed.data.returnTo, "submitted", "1"));
}

// "Send me a fresh link" on an unsigned or outdated feedback link. The new
// link is emailed to the booking's own contact, never to whoever clicked, and
// the page never reveals where it went.
export async function requestFeedbackLinkAction(formData: FormData) {
  const sessionId = String(formData.get("bookingSessionId") || "");

  if (!z.uuid().safeParse(sessionId).success) {
    redirect("/");
  }

  const done = `/feedback/${sessionId}?link=requested`;
  const allowed = await allowPublicRequest("feedback-link", sessionId, 3);
  const admin = createAdminClient();

  if (!allowed || !admin) {
    redirect(done);
  }

  const { data: session } = await admin
    .from("booking_sessions")
    .select("id, booking_request_id, ends_at, status")
    .eq("id", sessionId)
    .maybeSingle();
  const { data: existingReview } = session
    ? await admin
        .from("presentation_reviews")
        .select("id")
        .eq("booking_session_id", sessionId)
        .maybeSingle()
    : { data: null };

  if (
    session?.booking_request_id &&
    !existingReview &&
    new Date(session.ends_at as string).getTime() <= Date.now() &&
    PUBLIC_FEEDBACK_ELIGIBLE_STATUSES.has(String(session.status))
  ) {
    try {
      await sendSchoolSessionEmails(session.booking_request_id as string, [sessionId], "feedback");
    } catch (error) {
      console.error("[feedback-link] Fresh link could not be sent", {
        sessionId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  redirect(done);
}

// Staff "copy feedback link": the signature is created server-side and only
// for staff, so it never reaches the ambassador portal's session data.
export async function getSignedFeedbackLinkAction(sessionId: string) {
  await requirePortalAccess("staff");

  if (!z.uuid().safeParse(sessionId).success) {
    return null;
  }

  return feedbackUrl(sessionId);
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

  // Ownership, the cancellable sessions (upcoming and undelivered, judged
  // under the locks), the booking, history, activity and applications are
  // all handled by one transaction (0055); nothing is half cancelled.
  const admin = getAdminClientOrThrow();
  const { data: rows, error } = await admin.rpc("cancel_school_booking", {
    p_booking_id: parsed.data.bookingRequestId,
    p_actor_id: actor.id,
    p_notes: parsed.data.notes ?? null
  });
  const result = groupResult(rows);

  if (error || !result) {
    logGroupFailure("cancel_school_booking", parsed.data.bookingRequestId, error);
    redirect(appendSearchParam(parsed.data.returnTo, "error", "change-request-failed"));
  }

  if (result.outcome !== "cancelled") {
    redirect(appendSearchParam(parsed.data.returnTo, "error", result.outcome));
  }

  const cancelledIds = groupSessionIds(result);
  const now = Date.now();
  const [{ data: booking }, { data: cancelledRows }] = await Promise.all([
    admin.from("booking_requests").select("school_id").eq("id", parsed.data.bookingRequestId).maybeSingle(),
    cancelledIds.length
      ? admin
          .from("booking_sessions")
          .select("id, assigned_ambassador_id, starts_at, presentation_type_id")
          .in("id", cancelledIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> })
  ]);
  const activeSessions = (cancelledRows ?? []) as Array<{
    id: string;
    assigned_ambassador_id: string | null;
    starts_at: string;
    presentation_type_id: string | null;
  }>;

  const { data: changeSchool } = booking?.school_id
    ? await admin.from("schools").select("name").eq("id", booking.school_id).maybeSingle()
    : { data: null };
  // Late cancellations are allowed (plans change), but staff and the
  // assigned ambassador need to hear about them straight away.
  const lateSessions = activeSessions.filter(
    (session) =>
      session.starts_at &&
      new Date(session.starts_at as string).getTime() - now < LATE_CANCELLATION_HOURS * 60 * 60 * 1000
  );
  const schoolLabel = (changeSchool?.name as string | null) ?? "A school";
  void notifyStaff({
    title: lateSessions.length
      ? `Late cancellation: ${schoolLabel} cancelled a session starting within ${LATE_CANCELLATION_HOURS} hours`
      : `${schoolLabel} cancelled a booking`,
    body: parsed.data.notes ?? "The school cancelled its booking.",
    type: "booking_cancelled",
    relatedUrl: "/staff/bookings"
  }).catch(() => {});

  if (cancelledIds.length) {
    scheduleEmail(() => sendSchoolStatusChangeEmails(parsed.data.bookingRequestId, cancelledIds, "cancelled"));
  }

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

  const lateAssignedSessions = lateSessions.filter((session) => session.assigned_ambassador_id);

  if (lateAssignedSessions.length) {
    const [{ data: lateAmbassadors }, { data: latePresentations }] = await Promise.all([
      admin
        .from("ambassador_profiles")
        .select("id, display_name, profiles!ambassador_profiles_user_id_fkey(email, full_name)")
        .in("id", lateAssignedSessions.map((session) => session.assigned_ambassador_id as string)),
      admin
        .from("presentation_types")
        .select("id, title")
        .in("id", lateAssignedSessions.map((session) => session.presentation_type_id as string))
    ]);

    for (const session of lateAssignedSessions) {
      const ambassador = (lateAmbassadors ?? []).find(
        (profile) => profile.id === session.assigned_ambassador_id
      );
      const ambassadorUser = relationOne(ambassador?.profiles) as
        | { email?: string | null; full_name?: string | null }
        | null;

      if (!ambassadorUser?.email) {
        continue;
      }

      const presentation = (latePresentations ?? []).find(
        (item) => item.id === session.presentation_type_id
      );
      scheduleEmail(() => sendAmbassadorLateCancellationEmail({
        ambassadorEmail: ambassadorUser.email as string,
        ambassadorName:
          ambassadorUser.full_name || (ambassador?.display_name as string | null) || "Ambassador",
        schoolName: schoolLabel,
        sessionDate: formatDateTime(session.starts_at as string),
        presentationTitle: (presentation?.title as string | null) ?? "Presentation",
        bookingSessionId: session.id as string
      }));
    }
  }

  await logAuditEvent(
    actor.id,
    "booking.cancelled_by_school",
    "booking_request",
    parsed.data.bookingRequestId
  );
  scheduleCalendarSync({ bookingIds: [parsed.data.bookingRequestId] });
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

  // Ownership, state and the session's status and start time as read above
  // are re-checked under the table lock, and the request, history and
  // activity are written together (0055): a cancellation or move that
  // landed after the read is never overwritten.
  const { data: requestRows, error } = await admin.rpc("request_school_session_reschedule", {
    p_booking_id: parsed.data.bookingRequestId,
    p_session_id: parsed.data.bookingSessionId,
    p_actor_id: actor.id,
    p_preferred_date: parsed.data.preferredDate,
    p_notes: parsed.data.notes,
    p_expected_status: session.status as string,
    p_expected_starts_at: session.starts_at as string
  });
  const requestResult = groupResult(requestRows);

  if (error || !requestResult) {
    logGroupFailure("request_school_session_reschedule", parsed.data.bookingSessionId, error);
    redirect(appendSearchParam(parsed.data.returnTo, "error", "change-request-failed"));
  }

  if (requestResult.outcome !== "requested") {
    redirect(appendSearchParam(parsed.data.returnTo, "error", requestResult.outcome));
  }

  const { data: school } = await admin
    .from("schools")
    .select("name")
    .eq("id", session.school_id)
    .maybeSingle();

  void notifyStaff({
    title: `${(school?.name as string | null) ?? "A school"} requested a reschedule`,
    body: `Preferred date ${formatDateOnly(parsed.data.preferredDate)}. ${parsed.data.notes}`,
    type: "booking_reschedule_requested",
    relatedUrl: `/staff/bookings?booking=${parsed.data.bookingRequestId}`
  }).catch(() => {});

  scheduleEmail(() => sendSchoolStatusChangeEmails(parsed.data.bookingRequestId,
    [parsed.data.bookingSessionId], "reschedule_requested", formatDateOnly(parsed.data.preferredDate)));

  await logAuditEvent(
    actor.id,
    "session.reschedule_requested",
    "booking_session",
    parsed.data.bookingSessionId
  );
  scheduleCalendarSync({ sessionIds: [parsed.data.bookingSessionId] });
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

    // The assigned ambassador can't be in two places at once. Checked here
    // for a clear message, and again atomically by the RPC below.
    if (session.assigned_ambassador_id) {
      const { data: ambassadorSessions } = await admin
        .from("booking_sessions")
        .select("id, status, starts_at, ends_at")
        .eq("assigned_ambassador_id", session.assigned_ambassador_id as string)
        .lt("starts_at", finalEndsAt)
        .gt("ends_at", finalStartsAt);

      if (
        findOverlappingSession(
          (ambassadorSessions ?? []) as Array<{ id: string; status: string; starts_at: string; ends_at: string }>,
          session.id as string,
          finalStartsAt,
          finalEndsAt
        )
      ) {
        redirect(appendSearchParam(parsed.data.returnTo, "error", "reschedule-ambassador-conflict"));
      }
    }
  }

  const { data: resolutionRows, error } = await admin.rpc("resolve_session_reschedule", {
    p_session_id: parsed.data.bookingSessionId,
    p_decision: parsed.data.decision,
    p_new_start: parsed.data.decision === "approve" ? finalStartsAt : null,
    p_new_end: parsed.data.decision === "approve" ? finalEndsAt : null
  });
  const resolution = Array.isArray(resolutionRows) ? resolutionRows[0] : null;

  if (resolution?.outcome === "ambassador-conflict") {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "reschedule-ambassador-conflict"));
  }

  // Not "resolved" means someone else already resolved this request.
  if (error || resolution?.outcome !== "resolved") {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "reschedule-resolution-failed"));
  }

  const previousStatus = String(resolution.restored_status);

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

  const { data: contact } = await admin
    .from("school_contacts")
    .select("id, full_name, email")
    .eq("school_id", session.school_id)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

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

  scheduleEmail(() => sendSchoolStatusChangeEmails(session.booking_request_id as string,
    [session.id as string], parsed.data.decision === "approve" ? "rescheduled" : "reschedule_declined"));

  if (parsed.data.decision === "approve") {
    scheduleCalendarSync({ sessionIds: [session.id as string] });
  }

  await logAuditEvent(
    actor.id,
    `session.reschedule_${parsed.data.decision}d`,
    "booking_session",
    parsed.data.bookingSessionId
  );
  if (parsed.data.decision !== "approve") {
    scheduleCalendarSync({ sessionIds: [parsed.data.bookingSessionId] });
  }
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
  const decision = parsed.data.decision;
  const reopen = decision === "reopen";
  const cancelRebooked = decision === "cancel_rebooked";
  const { data: rows, error } = await admin.rpc("resolve_session_withdrawal_group", {
    p_session_id: parsed.data.bookingSessionId,
    p_actor_id: actor.id,
    p_decision: decision,
    p_note: parsed.data.note ?? null
  });
  const result = groupResult(rows);

  if (error || !result) {
    logGroupFailure("resolve_session_withdrawal_group", parsed.data.bookingSessionId, error);
    redirect(appendSearchParam(parsed.data.returnTo, "error", "no-withdrawal-pending"));
  }

  if (result.outcome !== "resolved") {
    redirect(appendSearchParam(parsed.data.returnTo, "error", result.outcome));
  }

  const sessionIds = groupSessionIds(result);
  const activityAction = reopen
    ? "session.withdrawal_approved"
    : cancelRebooked
      ? "session.withdrawal_cancelled_rebooked"
      : "session.withdrawal_declined";
  const [{ session, school, presentation }, ambassador] = await Promise.all([
    loadSessionLabels(admin, parsed.data.bookingSessionId),
    loadAmbassadorContact(admin, (result.ambassador_profile_id as string | null) ?? null)
  ]);
  const sessionTitle = presentation?.title ?? "the session";
  const schoolName = school?.name ?? "School";

  // One message for the day's sessions, about the session staff acted on.
  if (ambassador.userId) {
    void notifyUser(ambassador.userId, {
      title: reopen ? "Withdrawal approved" : cancelRebooked ? "Session cancelled" : "You're still assigned",
      body: reopen
        ? `${presentation?.title ?? "Your session"} has been reopened for another ambassador.`
        : cancelRebooked
          ? `${sessionTitle} at ${schoolName} has been cancelled because the school was rebooked. You no longer need to attend.`
          : `You remain assigned to ${sessionTitle}.${parsed.data.note ? ` Note from staff: ${parsed.data.note}` : ""}`,
      type: reopen
        ? "session_withdrawal_approved"
        : cancelRebooked
          ? "session_withdrawal_cancelled"
          : "session_withdrawal_declined",
      relatedUrl: reopen ? "/ambassador/open-bookings" : "/ambassador/upcoming"
    }).catch(() => {});
  }

  if (ambassador.email && session) {
    const ambassadorEmail = {
      ambassadorEmail: ambassador.email,
      ambassadorName: ambassador.fullName ?? "Ambassador",
      schoolName,
      sessionDate: formatDateTime(session.starts_at),
      presentationTitle: presentation?.title ?? "Presentation",
      bookingSessionId: parsed.data.bookingSessionId
    };
    scheduleEmail(() =>
      cancelRebooked
        ? sendAmbassadorLateCancellationEmail(ambassadorEmail)
        : sendAmbassadorWithdrawalResolvedEmail({
            ...ambassadorEmail,
            decision: reopen ? "approved" : "declined",
            staffNote: parsed.data.note
          })
    );
  }

  for (const sessionId of sessionIds) {
    await logAuditEvent(actor.id, activityAction, "booking_session", sessionId);
  }
  scheduleCalendarSync({ sessionIds });
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/ambassador");
  revalidatePath("/school");
  redirect(
    appendSearchParam(
      parsed.data.returnTo,
      "withdrawal",
      reopen ? "approved" : cancelRebooked ? "cancelled" : "declined"
    )
  );
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

  // One ambassador covers the whole day: sessions that shared the previous
  // assignment (or had none) follow this one, in one transaction that also
  // refuses a time clash with the ambassador's other sessions.
  const admin = getAdminClientOrThrow();
  const { data: rows, error } = await admin.rpc("assign_ambassador_group", {
    p_session_id: parsed.data.bookingSessionId,
    p_actor_id: actor.id,
    p_ambassador_profile_id: parsed.data.ambassadorProfileId || null
  });
  const result = groupResult(rows);
  const unassigning = !parsed.data.ambassadorProfileId;

  if (error || !result) {
    logGroupFailure("assign_ambassador_group", parsed.data.bookingSessionId, error);
    redirect(appendSearchParam(parsed.data.returnTo, "error", unassigning ? "unassign-failed" : "assign-failed"));
  }

  if (result.outcome === "already-assigned") {
    redirect(appendSearchParam(parsed.data.returnTo, "assigned", "1"));
  }

  if (result.outcome !== (unassigning ? "unassigned" : "assigned")) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", result.outcome));
  }

  const sessionIds = groupSessionIds(result);
  const previousAmbassadorId = (result.previous_ambassador_id as string | null) ?? null;
  const { session, school, presentation } = await loadSessionLabels(admin, parsed.data.bookingSessionId);

  if (unassigning) {
    const previous = await loadAmbassadorContact(admin, previousAmbassadorId);

    if (previous.userId) {
      void notifyUser(previous.userId, {
        title: "You are no longer assigned",
        body: `${presentation?.title ?? "The session"} at ${school?.name ?? "a school"} was removed from your assignments.`,
        type: "session_unassigned",
        relatedUrl: "/ambassador/upcoming"
      }).catch(() => {});
    }

    for (const sessionId of sessionIds) {
      await logAuditEvent(actor.id, "session.ambassador_unassigned", "booking_session", sessionId);
    }
    scheduleCalendarSync({ sessionIds });
    revalidatePath("/staff");
    revalidatePath("/admin");
    revalidatePath("/ambassador");
    revalidatePath("/school");
    redirect(appendSearchParam(parsed.data.returnTo, "unassigned", "1"));
  }

  const declinedAmbassadorIds = ((result.declined_ambassador_ids as string[] | null) ?? []).filter(Boolean);
  // Missing until the 0050 migration is applied; treated as in person.
  const [{ data: sessionDelivery }, ambassador, previous, { data: declinedApplicantProfiles }] =
    await Promise.all([
      admin
        .from("booking_sessions")
        .select("delivery_mode, meeting_url")
        .eq("id", parsed.data.bookingSessionId)
        .maybeSingle(),
      loadAmbassadorContact(admin, parsed.data.ambassadorProfileId),
      result.replaced_withdrawal ? loadAmbassadorContact(admin, previousAmbassadorId) : Promise.resolve(null),
      declinedAmbassadorIds.length
        ? admin.from("ambassador_profiles").select("id, user_id").in("id", declinedAmbassadorIds)
        : Promise.resolve({ data: [] as Array<{ id: string; user_id: string | null }> })
    ]);

  // One assignment email and notice for the day, about the session staff
  // acted on.
  if (session && school && presentation && ambassador.email) {
    const ambassadorEmail = ambassador.email;
    scheduleEmail(() => sendAmbassadorAssignedEmail({
      ambassadorEmail,
      ambassadorName: ambassador.fullName ?? "Ambassador",
      schoolName: school.name ?? "School",
      sessionDate: formatDateTime(session.starts_at),
      sessionAddress:
        sessionDelivery?.delivery_mode === "online"
          ? `Online (video call)${sessionDelivery.meeting_url ? ` — ${sessionDelivery.meeting_url}` : " — link to follow"}`
          : school.address ?? "",
      presentationTitle: presentation.title ?? "Presentation",
      bookingSessionId: parsed.data.bookingSessionId,
      sessionStartsAt: session.starts_at,
      sessionEndsAt: session.ends_at,
      deliveryMode: sessionDelivery?.delivery_mode === "online" ? "online" : "in_person",
      meetingUrl: (sessionDelivery?.meeting_url as string | null) ?? null
    }));
  }

  // Every changed session, even for a directory-only ambassador with no email.
  scheduleCalendarSync({ sessionIds });

  if (ambassador.userId) {
    void notifyUser(ambassador.userId, {
      title: `You've been assigned: ${presentation?.title ?? "Presentation"}`,
      body: `${school?.name ?? "A school"} on ${session?.starts_at ? formatDateTime(session.starts_at) : "the scheduled date"}.`,
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
      body: `${presentation?.title ?? "This session"} at ${school?.name ?? "a school"} has been assigned to another ambassador.`,
      type: "session_application_declined",
      relatedUrl: "/ambassador/open-bookings"
    }).catch(() => {});
  }

  if (previous?.userId) {
    void notifyUser(previous.userId, {
      title: "Withdrawal approved through reassignment",
      body: `${presentation?.title ?? "Your session"} has been assigned to another ambassador.`,
      type: "session_withdrawal_approved",
      relatedUrl: "/ambassador/open-bookings"
    }).catch(() => {});
  }

  for (const sessionId of sessionIds) {
    await logAuditEvent(actor.id, "session.ambassador_assigned", "booking_session", sessionId);
  }
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/ambassador");
  revalidatePath("/school");
  redirect(appendSearchParam(parsed.data.returnTo, "assigned", "1"));
}

// Shared by the bookings list (redirects afterwards) and the booking details
// dialog (stays open). Returns an error code instead of redirecting.
type StatusBatchRow = {
  outcome: string;
  booking_id: string | null;
  old_status: string | null;
  changed_session_ids: string[] | null;
  conflict_session_id: string | null;
};

const BOOKING_STATUS_VALUES = updateBookingStatusSchema.shape.status.options as readonly string[];

// The status the staff member was looking at, sent with the form. Anything
// else (missing, unknown) means "use the status read under the lock".
function expectedStatusOf(value: FormDataEntryValue | null) {
  const status = typeof value === "string" ? value : "";
  return BOOKING_STATUS_VALUES.includes(status) ? status : null;
}

async function applyBookingStatusUpdate(
  actorId: string,
  formData: FormData
): Promise<{ ok: true; emailed: boolean } | { ok: false; error: string }> {
  const parsed = updateBookingStatusSchema.safeParse({
    bookingRequestId: String(formData.get("bookingRequestId") || ""),
    status: String(formData.get("status") || ""),
    reason: String(formData.get("reason") || "").trim() || undefined,
    returnTo: "/staff/bookings"
  });

  if (!parsed.success) {
    return { ok: false, error: "invalid-status" };
  }

  // The booking, its sessions (cascade, un-cancel, overlap check for
  // sessions coming back with an ambassador), history and activity change in
  // one transaction (0055 update_booking_status_batch). The form sends the
  // status staff were looking at; if a school cancellation, roll-up or
  // another staff member changed it meanwhile, nothing is written.
  const admin = getAdminClientOrThrow();
  const emailChoice = formData.get("emailChoice") === "send" ? "send" : "skip";
  const { data: rows, error } = await admin.rpc("update_booking_status_batch", {
    p_actor_id: actorId,
    p_status: parsed.data.status,
    p_bookings: [
      { id: parsed.data.bookingRequestId, expected_status: expectedStatusOf(formData.get("expectedStatus")) }
    ],
    p_reason: parsed.data.reason ?? null,
    p_bulk: false,
    p_email_choice: emailChoice
  });
  const result = Array.isArray(rows) ? (rows[0] as StatusBatchRow | undefined) : undefined;

  if (error || !result) {
    logGroupFailure("update_booking_status_batch", parsed.data.bookingRequestId, error);
    return { ok: false, error: "status-update-failed" };
  }

  if (result.outcome !== "updated") {
    return { ok: false, error: result.outcome };
  }

  const affectedSessionIds = (result.changed_session_ids ?? []).filter(Boolean);
  const emailEvent = statusEmailEvent(parsed.data.status);
  const emailed = Boolean(emailChoice === "send" && emailEvent && affectedSessionIds.length);
  if (emailed && emailEvent) {
    const event = emailEvent === "confirmed" && result.old_status === "reschedule_requested" ? "rescheduled" : emailEvent;
    scheduleEmail(() => emailDeliveryContext.run({ manualBookingId: parsed.data.bookingRequestId }, () =>
      sendSchoolSessionEmails(parsed.data.bookingRequestId, affectedSessionIds, event)));
  }

  await logAuditEvent(
    actorId,
    "booking.status_updated",
    "booking_request",
    parsed.data.bookingRequestId
  );
  scheduleCalendarSync({ bookingIds: [parsed.data.bookingRequestId] });
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/school");
  return { ok: true, emailed };
}

export async function updateBookingStatusAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const returnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/bookings"),
    "/staff/bookings"
  );
  const result = await applyBookingStatusUpdate(actor.id, formData);

  if (!result.ok) {
    redirect(appendSearchParam(returnTo, "error", result.error));
  }

  redirect(appendSearchParam(returnTo, "updated", "status"));
}

// Booking details dialog: same update, but the dialog stays open and shows
// the result inside it.
export async function updateBookingStatusInPlaceAction(
  _previousState: SessionActionState,
  formData: FormData
): Promise<SessionActionState> {
  const actor = await requirePortalAccess("staff");
  const result = await applyBookingStatusUpdate(actor.id, formData);

  if (!result.ok) {
    return sessionActionResult({ error: result.error });
  }

  return sessionActionResult({ updated: result.emailed ? "status-emailed" : "status" });
}

export async function bulkDeleteBookingsAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const returnTo = sanitizeReturnTo(String(formData.get("returnTo") || "/staff/bookings"), "/staff/bookings");
  const parsed = z.array(z.uuid()).min(1).max(100).safeParse(
    [...new Set(formData.getAll("bookingRequestId").map(String))]
  );
  if (!parsed.success) {
    redirect(appendSearchParam(returnTo, "error", "invalid-booking-deletion"));
  }
  const admin = getAdminClientOrThrow();
  const calendarEventIds = await collectCalendarEventIdsForBookings(parsed.data).catch(() => []);
  // One DELETE keeps the selected batch atomic. Session dependencies cascade;
  // retained email/media records are detached by their SET NULL constraints.
  const { data, error } = await admin.from("booking_requests")
    .delete().in("id", parsed.data).select("id, reference_code");
  if (error) {
    console.error("[booking-delete] Could not delete selected bookings", { code: error.code, message: error.message, details: error.details });
    redirect(appendSearchParam(returnTo, "error", "booking-delete-failed"));
  }
  for (const booking of data ?? []) {
    await logAuditEvent(actor.id, "booking.deleted", "booking_request", booking.id);
  }
  scheduleOutlookEventRemoval(calendarEventIds);
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/school");
  revalidatePath("/ambassador");
  const resultUrl = appendSearchParam(returnTo, "deleted", "bookings");
  redirect(appendSearchParam(resultUrl, "deletedCount", String(data?.length ?? 0)));
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

  // Every selected booking changes in one transaction, or none does (0055
  // update_booking_status_batch): bookings are locked in id order after the
  // session table, each is checked against the status shown when it was
  // selected, and the cascade, history and activity are written together.
  const admin = getAdminClientOrThrow();
  const emailChoice = formData.get("emailChoice") === "send" ? "send" : "skip";
  const { data: rows, error } = await admin.rpc("update_booking_status_batch", {
    p_actor_id: actor.id,
    p_status: parsed.data.status,
    p_bookings: parsed.data.bookingRequestIds.map((id) => ({
      id,
      expected_status: expectedStatusOf(formData.get(`expectedStatus.${id}`))
    })),
    p_reason: null,
    p_bulk: true,
    p_email_choice: emailChoice
  });
  const results = (Array.isArray(rows) ? rows : []) as StatusBatchRow[];

  if (error || !results.length) {
    logGroupFailure("update_booking_status_batch", parsed.data.bookingRequestIds.join(","), error);
    redirect(appendSearchParam(parsed.data.returnTo, "error", "status-update-failed"));
  }

  if (results[0].outcome !== "updated") {
    redirect(appendSearchParam(parsed.data.returnTo, "error", results[0].outcome));
  }

  const event = statusEmailEvent(parsed.data.status);
  if (emailChoice === "send" && event) {
    for (const row of results) {
      const bookingId = row.booking_id;
      const ids = (row.changed_session_ids ?? []).filter(Boolean);
      if (bookingId && ids.length) scheduleEmail(() => emailDeliveryContext.run({ manualBookingId: bookingId }, () =>
        sendSchoolSessionEmails(bookingId, ids, event)));
    }
  }

  await Promise.all(
    parsed.data.bookingRequestIds.map((bookingRequestId) =>
      logAuditEvent(actor.id, "booking.status_updated", "booking_request", bookingRequestId)
    )
  );
  scheduleCalendarSync({ bookingIds: parsed.data.bookingRequestIds });
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

// Sets the video-call link on an online session. It is shown to the school
// in the confirmation email and to staff and the assigned ambassador.
// Returns its result (rather than redirecting) so the booking details dialog
// stays open and shows the saved link.
export async function updateSessionMeetingLinkAction(
  _previousState: SessionActionState,
  formData: FormData
): Promise<SessionActionState> {
  const actor = await requirePortalAccess("staff");
  const parsed = updateSessionMeetingLinkSchema.safeParse({
    sessionId: String(formData.get("sessionId") || ""),
    meetingUrl: String(formData.get("meetingUrl") ?? "").trim()
  });

  if (!parsed.success) {
    return sessionActionResult({ error: "invalid-meeting-link" });
  }

  const admin = getAdminClientOrThrow();
  const { data: session } = await admin
    .from("booking_sessions")
    .select("id, booking_request_id, delivery_mode, meeting_url, status, starts_at")
    .eq("id", parsed.data.sessionId)
    .maybeSingle();

  if (!session || session.delivery_mode !== "online") {
    return sessionActionResult({ error: "session-not-found" });
  }

  const meetingUrl = parsed.data.meetingUrl || null;
  const { error } = await admin
    .from("booking_sessions")
    .update({ meeting_url: meetingUrl })
    .eq("id", parsed.data.sessionId);

  if (error) {
    return sessionActionResult({ error: "meeting-link-update-failed" });
  }

  await admin.from("booking_activity_logs").insert({
    booking_request_id: session.booking_request_id,
    booking_session_id: parsed.data.sessionId,
    action: "booking.meeting_link_updated",
    actor_id: actor.id,
    actor_type: "staff",
    details: { hadLink: Boolean(session.meeting_url), hasLink: Boolean(meetingUrl) }
  });

  await logAuditEvent(
    actor.id,
    "booking.meeting_link_updated",
    "booking_session",
    parsed.data.sessionId
  );

  const notified =
    Boolean(meetingUrl) &&
    meetingUrl !== session.meeting_url &&
    sessionAwaitsMeetingLinkEmail(session.status as string, session.starts_at as string) &&
    (await bookingSendsEmails(session.booking_request_id as string));

  if (notified) {
    scheduleEmail(() =>
      sendMeetingLinkNotifications(session.booking_request_id as string, parsed.data.sessionId)
    );
  }

  // Keep the schools@ calendar event's video-call details current.
  scheduleCalendarSync({ sessionIds: [parsed.data.sessionId] });

  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/ambassador");
  return sessionActionResult({
    updated: !meetingUrl ? "meeting-link-removed" : notified ? "meeting-link-sent" : "meeting-link"
  });
}

// A confirmed online session that hasn't happened yet: adding or changing its
// link emails the school and ambassador. Before confirmation the link simply
// goes out in the confirmation email.
// Record-only bookings never email anyone, so don't claim we did.
async function bookingSendsEmails(bookingId: string) {
  const policy = await bookingEmailPolicy(bookingId).catch(() => null);
  return Boolean(policy && !policy.manualOnly);
}

function sessionAwaitsMeetingLinkEmail(status: string, startsAt: string) {
  return (
    ["confirmed", "ambassador_assigned", "reschedule_requested", "withdrawal_requested"].includes(status) &&
    new Date(startsAt).getTime() > Date.now()
  );
}

// Staff click "Create Teams link" in the booking details. Microsoft creates a
// Teams meeting on the shared calendar and the join link is saved.
export async function createSessionTeamsLinkAction(
  _previousState: SessionActionState,
  formData: FormData
): Promise<SessionActionState> {
  const actor = await requirePortalAccess("staff");
  const sessionId = String(formData.get("sessionId") || "");

  if (!z.uuid().safeParse(sessionId).success) {
    return sessionActionResult({ error: "session-not-found" });
  }

  const admin = getAdminClientOrThrow();
  const { data: before } = await admin
    .from("booking_sessions")
    .select("booking_request_id, meeting_url, status, starts_at")
    .eq("id", sessionId)
    .maybeSingle();
  const result = await createTeamsMeetingForSession(sessionId);

  if (!result.ok) {
    return sessionActionResult({ error: `teams-${result.code}` });
  }

  await admin.from("booking_activity_logs").insert({
    booking_request_id: before?.booking_request_id ?? null,
    booking_session_id: sessionId,
    action: "booking.meeting_link_updated",
    actor_id: actor.id,
    actor_type: "staff",
    details: { source: "teams", hadLink: Boolean(before?.meeting_url), hasLink: true }
  });
  await logAuditEvent(actor.id, "booking.teams_link_created", "booking_session", sessionId);

  const notified =
    Boolean(before?.booking_request_id) &&
    result.joinUrl !== before?.meeting_url &&
    sessionAwaitsMeetingLinkEmail(String(before?.status ?? ""), String(before?.starts_at ?? "")) &&
    (await bookingSendsEmails(before?.booking_request_id as string));

  if (notified && before?.booking_request_id) {
    scheduleEmail(() => sendMeetingLinkNotifications(before.booking_request_id as string, sessionId));
  }

  // Fill the calendar event's description with the full booking details.
  scheduleCalendarSync({ sessionIds: [sessionId] });

  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/ambassador");
  return sessionActionResult({ updated: notified ? "teams-link-sent" : "teams-link" });
}

// Settings: pushes bookings into the schools@ Outlook calendar (past and
// future, newest first), in batches so each press finishes quickly. Safe to
// press repeatedly: existing events are updated, never duplicated.
export async function syncCalendarNowAction() {
  const actor = await requirePortalAccess("super_admin");
  const result = await reconcileCalendar(80).catch(() => null);
  await logAuditEvent(actor.id, "settings.calendar_synced", "settings");

  if (!result) {
    redirect("/admin/settings?calendarSync=error");
  }

  if (!result.configured) {
    redirect("/admin/settings?calendarSync=unconfigured");
  }

  const { added, updated, removed, failed } = result.counts;
  redirect(`/admin/settings?calendarSync=${added}-${updated}-${removed}-${failed}-${result.remaining}`);
}

// Settings: creates a throwaway Teams meeting on the shared calendar and then
// deletes it, to prove the Microsoft connection works on this deployment.
export async function testMicrosoftTeamsAction() {
  const actor = await requirePortalAccess("super_admin");
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const result = await createOrUpdateTeamsMeeting({
    title: "NZ Esports booking platform – connection test (safe to delete)",
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 15 * 60 * 1000).toISOString(),
    description: "Created by the booking platform to test the Microsoft Teams connection. It is deleted straight away.",
    location: "Online (Microsoft Teams)"
  });

  await logAuditEvent(actor.id, "settings.microsoft_teams_tested", "settings");

  if (result.status === "unconfigured") {
    redirect("/admin/settings?teams=unconfigured");
  }

  if (result.status === "failed") {
    redirect(`/admin/settings?teams=${result.code}`);
  }

  const deleted = await deleteOutlookCalendarEvent(result.eventId).catch(() => false);
  redirect(
    `/admin/settings?teams=ok${deleted ? "" : "&teamsCleanup=failed"}`
  );
}

// Replaces the private online booking link: bumping the version changes the
// signed token, so every copy of the old link already shared stops working.
export async function rotateOnlineBookingLinkAction(formData: FormData) {
  const actor = await requirePortalAccess("super_admin");
  const returnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/admin/bookings"),
    "/admin/bookings"
  );
  const admin = getAdminClientOrThrow();
  const currentVersion = await getOnlineBookingLinkVersion();
  const { error } = await admin.from("settings").upsert(
    {
      setting_key: ONLINE_BOOKING_LINK_SETTING_KEY,
      setting_value: { version: currentVersion + 1 },
      updated_by: actor.id,
      updated_at: new Date().toISOString()
    },
    { onConflict: "setting_key" }
  );

  if (error) {
    redirect(appendSearchParam(returnTo, "error", "online-link-replace-failed"));
  }

  await logAuditEvent(actor.id, "settings.online_booking_link_replaced", "settings");
  redirect(appendSearchParam(returnTo, "replaced", "online-link"));
}

// Lets staff fill in or correct the student numbers on an existing session,
// e.g. completed bookings imported without a count.
export async function updateSessionStudentCountsAction(
  _previousState: SessionActionState,
  formData: FormData
): Promise<SessionActionState> {
  const actor = await requirePortalAccess("staff");
  const parsed = updateSessionStudentCountsSchema.safeParse({
    sessionId: String(formData.get("sessionId") || ""),
    expectedStudentCount: String(formData.get("expectedStudentCount") ?? "").trim(),
    actualStudentCount: String(formData.get("actualStudentCount") ?? "").trim()
  });

  if (!parsed.success) {
    return sessionActionResult({ error: "invalid-student-count" });
  }

  const admin = getAdminClientOrThrow();
  const { data: session } = await admin
    .from("booking_sessions")
    .select("id, booking_request_id, expected_student_count, actual_student_count")
    .eq("id", parsed.data.sessionId)
    .maybeSingle();

  if (!session) {
    return sessionActionResult({ error: "session-not-found" });
  }

  const { error } = await admin
    .from("booking_sessions")
    .update({
      expected_student_count: parsed.data.expectedStudentCount,
      actual_student_count: parsed.data.actualStudentCount
    })
    .eq("id", parsed.data.sessionId);

  if (error) {
    return sessionActionResult({ error: "student-count-update-failed" });
  }

  await admin.from("booking_activity_logs").insert({
    booking_request_id: session.booking_request_id,
    booking_session_id: parsed.data.sessionId,
    action: "booking.student_counts_updated",
    actor_id: actor.id,
    actor_type: "staff",
    details: {
      expectedStudentCount: {
        from: session.expected_student_count,
        to: parsed.data.expectedStudentCount
      },
      actualStudentCount: {
        from: session.actual_student_count,
        to: parsed.data.actualStudentCount
      }
    }
  });

  await logAuditEvent(
    actor.id,
    "booking.student_counts_updated",
    "booking_session",
    parsed.data.sessionId
  );
  scheduleCalendarSync({ sessionIds: [parsed.data.sessionId] });
  revalidatePath("/staff");
  revalidatePath("/admin");
  return sessionActionResult({ updated: "students" });
}

// Staff accept the date a school moved its session to (manage-booking link).
// The session already carries the new time; this just clears the flag that
// keeps it in the "Rescheduling" view.
export async function confirmRescheduledSessionAction(
  _previousState: SessionActionState,
  formData: FormData
): Promise<SessionActionState> {
  const actor = await requirePortalAccess("staff");
  const sessionId = z.uuid().safeParse(String(formData.get("sessionId") || ""));

  if (!sessionId.success) {
    return sessionActionResult({ error: "session-not-found" });
  }

  // What staff were shown: the start time and the moment the school moved
  // it. Each school move stamps a new reschedule_confirmation_needed_at, so
  // a move, cancel and re-move back to the same time still doesn't match.
  // Both are required; one conditional update means nothing can land
  // between the check and the write.
  const timestamp = z.iso.datetime({ offset: true });
  const expectedStartsAt = timestamp.safeParse(String(formData.get("expectedStartsAt") || ""));
  const expectedFlaggedAt = timestamp.safeParse(String(formData.get("expectedFlaggedAt") || ""));

  if (!expectedStartsAt.success || !expectedFlaggedAt.success) {
    return sessionActionResult({ error: "reschedule-changed" });
  }

  const admin = getAdminClientOrThrow();
  const { data: session, error } = await admin
    .from("booking_sessions")
    .update({ reschedule_confirmation_needed_at: null })
    .eq("id", sessionId.data)
    .in("status", ["requested", "tentative", "applied", "ambassador_assigned", "confirmed"])
    .eq("starts_at", expectedStartsAt.data)
    .eq("reschedule_confirmation_needed_at", expectedFlaggedAt.data)
    .select("id, booking_request_id, starts_at")
    .maybeSingle();

  if (error) {
    return sessionActionResult({ error: "reschedule-confirm-failed" });
  }

  if (!session) {
    const { data: current } = await admin
      .from("booking_sessions")
      .select("id, status, starts_at, reschedule_confirmation_needed_at")
      .eq("id", sessionId.data)
      .maybeSingle();

    // A cleared flag is a successful retry only if this is still the same
    // active session. Cancellation also clears it and must not read as a
    // successful confirmation of the old panel.
    const alreadyConfirmed = current &&
      ["requested", "tentative", "applied", "ambassador_assigned", "confirmed"].includes(current.status) &&
      new Date(current.starts_at).getTime() === new Date(expectedStartsAt.data).getTime() &&
      !current.reschedule_confirmation_needed_at;
    return alreadyConfirmed
      ? sessionActionResult({ updated: "reschedule-confirmed" })
      : sessionActionResult({ error: "reschedule-changed" });
  }

  await admin.from("booking_activity_logs").insert({
    booking_request_id: session.booking_request_id,
    booking_session_id: session.id,
    action: "session.reschedule_confirmed",
    actor_id: actor.id,
    actor_type: "staff",
    details: { starts_at: session.starts_at }
  });
  await logAuditEvent(actor.id, "session.reschedule_confirmed", "booking_session", session.id as string);
  scheduleCalendarSync({ sessionIds: [session.id as string] });
  revalidatePath("/staff");
  revalidatePath("/admin");
  return sessionActionResult({ updated: "reschedule-confirmed" });
}

const reportMediaUploadRequestSchema = z
  .array(z.object({ name: z.string().min(1).max(255), size: z.number().int().positive() }))
  .min(1)
  .max(REPORT_MEDIA_MAX_FILES);

async function prepareReportMediaUploads(userId: string, files: unknown) {
  const parsed = reportMediaUploadRequestSchema.safeParse(files);
  if (!parsed.success) {
    return { error: "Choose up to 15 photos, videos or PDFs, 5 MB each." };
  }
  try {
    return {
      uploads: await Promise.all(
        parsed.data.map((file) => prepareReportMediaUpload(userId, file.name, file.size))
      )
    };
  } catch (error) {
    console.error("[report-media] Could not prepare upload", error);
    return { error: "Could not start the upload. Check the file type and size, then try again." };
  }
}

export async function prepareAmbassadorReportMediaUploadAction(
  files: Array<{ name: string; size: number }>
) {
  const actor = await requirePortalAccess("ambassador");
  return prepareReportMediaUploads(actor.id, files);
}

export async function prepareStaffReportMediaUploadAction(
  files: Array<{ name: string; size: number }>
) {
  const actor = await requirePortalAccess("staff");
  return prepareReportMediaUploads(actor.id, files);
}

// Report forms submit only the storage paths of files the browser already
// uploaded. Returns null when anything is off so the caller can reject the
// whole submission rather than silently dropping evidence.
async function readUploadedReportMedia(formData: FormData, userId: string) {
  const raw = String(formData.get("mediaUploads") || "");

  if (!raw) {
    return [];
  }

  let entries: unknown;

  try {
    entries = JSON.parse(raw);
  } catch {
    return null;
  }

  const parsed = z
    .array(z.object({ path: z.string().min(1).max(512), name: z.string().min(1).max(255) }))
    .max(REPORT_MEDIA_MAX_FILES)
    .safeParse(entries);

  if (!parsed.success) {
    return null;
  }

  try {
    return await Promise.all(
      parsed.data.map(async (entry) => {
        const contentType = await validateUploadedReportMedia(userId, entry.path);
        return {
          storagePath: entry.path,
          title: entry.name,
          mediaType: contentType.startsWith("video/")
            ? "video"
            : contentType === "application/pdf"
              ? "document"
              : "image"
        };
      })
    );
  } catch {
    return null;
  }
}

export async function prepareResourceUploadAction(input: { name: string; size: number }) {
  const actor = await requirePortalAccess("staff");
  const parsed = z.object({ name: z.string().min(1).max(255), size: z.number().int().positive() }).safeParse(input);
  if (!parsed.success) return { error: "Choose a valid resource file." };
  try {
    return { upload: await prepareResourceUpload(actor.id, parsed.data.name, parsed.data.size) };
  } catch (error) {
    console.error("[resource-upload] Could not prepare upload", error);
    return { error: "Could not start the upload. Check the file type and size, then try again." };
  }
}

// Keep the standalone resource page's native form contract; the modal consumes
// structured errors so a rejected upload never navigates away from its fields.
export async function saveResourceAction(formData: FormData) {
  const result = await saveResourceEditorAction(formData);
  if (result.redirectTo) redirect(result.redirectTo);
  const returnTo = sanitizeReturnTo(String(formData.get("returnTo") || "/staff/resources"), "/staff/resources");
  redirect(appendSearchParam(returnTo, "error", result.errorCode ?? "resource-save-failed"));
}

export async function saveResourceEditorAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/resources"),
    "/staff/resources"
  );

  if (formData.get("intent") === "delete") {
    const resourceId = z.uuid().safeParse(String(formData.get("id") || ""));

    if (!resourceId.success) {
      return { error: "Check the title, audience and presentation, then try again.", errorCode: "invalid-resource" };
    }

    const admin = getAdminClientOrThrow();
    const { data: resource, error: resourceError } = await admin
      .from("presentation_resources")
      .select("storage_path")
      .eq("id", resourceId.data)
      .maybeSingle();

    if (resourceError || !resource) {
      return { error: "The resource could not be deleted. Please try again.", errorCode: "resource-delete-failed" };
    }

    const { error: deleteError } = await admin
      .from("presentation_resources")
      .delete()
      .eq("id", resourceId.data);

    if (deleteError) {
      return { error: "The resource could not be deleted. Please try again.", errorCode: "resource-delete-failed" };
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
    return { redirectTo: appendSearchParam(fallbackReturnTo, "deleted", "resource") };
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
    return { error: "Check the title, audience and presentation, then try again.", errorCode: "invalid-resource" };
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
    return { error: "Check the title, audience and presentation, then try again.", errorCode: "invalid-resource" };
  }

  const file = formData.get("file");
  let storagePath: string | null = null;
  const uploadedPath = String(formData.get("uploadedStoragePath") || "");
  if (uploadedPath) {
    try {
      storagePath = await validateUploadedResource(actor.id, uploadedPath);
    } catch (error) {
      console.error("[resource-upload] Could not verify uploaded file", error);
      return { error: "The uploaded file could not be verified. Please try again.", errorCode: "resource-upload-failed" };
    }
  }

  if (!uploadedPath && file instanceof File && file.size > 0) {
    try {
      const upload = await uploadPrivateResourceFile(file);
      storagePath = upload.storagePath;
    } catch (error) {
      console.error("[resource-upload] Upload failed", error);
      return { error: "The file could not be uploaded. Check your connection and use a supported file up to 40 MB, then try again.", errorCode: "resource-upload-failed" };
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

  if (storagePath || !parsed.data.id || formData.get("removeAttachment") === "on") {
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
    console.error("[resource-save] Save failed", { code: error.code, message: error.message });
    if (storagePath && !uploadedPath) await deletePrivateResourceFile(storagePath).catch(() => undefined);
    return { error: "The resource could not be saved. Your entries are still here; please try again.", errorCode: "resource-save-failed" };
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
    return { redirectTo: `${parsed.data.returnTo.replace(/\/new$/, `/${resourceId}`)}?saved=resource` };
  }

  return { redirectTo: appendSearchParam(parsed.data.returnTo, "saved", "resource") };
}

export async function updateTrainingPackResourcesAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const parsed = z.object({
    packId: z.uuid(), resourceIds: z.array(z.uuid()).min(1).max(100),
    intent: z.enum(["add", "remove", "draft"])
  }).safeParse({ packId: formData.get("packId"), resourceIds: formData.getAll("resourceId"), intent: formData.get("intent") });
  if (!parsed.success) return { error: "Choose at least one resource (up to 100)." };
  const admin = getAdminClientOrThrow();
  const { packId, resourceIds, intent } = parsed.data;
  const { data: pack } = await admin.from("training_resource_packs").select("id").eq("id", packId).maybeSingle();
  if (!pack) return { error: "This training pack could not be found." };
  if (intent === "add") {
    const { data: resources, error } = await admin.from("presentation_resources").select("id, audiences").in("id", resourceIds);
    if (error || resources?.length !== new Set(resourceIds).size || resources.some((resource) => !resource.audiences?.includes("ambassador"))) {
      return { error: "Select resources that are available to ambassadors. Edit their audience first if needed." };
    }
    const { error: linkError } = await admin.from("training_pack_resources").upsert(
      [...new Set(resourceIds)].map((resourceId) => ({ training_pack_id: packId, resource_id: resourceId })),
      { onConflict: "training_pack_id,resource_id", ignoreDuplicates: true }
    );
    if (linkError) return { error: "Resources could not be added. Check that the shared-pack database update has been applied." };
  } else if (intent === "remove") {
    const { error: legacyError } = await admin.from("presentation_resources").update({ training_pack_id: null }).eq("training_pack_id", packId).in("id", resourceIds);
    if (legacyError) return { error: "Resources could not be removed from the pack." };
    const { error } = await admin.from("training_pack_resources").delete().eq("training_pack_id", packId).in("resource_id", resourceIds);
    if (error) return { error: "Resources could not be removed from the pack." };
  } else {
    const { data: links, error: linkError } = await admin.from("training_pack_resources").select("resource_id").eq("training_pack_id", packId).in("resource_id", resourceIds);
    if (linkError || links?.length !== new Set(resourceIds).size) return { error: "These resources are no longer in this pack." };
    const { error } = await admin.from("presentation_resources").update({ is_active: false }).in("id", resourceIds);
    if (error) return { error: "The resources could not be saved as drafts." };
  }
  await logAuditEvent(actor.id, `training_pack.resources_${intent}`, "training_resource_pack", packId);
  updateTag(PUBLIC_CONTENT_TAG);
  revalidatePath("/admin"); revalidatePath("/staff"); revalidatePath("/ambassador");
  return { success: true };
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
    .from("training_pack_resources")
    .select("resource_id", { count: "exact", head: true })
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

// Sends one claimed finance email and records the outcome against that claim
// only (complete_finance_payment_email, 0054): if the claim was taken over or
// already completed, this send changes nothing. Returns whether the email went
// out and its outcome was recorded.
async function sendPaymentApprovalToFinance({
  paymentId,
  claimId,
  confirmationToken,
  financeEmail,
  actorId
}: {
  paymentId: string;
  claimId: string;
  confirmationToken: string;
  financeEmail: string;
  actorId: string;
}) {
  const admin = getAdminClientOrThrow();
  const completeClaim = async (sent: boolean, error: string | null) => {
    const { data, error: completeError } = await admin.rpc("complete_finance_payment_email", {
      p_payment_id: paymentId,
      p_claim_id: claimId,
      p_sent: sent,
      p_error: error,
      p_actor_id: actorId
    });

    if (completeError || data !== true) {
      console.error("[finance] Email outcome not recorded for this claim", {
        paymentId,
        code: completeError?.code
      });
      return false;
    }

    return true;
  };

  let details: Awaited<ReturnType<typeof loadPaymentDetails>> = null;

  try {
    details = await loadPaymentDetails(paymentId);
  } catch {
    details = null;
  }

  if (!details) {
    await completeClaim(false, "Approved payment details could not be loaded.");
    return false;
  }

  let emailResult: Awaited<ReturnType<typeof sendPaymentApprovalToFinanceEmail>>;

  try {
    emailResult = await sendPaymentApprovalToFinanceEmail({
      toEmail: financeEmail,
      invoiceNumber: details.invoiceNumber,
      ambassadorName: details.ambassadorName,
      sessionDescription: details.sessionDescription,
      amountLabel: describePaymentAmount(details),
      bankAccountName: details.bankAccountName,
      bankAccountNumber: details.bankAccountNumber,
      gstNumber: details.gstNumber,
      confirmationToken,
      bookingSessionId: details.bookingSessionId
    });
  } catch (error) {
    // Release the claim as failed so staff can resend straight away.
    await completeClaim(false, error instanceof Error ? error.message : "The finance email could not be sent.");
    return false;
  }

  const sent = emailResult.status === "sent";
  const recorded = await completeClaim(
    sent,
    sent
      ? null
      : emailResult.status === "suppressed_manual_only"
        ? "Held back: this booking is record only (no emails). Use Resend to send the invoice to finance."
        : "error" in emailResult
          ? emailResult.error
          : "Brevo email delivery is not configured."
  );

  return sent && recorded;
}

export async function markReportReviewedAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const returnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/reports"),
    "/staff/reports"
  );
  const reportId = String(formData.get("reportId") || "");
  const skipPayment = formData.get("skipPayment") === "yes";
  const extraAmountInput = String(formData.get("extraAmount") ?? "").trim();
  const paymentNote = String(formData.get("paymentNote") || "").trim().slice(0, 500);

  if (!reportId) {
    redirect(appendSearchParam(returnTo, "error", "invalid-report"));
  }

  const admin = getAdminClientOrThrow();
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
          .select("id, status, amount_cents, review_required, custom_reviewed_at")
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

  // Staff may top up a payment up to $250 (e.g. for a back-to-back session in
  // a separate booking at the same school, which the grouped report doesn't
  // cover), or approve a report with no payment when another report's top-up
  // covers it. Both need a note, whole dollars only so the finance email shows
  // exactly what is paid. The approval RPC re-checks every rule inside its
  // transaction.
  //
  // A payment created for custom review (0056: a gap over 1 up to 2 hours or
  // of 4+ hours, three or more sessions, overlapping or invalid times) is only
  // approved with an explicit staff decision: the custom amount typed in
  // (even 0), the review confirmed and a note; or no payment with a note.
  // approve_ambassador_report_payment refuses anything else, so these checks
  // only give staff a clear message first.
  let extraAmountCents = 0;
  const needsCustomReview = Boolean(payment?.review_required) && !payment?.custom_reviewed_at;
  const customReviewConfirmed = formData.get("customReviewConfirmed") === "yes";

  if (payment && !skipPayment) {
    const parsedExtra = parseExtraAmountCents(extraAmountInput);

    if (parsedExtra === null) {
      redirect(appendSearchParam(returnTo, "error", "invalid-payment-amount"));
    }

    extraAmountCents = parsedExtra;
  }

  if (needsCustomReview && !skipPayment && (!customReviewConfirmed || extraAmountInput === "")) {
    redirect(appendSearchParam(returnTo, "error", "custom-review-required"));
  }

  if (payment && (skipPayment || extraAmountCents > 0 || needsCustomReview) && paymentNote.length < 3) {
    redirect(appendSearchParam(returnTo, "error", "payment-note-required"));
  }

  if (payment && skipPayment) {
    const { data: approvalRows, error: approvalError } = await admin.rpc(
      "approve_ambassador_report_payment",
      {
        p_report_id: report.id,
        p_actor_id: actor.id,
        p_skip_payment: true,
        p_payment_note: paymentNote
      }
    );

    if (approvalError) {
      redirect(appendSearchParam(returnTo, "error", "report-review-failed"));
    }

    const approval = Array.isArray(approvalRows) ? approvalRows[0] : null;

    if (!approval?.did_approve) {
      redirect(appendSearchParam(returnTo, "approved", "report"));
    }

    await admin.from("booking_activity_logs").insert({
      booking_session_id: report.booking_session_id,
      action: "payment.approved_without_payment",
      actor_id: actor.id,
      actor_type: actor.role,
      details: { payment_note: paymentNote, ...(needsCustomReview ? { custom_review: true } : {}) }
    });
    await logAuditEvent(actor.id, "payment.approved_without_payment", "payment", payment.id as string);
  } else if (payment) {
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
    const paymentSettings = await getPaymentSettings();
    // Approval leaves the payment "Ready for finance"; the confirmation token
    // is only created when staff send it (claim_finance_payment_email).
    const { data: approvalRows, error: approvalError } = await admin.rpc(
      "approve_ambassador_report_payment",
      {
        p_report_id: report.id,
        p_actor_id: actor.id,
        p_invoice_number: invoiceNumber,
        p_bank_account_name: bankAccountName,
        p_bank_account_number: bankAccountNumber,
        p_gst_number: String(ambassadorProfile?.gst_number ?? "").trim() || null,
        p_finance_email: paymentSettings.financeEmail,
        p_extra_amount_cents: extraAmountCents,
        p_payment_note: extraAmountCents > 0 || needsCustomReview ? paymentNote : null,
        p_review_confirmed: needsCustomReview && customReviewConfirmed
      }
    );

    const approval = Array.isArray(approvalRows) ? approvalRows[0] : null;

    if (approvalError) {
      redirect(appendSearchParam(returnTo, "error", "report-review-failed"));
    }

    if (!approval?.did_approve) {
      redirect(appendSearchParam(returnTo, "approved", "report"));
    }

    // Two-step finance: approval only prepares the payment (the RPC leaves no
    // email status). Staff send it to finance separately from the Payments
    // tab ("Ready for finance"), so the amount and bank details get a second
    // look before Nate is emailed.
    await admin.from("booking_activity_logs").insert({
      booking_session_id: report.booking_session_id,
      action: "payment.approved_for_finance",
      actor_id: actor.id,
      actor_type: actor.role,
      details: {
        invoice_number: invoiceNumber,
        finance_email_status: "ready",
        ...(extraAmountCents > 0 || needsCustomReview
          ? { extra_amount_cents: extraAmountCents, payment_note: paymentNote }
          : {}),
        ...(needsCustomReview ? { custom_review: true } : {})
      }
    });

    if (ambassadorProfile?.user_id) {
      void notifyUser(ambassadorProfile.user_id as string, {
        title: "Report approved for payment",
        body: `Your report has been approved (invoice ${invoiceNumber}). We'll let you know when your payment has been sent to finance.`,
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
  redirect(
    appendSearchParam(
      returnTo,
      "approved",
      !payment ? "report" : skipPayment ? "report-no-payment" : "report-payment"
    )
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
  sourcedAmountDollars: z.coerce.number().min(0),
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
  let financeEmailChange: { from: string; to: string } | null = null;

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
      sourcedAmountDollars: formData.get("sourcedAmountDollars") || 0,
      eligibleAttendeeThreshold: formData.get("eligibleAttendeeThreshold") || 0
    });

    if (parsed.success) {
      const { defaultAmountDollars, sourcedAmountDollars, ...rest } = parsed.data;
      // Approved invoices, including ambassadors' bank details and the
      // one-click "mark paid" link, go to this address. Staff run payments
      // day to day, but only a super admin may redirect where they are sent.
      const currentFinanceEmail = (await getPaymentSettings()).financeEmail;

      if (rest.financeEmail.trim().toLowerCase() !== currentFinanceEmail.trim().toLowerCase()) {
        if (actor.role !== "super_admin") {
          redirect(appendSearchParam(returnTo, "error", "finance-email-super-admin-only"));
        }

        financeEmailChange = { from: currentFinanceEmail, to: rest.financeEmail };
      }

      settingValue = {
        ...rest,
        defaultAmountCents: Math.round(defaultAmountDollars * 100),
        sourcedAmountCents: Math.round(sourcedAmountDollars * 100)
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

  if (financeEmailChange) {
    const change = financeEmailChange;
    await logAuditEvent(actor.id, "settings.finance_email_changed", "setting", section);
    const { data: superAdmins } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "super_admin")
      .eq("status", "active");

    for (const superAdmin of superAdmins ?? []) {
      void notifyUser(superAdmin.id as string, {
        title: "Finance email address changed",
        body: `${actor.fullName} changed where payment invoices are sent from ${change.from} to ${change.to}.`,
        type: "settings_finance_email_changed",
        relatedUrl: "/staff/settings"
      }).catch(() => {});
    }
  }

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

type FinanceSendResult = { tone: "success" | "error"; message: string };

// Sends an approved payment to finance: the first send from "Ready for
// finance", or a resend after a failed/unconfirmed email or expired link.
// Returns the outcome instead of redirecting so the Payments page refreshes in
// place (no jump to the top) and shows the result as a toast.
export async function sendFinancePaymentEmailAction(formData: FormData): Promise<FinanceSendResult> {
  const actor = await requirePortalAccess("staff");
  const parsed = retryFinanceEmailSchema.safeParse({
    paymentId: String(formData.get("paymentId") || ""),
    returnTo: sanitizeReturnTo(String(formData.get("returnTo") || "/staff/payments"), "/staff/payments")
  });

  if (!parsed.success) {
    return { tone: "error", message: "The payment could not be updated. Please try again." };
  }

  const admin = getAdminClientOrThrow();
  const paymentSettings = await getPaymentSettings();
  const confirmation = createFinanceConfirmationToken();
  // One atomic claim decides who sends: first send, a failed send, an expired
  // link, or a send left pending past the stale window. A concurrent click
  // (or a retry while a send is in flight) gets no claim and sends nothing.
  const { data: claimRows, error: claimError } = await admin.rpc("claim_finance_payment_email", {
    p_payment_id: parsed.data.paymentId,
    p_actor_id: actor.id,
    p_token_hash: confirmation.tokenHash,
    p_token_expires_at: confirmation.expiresAt,
    p_finance_email: paymentSettings.financeEmail,
    p_stale_after_seconds: FINANCE_EMAIL_CLAIM_STALE_SECONDS
  });
  const claim = Array.isArray(claimRows) ? claimRows[0] : null;

  if (claimError) {
    return { tone: "error", message: "The payment could not be updated. Please try again." };
  }

  if (!claim?.claim_id) {
    return {
      tone: "error",
      message:
        "That payment is already with finance or being sent right now. Refresh the page to see its latest status."
    };
  }

  const payment = {
    id: parsed.data.paymentId,
    booking_session_id: claim.booking_session_id as string,
    invoice_number: claim.invoice_number as string
  };
  const firstSend = claim.first_send === true;

  // A staff member clicking Resend is a deliberate manual send, so it goes
  // out even for a record-only booking (whose automatic emails are held).
  const { data: paymentSession } = await admin
    .from("booking_sessions")
    .select("booking_request_id")
    .eq("id", payment.booking_session_id)
    .maybeSingle();
  const sendToFinance = () =>
    sendPaymentApprovalToFinance({
      paymentId: payment.id,
      claimId: claim.claim_id as string,
      confirmationToken: confirmation.token,
      financeEmail: paymentSettings.financeEmail,
      actorId: actor.id
    });
  const emailSent = paymentSession?.booking_request_id
    ? await emailDeliveryContext.run(
        { ...emailDeliveryContext.getStore(), manualBookingId: paymentSession.booking_request_id as string },
        sendToFinance
      )
    : await sendToFinance();

  const sendAction = firstSend ? "payment.sent_to_finance" : "payment.finance_email_retried";
  await admin.from("booking_activity_logs").insert({
    booking_session_id: payment.booking_session_id,
    action: sendAction,
    actor_id: actor.id,
    actor_type: actor.role,
    details: {
      invoice_number: payment.invoice_number,
      finance_email_status: emailSent ? "sent" : "failed"
    }
  });

  // Ambassadors can see their payment has gone to finance (and chase it).
  if (emailSent && firstSend) {
    const { data: paymentOwner } = await admin
      .from("payments")
      .select("amount_cents, ambassador_profiles(user_id)")
      .eq("id", payment.id as string)
      .maybeSingle();
    const ownerUserId = relationOne(paymentOwner?.ambassador_profiles)?.user_id as string | undefined;

    if (ownerUserId) {
      void notifyUser(ownerUserId, {
        title: "Payment sent to finance",
        body: `Your ${formatCurrency(Number(paymentOwner?.amount_cents ?? 0))} payment (invoice ${payment.invoice_number}) has been sent to finance to be paid.`,
        type: "payment_sent_to_finance",
        relatedUrl: "/ambassador/earnings"
      }).catch(() => {});
    }
  }

  await logAuditEvent(actor.id, sendAction, "payment", payment.id as string);
  revalidatePath("/ambassador");
  revalidatePath("/staff");
  revalidatePath("/admin");
  return emailSent
    ? {
        tone: "success",
        message: `Invoice ${payment.invoice_number} sent to finance. It's now listed under With finance.`
      }
    : {
        tone: "error",
        message:
          "The finance email couldn't be sent. The approval and invoice number are safe; the reason is shown under Finance delivery issues."
      };
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
