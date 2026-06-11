# Implementation Plan — School Booking Platform

> Generated 2026-06-11. This plan is designed to be handed off to an implementing agent.
> All file paths are relative to the project root.
> Complete items in order within each phase — later items sometimes depend on earlier ones.

---

## Codex implementation notes — 2026-06-11

> Codex-added progress note, not part of the original audit text.

- Implemented Phase 1.1 region and presentation UUID lookup in `lib/services/bookings.ts`, plus public booking activity logging and booking-received email trigger.
- Implemented Phase 2 server actions for ambassador reports, session applications, school reviews, staff ambassador assignment, booking status updates, manual school/booking entries, and training completion.
- Implemented Phase 3/4 trigger helpers in `lib/services/email-triggers.ts` and `lib/services/calendar-triggers.ts`; assignment and booking confirmation actions call them non-blockingly.
- Implemented Phase 5 staff calendar/settings coverage was verified as already present; ambassador training now uses portal data and can mark modules complete.
- Implemented Phase 6 metric correction for operations cards and added booking activity log writes for key flows.
- Implemented Phase 7 migration as `supabase/migrations/0004_audit_plan_fixes.sql` with review/session FK, report columns, nullable manual booking contact support, event actor type, and training module publication flags.
- Implemented Phase 8.1 on-demand private resource download route at `app/portal/download/[resourceId]/route.ts` and switched portal resource links to use it.
- Implemented Phase 7.3 with a DB-backed availability config loader in `lib/services/availability-server.ts`, while keeping the slot builder client-safe and passing config into the public booking UI.
- Implemented Phase 6.3 funnel metrics from `booking_activity_logs` for submissions, confirmations, conversion rate, and average confirmation time.
- Documented Phase 1.2 school portal access behavior in `docs/SCHOOL_PORTAL_ACCESS.md`.

---

## Context for the implementing agent

This is a Next.js 16 + Supabase school booking platform for delivering esports/digital-wellbeing presentations to NZ schools. The database schema is fully designed and seeded. The UI skeleton is largely in place. The gap is that many forms have no server action behind them, and several integrations (email, calendar) are wired up but never called.

**Key files to understand before starting:**
- `app/portal/actions.ts` — all Server Actions live here
- `lib/services/portal.ts` — the `loadPlatformData()` function that all portals call
- `lib/services/bookings.ts` — public booking submission
- `lib/services/email.ts` — `sendTransactionalEmail()`, ready to call
- `lib/services/calendar.ts` — `createOutlookCalendarEvent()`, ready to call
- `supabase/migrations/0001_initial_schema.sql` — authoritative DB schema

**Architecture pattern for Server Actions:**
1. `requirePortalAccess(role)` at the top for auth guard
2. `z.object().safeParse(formData)` for validation
3. `getAdminClientOrThrow()` for DB access
4. DB mutation
5. `await logAuditEvent(...)` for audit trail
6. `revalidatePath(...)` then `redirect(...)`

---

## Phase 1 — Critical Bugs (fix first, nothing else works correctly without these)

### 1.1 Fix `region_id: null` in public booking submission

**File:** `lib/services/bookings.ts`  
**Problem:** Lines 64 and 100 hardcode `region_id: null` when creating schools and booking_requests. The region slug is available in `input.regionSlug` but never resolved to a UUID.  
**Fix:** Before creating the school, resolve `regionSlug` to a `region_id` with a DB lookup. Use that ID everywhere.

```ts
// Add this block after line 48 (after `const now = new Date().toISOString()`)
const { data: region } = await admin
  .from("regions")
  .select("id")
  .eq("slug", regionSlug)
  .maybeSingle();
const resolvedRegionId = region?.id ?? null;
```

Then replace every `region_id: null` in this function with `region_id: resolvedRegionId`.

Also fix `booking_sessions` insert (line 120): the `presentation_type_id` is looked up from the in-memory `presentations` demo array. It should instead query the DB:

```ts
// Replace the presentations.find() block with:
const { data: presentationType } = await admin
  .from("presentation_types")
  .select("id")
  .eq("slug", session.presentationSlug)
  .maybeSingle();
```

Then use `presentationType?.id ?? null` for `presentation_type_id`.

---

### 1.2 Fix school_contact_users record not created on public booking

**File:** `lib/services/bookings.ts`  
**Problem:** When a school books via the public form, a `school_contact` record is created but a `school_contact_users` row is never created. This means the contact can't log in to the school portal later (the RLS policy for `school` role reads `school_contact_users` to authorise access).  
**Note:** The `on_auth_user_created` trigger handles this for signup flow — but for the public booking flow, the contact record is created manually (no auth user yet). The fix is to leave a `TODO` comment noting that `school_contact_users` should be created when the contact later registers.

