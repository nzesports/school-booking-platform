"use server";

import { revalidatePath as nextRevalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { buildAuthConfirmUrl, requirePortalAccess } from "@/lib/services/auth";
import { PLATFORM_DATA_TAG, PUBLIC_CONTENT_TAG } from "@/lib/services/cache-tags";
import { syncSessionToCalendar } from "@/lib/services/calendar-triggers";
import {
  sendAmbassadorAssignedEmail,
  sendBookingCancelledEmail,
  sendBookingConfirmedEmail,
  sendFeedbackRequestEmail,
  sendInvoiceToFinanceEmail
} from "@/lib/services/email-triggers";
import {
  buildInvoicePdf,
  generateInvoiceNumber,
  loadInvoiceDetails
} from "@/lib/services/invoices";
import { notifyStaff, notifyUser } from "@/lib/services/notifications";
import { sanitizeRichText } from "@/lib/services/sanitize";
import { uploadPrivateResourceFile, uploadPublicAsset } from "@/lib/services/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDateTime, nzDateTimeToIso, slugify, splitCommaList } from "@/lib/utils";

// Every path revalidation in this module accompanies a data write, so bust the
// shared platform-data cache (lib/services/portal.ts) at the same time. This
// keeps the 60s cache from ever serving stale data after a portal action.
function revalidatePath(path: string) {
  updateTag(PLATFORM_DATA_TAG);
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
  schoolId: z.uuid(),
  presentationTypeId: z.uuid(),
  assignedAmbassadorId: z.string().optional(),
  outreachAmbassadorId: z.string().optional(),
  status: z.enum([
    "tentative",
    "ambassador_needed",
    "ambassador_assigned",
    "confirmed",
    "reschedule_requested",
    "cancel_requested",
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
});

const ambassadorReportSubmitSchema = z.object({
  bookingSessionId: z.uuid(),
  presenterName: z.string().min(2),
  schoolName: z.string().min(2),
  schoolRollSize: z.coerce.number().int().nonnegative().optional(),
  primaryContactName: z.string().min(2),
  primaryContactEmail: z.string().email(),
  regionLocation: z.string().optional(),
  deliveredDate: z.string().min(1),
  deliveredTime: z.string().min(1),
  firstPresentation: z.enum(["yes", "no"]),
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

const sessionApplicationSchema = z.object({
  bookingSessionId: z.uuid(),
  message: z.string().optional(),
  returnTo: z.string().min(1).default("/ambassador/open-bookings")
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
  mailingListOptIn: z.enum(["yes", "no"]),
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
  intent: z.enum(["reschedule", "cancel"]),
  preferredDate: z.string().optional(),
  notes: z.string().optional(),
  returnTo: z.string().min(1).default("/school/bookings")
});

const assignAmbassadorSchema = z.object({
  bookingSessionId: z.uuid(),
  ambassadorProfileId: z.uuid(),
  returnTo: z.string().min(1)
});

const updateBookingStatusSchema = z.object({
  bookingRequestId: z.uuid(),
  status: z.enum([
    "tentative",
    "ambassador_needed",
    "ambassador_assigned",
    "confirmed",
    "reschedule_requested",
    "cancel_requested",
    "completed_pending_report",
    "report_submitted",
    "paid",
    "closed",
    "cancelled",
    "declined"
  ]),
  reason: z.string().optional(),
  returnTo: z.string().min(1)
});

const SESSION_CASCADE: Partial<Record<string, { to: string; onlyFrom?: string[] }>> = {
  confirmed: {
    to: "confirmed",
    onlyFrom: [
      "tentative",
      "ambassador_needed",
      "ambassador_applied",
      "ambassador_assigned",
      "reschedule_requested"
    ]
  },
  cancelled: { to: "cancelled" },
  ambassador_needed: { to: "ambassador_needed", onlyFrom: ["tentative"] }
};

const trainingCompleteSchema = z.object({
  trainingModuleId: z.uuid(),
  trainingLessonId: z.string().optional(),
  returnTo: z.string().min(1).default("/ambassador/training")
});

const resourceSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(2),
  description: z.string().optional(),
  audiences: z.array(z.enum(["school", "ambassador", "staff"])).min(1),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  resourceType: z.string().min(1),
  presentationTypeId: z.string().optional(),
  versionLabel: z.string().optional(),
  youtubeUrl: z.string().optional(),
  externalUrl: z.string().optional(),
  isCurrent: z.boolean().optional(),
  isActive: z.boolean().optional(),
  returnTo: z.string().min(1)
});

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

const ambassadorPaymentDetailsSchema = z.object({
  bankAccountNumber: z.string().trim().regex(nzBankAccountPattern),
  gstNumber: z.string().trim().optional(),
  returnTo: z.string().min(1).default("/ambassador/profile")
});

const invoiceSubmitSchema = z.object({
  paymentId: z.uuid(),
  bankAccountNumber: z.string().trim().regex(nzBankAccountPattern),
  gstNumber: z.string().trim().optional(),
  invoiceNotes: z.string().max(2000).optional(),
  saveToProfile: z.boolean().optional(),
  returnTo: z.string().min(1).default("/ambassador/earnings")
});

const sendInvoiceToFinanceSchema = z.object({
  paymentId: z.uuid(),
  toEmail: z.string().trim().email(),
  ccEmail: z.string().optional(),
  returnTo: z.string().min(1).default("/staff/payments")
});

const markPaymentPaidSchema = z.object({
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
    redirect(`${fallbackReturnTo}?error=invalid-review`);
  }

  const admin = getAdminClientOrThrow();
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

  const { error } = await admin
    .from("ambassador_profiles")
    .update(updatePayload)
    .eq("id", parsed.data.ambassadorProfileId);

  if (error) {
    redirect(`${parsed.data.returnTo}?error=review-failed`);
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

  await logAuditEvent(
    actor.id,
    parsed.data.status === "approved"
      ? "ambassador.approved"
      : parsed.data.status === "inactive"
        ? "ambassador.access_restricted"
        : "ambassador.declined",
    "ambassador_profile",
    parsed.data.ambassadorProfileId
  );

  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(`${parsed.data.returnTo}?reviewed=${parsed.data.status}`);
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
    schoolId: String(formData.get("schoolId") || ""),
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
  const { data: school } = await admin
    .from("schools")
    .select("id, region_id")
    .eq("id", parsed.data.schoolId)
    .maybeSingle();

  if (!school) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-school-missing"));
  }

  const startsAt = new Date(nzDateTimeToIso(parsed.data.date, parsed.data.startTime));
  const endsAt = new Date(startsAt.getTime() + parsed.data.durationMinutes * 60 * 1000);
  const reportStatus = parsed.data.status === "report_submitted" ? "submitted" : "not_submitted";
  const paymentStatus = parsed.data.status === "report_submitted" ? "eligible" : "not_eligible";

  const { data: booking, error: bookingError } = await admin
    .from("booking_requests")
    .insert({
      school_id: parsed.data.schoolId,
      region_id: school.region_id ?? null,
      status: parsed.data.status,
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
      school_id: parsed.data.schoolId,
      assigned_ambassador_id: parsed.data.assignedAmbassadorId || null,
      status: parsed.data.status,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      year_levels: parsed.data.yearLevels,
      expected_student_count: parsed.data.expectedStudentCount,
      actual_student_count: parsed.data.actualStudentCount ?? null,
      internal_notes: parsed.data.internalNotes || null,
      report_status: reportStatus,
      payment_status: paymentStatus
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-session-save-failed"));
  }

  await admin.from("booking_status_history").insert({
    booking_request_id: booking.id,
    booking_session_id: session.id,
    new_status: parsed.data.status,
    changed_by: actor.id,
    reason: "Manual staff entry"
  });

  await logAuditEvent(actor.id, "booking.manually_created", "booking_request", booking.id);
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(parsed.data.returnTo, "created", "booking"));
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
    schoolRollSize: String(formData.get("schoolRollSize") || "") || undefined,
    primaryContactName: String(formData.get("primaryContactName") || ""),
    primaryContactEmail: String(formData.get("primaryContactEmail") || ""),
    regionLocation: String(formData.get("regionLocation") || "") || undefined,
    deliveredDate: String(formData.get("deliveredDate") || ""),
    deliveredTime: String(formData.get("deliveredTime") || ""),
    firstPresentation: String(formData.get("firstPresentation") || ""),
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

  const deliveredAt = new Date(`${parsed.data.deliveredDate}T${parsed.data.deliveredTime}:00`);

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
    .select("id, booking_request_id, assigned_ambassador_id, starts_at, school_id")
    .eq("id", parsed.data.bookingSessionId)
    .maybeSingle();

  if (!session || session.assigned_ambassador_id !== ambassadorProfile.id) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-assigned"));
  }

  if (session.starts_at && new Date(session.starts_at as string).getTime() > Date.now()) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-finished"));
  }

  const { data: existingReport } = await admin
    .from("ambassador_reports")
    .select("id")
    .eq("booking_session_id", parsed.data.bookingSessionId)
    .maybeSingle();

  if (existingReport) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "report-already-submitted"));
  }

  const { data: report, error: reportError } = await admin
    .from("ambassador_reports")
    .insert({
      booking_session_id: parsed.data.bookingSessionId,
      ambassador_profile_id: ambassadorProfile.id,
      presenter_name: parsed.data.presenterName,
      school_roll_size: parsed.data.schoolRollSize ?? null,
      primary_contact_name: parsed.data.primaryContactName,
      primary_contact_email: parsed.data.primaryContactEmail,
      delivered_at: Number.isNaN(deliveredAt.getTime())
        ? (session.starts_at ?? new Date().toISOString())
        : deliveredAt.toISOString(),
      first_presentation_to_school: parsed.data.firstPresentation === "yes",
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
        parsed.data.regionLocation?.trim()
          ? `Region / location: ${parsed.data.regionLocation.trim()}`
          : "",
        parsed.data.schoolName.trim() ? `School (as entered): ${parsed.data.schoolName.trim()}` : ""
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
  // media library, linked to this report for staff review.
  const mediaFiles = formData
    .getAll("mediaFiles")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0)
    .slice(0, 6);

  for (const file of mediaFiles) {
    try {
      const upload = await uploadPublicAsset(file, "report-media");
      await admin.from("media_library").insert({
        title: file.name,
        media_type: file.type.startsWith("video/")
          ? "video"
          : file.type === "application/pdf"
            ? "document"
            : "image",
        storage_path: upload.storagePath,
        public_url: upload.publicUrl,
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
  const paymentStatus = isPaymentEligible ? "eligible" : "not_eligible";
  const eligibilityReason = isPaymentEligible
    ? `Attendee count ${parsed.data.attendeeCount} meets threshold of ${eligibleThreshold}.`
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
      eligibility_reason: eligibilityReason
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
      payment_status: paymentStatus
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

  const { data: existing } = await admin
    .from("booking_session_applications")
    .select("id")
    .eq("booking_session_id", parsed.data.bookingSessionId)
    .eq("ambassador_profile_id", ambassadorProfile.id)
    .maybeSingle();

  if (existing) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "already-applied"));
  }

  const { error } = await admin.from("booking_session_applications").insert({
    booking_session_id: parsed.data.bookingSessionId,
    ambassador_profile_id: ambassadorProfile.id,
    status: "applied",
    message: parsed.data.message || null
  });

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "application-failed"));
  }

  await admin
    .from("booking_sessions")
    .update({ status: "ambassador_applied" })
    .eq("id", parsed.data.bookingSessionId)
    .eq("status", "ambassador_needed");

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
    mailingListOptIn: String(formData.get("mailingListOptIn") || ""),
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
  const overallRating = Math.round(
    (parsedData.attendanceRating +
      parsedData.studentResponseRating +
      parsedData.contentRating +
      parsedData.presenterEnergyRating) /
      4
  );
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
    .select("id, school_id, presentation_type_id")
    .eq("id", parsed.data.bookingSessionId)
    .maybeSingle();

  if (!session) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-found"));
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

  if (!schoolIds.has(session.school_id as string)) {
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
    relatedUrl: "/admin/feedback"
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
    .select("id, school_id, presentation_type_id, ends_at")
    .eq("id", parsed.data.bookingSessionId)
    .maybeSingle();

  if (!session) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "session-not-found"));
  }

  // Feedback only opens once the session time has passed.
  if (new Date(session.ends_at as string).getTime() > Date.now()) {
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
    relatedUrl: "/admin/feedback"
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
    preferredDate: String(formData.get("preferredDate") || "") || undefined,
    notes:
      String(formData.get("notes") || formData.get("reason") || "") ||
      undefined,
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-change-request"));
  }

  const admin = getAdminClientOrThrow();
  const { data: booking } = await admin
    .from("booking_requests")
    .select("id, school_id")
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

  if (!schoolIds.has(booking.school_id as string)) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-not-owned"));
  }

  const nextStatus =
    parsed.data.intent === "reschedule" ? "reschedule_requested" : "cancel_requested";
  const noteParts = [
    parsed.data.notes,
    parsed.data.preferredDate ? `Preferred date: ${parsed.data.preferredDate}` : null
  ].filter(Boolean);
  const { error } = await admin
    .from("booking_requests")
    .update({
      status: nextStatus,
      requested_different_time: parsed.data.intent === "reschedule",
      requested_time_notes: noteParts.join("\n") || null
    })
    .eq("id", parsed.data.bookingRequestId);

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "change-request-failed"));
  }

  await admin.from("booking_status_history").insert({
    booking_request_id: parsed.data.bookingRequestId,
    new_status: nextStatus,
    changed_by: actor.id,
    reason: noteParts.join(" ") || `School requested ${parsed.data.intent}`
  });

  await admin.from("booking_activity_logs").insert({
    booking_request_id: parsed.data.bookingRequestId,
    action: `booking.${parsed.data.intent}_requested`,
    actor_id: actor.id,
    actor_type: "school",
    details: {
      preferred_date: parsed.data.preferredDate ?? null,
      notes: parsed.data.notes ?? null
    }
  });

  const { data: changeSchool } = booking.school_id
    ? await admin.from("schools").select("name").eq("id", booking.school_id).maybeSingle()
    : { data: null };
  void notifyStaff({
    title: `${(changeSchool?.name as string | null) ?? "A school"} requested ${parsed.data.intent}`,
    body: parsed.data.notes ?? `School requested a ${parsed.data.intent}.`,
    type: `booking_${parsed.data.intent}_requested`,
    relatedUrl: "/staff/bookings"
  }).catch(() => {});

  await logAuditEvent(
    actor.id,
    `booking.${parsed.data.intent}_requested`,
    "booking_request",
    parsed.data.bookingRequestId
  );
  revalidatePath("/school");
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(parsed.data.returnTo, "requested", parsed.data.intent));
}

