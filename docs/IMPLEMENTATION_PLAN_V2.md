# Implementation Plan V2 — School Booking Platform

> Generated 2026-06-12 from a full code + security audit of the current working tree.
> Supersedes `IMPLEMENTATION_PLAN.md` (2026-06-11), which is now ~90% implemented.
> Written so a less capable agent can implement it. Work through phases **in order** —
> Phase 0 contains security fixes that must land before anything else.
>
> **Golden rules for the implementing agent:**
> 1. Always `Read` the current file before editing — snippets here are sketches, column
>    names must be verified against `supabase/migrations/0001_initial_schema.sql` + later migrations.
> 2. Follow the existing Server Action pattern in `app/portal/actions.ts`:
>    `requirePortalAccess(role)` → Zod `safeParse` → `getAdminClientOrThrow()` → mutation →
>    `logAuditEvent` → `revalidatePath` → `redirect`.
> 3. New DB changes go into **new** migration files (`supabase/migrations/0005_...`, `0006_...`).
>    Never edit an existing migration.
> 4. Run `npx tsc --noEmit` and `npm run lint` after each phase. There are no automated tests.
> 5. All portal reads go through `loadPlatformData()` in `lib/services/portal.ts` (service-role
>    client, filter in memory). Keep that pattern; do not refactor it into per-portal queries.

---

## Architecture refresher (read once)

- Next.js 16 app router, React 19, Tailwind 4, Supabase (auth + Postgres + storage), Brevo email,
  Microsoft Graph calendar, Zod.
- Portals are 4 catch-all server pages: `app/admin|staff|school|ambassador/[[...slug]]/page.tsx`.
  The `slug` array picks the sub-view inside one big component. There is no client-side routing.
- Roles: `school`, `ambassador`, `staff`, `super_admin` stored on `public.profiles.role`.
  `requirePortalAccess(scope)` (in `lib/services/auth.ts`) guards pages and actions.
  `staff` scope admits both `staff` and `super_admin`.
- Server actions and portal data loaders use the **service-role** client
  (`lib/supabase/admin.ts`), which bypasses RLS — every action must therefore do its own
  ownership checks. RLS only protects direct API access with the publishable key.
- Signup flows write `role`, `school_name`, `region_slug` etc. into `auth.users.raw_user_meta_data`;
  the DB trigger `handle_new_auth_user` (migration 0002, re-declared in 0003) creates
  `profiles`, `schools`, `school_contacts`, `school_contact_users`, `ambassador_profiles`.

---

## Phase 0 — CRITICAL security fixes (do first, in this order)

### 0.1 Privilege escalation: any user can make themselves super_admin ⚠️ MOST CRITICAL

**Problem A (RLS):** In `0001_initial_schema.sql`, the policies
`"users insert own profile"` and `"users update own profile"` allow
`id = auth.uid()` with no column restrictions. Any authenticated user can call the Supabase
REST API directly with the public publishable key and run
`UPDATE profiles SET role='super_admin', status='active' WHERE id=auth.uid()` — instant admin.

**Problem B (trigger):** `handle_new_auth_user` trusts `raw_user_meta_data->>'role'`.
`supabase.auth.signUp()` is callable by anyone with the publishable key, and the caller fully
controls metadata — so anyone can sign up directly against the auth API with
`{"role": "super_admin"}` (the app's own forms set role server-side, but attackers don't use
the forms). Same applies to `"staff"`.

**Fix — create `supabase/migrations/0005_security_hardening.sql`:**

```sql
-- A. Prevent self-service changes to role/status on profiles
create or replace function public.prevent_profile_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role bypasses RLS but NOT triggers; allow it explicitly
  if current_setting('request.jwt.claims', true) is null
     or (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role' then
    return new;
  end if;

  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and not public.is_staff_like() then
    raise exception 'Only staff can change role or status.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_privilege_change on public.profiles;
create trigger prevent_profile_privilege_change
before update on public.profiles
for each row execute function public.prevent_profile_privilege_change();

-- Also remove the self-insert path (profiles are only created by the auth trigger / service role)
drop policy if exists "users insert own profile" on public.profiles;
```

```sql
-- B. Whitelist self-signup roles in the auth trigger
-- In handle_new_auth_user (re-declare the whole function, copying the 0003 version), replace:
--   selected_role text := coalesce(metadata->>'role', 'school');
-- with:
  selected_role text := case
    when metadata->>'role' in ('school', 'ambassador') then metadata->>'role'
    else 'school'
  end;
```

Note: `invitePortalUserAction` invites staff/super_admin via
`admin.auth.admin.inviteUserByEmail` with role metadata — the trigger runs for invited users
too. So the whitelist must not break invites. Handle it by checking
`new.raw_app_meta_data` instead: invites created by the admin API can carry the role in
**app_metadata** (attacker-controlled user_metadata vs server-controlled app_metadata).
Concretely: update `invitePortalUserAction` in `app/portal/actions.ts` to pass the role via
the `data` option AND have the trigger accept `staff`/`super_admin` **only** when
`new.raw_app_meta_data->>'provider' = 'email'` is insufficient — simplest robust approach:

```ts
// invitePortalUserAction: keep metadata for full_name, then after invite succeeds,
// explicitly set the role with the service client (trigger will have created a 'school' profile):
await admin.from("profiles").update({ role: parsed.data.role }).eq("email", parsed.data.email);
```
(Service role bypasses the new trigger guard per the JWT check above.)

### 0.2 Ambassador self-approval via RLS

**Problem:** Policy `"ambassadors update own profile"` on `ambassador_profiles` lets an
ambassador update their own row including `status`. Portal access requires
`ambassador_profiles.status = 'approved'` — so an applicant can self-approve via the REST API.
The same row also stores `bank_account_number`, `police_vetting_status` — those they may edit,
but `status`, `approved_at`, `approved_by` must be staff-only.

**Fix (same migration 0005):** mirror the profiles trigger:

```sql
create or replace function public.prevent_ambassador_self_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('request.jwt.claims', true) is null
     or (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role' then
    return new;
  end if;

  if (new.status is distinct from old.status
      or new.approved_at is distinct from old.approved_at
      or new.approved_by is distinct from old.approved_by)
     and not public.is_staff_like() then
    raise exception 'Only staff can change ambassador approval state.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_ambassador_self_approval on public.ambassador_profiles;
create trigger prevent_ambassador_self_approval
before update on public.ambassador_profiles
for each row execute function public.prevent_ambassador_self_approval();
```