Actually, this is **by design** — the public booking doesn't require the school to create an account. No fix needed, but the school portal access flow should be documented: school contacts receive a "set up your account" email after booking (see Phase 2.2 email triggers).

---

## Phase 2 — Missing Server Actions

### 2.1 Ambassador report submission

**Where the form is:** The ambassador portal at `/ambassador/completed` lists completed sessions. Each session should have a "Submit Report" button linking to `/ambassador/report/[sessionId]`.  
**What's missing:** The page route, the form component, and the server action.

**Step A — Create the server action in `app/portal/actions.ts`:**

Add a new Zod schema after the existing schemas (around line 130):

```ts
const ambassadorReportSubmitSchema = z.object({
  bookingSessionId: z.uuid(),
  attendeeCount: z.coerce.number().int().nonnegative(),
  yearLevels: z.string().min(1),
  teacherResponseRating: z.coerce.number().int().min(1).max(5),
  studentEngagementRating: z.coerce.number().int().min(1).max(5),
  presentationFeedback: z.string().optional(),
  notableQuestions: z.string().optional(),
  mediaConsentObtained: z.boolean().optional(),
  returnTo: z.string().min(1).default("/ambassador/completed")
});
```

Add the action function:

```ts
export async function submitAmbassadorReportAction(formData: FormData) {
  const actor = await requirePortalAccess("ambassador");
  const fallbackReturnTo = String(formData.get("returnTo") || "/ambassador/completed");
  const parsed = ambassadorReportSubmitSchema.safeParse({
    bookingSessionId: String(formData.get("bookingSessionId") || ""),
    attendeeCount: formData.get("attendeeCount"),
    yearLevels: String(formData.get("yearLevels") || ""),
    teacherResponseRating: formData.get("teacherResponseRating"),
    studentEngagementRating: formData.get("studentEngagementRating"),
    presentationFeedback: String(formData.get("presentationFeedback") || "") || undefined,
    notableQuestions: String(formData.get("notableQuestions") || "") || undefined,
    mediaConsentObtained: formData.get("mediaConsentObtained") === "on",
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-report"));
  }

  const admin = getAdminClientOrThrow();

  // Look up the ambassador_profile for this user
  const { data: ambProfile } = await admin
    .from("ambassador_profiles")
    .select("id")
    .eq("user_id", actor.id)
    .maybeSingle();

  if (!ambProfile) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "ambassador-not-found"));
  }

  // Check report not already submitted
  const { data: existing } = await admin
    .from("ambassador_reports")
    .select("id")
    .eq("booking_session_id", parsed.data.bookingSessionId)
    .maybeSingle();

  if (existing) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "report-already-submitted"));
  }

  // Insert report
  const { error: reportError } = await admin.from("ambassador_reports").insert({
    booking_session_id: parsed.data.bookingSessionId,
    ambassador_profile_id: ambProfile.id,
    attendee_count: parsed.data.attendeeCount,
    year_levels: parsed.data.yearLevels,
    teacher_response_rating: parsed.data.teacherResponseRating,
    student_engagement_rating: parsed.data.studentEngagementRating,
    presentation_feedback: parsed.data.presentationFeedback || null,
    notable_questions: parsed.data.notableQuestions || null,
    media_consent_obtained: parsed.data.mediaConsentObtained ?? false,
    submitted_at: new Date().toISOString()
  });

  if (reportError) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "report-save-failed"));
  }

  // Update session report_status and payment_status
  // Payment is eligible if attendee_count >= 100 (configurable threshold)
  const ELIGIBLE_THRESHOLD = 100;
  const paymentStatus = parsed.data.attendeeCount >= ELIGIBLE_THRESHOLD ? "eligible" : "not_eligible";
  const eligibilityReason = parsed.data.attendeeCount >= ELIGIBLE_THRESHOLD
    ? `Attendee count ${parsed.data.attendeeCount} meets threshold of ${ELIGIBLE_THRESHOLD}`
    : `Attendee count ${parsed.data.attendeeCount} below threshold of ${ELIGIBLE_THRESHOLD}`;

  await admin
    .from("booking_sessions")
    .update({
      report_status: "submitted",
      payment_status: paymentStatus,
      actual_student_count: parsed.data.attendeeCount,
      status: "report_submitted"
    })
    .eq("id", parsed.data.bookingSessionId);

  // Create payment record if eligible
  if (paymentStatus === "eligible") {
    await admin.from("payments").insert({
      booking_session_id: parsed.data.bookingSessionId,
      ambassador_profile_id: ambProfile.id,
      amount_cents: 0, // Staff will set final amount
      status: "pending_review",
      eligibility_reason: eligibilityReason
    });
  }

  // Update booking_requests status to report_submitted
  const { data: session } = await admin
    .from("booking_sessions")
    .select("booking_request_id")
    .eq("id", parsed.data.bookingSessionId)
    .maybeSingle();

  if (session?.booking_request_id) {
    await admin
      .from("booking_requests")
      .update({ status: "report_submitted" })
      .eq("id", session.booking_request_id);
  }

  await logAuditEvent(actor.id, "report.submitted", "ambassador_report");
  revalidatePath("/ambassador");
  revalidatePath("/staff");
  redirect(appendSearchParam(parsed.data.returnTo, "submitted", "report"));
}
```

