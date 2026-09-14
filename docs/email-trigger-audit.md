# Email trigger audit

Finance recipient verified in the hosted Supabase `settings` row (`setting_key = payments`): **info@esf.nz**. Change **Admin → Settings → Payments → Finance email** to route future approvals/retries to another inbox. This does not change the Brevo sender. Previously sent messages and verification tokens are not redirected by changing the setting.

| Event | Delivery path |
| --- | --- |
| School signup | Supabase sends the auth verification email; the application schedules a Brevo welcome email after successful signup. |
| Ambassador signup | Supabase sends verification; the application schedules the application receipt after the required profile photo is saved. |
| Ambassador approved | Brevo approval email links to the ambassador portal. |
| Booking submitted | Brevo receipt includes every requested session. |
| Booking confirmed | Email for each affected session, including bulk updates and direct confirmed entries. |
| Booking cancelled by school/staff | Cancellation email for each affected session, including bulk updates. |
| School requests reschedule | Receipt explains the requested date is not yet confirmed. |
| Staff resolves reschedule | Updated-session email on approval; original-time-unchanged email on decline. Uses the booking's contact. |
| Ambassador submits an eligible report | Payment enters staff review. It is not yet sent to finance or marked paid. |
| Staff approves report/payment | Dedicated finance inbox receives payment details and a tokenized **Payment made** button. Delivery status and retries are recorded on the payment. |
| Finance confirms payment | Explicit form submission validates the expiring token and approved state, marks payment paid, and notifies the ambassador in-app. Opening the email/link alone does not mark it paid. |
| Upcoming sessions / feedback | Existing scheduled reminder and feedback triggers remain in the cron route. |

Confirmed sessions and rescheduled confirmed sessions include Google Calendar, Outlook.com, Office 365, Yahoo, and hosted ICS downloads for Apple Calendar and other compatible apps. Updating the requested date of a tentative session does not claim the booking is confirmed or offer calendar buttons. Calendar buttons and the finance verification button are appended if a customized template leaves out their placeholders. Calendar downloads use stable session UIDs and cancelled status where appropriate, with UTF-8 line folding per [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545). These are add/import links, not a live calendar subscription; web-calendar imports do not automatically remove or reschedule previously imported events.

Manual bookings need an existing school contact email. If no booking-specific contact was recorded, delivery uses the school's designated primary contact; it does not invent a recipient.

Verification uses typecheck, scoped lint, and focused mocked tests of recipient routing, template rendering, multi-session filtering, calendar generation, and provider error handling. No real signup, booking, payment, or email is created during these checks. The finance recipient was read from the live database; the payment confirmation flow was reviewed without changing real payment records.

After deployment, manually check school/ambassador verification and welcome emails, a multi-session confirmation, cancellation, reschedule approval/decline, and an approved test payment sent to the finance inbox. Confirm provider acceptance/delivery in Brevo and `email_logs`. Actual mailbox rendering and delivery in every email client are not established by unit tests.