Also add in 0005 (data hygiene that doubles as defense):

```sql
-- one ambassador profile per user (currently duplicates are possible)
create unique index if not exists ambassador_profiles_user_id_key
  on public.ambassador_profiles(user_id);
```
> Before adding the index, write a `delete` of duplicate rows keeping the oldest:
> `delete from ambassador_profiles a using ambassador_profiles b where a.user_id = b.user_id and a.created_at > b.created_at;`

### 0.3 School account takeover via school-name match

**Problem:** `handle_new_auth_user` links a new "school" signup to an **existing** school by
case-insensitive name match (`where lower(name) = lower(metadata->>'school_name')`). Anyone can
sign up claiming "Auckland Grammar School" and immediately read that school's bookings, contact
names/emails, and history (both via RLS `is_school_contact_for_school` and via
`getSchoolPortalData` filtering).

**Fix (migration 0005, inside the re-declared `handle_new_auth_user`):** only auto-link when the
**verified email** already exists as a school contact; otherwise create a fresh school in
`pending_review` status for staff to merge:

```sql
if selected_role = 'school' then
  -- 1. Try to link by verified email to an existing contact
  select sc.id, sc.school_id
  into school_contact_id, school_record_id
  from public.school_contacts sc
  where lower(sc.email) = lower(coalesce(new.email, ''))
  order by sc.is_primary desc, sc.created_at asc
  limit 1;

  if school_contact_id is not null then
    insert into public.school_contact_users (school_contact_id, user_id)
    values (school_contact_id, new.id)
    on conflict (school_contact_id, user_id) do nothing;
  else
    -- 2. No email match: always create a NEW school (never name-match), pending staff review
    insert into public.schools (name, region_id, status)
    values (coalesce(metadata->>'school_name', split_part(coalesce(new.email,''), '@', 1)),
            selected_region_id, 'pending_review')
    returning id into school_record_id;

    insert into public.school_contacts (school_id, full_name, email, phone, is_primary,
                                        can_access_portal, marketing_consent)
    values (school_record_id, coalesce(metadata->>'full_name', ''), coalesce(new.email,''),
            metadata->>'phone', true, true,
            coalesce((metadata->>'marketing_consent')::boolean, false))
    returning id into school_contact_id;

    insert into public.school_contact_users (school_contact_id, user_id)
    values (school_contact_id, new.id)
    on conflict do nothing;
  end if;
end if;
```

This also makes the flow advertised in `sendBookingRequestReceivedEmail` ("sign up with this
same email and your school record will be linked automatically") actually true — today the link
happens by school name, not email.

Staff follow-up: a "merge duplicate schools" task is in Phase 5; for now duplicates in
`pending_review` are visible and harmless.

### 0.4 Delete the legacy unsafe action `submitPortalAction` and the fake magic-link page

**Problem:** `app/actions.ts` → `submitPortalAction` is an older duplicate of the report/review
actions with **no ownership checks**:
- ambassador scope inserts a report for *any* session id, skips the duplicate-report check, and
  unconditionally sets `payment_status: "eligible"` regardless of attendee count;
- school scope inserts a review for *any* session without verifying the school owns it.

Nothing in the UI references it, but it is an exported `"use server"` action, i.e. a live POST
endpoint in the build.

**Fix:**
1. Delete `submitPortalAction` from `app/actions.ts` (and the now-unused
   `requirePortalAccess`/`createAdminClient` imports if orphaned).
2. Delete `requestMagicLinkAction` (it sends nothing — pure UI theatre) and
   `app/magic-link/page.tsx`; remove `/magic-link` from `authPrefixes` in
   `components/site/app-chrome.tsx`. If magic links are wanted later, implement with
   `supabase.auth.signInWithOtp` — out of scope here.
3. Delete dead demo helpers `listBookingRequests`, `getBookingRequestById`,
   `listOpenAmbassadorSessions` from `lib/services/bookings.ts` (grep first; only
   `app/booking/confirmation` was a consumer historically and it no longer uses them).

### 0.5 Open redirect via `returnTo` in every portal action

**Problem:** Every action in `app/portal/actions.ts` redirects to a form-supplied `returnTo`
validated only as `z.string().min(1)`. `redirect("https://evil.com/...")` and
`redirect("//evil.com")` both work. Also `sanitizePublicAuthReturnPath` in
`lib/services/auth.ts`/`auth-public.ts` accepts `//evil.com` (passes `startsWith("/")`).

**Fix:**
1. In `app/portal/actions.ts` add one helper and use it on **every** `returnTo` /
   `redirectTo` before any `redirect(...)` (including the early `fallbackReturnTo` paths):

```ts
function sanitizeReturnTo(path: string, fallback: string) {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\")
    ? path
    : fallback;
}
```
   Easiest mechanical approach: wrap at read time —
   `const fallbackReturnTo = sanitizeReturnTo(String(formData.get("returnTo") || X), X);`
   and change every schema `returnTo` to be re-sanitized after parse.
2. In both `sanitizePublicAuthReturnPath` implementations change the guard to
   `if (!path || !path.startsWith("/") || path.startsWith("//")) return "/";`

### 0.6 Unvalidated file uploads (stored XSS / abuse)

**Problem:** `lib/services/storage.ts` uploads any file of any size with the client-supplied
content type. `uploadPublicAsset` serves from the **public** bucket — an uploaded SVG (allowed
by the form `accept=".svg"`) or HTML file becomes a same-origin-ish hosted XSS payload; there is
also no size cap. Only staff/super_admin can upload today, but this is data-storage platform
hardening the user explicitly asked for.

**Fix in `lib/services/storage.ts`:**

```ts
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const PRIVATE_ALLOWED = new Map([
  ["pdf", "application/pdf"], ["ppt", "application/vnd.ms-powerpoint"],
  ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ["doc", "application/msword"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["txt", "text/plain"], ["png", "image/png"], ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"], ["webp", "image/webp"]
]);
const PUBLIC_ALLOWED = new Map([
  ["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["webp", "image/webp"]
]);
```

- In both upload functions: reject if `file.size > MAX_UPLOAD_BYTES` or extension not in the
  relevant map; **derive `contentType` from the map**, never from `file.type`.
- Remove `.svg` from both `accept` attributes (admin + staff resource forms, presentation image,
  homepage image). SVG stays out until/unless sanitized server-side.
- Keep `upsert: false`.

### 0.7 Public booking spam / abuse hardening

**Problem:** `submitBookingRequest` (public, unauthenticated) creates `schools`,
`school_contacts`, `booking_requests`, `booking_sessions` rows on every call. RLS also allows
`anon` to insert `booking_requests`/`booking_sessions` directly (`with check (true)`).

**Fix (pragmatic level):**
1. Add a honeypot field (`<input name="website2" className="hidden" tabIndex={-1} autoComplete="off">`)
   to `components/forms/booking-request-form.tsx` and reject in
   `submitBookingRequestAction` when non-empty (silently redirect to confirmation).
2. In `submitBookingRequest`, make school matching case-insensitive
   (`.ilike("name", input.schoolName)` — exact-name `eq` currently creates case duplicates) and
   cap `input.sessions.length` at e.g. 5 in the Zod schema in `app/actions.ts`.
3. Tighten RLS: the app inserts via the service client, so the anon insert policies are not
   needed by the app at all. In migration 0005:

```sql
drop policy if exists "public submit booking requests" on public.booking_requests;
drop policy if exists "public and staff create booking sessions" on public.booking_sessions;
create policy "staff create booking requests" on public.booking_requests
  for insert to authenticated with check (public.is_staff_like());
create policy "staff create booking sessions" on public.booking_sessions
  for insert to authenticated with check (public.is_staff_like());
```
4. (Optional, recommended before launch) add an IP rate limit using a small
   `booking_submission_throttle` table or Vercel/edge middleware — note as TODO, not blocking.

### 0.8 HTML injection in transactional emails

**Problem:** `lib/services/email-triggers.ts` interpolates user-supplied strings
(contact name, school name) straight into HTML.

**Fix:** add at top of the file and wrap every interpolated value:

```ts
function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
```

### 0.9 Misc constraints + secrets hygiene (migration 0005 + repo)

- `create unique index if not exists presentation_reviews_session_key on public.presentation_reviews(booking_session_id) where booking_session_id is not null;`
  (schools currently can submit unlimited reviews per session; also add a friendly
  "already submitted" redirect in `submitSchoolReviewAction` by checking for an existing row first).
- `.env.example` contains a real Supabase project URL + publishable key. Publishable keys are
  designed to be public, but the example file should not point at the production project.
  Replace with `https://YOUR-PROJECT.supabase.co` / `sb_publishable_...` placeholders and
  confirm `.env`/`.env.local` are gitignored (`git check-ignore .env.local`).
- Verify `next.config.ts` doesn't disable anything security relevant (it doesn't today).