**Step B — Create the report page:**  
Create `app/ambassador/[[...slug]]/page.tsx` already handles routing via catch-all. Add a `"report"` case in the slug routing to render a report form. The form needs fields: attendeeCount, yearLevels (checkboxes), teacherResponseRating (1–5 stars), studentEngagementRating (1–5 stars), presentationFeedback (textarea), notableQuestions (textarea), mediaConsentObtained (checkbox).

---

### 2.2 Session application flow (ambassador applies to open session)

**Where schema is:** `booking_session_applications` table in DB.  
**What's missing:** Action handler and UI button on the open-bookings view.

**Add schema to `app/portal/actions.ts`:**

```ts
const sessionApplicationSchema = z.object({
  bookingSessionId: z.uuid(),
  message: z.string().optional(),
  returnTo: z.string().min(1).default("/ambassador/open-bookings")
});
```

**Add action:**

```ts
export async function applyToSessionAction(formData: FormData) {
  const actor = await requirePortalAccess("ambassador");
  const fallbackReturnTo = String(formData.get("returnTo") || "/ambassador/open-bookings");
  const parsed = sessionApplicationSchema.safeParse({
    bookingSessionId: String(formData.get("bookingSessionId") || ""),
    message: String(formData.get("message") || "") || undefined,
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-application"));
  }

  const admin = getAdminClientOrThrow();

  const { data: ambProfile } = await admin
    .from("ambassador_profiles")
    .select("id")
    .eq("user_id", actor.id)
    .maybeSingle();

  if (!ambProfile) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "ambassador-not-found"));
  }

  // Check not already applied
  const { data: existing } = await admin
    .from("booking_session_applications")
    .select("id")
    .eq("booking_session_id", parsed.data.bookingSessionId)
    .eq("ambassador_profile_id", ambProfile.id)
    .maybeSingle();

  if (existing) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "already-applied"));
  }

  const { error } = await admin.from("booking_session_applications").insert({
    booking_session_id: parsed.data.bookingSessionId,
    ambassador_profile_id: ambProfile.id,
    status: "pending",
    message: parsed.data.message || null
  });

  if (error) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "application-failed"));
  }

  // Update session status to ambassador_applied
  await admin
    .from("booking_sessions")
    .update({ status: "ambassador_applied" })
    .eq("id", parsed.data.bookingSessionId)
    .eq("status", "ambassador_needed"); // Only if not already applied to

  await logAuditEvent(actor.id, "session.applied", "booking_session_application");
  revalidatePath("/ambassador");
  revalidatePath("/staff");
  redirect(appendSearchParam(parsed.data.returnTo, "applied", "1"));
}
```

**UI:** In the ambassador portal's open-bookings view, for each session card, add a small form with hidden `bookingSessionId` input and a "Apply" button that posts to `applyToSessionAction`. If `applied=1` is in the query string, show a success toast.

---

### 2.3 School session review submission

**What's missing:** The school portal nav links to `/school/review/[sessionId]` but there's no page or action.

**Add schema to `app/portal/actions.ts`:**

```ts
const schoolReviewSchema = z.object({
  bookingSessionId: z.uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  quote: z.string().min(10),
  attribution: z.string().min(2),
  isPublic: z.boolean().optional(),
  returnTo: z.string().min(1).default("/school/bookings")
});
```

**Add action:**

