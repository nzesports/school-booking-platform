# Guest booking management

## Deployment requirements

Apply migrations 0037 through 0040 in order before deploying this code. No reset or seeding is required. The school Supabase project requires an authorised administrator; the locally connected CLI account did not have access when checked. These migrations have not been applied by this task. Removing the email-code step requires no additional migration; the existing session tables remain in use.

Requires the existing Supabase service-role configuration, NEXT_PUBLIC_SITE_URL (HTTPS in production), for booking access. Brevo is only required for booking-change notifications. Access deliberately fails closed when its database dependencies are unavailable. Use Vercel's overwritten forwarding header for IP limits; other hosts currently share a conservative limiter and need a trusted-proxy integration before launch.

## Access controls

- Matching the six-digit reference and primary contact email opens that booking directly. No email code, email link or account is required. Email matching ignores case and surrounding whitespace. Unknown references and wrong emails receive the same mismatch message.
- Hourly request limits: 20 per IP, five per email, five per reference. Persistent atomic counters use keyed hashes so email/IP values are not stored in rate-limit keys. These limits can delay a legitimate customer during abuse.
- The server creates a booking-scoped session only after both values match. Anyone who knows both values can access the booking; this flow does not prove mailbox ownership. Session secrets are stored only as hashes. Do not log access form bodies.
- Opaque 256-bit session secrets use HttpOnly, SameSite=Strict cookies scoped to /manage-booking and Secure on HTTPS. Server sessions expire after 15 minutes idle or 30 minutes overall. Database lookup and each mutation enforce booking scope and current contact/reference/version.
- Finishing access revokes the session. Staff can invalidate all sessions from session details. Changing the booking contact email/reference also invalidates access. Older verification UI/actions have been removed. Historical challenge tables/RPCs remain for migration compatibility but are no longer used to grant access by the application.
- Private tables have RLS and no anonymous/authenticated grants. Sensitive RPCs are service-role-only; superseded mutation RPCs cannot be called directly by the service role.
- New references are random six-digit values with uniqueness enforced; existing references are retained. Keep booking references private alongside contact details.
- Scheduled maintenance prunes expired credentials and old rate counters.

## Changes and communications

- Guest cancellation/rescheduling requires more than 24 hours' notice, confirmation, an unchanged session snapshot, and an active session. Maximum five mutation attempts per authenticated session and ten per booking/hour.
- Rescheduling preserves duration, ambassador and approval status. Dates must be seven to 365 days ahead, within recorded availability, and without conflicts. Database checks serialize mutations and reject stale requests. Existing pending change requests cannot be rescheduled again.
- Only the selected session changes. Previous/new dates are recorded in activity history and displayed with rescheduled badges; cancelled status remains visible.
- Booking messages include a small reference marker and small italic management instructions. Calendar descriptions include booking details and ambassador information. Older delivered messages are not rewritten.
- Change notifications and calendar synchronization run after the response. They are not a durable delivery queue: delivery failures require operational follow-up. A retryable outbox remains a follow-up improvement.

## Verification and rollout gate

Repository policy limits automatic checks to lint and typecheck. No production build, browser tests, security integration tests, or database changes were executed.

Before launch, obtain approval for a focused staging check using test bookings and an authorised test mailbox:

1. Correct reference/email opens only the matching booking without sending an access email. Unknown references and incorrect emails show the same mismatch message.
2. Confirm access still works without Brevo configured, and old verification query parameters return to the lookup form.
3. Verify layered limits under concurrent requests and confirm anonymous/authenticated API clients cannot access tables or RPCs.
4. Confirm no other booking can be read or changed by substituting IDs, references or form values.
5. Confirm logout, idle/absolute expiry, staff revocation and changed contact details deny subsequent access and mutations.
6. Confirm stale forms, concurrent conflicting changes, unavailable times and the 24-hour cutoff fail safely; valid cancellation/rescheduling preserve other sessions.
7. Confirm email delivery, booking references, history badges, calendar changes and failure logging without secrets.

Remaining security scope: this implementation is not a whole-application security audit. Review other public booking/confirmation/calendar endpoints and database policies before claiming all booking data is protected.