**Phase 0 acceptance checks:**
- With a non-staff session and the publishable key, `PATCH /rest/v1/profiles?id=eq.<self>`
  setting `role=super_admin` returns an error.
- Signing up via the raw auth API with `{"role":"staff"}` produces a `school` profile.
- Signing up with an existing school's name but a new email produces a NEW `pending_review`
  school, not a link to the old one.
- A crafted form post with `returnTo=https://evil.com` redirects to the fallback path.

---

## Phase 1 — Booking lifecycle correctness (schools manage bookings, statuses make sense)

### 1.1 Fix `updateBookingStatusAction` (staff status changes are currently broken/lossy)

File: `app/portal/actions.ts`.

Bugs:
- The status `<select>` rendered in `components/dashboard/operations-views.tsx` offers
  `reschedule_requested` and `cancel_requested`, but `updateBookingStatusSchema` doesn't include
  them → choosing them always errors with `invalid-status`.
- The action then blanket-updates **every** session of the booking to the same status, e.g.
  re-confirming a booking stomps a session already in `report_submitted`, and request-level
  statuses like `paid`/`closed` get written onto sessions.

Fix:
1. Extend the enum with `"reschedule_requested"`, `"cancel_requested"`, `"declined"`.
2. Replace the blanket session update with a guarded cascade:

```ts
const SESSION_CASCADE: Partial<Record<string, { to: string; onlyFrom?: string[] }>> = {
  confirmed:  { to: "confirmed", onlyFrom: ["tentative", "ambassador_needed", "ambassador_applied", "ambassador_assigned", "reschedule_requested"] },
  cancelled:  { to: "cancelled" },
  ambassador_needed: { to: "ambassador_needed", onlyFrom: ["tentative"] }
};
const cascade = SESSION_CASCADE[parsed.data.status];
if (cascade) {
  let query = admin.from("booking_sessions")
    .update({ status: cascade.to })
    .eq("booking_request_id", parsed.data.bookingRequestId);
  if (cascade.onlyFrom) query = query.in("status", cascade.onlyFrom);
  await query;
}
```
   All other request statuses (`paid`, `closed`, `report_submitted`, `reschedule_requested`, …)
   must NOT touch session rows.
3. When status becomes `cancelled` and there was a `cancel_requested`, also send a
   school-facing email (new `sendBookingCancelledEmail` in `email-triggers.ts`, same shape as
   the confirmed email — fire-and-forget with `void ...catch(() => {})`).

### 1.2 School portal: real navigation, booking detail, cancel entry point

File: `app/school/[[...slug]]/page.tsx`.

Bugs to fix:
- `navItems` hardcodes `/school/review/session-1001`; the "Need to change something?" card
  hardcodes `/school/review/session-1001` and `/school/bookings/booking-1001/reschedule`
  (demo IDs that 404 or post junk in production). Remove both hardcoded links: point the nav
  "Reviews" item at `/school/bookings` (reviews are launched per session from the table), and
  make the card buttons use the first real booking/session if one exists, otherwise hide them.
- There is no link to the existing `/school/bookings/[id]/cancel` route anywhere. In the
  bookings `DataTable`, add a per-row actions cell with three `ButtonLink`s:
  `Reschedule` → `/school/bookings/${booking.id}/reschedule`,
  `Cancel` → `/school/bookings/${booking.id}/cancel`,
  `Leave review` (only when the session is delivered — `["completed_pending_report","report_submitted","paid","closed"].includes(session.status)` or `endsAt < now`).
- "View details" links to `/school/bookings/${booking.id}` which renders the same table.
  Add a detail card when `route.startsWith("bookings/") && slug?.length === 2`: show the
  booking's sessions, statuses, assigned ambassador, school notes, and the reschedule/cancel
  buttons.