```ts
export async function submitSchoolReviewAction(formData: FormData) {
  const actor = await requirePortalAccess("school");
  const fallbackReturnTo = String(formData.get("returnTo") || "/school/bookings");
  const parsed = schoolReviewSchema.safeParse({
    bookingSessionId: String(formData.get("bookingSessionId") || ""),
    rating: formData.get("rating"),
    quote: String(formData.get("quote") || ""),
    attribution: String(formData.get("attribution") || ""),
    isPublic: formData.get("isPublic") === "on",
    returnTo: fallbackReturnTo
  });

  if (!parsed.success) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "invalid-review"));
  }

  const admin = getAdminClientOrThrow();

  // Get school_id from session
  const { data: session } = await admin
    .from("booking_sessions")
    .select("school_id, presentation_type_id")
    .eq("id", parsed.data.bookingSessionId)
    .maybeSingle();

  if (!session) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "session-not-found"));
  }

  const { error } = await admin.from("presentation_reviews").insert({
    booking_session_id: parsed.data.bookingSessionId,
    presentation_type_id: session.presentation_type_id,
    school_id: session.school_id,
    quote: parsed.data.quote,
    attribution: parsed.data.attribution,
    rating: parsed.data.rating,
    is_public: parsed.data.isPublic ?? false,
    is_approved: false // Staff must approve before it appears publicly
  });

  if (error) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "review-save-failed"));
  }

  await logAuditEvent(actor.id, "review.submitted", "presentation_review");
  revalidatePath("/school");
  redirect(appendSearchParam(parsed.data.returnTo, "submitted", "review"));
}
```

**Note:** `booking_sessions` doesn't have a `booking_session_id` FK in `presentation_reviews` per the current schema — you may need to add that column or use `presentation_type_id` + `school_id` as the join. Check `0001_initial_schema.sql` for the exact columns on `presentation_reviews`.

---

### 2.4 Staff assigns ambassador to session

**What's missing:** There is no action to assign an ambassador to a session from the staff portal.

**Add schema to `app/portal/actions.ts`:**

```ts
const assignAmbassadorSchema = z.object({
  bookingSessionId: z.uuid(),
  ambassadorProfileId: z.uuid(),
  returnTo: z.string().min(1)
});
```

**Add action:**

```ts
export async function assignAmbassadorAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = String(formData.get("returnTo") || "/staff/bookings");
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
    redirect(appendSearchParam(fallbackReturnTo, "error", "assign-failed"));
  }

  await admin.from("booking_status_history").insert({
    booking_session_id: parsed.data.bookingSessionId,
    new_status: "ambassador_assigned",
    changed_by: actor.id,
    reason: "Ambassador manually assigned by staff"
  });

  // Trigger email + calendar (see Phase 3)
  // TODO: call sendAmbassadorAssignmentEmail(...)
  // TODO: call createOutlookCalendarEvent(...)

  await logAuditEvent(actor.id, "session.ambassador_assigned", "booking_session", parsed.data.bookingSessionId);
  revalidatePath("/staff");
  revalidatePath("/ambassador");
  redirect(appendSearchParam(parsed.data.returnTo, "assigned", "1"));
}
```

---

### 2.5 Staff approves/confirms a booking

**What's missing:** No action to move a booking from `tentative` → `confirmed`.

**Add schema to `app/portal/actions.ts`:**

```ts
const updateBookingStatusSchema = z.object({
  bookingRequestId: z.uuid(),
  status: z.enum([
    "tentative", "ambassador_needed", "ambassador_assigned",
    "confirmed", "completed_pending_report", "report_submitted",
    "paid", "closed", "cancelled"
  ]),
  reason: z.string().optional(),
  returnTo: z.string().min(1)
});
```

**Add action:**

```ts
export async function updateBookingStatusAction(formData: FormData) {
  const actor = await requirePortalAccess("staff");
  const fallbackReturnTo = String(formData.get("returnTo") || "/staff/bookings");
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

  const { error } = await admin
    .from("booking_requests")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.bookingRequestId);

  if (error) {
    redirect(appendSearchParam(fallbackReturnTo, "error", "status-update-failed"));
  }

  await admin.from("booking_status_history").insert({
    booking_request_id: parsed.data.bookingRequestId,
    new_status: parsed.data.status,
    changed_by: actor.id,
    reason: parsed.data.reason || `Status updated to ${parsed.data.status}`
  });

  // If confirmed, send confirmation email (see Phase 3)
  // TODO: if status === "confirmed" call sendBookingConfirmationEmail(...)

  await logAuditEvent(actor.id, "booking.status_updated", "booking_request", parsed.data.bookingRequestId);
  revalidatePath("/staff");
  revalidatePath("/school");
  redirect(appendSearchParam(parsed.data.returnTo, "updated", "status"));
}
```

---

## Phase 3 — Email Triggers