export async function assignAmbassadorAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/bookings"),
    "/staff/bookings"
  );
  const parsed = assignAmbassadorSchema.safeParse({
    bookingSessionId: String(formData.get("bookingSessionId") || ""),
    ambassadorProfileId: String(formData.get("ambassadorProfileId") || ""),
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-assign"));
  }

  const admin = getAdminClientOrThrow();
  const { error } = await admin
    .from("booking_sessions")
    .update({
      assigned_ambassador_id: parsed.data.ambassadorProfileId,
      status: "ambassador_assigned"
    })
    .eq("id", parsed.data.bookingSessionId);

  if (error) {
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
    .neq("ambassador_profile_id", parsed.data.ambassadorProfileId);

  await admin.from("booking_status_history").insert({
    booking_session_id: parsed.data.bookingSessionId,
    new_status: "ambassador_assigned",
    changed_by: actor.id,
    reason: "Ambassador manually assigned by staff"
  });

  await admin.from("booking_activity_logs").insert({
    booking_session_id: parsed.data.bookingSessionId,
    action: "session.ambassador_assigned",
    actor_id: actor.id,
    actor_type: "staff",
    details: { ambassador_profile_id: parsed.data.ambassadorProfileId }
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

  if (session && school && presentation && ambassadorUser?.email) {
    void sendAmbassadorAssignedEmail({
      ambassadorEmail: ambassadorUser.email as string,
      ambassadorName: (ambassadorUser.full_name as string | null) ?? "Ambassador",
      schoolName: (school.name as string | null) ?? "School",
      sessionDate: formatDateTime(session.starts_at as string),
      sessionAddress: (school.address as string | null) ?? "",
      presentationTitle: (presentation.title as string | null) ?? "Presentation",
      bookingSessionId: parsed.data.bookingSessionId
    }).catch(() => {});

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

  await logAuditEvent(
    actor.id,
    "session.ambassador_assigned",
    "booking_session",
    parsed.data.bookingSessionId
  );
  revalidatePath("/staff");
  revalidatePath("/admin");
  revalidatePath("/ambassador");
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
    reason: String(formData.get("reason") || "") || undefined,
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-status"));
  }

  const admin = getAdminClientOrThrow();
  const { data: existingBooking } = await admin
    .from("booking_requests")
    .select("id, status, school_id, primary_contact_id")
    .eq("id", parsed.data.bookingRequestId)
    .maybeSingle();

  if (!existingBooking) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "booking-not-found"));
  }

  // A booking can't be marked delivered/completed before its sessions have
  // actually happened.
  const completionStatuses = ["completed_pending_report", "report_submitted", "paid", "closed"];

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

  const { error } = await admin
    .from("booking_requests")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.bookingRequestId);

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "status-update-failed"));
  }

  const cascade = SESSION_CASCADE[parsed.data.status];

  if (cascade) {
    let sessionUpdate = admin
      .from("booking_sessions")
      .update({ status: cascade.to })
      .eq("booking_request_id", parsed.data.bookingRequestId);

    if (cascade.onlyFrom) {
      sessionUpdate = sessionUpdate.in("status", cascade.onlyFrom);
    }

    const { error: cascadeError } = await sessionUpdate;

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

  if (
    parsed.data.status === "confirmed" ||
    parsed.data.status === "cancelled" ||
    parsed.data.status === "completed_pending_report"
  ) {
    const { data: firstSession } = await admin
      .from("booking_sessions")
      .select("id, starts_at, presentation_type_id")
      .eq("booking_request_id", parsed.data.bookingRequestId)
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const { data: contact } = existingBooking.primary_contact_id
      ? await admin
          .from("school_contacts")
          .select("full_name, email")
          .eq("id", existingBooking.primary_contact_id)
          .maybeSingle()
      : { data: null };
    const { data: school } = existingBooking.school_id
      ? await admin.from("schools").select("name").eq("id", existingBooking.school_id).maybeSingle()
      : { data: null };
    const { data: presentation } = firstSession?.presentation_type_id
      ? await admin
          .from("presentation_types")
          .select("title")
          .eq("id", firstSession.presentation_type_id)
          .maybeSingle()
      : { data: null };

    if (contact?.email && firstSession) {
      const emailPayload = {
        contactEmail: contact.email as string,
        contactName: (contact.full_name as string | null) ?? "there",
        schoolName: (school?.name as string | null) ?? "your school",
        sessionDate: formatDateTime(firstSession.starts_at as string),
        presentationTitle: (presentation?.title as string | null) ?? "your presentation",
        bookingId: parsed.data.bookingRequestId,
        bookingSessionId: firstSession.id as string
      };

      if (parsed.data.status === "confirmed") {
        void sendBookingConfirmedEmail(emailPayload).catch(() => {});
      }

      if (
        parsed.data.status === "cancelled" &&
        existingBooking.status === "cancel_requested"
      ) {
        void sendBookingCancelledEmail(emailPayload).catch(() => {});
      }

      // Delivered sessions trigger the post-session feedback invitation.
      if (parsed.data.status === "completed_pending_report") {
        void sendFeedbackRequestEmail(emailPayload).catch(() => {});
      }
    }
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

export async function markTrainingCompleteAction(formData: FormData) {
  const actor = await requirePortalAccess("ambassador");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/ambassador/training"),
    "/ambassador/training"
  );
  const parsed = trainingCompleteSchema.safeParse({
    trainingModuleId: String(formData.get("trainingModuleId") || ""),
    trainingLessonId: String(formData.get("trainingLessonId") || "") || undefined,
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-training"));
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

  let existingQuery = admin
    .from("training_progress")
    .select("id")
    .eq("ambassador_profile_id", ambassadorProfile.id)
    .eq("training_module_id", parsed.data.trainingModuleId);

  existingQuery = parsed.data.trainingLessonId
    ? existingQuery.eq("training_lesson_id", parsed.data.trainingLessonId)
    : existingQuery.is("training_lesson_id", null);

  const { data: existing } = await existingQuery.maybeSingle();
  const payload = {
    ambassador_profile_id: ambassadorProfile.id,
    training_module_id: parsed.data.trainingModuleId,
    training_lesson_id: parsed.data.trainingLessonId || null,
    status: "completed",
    completed_at: new Date().toISOString()
  };
  const { error } = existing?.id
    ? await admin.from("training_progress").update(payload).eq("id", existing.id)
    : await admin.from("training_progress").insert(payload);

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "training-save-failed"));
  }

  await logAuditEvent(actor.id, "training.completed", "training_module", parsed.data.trainingModuleId);
  revalidatePath("/ambassador");
  redirect(appendSearchParam(parsed.data.returnTo, "completed", "training"));
}