- Metrics are wrong/fake: "Active requests" counts everything including cancelled, and
  "Recent review score" shows the string `Active`. Compute:
  - Active requests = bookings with status in
    `["tentative","ambassador_needed","ambassador_applied","ambassador_assigned","confirmed","reschedule_requested"]`
  - Upcoming sessions = sessions with `startsAt > now` and not cancelled
  - Completed sessions = sessions delivered (reuse `isDeliveredSession` from
    `lib/services/dashboard-insights.ts`)
  - Drop the fake review-score tile or replace with count of reviews the school has submitted
    (requires adding the school's own reviews to `SchoolPortalData` — see 1.3).
- Add a success/error notice banner reading `?requested=`, `?submitted=`, `?error=` like the
  ambassador page does (`getAmbassadorNotice` is the template to copy).

### 1.3 `SchoolPortalData` should carry the school itself (and its reviews)

File: `lib/services/portal.ts`.

Today `getSchoolPortalData` only returns `{bookings, resources}`; the page derives the school
name from `bookings[0]` so a school with no bookings shows "School account". Extend:

```ts
export type SchoolPortalData = {
  school: { id: string; name: string; city: string } | null;
  bookings: BookingRequestView[];
  resources: ResourceRecord[];
  myReviews: SchoolFeedbackSummary[];   // filtered by school_id
};
```
Resolve `schoolIds` exactly as the function already does, then take the first school record from
`data.schools`. Filter `mapSchoolReviews(data)` by the raw review `school_id` being in
`schoolIds` (you will need the raw id — keep a parallel filter over `data.schoolReviews`
before mapping). Update the demo fallback object to the new shape.

### 1.4 School "new booking" entry point

Schools currently have to go back to the public homepage widget. In the school portal overview,
add a primary `ButtonLink href="/book"` ("Book another presentation"). No backend work — the
public flow already exists. (Optional improvement, not required: pre-fill contact fields via
query params.)

### 1.5 Ambassador portal correctness

File: `app/ambassador/[[...slug]]/page.tsx`.

- **Demo data leak:** "Recent reports" card and the `reports` route render `reportSummaries`
  imported from `lib/domain/demo-data` — live ambassadors see fake reports. Fix: add
  `reports: ReportSummary[]` to `AmbassadorPortalData` in `lib/services/portal.ts`
  (filter `mapReports(data)` to this ambassador via raw `ambassador_profile_id`), and use
  `portal.reports` in both places. Remove the demo import.
- **Wrong filtering:** `ownedSessions` re-filters `assignedSessions` by display-name equality
  (`session.assignedAmbassadorName === portal.ambassador.name`) — breaks for duplicate names
  and when the ambassador fallback kicks in. Delete the name filter; `portal.assignedSessions`
  is already filtered by `user_id`.
- **Upcoming vs completed:** both routes show all sessions with a "Submit report" button even
  for future sessions. Split:
  ```ts
  const upcoming = portal.assignedSessions.filter(s => new Date(s.startsAt) > new Date() && s.status !== "cancelled");
  const completed = portal.assignedSessions.filter(s => new Date(s.endsAt) <= new Date() && s.status !== "cancelled");
  ```
  Only `completed` rows get "Submit report", and only when `s.reportStatus === "not_submitted"`
  (otherwise show a "Report submitted" badge).
- **Server-side guard:** in `submitAmbassadorReportAction` (app/portal/actions.ts), after
  loading the session, also reject when `new Date(session.starts_at) > new Date()`
  (`error=session-not-finished`).
- **Open-bookings route overlap:** when `route.startsWith("open-bookings/")` both the DataTable
  and the apply card render. Make the table condition `route === "open-bookings"` only.
- Remove the hardcoded `trend: "+12% vs last month"` on earnings (use `"All time"` or drop).

### 1.6 Timezone correctness (NZ daylight saving)

- `lib/services/bookings.ts` builds `starts_at: \`${date}T${time}:00+12:00\`` — wrong for NZDT
  (UTC+13, late Sep–early Apr). `saveManualBookingAction` is worse: `new Date(\`${date}T${time}:00\`)`
  uses the **server's** timezone.
- Fix: add a helper in `lib/utils.ts`:

```ts
export function nzOffsetForDate(dateString: string) {
  // NZDT (+13:00) runs from the last Sunday of September to the first Sunday of April.
  const probe = new Date(`${dateString}T12:00:00Z`);
  const nzHour = Number(new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hour: "2-digit", hour12: false }).format(probe));
  const utcHour = probe.getUTCHours();
  const offset = (nzHour - utcHour + 24) % 24;
  return offset === 13 ? "+13:00" : "+12:00";
}
export function nzDateTimeToIso(dateString: string, time: string) {
  return new Date(`${dateString}T${time}:00${nzOffsetForDate(dateString)}`).toISOString();
}
```
  Use `nzDateTimeToIso` in both `submitBookingRequest` (starts/ends) and
  `saveManualBookingAction` (compute `endsAt` by adding `durationMinutes * 60000` to the parsed
  start). Also check `formatTime`/`formatDateTime` in `lib/utils.ts` render with
  `timeZone: "Pacific/Auckland"` so server (UTC) and local dev agree — if they use default
  locale formatting without a timeZone, add it.

**Phase 1 acceptance checks:**
- Staff can move a booking to `reschedule_requested` → `confirmed` → `cancelled` from the UI
  without `invalid-status`, and a session already `report_submitted` is untouched by re-confirm.
- A school user sees Cancel + Reschedule + Detail for their own bookings only; the demo
  `session-1001` links are gone.
- An ambassador sees only past sessions under Completed, can submit exactly one report, and
  sees their own (not demo) submitted reports.
- A booking made for a January date stores `+13:00`-equivalent UTC instants.

---

## Phase 2 — Super-admin oversight: feedback, presentation performance, booking counts

### 2.1 One canonical metrics module (kill the double counting at the source)

Today there are **two** metric builders: `buildOperationsMetrics`/`buildFunnelMetrics` in
`lib/services/portal.ts` (computed but **never rendered** — the pages use
`buildFilteredDashboardData(...).metrics`) and `buildRangeMetrics` in
`lib/services/dashboard-insights.ts`. They disagree (e.g. portal.ts "needing action" omits
`reschedule_requested`/`cancel_requested`; insights' "New enquiries" counts status `requested`
which nothing ever sets, so it is permanently 0).

Steps:
1. Delete `buildOperationsMetrics`, `buildStaffMetrics`, `buildAdminMetrics`,
   `buildFunnelMetrics` from `lib/services/portal.ts`; drop the `metrics` field from
   `StaffPortalData`/`AdminPortalData` (and the demo fallbacks) and remove from the page props.
   Keep `bookingActivityLogs` in the load — pass them through as
   `activityLogs` on both portal data types instead.
2. In `lib/services/dashboard-insights.ts`, make `buildRangeMetrics` the single source:
   - Replace "New enquiries" with `bookings created within range` (use `booking.createdAt`).
   - Add the funnel logic (submissions / confirmed / conversion / avg-confirm-time) moved over
     from portal.ts, fed by `activityLogs` passed into `buildFilteredDashboardData`.
   - Fix the `||` fallbacks from the old funnel code (`logs.length || bookings.length`
     silently swaps data sources when logs are empty-but-present); prefer logs when the logs
     array is non-empty overall, else booking-derived counts — make it explicit.
3. **Booking counts without crossover** — define and implement these tiles (range-aware),
   counting **booking_requests exactly once each** by `source`:
   - `School-initiated` = `source === "public"` (public form + portal "book again")
   - `Staff-logged` = `source === "staff"`
   - `Ambassador-referred` = `source === "ambassador"` (see 2.2)
   - Status tiles across all sources: `Upcoming` (any non-cancelled session with
     `startsAt > now`), `Confirmed` (request status `confirmed`/`ambassador_assigned`),
     `Cancelled` (request status in cancelledStatuses), `Completed`
     (request status in `["report_submitted","paid","closed"]` or all sessions delivered).
   A booking appears in exactly one source bucket and one status bucket; sessions are only used
   for the Upcoming tile and labelled "sessions" not "bookings" in the UI copy.
4. Render the source-split tiles in `OperationsAnalytics`
   (`components/dashboard/operations-analytics.tsx`) — read that file before editing; add a
   second `MetricGrid` row titled "Where bookings come from".

### 2.2 Ambassador-referred bookings

Schema already has `booking_requests.ambassador_outreach_by` and the `source` union includes
`"ambassador"`, but nothing sets either. Minimal viable implementation:
- In the staff manual-booking form (`BookingLifecyclePanel`), add an optional
  "Referred by ambassador" `<select>` of approved ambassadors posting `outreachAmbassadorId`.
- In `saveManualBookingAction`: when set, write `source: "ambassador"` and
  `ambassador_outreach_by`. Extend `manualBookingSchema` accordingly.
- That's it — public bookings stay `public`. (A public "referred by" free-text field can come
  later; do not conflate it with `referred_by` on ambassador signups.)