`lib/services/email.ts` has `sendTransactionalEmail()` fully ready. The email templates are seeded in the DB (keys: `booking_request_received`, `school_booking_confirmed`, `ambassador_assignment_confirmation`). The gap is that nothing calls this function.

**Pattern for each trigger:**
1. After DB mutation succeeds, call `sendTransactionalEmail()`
2. Log the result to `email_logs` table
3. Never throw — email failure must not abort the user-facing action

**Create `lib/services/email-triggers.ts`** (new file):

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "./email";

async function logEmail(result: Awaited<ReturnType<typeof sendTransactionalEmail>>) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("email_logs").insert({
    template_key: result.templateKey,
    recipient_email: result.recipientEmail,
    subject: result.subject,
    status: result.status,
    external_message_id: result.id
  });
}

export async function sendBookingRequestReceivedEmail(opts: {
  contactEmail: string;
  contactName: string;
  schoolName: string;
  bookingId: string;
}) {
  const result = await sendTransactionalEmail({
    templateKey: "booking_request_received",
    recipientEmail: opts.contactEmail,
    subject: "We've received your booking request",
    html: `
      <p>Hi ${opts.contactName},</p>
      <p>Thank you for your booking request for <strong>${opts.schoolName}</strong>.</p>
      <p>Your reference number is <strong>${opts.bookingId}</strong>.</p>
      <p>Our team will be in touch within 2 business days to confirm your session.</p>
    `
  });
  await logEmail(result);
  return result;
}

export async function sendBookingConfirmedEmail(opts: {
  contactEmail: string;
  contactName: string;
  schoolName: string;
  sessionDate: string;
  presentationTitle: string;
}) {
  const result = await sendTransactionalEmail({
    templateKey: "school_booking_confirmed",
    recipientEmail: opts.contactEmail,
    subject: "Your session is confirmed!",
    html: `
      <p>Hi ${opts.contactName},</p>
      <p>Great news — your <strong>${opts.presentationTitle}</strong> session for ${opts.schoolName} 
      on <strong>${opts.sessionDate}</strong> is now confirmed.</p>
      <p>We'll send you a reminder closer to the date.</p>
    `
  });
  await logEmail(result);
  return result;
}

export async function sendAmbassadorAssignedEmail(opts: {
  ambassadorEmail: string;
  ambassadorName: string;
  schoolName: string;
  sessionDate: string;
  sessionAddress: string;
  presentationTitle: string;
}) {
  const result = await sendTransactionalEmail({
    templateKey: "ambassador_assignment_confirmation",
    recipientEmail: opts.ambassadorEmail,
    subject: `Session confirmed: ${opts.presentationTitle} at ${opts.schoolName}`,
    html: `
      <p>Hi ${opts.ambassadorName},</p>
      <p>You've been assigned to deliver <strong>${opts.presentationTitle}</strong> 
      at <strong>${opts.schoolName}</strong> on <strong>${opts.sessionDate}</strong>.</p>
      <p>Location: ${opts.sessionAddress}</p>
    `
  });
  await logEmail(result);
  return result;
}
```

**Wire up triggers:**

1. In `lib/services/bookings.ts` — `submitBookingRequest()`:  
   After creating the `booking_request`, call:
   ```ts
   import { sendBookingRequestReceivedEmail } from "./email-triggers";
   // ...after successful booking_request insert:
   sendBookingRequestReceivedEmail({
     contactEmail: input.contactEmail,
     contactName: input.contactName,
     schoolName: input.schoolName,
     bookingId: bookingRequest.id
   }).catch(() => {}); // fire-and-forget, never fail the booking
   ```

2. In `app/portal/actions.ts` — `updateBookingStatusAction()`:  
   After status changes to `"confirmed"`, fetch contact email and call `sendBookingConfirmedEmail(...)`.

3. In `app/portal/actions.ts` — `assignAmbassadorAction()`:  
   After assignment, fetch ambassador's email from `profiles` and call `sendAmbassadorAssignedEmail(...)`.

**Note on email_logs table columns:** Check the exact column names in `0001_initial_schema.sql` before writing the insert — the schema may use `message_id` or `brevo_message_id` instead of `external_message_id`.

---

## Phase 4 — Calendar Sync

`lib/services/calendar.ts` has `createOutlookCalendarEvent()` fully ready. It's never called.

**Where to call it:** In `assignAmbassadorAction()` after the DB update succeeds.

**Add to `lib/services/email-triggers.ts`** (or create `lib/services/calendar-triggers.ts`):

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { createOutlookCalendarEvent } from "./calendar";

export async function syncSessionToCalendar(opts: {
  bookingSessionId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  schoolName: string;
  schoolAddress: string;
  ambassadorName: string;
}) {
  const result = await createOutlookCalendarEvent({
    title: opts.title,
    startsAt: opts.startsAt,
    endsAt: opts.endsAt,
    description: `Ambassador: ${opts.ambassadorName}<br>School: ${opts.schoolName}`,
    location: opts.schoolAddress
  });

  if (result.status === "synced") {
    const admin = createAdminClient();
    if (admin) {
      // Store external event ID so it can be updated/deleted later
      await admin.from("calendar_events").insert({
        booking_session_id: opts.bookingSessionId,
        external_event_id: result.id,
        sync_status: "synced",
        synced_at: new Date().toISOString()
      });

      // Update session with calendar_event_id
      const { data: calEvent } = await admin
        .from("calendar_events")
        .select("id")
        .eq("external_event_id", result.id)
        .maybeSingle();

      if (calEvent) {
        await admin
          .from("booking_sessions")
          .update({ calendar_event_id: calEvent.id })
          .eq("id", opts.bookingSessionId);
      }
    }
  }

  return result;
}
```