export async function saveResourceAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/resources"),
    "/staff/resources"
  );
  const parsed = resourceSchema.safeParse({
    id: String(formData.get("id") || "") || undefined,
    title: String(formData.get("title") || ""),
    description: String(formData.get("description") || ""),
    audiences: formData.getAll("audiences").map(String),
    tags: splitCommaList(String(formData.get("tags") || "")),
    resourceType: String(formData.get("resourceType") || ""),
    presentationTypeId: String(formData.get("presentationTypeId") || "") || undefined,
    versionLabel: String(formData.get("versionLabel") || "") || undefined,
    youtubeUrl: String(formData.get("youtubeUrl") || "") || undefined,
    externalUrl: String(formData.get("externalUrl") || "") || undefined,
    isCurrent: formData.get("isCurrent") === "on",
    isActive: formData.get("isActive") === "on",
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(`${fallbackReturnTo}?error=invalid-resource`);
  }

  const file = formData.get("file");
  let storagePath: string | null = null;

  if (file instanceof File && file.size > 0) {
    try {
      const upload = await uploadPrivateResourceFile(file);
      storagePath = upload.storagePath;
    } catch {
      redirect(`${parsed.data.returnTo}?error=resource-upload-failed`);
    }
  }

  const admin = getAdminClientOrThrow();
  const payload: Record<string, unknown> = {
    title: parsed.data.title,
    description: parsed.data.description || null,
    audiences: parsed.data.audiences,
    tags: parsed.data.tags,
    resource_type: parsed.data.resourceType,
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

  const query = parsed.data.id
    ? admin
        .from("presentation_resources")
        .update(payload)
        .eq("id", parsed.data.id)
        .select("id")
        .single()
    : admin.from("presentation_resources").insert(payload).select("id").single();

  const { data, error } = await query;

  if (error) {
    redirect(`${parsed.data.returnTo}?error=resource-save-failed`);
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

  redirect(`${parsed.data.returnTo}?saved=resource`);
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
      body_html: sanitizeRichText(parsed.data.bodyHtml),
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

export async function saveAmbassadorPaymentDetailsAction(formData: FormData) {
  const actor = await requirePortalAccess("ambassador");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/ambassador/profile"),
    "/ambassador/profile"
  );
  const parsed = ambassadorPaymentDetailsSchema.safeParse({
    bankAccountNumber: String(formData.get("bankAccountNumber") || ""),
    gstNumber: String(formData.get("gstNumber") || "") || undefined,
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-payment-details"));
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

  const { error } = await admin
    .from("ambassador_profiles")
    .update({
      bank_account_number: parsed.data.bankAccountNumber,
      gst_number: parsed.data.gstNumber || null
    })
    .eq("id", ambassadorProfile.id);

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "payment-details-save-failed"));
  }

  await logAuditEvent(
    actor.id,
    "ambassador.payment_details_updated",
    "ambassador_profile",
    ambassadorProfile.id
  );
  revalidatePath("/ambassador");
  redirect(appendSearchParam(parsed.data.returnTo, "saved", "payment-details"));
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
  const { error } = await admin
    .from("ambassador_reports")
    .update({
      reviewed_for_payment_at: new Date().toISOString(),
      reviewed_for_payment_by: actor.id
    })
    .eq("id", reportId);

  if (error) {
    redirect(appendSearchParam(returnTo, "error", "report-review-failed"));
  }

  await logAuditEvent(actor.id, "report.reviewed_for_payment", "ambassador_report", reportId);
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(returnTo, "saved", "report-reviewed"));
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
    .select("id")
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

  const weeklyAvailability: Record<string, string> = {};
  for (const day of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
    const value = String(formData.get(`availability-${day}`) || "").trim();

    if (value) {
      weeklyAvailability[day] = value;
    }
  }

  const profileDetails = {
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

  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: fullName, phone: phone || null })
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
    bank_account_name: String(formData.get("bankAccountName") || "").trim() || null,
    bank_account_number: String(formData.get("bankAccountNumber") || "").trim() || null,
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

