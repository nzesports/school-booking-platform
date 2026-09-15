# Guest booking management

## Deployment requirements

Apply migrations 0037 through 0040 in order before deploying this code. No reset or seeding is required. The school Supabase project requires an authorised administrator; the locally connected CLI account did not have access when checked. These migrations have not been applied by this task.

Requires the existing Supabase service-role configuration, NEXT_PUBLIC_SITE_URL (HTTPS in production), and working Brevo transactional email configuration. Verification deliberately fails closed when its database dependencies are unavailable. Use Vercel's overwritten forwarding header for IP limits; other hosts currently share a conservative limiter and need a trusted-proxy integration before launch.

## Access controls

- Reference plus primary contact email starts verification. The same browser must submit an eight-digit cryptographically random email code within ten minutes. Codes are single-use with at most five attempts. Unknown references, mismatched emails and recipient throttles receive the same prompt.
- Hourly request limits: 20 per IP, five per email, five per reference; verification: 30 per IP. Persistent atomic counters use keyed hashes so email/IP values are not stored in rate-limit keys. Recipient limits can delay a legitimate customer during abuse; staff assistance remains necessary.
- Verification codes use HMAC with the server service-role secret and browser challenge. Raw codes and session secrets are never stored in the database. Do not log email payloads or verification form bodies.
- Opaque 256-bit session secrets use HttpOnly, SameSite=Strict cookies scoped to /manage-booking and Secure on HTTPS. Server sessions expire after 15 minutes idle or 30 minutes overall. Database lookup and each mutation enforce booking scope and current contact/reference/version.
- Finishing access revokes the session. Staff can invalidate all sessions and pending codes from session details. Changing the booking contact email/reference also invalidates access. Old access cookies and email links cannot bypass verification.
- Private tables have RLS and no anonymous/authenticated grants. Sensitive RPCs are service-role-only; superseded mutation RPCs cannot be called directly by the service role.
- New references are random six-digit values with uniqueness enforced; existing references are retained. References are identifiers, not authentication secrets.
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

1. Correct reference/email produces a code; mismatches show the identical prompt without disclosing details.
2. Wrong, expired, reused codes and sixth attempts fail. Codes work only with their originating browser challenge.
3. Verify layered limits under concurrent requests and confirm anonymous/authenticated API clients cannot access tables or RPCs.
4. Confirm no other booking can be read or changed by substituting IDs, references or form values.
5. Confirm logout, idle/absolute expiry, staff revocation and changed contact details deny subsequent access and mutations.
6. Confirm stale forms, concurrent conflicting changes, unavailable times and the 24-hour cutoff fail safely; valid cancellation/rescheduling preserve other sessions.
7. Confirm email delivery, booking references, history badges, calendar changes and failure logging without secrets.

Remaining security scope: this implementation is not a whole-application security audit. Review other public booking/confirmation/calendar endpoints and database policies before claiming all booking data is protected.
