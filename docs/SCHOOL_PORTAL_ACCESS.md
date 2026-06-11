# School Portal Access Flow

> Codex-added documentation for Implementation Plan Phase 1.2.

Public booking does not create a `school_contact_users` row immediately. That is intentional: a school can submit a booking request without creating an auth account.

When the contact later signs up with the same email address through the school signup flow, the Supabase auth trigger creates or finds the school contact and links the auth user through `school_contact_users`. That link is what authorises access to `/school` under the current RLS model.

Operationally:
- Public booking creates `schools`, `school_contacts`, `booking_requests`, and `booking_sessions`.
- The school contact receives the booking-received email after submission.
- School portal access starts after the contact creates a school account and verifies email.
- Staff can still manually add schools and bookings from the staff/admin dashboards when no contact account exists yet.