**Call site in `assignAmbassadorAction()`** (after DB update):

```ts
// Fetch session details for calendar
const { data: fullSession } = await admin
  .from("booking_sessions")
  .select("starts_at, ends_at, presentation_types(title), schools(name, address)")
  .eq("id", parsed.data.bookingSessionId)
  .maybeSingle();

// Fetch ambassador profile + user
const { data: ambUser } = await admin
  .from("ambassador_profiles")
  .select("profiles(full_name)")
  .eq("id", parsed.data.ambassadorProfileId)
  .maybeSingle();

if (fullSession) {
  syncSessionToCalendar({
    bookingSessionId: parsed.data.bookingSessionId,
    title: `Esports Session — ${fullSession.schools?.name}`,
    startsAt: fullSession.starts_at,
    endsAt: fullSession.ends_at,
    schoolName: fullSession.schools?.name ?? "Unknown School",
    schoolAddress: fullSession.schools?.address ?? "",
    ambassadorName: ambUser?.profiles?.full_name ?? "Ambassador"
  }).catch(() => {}); // fire-and-forget
}
```

---

## Phase 5 — Missing Portal Pages

### 5.1 Staff Calendar page

**File:** `app/staff/[[...slug]]/page.tsx`  
The nav links to `/staff/calendar` but the catch-all renders nothing for that slug.  
**Fix:** Add a `"calendar"` case in the slug switch that renders a list of upcoming sessions in a calendar-like UI. At minimum, render a table of sessions grouped by month with their assigned ambassador and school. Full calendar widget is optional.

### 5.2 Staff Settings page

**File:** `app/staff/[[...slug]]/page.tsx`  
The nav links to `/staff/settings` but nothing is rendered.  
**Fix:** Add a `"settings"` case that shows a read-only view of the `settings` table values from `portal.ts`'s `StaffPortalData.settings`. Staff can view, admins can edit (that's already handled in `/admin`).

### 5.3 Ambassador Training page

**File:** `app/ambassador/[[...slug]]/page.tsx`  
The nav links to `/ambassador/training` but there's no content — the `training_modules` table is empty.  
**Fix:** 
- Seed at least 2 training modules in `supabase/seed.sql` (e.g. "Platform Orientation" and "Delivery Best Practices") with placeholder YouTube URLs
- Add training content to the portal data queries in `loadPlatformData()` in `lib/services/portal.ts`
- Render the modules in a list with a "Mark Complete" button per lesson
- Add `markTrainingCompleteAction()` to `app/portal/actions.ts` that inserts into `training_progress`

**Seed SQL to add to `supabase/seed.sql`:**

```sql
INSERT INTO training_modules (title, description, sort_order, is_required, is_published) VALUES
  ('Platform Orientation', 'Learn how to use the ambassador portal, submit reports, and manage your schedule.', 1, true, true),
  ('Delivery Best Practices', 'Tips and techniques for delivering engaging presentations to school students.', 2, true, true)
ON CONFLICT DO NOTHING;
```

---

## Phase 6 — Analytics

### Current state

There is no analytics tracking beyond database audit logs. The portals show hardcoded demo metrics.

### What to build

**Decision:** Use the existing `booking_activity_logs` + `audit_logs` tables as the event store. Do not add a third-party analytics service yet — the data is already in the DB, we just need to query it.

### 6.1 Fix portal metrics to use real data

**File:** `lib/services/portal.ts`  
**Problem:** The `metrics` array in `StaffPortalData` / `AdminPortalData` is computed but it currently falls back to demo data because `loadPlatformData()` returns `null` in local dev.