### 2.3 Presentation performance (per-presentation feedback + delivery stats)

New section under `/admin/presentations` (and a summary card on the admin dashboard).

1. **Make joins ID-based first.** `BookingSessionView` (in `lib/domain/types.ts`) lacks ids —
   add `presentationTypeId?: string; schoolId?: string` and populate in `mapBookingRequests`.
   Add `presentationTypeId?: string; schoolId?: string` to `ReportSummary` and
   `SchoolFeedbackSummary` and populate in `mapReports`/`mapSchoolReviews`.
   Then fix the two existing title-based joins:
   - `app/admin/[[...slug]]/page.tsx` review count
     (`review.presentationTitle === presentationEditor.title` → compare ids)
   - `buildSchoolDeliverySummaries` in `dashboard-insights.ts`
     (`session.schoolName === school.name` → `session.schoolId === school.id`).
2. Add to `lib/services/dashboard-insights.ts`:

```ts
export function buildPresentationPerformance(
  presentations: PresentationType[],
  bookings: BookingRequestView[],
  reports: ReportSummary[],
  reviews: SchoolFeedbackSummary[]
) {
  const sessions = bookings.flatMap(b => b.sessions);
  return presentations.map(p => {
    const pSessions = sessions.filter(s => s.presentationTypeId === p.id);
    const delivered = pSessions.filter(s => isDeliveredSession(s));
    const pReports = reports.filter(r => r.presentationTypeId === p.id);
    const pReviews = reviews.filter(r => r.presentationTypeId === p.id);
    const avg = (xs: number[]) => xs.length ? Math.round((xs.reduce((a,b)=>a+b,0)/xs.length)*10)/10 : null;
    return {
      presentation: p,
      deliveredCount: delivered.length,
      upcomingCount: pSessions.filter(s => isFutureSession(s)).length,
      totalAttendees: pReports.reduce((t, r) => t + r.attendeeCount, 0),
      avgTeacherRating: avg(pReports.map(r => r.teacherResponseRating).filter((x): x is number => typeof x === "number")),
      avgSchoolRating: avg(pReviews.map(r => r.rating).filter((x): x is number => typeof x === "number")),
      reviewCount: pReviews.length,
      reportCount: pReports.length
    };
  });
}
```
3. Render as a table at the top of the admin `presentations` route: columns
   Presentation / Delivered / Upcoming / Attendees / Teacher rating / School rating / Reviews,
   with a link per row to `/admin/feedback?presentation=<id>`.
4. In `FeedbackWorkspace` accept an optional `presentationFilterId` (read from searchParams in
   the admin page) and filter both lists by it.

### 2.4 Feedback workspace: approval workflow + consistent data

Files: `components/dashboard/operations-views.tsx`, `app/portal/actions.ts`,
`app/admin/[[...slug]]/page.tsx`, `app/staff/[[...slug]]/page.tsx`.

Bugs/gaps:
- School reviews are inserted with `is_approved: false`, but **no action exists anywhere to
  approve a review** — they can never become public testimonials.
- The homepage (`app/page.tsx` line ~217) renders `testimonials` from
  `lib/domain/demo-data` — real approved reviews never appear publicly.
- On `/admin/feedback`, `reports` are range-filtered (`filteredDashboard.reports`) but
  `schoolReviews` are not — the page silently mixes time windows.
- Ambassador-report cards don't show `student_engagement_rating` or notable questions.

Steps:
1. New action `reviewSchoolFeedbackAction` (staff scope) in `app/portal/actions.ts`:
   schema `{ reviewId: uuid, decision: enum(["approve","unapprove"]), makePublic: boolean opt, returnTo }`;
   updates `presentation_reviews.is_approved` (+ `is_public` when provided), audit-logs
   `review.approved`/`review.unapproved`, revalidates `/admin`, `/staff`, `/`.
2. In `FeedbackWorkspace`, on each school-review card add the approve/unapprove form (two
   buttons + "show on website" checkbox), and a `Public` badge when `isPublic && isApproved`.
   Pass `returnTo` from the calling page (`/admin/feedback` or `/staff/feedback`).