export async function submitPaymentInvoiceAction(formData: FormData) {
  const actor = await requirePortalAccess("ambassador");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/ambassador/earnings"),
    "/ambassador/earnings"
  );
  const parsed = invoiceSubmitSchema.safeParse({
    paymentId: String(formData.get("paymentId") || ""),
    bankAccountNumber: String(formData.get("bankAccountNumber") || ""),
    gstNumber: String(formData.get("gstNumber") || "") || undefined,
    invoiceNotes: String(formData.get("invoiceNotes") || "") || undefined,
    saveToProfile: formData.get("saveToProfile") === "on",
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-invoice"));
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

  const { data: payment } = await admin
    .from("payments")
    .select("id, booking_session_id, ambassador_profile_id, status, invoice_number")
    .eq("id", parsed.data.paymentId)
    .maybeSingle();

  if (!payment || payment.ambassador_profile_id !== ambassadorProfile.id) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "payment-not-found"));
  }

  if (payment.status !== "pending" || payment.invoice_number) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "payment-not-invoiceable"));
  }

  const submittedAt = new Date();
  const invoiceNumber = generateInvoiceNumber(payment.id as string, submittedAt);
  const { error } = await admin
    .from("payments")
    .update({
      status: "invoiced",
      invoice_number: invoiceNumber,
      bank_account_number: parsed.data.bankAccountNumber,
      gst_number: parsed.data.gstNumber || null,
      invoice_notes: parsed.data.invoiceNotes || null,
      invoice_submitted_at: submittedAt.toISOString(),
      updated_by: actor.id
    })
    .eq("id", payment.id);

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "invoice-save-failed"));
  }

  if (parsed.data.saveToProfile) {
    await admin
      .from("ambassador_profiles")
      .update({
        bank_account_number: parsed.data.bankAccountNumber,
        gst_number: parsed.data.gstNumber || null
      })
      .eq("id", ambassadorProfile.id);
  }

  await admin.from("booking_activity_logs").insert({
    booking_session_id: payment.booking_session_id,
    action: "payment.invoice_submitted",
    actor_id: actor.id,
    actor_type: "ambassador",
    details: { invoice_number: invoiceNumber }
  });

  void notifyStaff({
    title: `Invoice received from ${actor.fullName}`,
    body: `Invoice ${invoiceNumber} is ready to review and send to finance.`,
    type: "payment_invoice_submitted",
    relatedUrl: "/staff/payments"
  }).catch(() => {});

  await logAuditEvent(actor.id, "payment.invoice_submitted", "payment", payment.id as string);
  revalidatePath("/ambassador");
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(parsed.data.returnTo, "submitted", "invoice"));
}

export async function sendInvoiceToFinanceAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/payments"),
    "/staff/payments"
  );
  const parsed = sendInvoiceToFinanceSchema.safeParse({
    paymentId: String(formData.get("paymentId") || ""),
    toEmail: String(formData.get("toEmail") || ""),
    ccEmail: String(formData.get("ccEmail") || "") || undefined,
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-finance-email"));
  }

  const ccEmails = splitCommaList(parsed.data.ccEmail ?? "");

  if (ccEmails.some((email) => !z.string().email().safeParse(email).success)) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "invalid-finance-email"));
  }

  const admin = getAdminClientOrThrow();
  const { data: payment } = await admin
    .from("payments")
    .select("id, booking_session_id, status, invoice_number")
    .eq("id", parsed.data.paymentId)
    .maybeSingle();

  if (!payment || payment.status !== "invoiced" || !payment.invoice_number) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "invoice-not-ready"));
  }

  const details = await loadInvoiceDetails(payment.id as string);

  if (!details) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "invoice-not-ready"));
  }

  const pdfBytes = await buildInvoicePdf(details);
  const emailResult = await sendInvoiceToFinanceEmail({
    toEmail: parsed.data.toEmail,
    ccEmails,
    invoiceNumber: details.invoiceNumber,
    ambassadorName: details.ambassadorName,
    sessionDescription: details.sessionDescription,
    amountLabel: formatCurrency(details.amountCents, details.currency),
    bookingSessionId: details.bookingSessionId,
    attachment: {
      name: `${details.invoiceNumber}.pdf`,
      contentBase64: Buffer.from(pdfBytes).toString("base64")
    }
  });

  // Only flip the status once the email is out the door; a hard failure keeps
  // the invoice retryable. "skipped_unconfigured" still progresses so the flow
  // works in environments without Brevo keys.
  if (emailResult.status === "failed") {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "invoice-email-failed"));
  }

  const { error } = await admin
    .from("payments")
    .update({
      status: "submitted_for_payment",
      sent_to_finance_at: new Date().toISOString(),
      sent_to_email: parsed.data.toEmail,
      sent_cc_email: ccEmails.length > 0 ? ccEmails.join(", ") : null,
      updated_by: actor.id
    })
    .eq("id", payment.id);

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "invoice-update-failed"));
  }

  await admin.from("booking_activity_logs").insert({
    booking_session_id: payment.booking_session_id,
    action: "payment.sent_to_finance",
    actor_id: actor.id,
    actor_type: "staff",
    details: { invoice_number: details.invoiceNumber, sent_to: parsed.data.toEmail }
  });

  if (details.ambassadorUserId) {
    void notifyUser(details.ambassadorUserId, {
      title: "Invoice submitted for payment",
      body: `The team has submitted your invoice ${details.invoiceNumber} to finance for payment.`,
      type: "payment_submitted_for_payment",
      relatedUrl: "/ambassador/earnings"
    }).catch(() => {});
  }

  await logAuditEvent(actor.id, "payment.sent_to_finance", "payment", payment.id as string);
  revalidatePath("/ambassador");
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(parsed.data.returnTo, "sent", "invoice"));
}