When `loadPlatformData()` returns real data, the metrics are computed from the live DB data in the `buildStaffPortalData()` / `buildAdminPortalData()` functions. Verify these functions calculate the following correctly from the real query data:

- `bookings_needing_action` — count of `booking_requests` with status in `["tentative", "ambassador_needed", "ambassador_applied"]`
- `confirmed_sessions` — count with status `"confirmed"` or `"ambassador_assigned"` AND `starts_at > now()`
- `delivered_sessions` — count with status in `["report_submitted", "paid", "closed"]`
- `ambassadors_available` — count of `ambassador_profiles` where `status = "approved"`
- `new_enquiries_7d` — count of `booking_requests` where `created_at > now() - interval '7 days'`

If these calculations are wrong, fix them in the `buildStaffPortalData()` function. Look for the metrics array construction — it should be building `DashboardMetric[]` objects from the raw platform data.

### 6.2 Add event logging to key actions

Add calls to `booking_activity_logs` in the following places:

In `lib/services/bookings.ts` — `submitBookingRequest()`:
```ts
await admin.from("booking_activity_logs").insert({
  booking_request_id: bookingRequest.id,
  action: "booking_request.submitted",
  actor_type: "school",
  details: { source: "public_form", school_name: input.schoolName }
});
```

In `app/portal/actions.ts` — `assignAmbassadorAction()`:
```ts
await admin.from("booking_activity_logs").insert({
  booking_session_id: parsed.data.bookingSessionId,
  action: "session.ambassador_assigned",
  actor_id: actor.id,
  actor_type: "staff",
  details: { ambassador_profile_id: parsed.data.ambassadorProfileId }
});
```

In `app/portal/actions.ts` — `submitAmbassadorReportAction()`:
```ts
await admin.from("booking_activity_logs").insert({
  booking_session_id: parsed.data.bookingSessionId,
  action: "report.submitted",
  actor_id: actor.id,
  actor_type: "ambassador",
  details: { attendee_count: parsed.data.attendeeCount, payment_status: paymentStatus }
});
```

### 6.3 Add analytics queries to portal data

In `lib/services/portal.ts`, add to the `loadPlatformData()` Promise.all array:

```ts
admin
  .from("booking_activity_logs")
  .select("action, details, created_at")
  .order("created_at", { ascending: false })
  .limit(500),
```

Use this data to compute funnel metrics:
- Submissions in last 30d
- Confirmed sessions in last 30d
- Conversion rate (confirmed / submitted)
- Average time from submission to confirmation

These can be added as additional `DashboardMetric` items.

---

## Phase 7 — DB Schema Gaps

The following are schema issues that need to be patched. Create a new migration file: `supabase/migrations/0004_fixes.sql`

### 7.1 Add `booking_session_id` to `presentation_reviews`

The school review form needs to reference which session the review is for. Currently `presentation_reviews` only has `school_id` and `presentation_type_id` — there's no direct FK to `booking_sessions`.

```sql
ALTER TABLE presentation_reviews 
ADD COLUMN IF NOT EXISTS booking_session_id UUID REFERENCES booking_sessions(id) ON DELETE SET NULL;
```

### 7.2 Add `student_engagement_rating` to `ambassador_reports`

The report submission form collects student engagement separately from teacher response, but the schema only has `teacher_response_rating`.

```sql
ALTER TABLE ambassador_reports 
ADD COLUMN IF NOT EXISTS student_engagement_rating SMALLINT CHECK (student_engagement_rating BETWEEN 1 AND 5),
ADD COLUMN IF NOT EXISTS notable_questions TEXT,
ADD COLUMN IF NOT EXISTS media_consent_obtained BOOLEAN NOT NULL DEFAULT FALSE;
```

### 7.3 Fix `availability_rules` to actually be used

Currently `availability_rules` is seeded but `lib/services/availability.ts` ignores it and uses hardcoded logic. Either:
- **Option A (simpler):** Leave hardcoded, delete the `availability_rules` seed data, and document that availability is hardcoded.
- **Option B (correct):** Update `getAvailableSlots()` in `lib/services/availability.ts` to query `availability_rules` and `availability_overrides` from DB instead of using hardcoded arrays.

**Recommendation: Option B.** The DB already has the rules seeded. In `availability.ts`, replace the hardcoded day/time logic with:

```ts
const admin = createAdminClient();
if (admin) {
  const { data: rules } = await admin
    .from("availability_rules")
    .select("day_of_week, start_time, end_time")
    .eq("is_active", true);
  // use `rules` instead of hardcoded slots
  
  const { data: overrides } = await admin
    .from("availability_overrides")
    .select("override_date, is_blocked, reason")
    .gte("override_date", format(startDate, "yyyy-MM-dd"))
    .lte("override_date", format(endDate, "yyyy-MM-dd"));
  // use `overrides` instead of hardcoded NZ holidays array
}
```

---

## Phase 8 — Polish & Robustness

### 8.1 Resource download URL expiry

**File:** `lib/services/portal.ts`  
**Problem:** `createSignedResourceUrl()` creates signed URLs valid for 60 minutes at portal load time. If the user doesn't click download within an hour, the link expires.  
**Fix:** Don't pre-generate signed URLs at portal load time. Instead, create a dedicated download action/route that generates a fresh signed URL on demand.

Create `app/portal/download/[resourceId]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requirePortalAccess } from "@/lib/services/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSignedResourceUrl } from "@/lib/services/storage";

export async function GET(req: NextRequest, { params }: { params: { resourceId: string } }) {
  try {
    await requirePortalAccess("school"); // or ambassador — check role
  } catch {
    return NextResponse.redirect("/login");
  }
  
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data: resource } = await admin
    .from("presentation_resources")
    .select("storage_path, title")
    .eq("id", params.resourceId)
    .maybeSingle();

  if (!resource?.storage_path) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { url } = await createSignedResourceUrl(resource.storage_path, 300); // 5 min
  return NextResponse.redirect(url);
}
```

Update resource download links in the school and ambassador portals to use `/portal/download/[resourceId]` instead of the pre-generated signed URL.

### 8.2 Add `primary_contact_id` FK fix in booking_requests

When `saveManualBookingAction()` creates a `booking_request` via staff, it doesn't set `primary_contact_id`. This field is NOT NULL in the schema. Add logic to either pass a contact ID or make the column nullable.

**Check `0001_initial_schema.sql`:** If `primary_contact_id` has `NOT NULL`, either:
- Add a migration to make it nullable: `ALTER TABLE booking_requests ALTER COLUMN primary_contact_id DROP NOT NULL;`
- Or pass a valid contact ID in the staff booking action (requires a contact search/select UI)

**Recommendation:** Make it nullable via migration (it's a staff-created booking, there may not be a contact yet).

```sql
-- In 0004_fixes.sql:
ALTER TABLE booking_requests ALTER COLUMN primary_contact_id DROP NOT NULL;
```

---

## Summary: File Touch Map

| File | Changes |
|------|---------|
| `lib/services/bookings.ts` | Fix region_id lookup, fix presentation_type_id lookup, add email trigger call |
| `app/portal/actions.ts` | Add: `submitAmbassadorReportAction`, `applyToSessionAction`, `submitSchoolReviewAction`, `assignAmbassadorAction`, `updateBookingStatusAction`, `markTrainingCompleteAction` |
| `lib/services/email-triggers.ts` | **Create new file** with `sendBookingRequestReceivedEmail`, `sendBookingConfirmedEmail`, `sendAmbassadorAssignedEmail` |
| `lib/services/calendar-triggers.ts` | **Create new file** with `syncSessionToCalendar` |
| `lib/services/availability.ts` | Replace hardcoded logic with DB queries for rules + overrides |
| `lib/services/portal.ts` | Add training_modules/lessons/progress to loadPlatformData query, fix metrics calculations |
| `app/portal/download/[resourceId]/route.ts` | **Create new file** for on-demand signed resource URLs |
| `app/ambassador/[[...slug]]/page.tsx` | Add `"report"` case for report submission form, add `"training"` case |
| `app/staff/[[...slug]]/page.tsx` | Add `"calendar"` case, `"settings"` case |
| `app/school/[[...slug]]/page.tsx` | Wire up review form with `submitSchoolReviewAction` |
| `supabase/migrations/0004_fixes.sql` | **Create new file**: add booking_session_id to reviews, add rating columns to reports, make primary_contact_id nullable |
| `supabase/seed.sql` | Add training_modules seed data |

---

## What NOT to change

- Do not refactor `loadPlatformData()` into per-portal queries. The current "load everything, filter in memory" pattern is intentional for simplicity at this stage.
- Do not change the RLS policies — they are correct.
- Do not change the auth trigger `on_auth_user_created` — it works correctly.
- Do not remove demo data fallbacks — they exist for local development without Supabase configured.
- The `invitePortalUserAction` already sends an email via `admin.auth.admin.inviteUserByEmail()` — Supabase handles the invite email natively. This is working correctly.