3. Pass `schoolReviews` through the same range filter as reports (add
   `reviewInRange` mirroring `reportInRange` using `createdAt`) — or stop range-filtering
   reports on the feedback page; pick ONE and label the page with the active range either way.
4. Show engagement data: extend `ReportSummary` with `studentEngagementRating?: number` and
   `notableQuestions?: string` — add `student_engagement_rating, notable_questions` to the
   `ambassador_reports` select in `loadPlatformData` and map them; render in `FeedbackCard`
   meta line.
5. Homepage testimonials: in `lib/services/presentations.ts` add

```ts
export async function listPublicTestimonials(limit = 6) { /* admin client; from("presentation_reviews")
  .select("id, quote, attribution, rating, created_at, school_id, presentation_type_id")
  .eq("is_approved", true).eq("is_public", true).order("created_at", {ascending:false}).limit(limit);
  join names in memory from schools/presentation_types selects, fall back to demo testimonials
  when admin client missing or list empty */ }
```
   Use it in `app/page.tsx` instead of the demo import. (Use the **admin** client —
   `presentation_reviews` deliberately has no RLS select policy; do not add an anon policy.)

### 2.5 Operational notifications for staff/admin (oversight)

Today only ambassador applications create notifications. Add a small fan-out helper and call it
(fire-and-forget) from the relevant places:

1. `lib/services/notifications.ts` (new):

```ts
import { createAdminClient } from "@/lib/supabase/admin";
export async function notifyStaff(input: { title: string; body: string; type: string; relatedUrl?: string }) {
  const admin = createAdminClient();
  if (!admin) return;
  const { data: staff } = await admin.from("profiles").select("id")
    .in("role", ["staff", "super_admin"]).eq("status", "active");
  if (!staff?.length) return;
  await admin.from("notifications").insert(staff.map(s => ({
    user_id: s.id, title: input.title, body: input.body,
    notification_type: input.type, related_url: input.relatedUrl ?? null
  })));
}
```
2. Call sites (all `void notifyStaff({...}).catch(() => {})`):
   - `submitBookingRequest` → "New booking request from {school}" → `/staff/bookings`
   - `requestSchoolBookingChangeAction` → "{school} requested {intent}" → `/staff/bookings`
   - `submitAmbassadorReportAction` → "Report submitted for {school}" → `/staff/reports`
   - `submitSchoolReviewAction` → "New school review" → `/admin/feedback`
3. The staff/admin `activity` routes already render notifications — no UI work needed beyond
   verifying `notification_type` strings display fine.

**Phase 2 acceptance checks:**
- Admin dashboard shows source-split tiles whose sum equals total bookings in range.
- A review approved in `/admin/feedback` with "show on website" appears on the homepage.
- Presentation table shows delivered counts and average ratings consistent with the feedback page.
- Submitting a public booking creates one notification per active staff/admin user.

---

## Phase 3 — Resource library + CRM editing (the big one)

### 3.1 Schema: multi-audience + tags — `supabase/migrations/0006_resource_library.sql`

The core ask: one resource visible to BOTH schools and ambassadors, edited once; plus tags and
search. Replace single `audience` with an array (simplest model that fits the current code):

```sql
alter table public.presentation_resources
  add column if not exists audiences text[] not null default '{}',
  add column if not exists tags text[] not null default '{}';

update public.presentation_resources
  set audiences = array[audience]
  where audiences = '{}';

create index if not exists presentation_resources_audiences_idx
  on public.presentation_resources using gin (audiences);
create index if not exists presentation_resources_tags_idx
  on public.presentation_resources using gin (tags);

drop policy if exists "relevant users read resources" on public.presentation_resources;
create policy "relevant users read resources"
on public.presentation_resources for select
to authenticated
using (
  public.is_staff_like()
  or (audiences && array['ambassador'] and public.current_ambassador_profile_id() is not null)
  or (audiences && array['school'])
);
```
Keep the old `audience` column for now (Phase 5 drops it once everything reads `audiences`).

### 3.2 Service + action updates

1. `lib/services/portal.ts`:
   - select `audiences, tags` in the resources query; in `mapResources` set
     `audiences: (resource.audiences as string[]) ?? []` and `tags: (...) ?? []`
     (change `ResourceRecord.audience` → `audiences: string[]`; keep a computed
     `audienceLabel` if convenient).
   - School portal filter → `resource.audiences.includes("school")`;
     ambassador portal → `resource.audiences.includes("ambassador")`. Both should also filter
     `resource.isActive` (today inactive resources leak into school/ambassador portals —
     verify and fix while here).
2. `app/portal/download/[resourceId]/route.ts`: select `audiences`, change `canAccessResource`
   to `audiences.includes("ambassador")` / `audiences.includes("school")`.
3. `saveResourceAction` in `app/portal/actions.ts`:
   - schema: `audiences: z.array(z.enum(["school","ambassador","staff"])).min(1)`,
     `tags: z.array(z.string().trim().min(1).max(40)).max(12).default([])`;
   - parse with `formData.getAll("audiences").map(String)` and split a `tags` text input on
     commas (`splitCommaList` in `lib/utils.ts` already exists);
   - payload writes `audiences` and `tags` (and mirrors `audience: audiences[0]` until the
     column is dropped).
4. Resource forms (BOTH `app/admin/[[...slug]]/page.tsx` and `app/staff/[[...slug]]/page.tsx`
   — they are near-duplicates; consider extracting a shared `components/dashboard/resource-editor.tsx`
   server component to avoid editing twice — recommended):
   - replace the Audience `<select>` with three checkboxes named `audiences`
     (values school/ambassador/staff, defaultChecked from the record);
   - add a `tags` text input ("comma separated, e.g. wellbeing, parents, year-9").

### 3.3 Library UI: search, tag filter, readable layout, open-in-new-tab

Build one shared client component `components/dashboard/resource-library.tsx`
(`"use client"`), used by all four portals (admin/staff get edit buttons via a prop;
school/ambassador get read-only):

- Props: `resources: ResourceRecord[]`, `editBasePath?: string`.
- Local state: `query` (text), `activeTags: string[]`, `activeType: string | "all"`.
- Search filters on title + description + tags + presentationTitle, case-insensitive
  (in-memory is fine at this data size — no server round-trip).
- Tag chips derived from `Array.from(new Set(resources.flatMap(r => r.tags)))`, toggleable;
  type filter chips from the distinct `type` values.