export async function markPaymentPaidAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = sanitizeReturnTo(
    String(formData.get("returnTo") || "/staff/payments"),
    "/staff/payments"
  );
  const parsed = markPaymentPaidSchema.safeParse({
    paymentId: String(formData.get("paymentId") || ""),
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-payment"));
  }

  const admin = getAdminClientOrThrow();
  const { data: payment } = await admin
    .from("payments")
    .select("id, booking_session_id, ambassador_profile_id, status, invoice_number")
    .eq("id", parsed.data.paymentId)
    .maybeSingle();

  if (!payment) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "payment-not-found"));
  }

  if (!["pending", "eligible", "invoiced", "submitted_for_payment"].includes(payment.status as string)) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "payment-not-payable"));
  }

  const { error } = await admin
    .from("payments")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      updated_by: actor.id
    })
    .eq("id", payment.id);

  if (error) {
    redirect(appendSearchParam(parsed.data.returnTo, "error", "payment-update-failed"));
  }

  await admin
    .from("booking_sessions")
    .update({ payment_status: "paid" })
    .eq("id", payment.booking_session_id);

  await admin.from("booking_activity_logs").insert({
    booking_session_id: payment.booking_session_id,
    action: "payment.marked_paid",
    actor_id: actor.id,
    actor_type: "staff",
    details: { invoice_number: payment.invoice_number }
  });

  if (payment.ambassador_profile_id) {
    const { data: ambassadorProfile } = await admin
      .from("ambassador_profiles")
      .select("user_id")
      .eq("id", payment.ambassador_profile_id)
      .maybeSingle();

    if (ambassadorProfile?.user_id) {
      void notifyUser(ambassadorProfile.user_id as string, {
        title: "Payment sent",
        body: payment.invoice_number
          ? `Your invoice ${payment.invoice_number} has been marked as paid.`
          : "Your session payment has been marked as paid.",
        type: "payment_paid",
        relatedUrl: "/ambassador/earnings"
      }).catch(() => {});
    }
  }

  await logAuditEvent(actor.id, "payment.marked_paid", "payment", payment.id as string);
  revalidatePath("/ambassador");
  revalidatePath("/staff");
  revalidatePath("/admin");
  redirect(appendSearchParam(parsed.data.returnTo, "paid", "1"));
}