- Card layout: icon by type (FileText for pdf, Presentation for pptx, Youtube icon, etc. from
  `lucide-react`), title, description (clamped), tags as small chips, audience badges
  ("Schools", "Ambassadors", "Staff"), version + current-version badges (reuse the existing
  markup from the staff resources route as the base).
- **Open in new tab:** every resource link —
  `<a href={resource.downloadUrl} target="_blank" rel="noopener noreferrer">` ("Open" for
  pdf/pptx/external, "Watch" for youtube linking the watch URL). The download route already
  302s to a fresh 5-minute signed URL; because upload now sets a correct `contentType`
  (Phase 0.6), browsers will render PDFs inline in the new tab rather than force-download.
  Keep YouTube embeds inline only on the admin/staff edit pages (lazy iframes everywhere else
  are heavy — the school/ambassador library should link out).
- Replace the current resource lists in: school portal `resources` route, ambassador
  `training/resources` grid (resources half only), staff `resources` route list, admin
  `resources` route list.

### 3.4 Rich text editing for the CRM (presentations, homepage sections, email templates)

Today the "Full Description" toolbar in the admin presentation editor is **decorative** — the
`["B","H2","Quote","List","Link","Image"]` chips are inert `<span>`s over a plain textarea, and
the public presentation page renders the text raw. Implement real editing:

1. `npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-link sanitize-html`
   (+ `@types/sanitize-html` dev).
2. New client component `components/ui/rich-text-editor.tsx`:
   - Props: `name: string; defaultValue?: string; placeholder?: string`.
   - TipTap `useEditor` with StarterKit (headings 2–3, bold, italic, bullet/ordered list,
     blockquote) + Link.
   - Toolbar buttons calling `editor.chain().focus().toggleBold().run()` etc.; reflect active
     state with `editor.isActive("bold")`.
   - **Spellcheck:** set `editorProps: { attributes: { spellcheck: "true", class: "prose ..." } }`
     — this turns on the browser's native spellchecker inside the editor (that is the
     requested spellcheck capability; no third-party service).
   - Keep form compatibility with a hidden input:
     `<input type="hidden" name={name} value={html} />` updated via `onUpdate`
     (`setHtml(editor.getHTML())`).
3. New `lib/services/sanitize.ts`:

```ts
import sanitizeHtml from "sanitize-html";
export function sanitizeRichText(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ["p","br","strong","em","u","s","h2","h3","ul","ol","li","blockquote","a"],
    allowedAttributes: { a: ["href","target","rel"] },
    allowedSchemes: ["https","http","mailto"],
    transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }) }
  });
}
```
4. Server actions: in `savePresentationAction` run `fullDescription` through
   `sanitizeRichText` before insert/update; same for `saveHomepageSectionAction.body` and
   `saveEmailTemplateAction.bodyHtml` (email templates use a wider allowlist if needed —
   tables/inline styles are common in email; acceptable to reuse the same list initially).
5. Swap the fake toolbar + textarea in the admin presentation editor for
   `<RichTextEditor name="fullDescription" defaultValue={presentationEditor.fullDescription} />`.
   Same for homepage section `body` and email template `bodyHtml`. Add `spellCheck`
   attributes (`spellCheck={true}`) to the remaining plain inputs/textareas in admin forms
   (titles, summaries) — cheap win.
6. Render rich HTML where users read it:
   - `app/presentations/[slug]/page.tsx`: render
     `<div className="prose ..." dangerouslySetInnerHTML={{ __html: sanitizeRichText(presentation.fullDescription) }} />`
     (sanitize **again at render time** — defense in depth, content was written via service role).
   - Homepage sections body likewise (check `app/page.tsx` usage of `listHomepageSections`).
   - Add minimal prose styles in `app/globals.css` (h2/h3 margins, `ul { list-style: disc }`,
     blockquote border) since Tailwind's typography plugin isn't installed — or
     `npm install @tailwindcss/typography` and register it; either is fine, prefer the plugin.

### 3.5 Use the DB email templates (admin edits currently have no effect)

`saveEmailTemplateAction` edits `email_templates`, but `email-triggers.ts` sends hardcoded HTML
— the admin screen is a placebo. In `lib/services/email-triggers.ts`:

1. Add a loader + `{{placeholder}}` substitution:

```ts
async function renderTemplate(key: string, vars: Record<string, string>) {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("email_templates")
    .select("subject, body_html, is_active").eq("template_key", key).maybeSingle();
  if (!data?.is_active) return null;
  const sub = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => escapeHtml(vars[k] ?? ""));
  return { subject: sub(data.subject as string), html: sub(data.body_html as string) };
}
```
2. Each trigger builds `vars` (`contactName`, `schoolName`, `bookingId`, `sessionDate`,
   `presentationTitle`, …), tries `renderTemplate(templateKey, vars)`, and falls back to the
   current hardcoded HTML (with `escapeHtml` per Phase 0.8) when null.
3. Update `supabase/seed.sql` template bodies to use the same `{{placeholders}}` and document
   available placeholders in a `<p>` hint under each template form in the admin email-templates
   route.

**Phase 3 acceptance checks:**
- A resource saved with audiences `school + ambassador` appears in both portals; editing its
  title once updates both; a `staff`-only resource appears in neither.
- Library search by a tag substring filters cards without a page reload; PDF "Open" launches a
  new tab rendering inline.
- Bold/heading/bullet content saved in a presentation renders formatted on the public page, and
  `<script>` pasted into the editor is stripped server-side.
- Editing the `booking_request_received` template changes the actual email sent on the next
  public booking.

---

## Phase 4 — Integration correctness

### 4.1 Outlook calendar sync can never work as written

`lib/services/calendar.ts` gets an **app-only** token (client_credentials) but calls
`https://graph.microsoft.com/v1.0/me/...` — `/me` is meaningless without a signed-in user;
every call 4xxes (and the failure is swallowed as `status: "failed"` rows in
`calendar_events`). Fix:
1. Add env `MICROSOFT_GRAPH_USER_ID` (UPN or object id of the shared mailbox owning the
   calendar) to `lib/env.ts`, `.env.example`, and the `isMicrosoftGraphConfigured` check.
2. URL → `https://graph.microsoft.com/v1.0/users/${config.microsoftUserId}/calendars/${config.microsoftCalendarId}/events`.
3. Graph expects `dateTime` WITHOUT offset when `timeZone` is supplied. Convert:
   format the stored UTC instant into a Pacific/Auckland wall-clock string
   (`new Intl.DateTimeFormat("sv-SE", { timeZone: "Pacific/Auckland", dateStyle:"short", timeStyle:"medium" })`
   yields `YYYY-MM-DD HH:mm:ss`; replace space with `T`), and send that with
   `timeZone: "Pacific/Auckland"`.
4. App registration needs `Calendars.ReadWrite` **application** permission with admin consent —
   note this in `README.md` setup section.

### 4.2 Cancellation/reschedule emails

Covered in 1.1/2.5 — verify `sendBookingCancelledEmail` exists and is logged via `logEmail`
with `recipientType: "school"`.

---

## Phase 5 — Cleanup & consistency (do last; all low-risk)

1. **Consolidate ambassador signup.** There are two flows:
   `app/ambassador-signup` → `submitAmbassadorSignup` (creates a confirmed user with NO
   password via `admin.auth.admin.createUser`, then manually inserts `profiles` +
   `ambassador_profiles` — and the auth trigger ALSO inserts an `ambassador_profile`, creating
   duplicates until the 0005 unique index, after which the manual insert ERRORS) and the modal
   signup (`registerAmbassadorAccountAction`, correct). Fix: delete `submitAmbassadorSignup`
   and `submitAmbassadorSignupAction`; make `app/ambassador-signup/page.tsx` render the same
   fields but post to `registerAmbassadorAccountAction` (or simply redirect to
   `/?auth=signup&role=ambassador`). Check `components/forms/ambassador-signup-form.tsx` usage.
2. **Duplicate report columns.** Migration 0004 added `student_engagement_rating`,
   `notable_questions`, `media_consent_obtained` although 0001 already had
   `student_response_rating`, `student_questions_themes`, `media_consent_confirmed`;
   `submitAmbassadorReportAction` writes BOTH of each pair. Pick the 0001 names as canonical:
   migration 0007 copies any non-null 0004-column data into the 0001 columns, drops the 0004
   columns, and the action/selects/mappers are updated to the canonical names.
3. **Drop `presentation_resources.audience`** (after 3.x verified) — migration 0007.
4. **Dead code:** `ambassador_open_booking_sessions` view (unused; its `security_invoker`
   makes it useless for ambassadors anyway) — drop or leave with a comment; remove unused
   `mapResources` async/`Promise.all` wrapper (it has no awaits left once touched); remove
   demo `reportSummaries` import in ambassador page (done in 1.5); remove `requested` status
   handling if nothing sets it, or set it as the initial public-booking status — decide ONE
   (recommended: keep `tentative` as initial, delete `requested` from the type union and
   `actionStatuses`).
5. **Admin default range:** `/admin` defaults to `range=week`, so a quiet week shows zeros and
   looks broken. Default `readDashboardRange` to `"month"` (or `"all"`) — one-line change,
   confirm with the user which they prefer.
6. **School merge tool (follow-up from 0.3/0.7):** staff UI listing `pending_review` schools
   with a "merge into existing school" action that re-points `school_contacts`,
   `booking_requests`, `booking_sessions`, `presentation_reviews` school_id and deletes the
   duplicate. Schema needs nothing new. (Can be deferred; list it in the backlog if time-boxed.)
7. **README/env docs:** document all env vars incl. the new `MICROSOFT_GRAPH_USER_ID`, the
   storage upload limits, and the role model.

---

## File touch map (quick reference)

| File | Phases |
|---|---|
| `supabase/migrations/0005_security_hardening.sql` (new) | 0.1–0.3, 0.7, 0.9 |
| `supabase/migrations/0006_resource_library.sql` (new) | 3.1 |
| `supabase/migrations/0007_cleanup.sql` (new) | 5.2, 5.3 |
| `app/portal/actions.ts` | 0.5, 1.1, 1.5, 2.2, 2.4, 3.2, 3.4 |
| `app/actions.ts` | 0.4, 0.7 |
| `lib/services/storage.ts` | 0.6 |
| `lib/services/email-triggers.ts` | 0.8, 1.1, 3.5 |
| `lib/services/bookings.ts` | 0.4, 0.7, 1.6, 2.5, 5.1 |
| `lib/services/auth.ts` + `auth-public.ts` | 0.5 |
| `lib/services/portal.ts` | 1.3, 1.5, 2.1, 2.4, 3.2 |
| `lib/services/dashboard-insights.ts` | 2.1, 2.3 |
| `lib/services/notifications.ts` (new) | 2.5 |
| `lib/services/sanitize.ts` (new) | 3.4 |
| `lib/services/presentations.ts` | 2.4 (testimonials) |
| `lib/services/calendar.ts`, `lib/env.ts` | 4.1 |
| `lib/utils.ts` | 1.6 |
| `lib/domain/types.ts` | 2.3 (ids on views), 3.2 (audiences/tags) |
| `app/school/[[...slug]]/page.tsx` | 1.2, 1.4, 3.3 |
| `app/ambassador/[[...slug]]/page.tsx` | 1.5, 3.3 |
| `app/admin/[[...slug]]/page.tsx` | 2.3, 2.4, 3.2–3.4 |
| `app/staff/[[...slug]]/page.tsx` | 2.4, 3.2–3.3 |
| `components/dashboard/operations-views.tsx` | 1.1 (status options), 2.2, 2.4 |
| `components/dashboard/operations-analytics.tsx` | 2.1 |
| `components/dashboard/resource-library.tsx` (new) | 3.3 |
| `components/ui/rich-text-editor.tsx` (new) | 3.4 |
| `app/page.tsx`, `app/presentations/[slug]/page.tsx` | 2.4, 3.4 |
| `app/portal/download/[resourceId]/route.ts` | 3.2 |
| `.env.example`, `README.md` | 0.9, 4.1, 5.7 |

## What NOT to change

- Keep `loadPlatformData()` "load everything, filter in memory" — intentional at this scale.
- Keep the demo-data fallbacks for unconfigured local dev (but never render demo data when
  Supabase IS configured — that's the bug class fixed in 1.5).
- Don't add an anon RLS select policy on `presentation_reviews`; public testimonials go through
  the server with the admin client.
- `prevent_removing_last_super_admin` trigger and the `isLastActiveSuperAdmin` checks work —
  leave them.
- The signed-URL download route pattern (`/portal/download/[resourceId]`) is correct — extend,
  don't replace.
