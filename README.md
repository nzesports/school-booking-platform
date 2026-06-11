# NZ Esports School Booking Platform

Greenfield scaffold for the NZ Esports school presentation booking and operations platform.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS v4
- Supabase Auth, Postgres, Storage, and RLS
- Vercel deployment target
- Brevo email adapter
- Microsoft Graph calendar adapter

## Included in this scaffold

- Public homepage, presentation pages, and booking flow
- School, ambassador, staff, and super-admin portal route trees
- Shared light glassmorphism design system
- Domain model and seeded demo data for local UI development
- Supabase schema migration and seed data
- Brevo and Outlook adapter scaffolds with safe unconfigured fallbacks

## Getting started

1. Install dependencies:

```bash
npm install
```

2. Copy environment values:

```bash
cp .env.example .env.local
```

3. Run the app:

```bash
npm run dev
```

If Supabase is not configured, the app runs in demo mode and renders seeded operational data. That makes the route structure and UI reviewable immediately.

## Environment

Copy `.env.example` to `.env.local` and fill the values you use:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` enable live Supabase auth/data/storage.
- `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME` enable transactional email.
- `MICROSOFT_GRAPH_TENANT_ID`, `MICROSOFT_GRAPH_CLIENT_ID`, `MICROSOFT_GRAPH_CLIENT_SECRET`, `MICROSOFT_GRAPH_CALENDAR_ID`, and `MICROSOFT_GRAPH_USER_ID` enable Outlook calendar sync.

The Microsoft app registration needs `Calendars.ReadWrite` application permission with admin consent. `MICROSOFT_GRAPH_USER_ID` should be the UPN or object id of the shared mailbox/user that owns the configured calendar.

Uploads are capped at 25MB. Public assets accept PNG, JPG/JPEG, and WebP; private resource files additionally accept PDF, PowerPoint, Word, and TXT.

## Supabase setup

Apply the database contract from the `supabase` folder:

- Migration: [supabase/migrations/0001_initial_schema.sql](/workspaces/school-booking-platform/supabase/migrations/0001_initial_schema.sql:1)
- Seed: [supabase/seed.sql](/workspaces/school-booking-platform/supabase/seed.sql:1)

The schema includes:

- booking request → booking sessions parent/child model
- role-aware portal tables
- ambassador reports and payment tracking
- homepage content, FAQ, resources, training, notifications, and audit logs
- RLS policies and a privacy-safe `ambassador_open_booking_sessions` view

## Route map

- Public: `/`, `/presentations`, `/presentations/[slug]`, `/book`, `/book/[presentationSlug]`, `/ambassador-signup`, `/login`
- School: `/school`, `/school/bookings`, `/school/resources`, `/school/review/[bookingSessionId]`
- Ambassador: `/ambassador`, `/ambassador/open-bookings`, `/ambassador/upcoming`, `/ambassador/reports/[bookingSessionId]/new`, `/ambassador/earnings`, `/ambassador/training`
- Staff: `/staff`, `/staff/bookings`, `/staff/schools`, `/staff/ambassadors`, `/staff/reports`, `/staff/media`, `/staff/payments`
- Admin: `/admin`, `/admin/users`, `/admin/roles`, `/admin/presentations`, `/admin/regions`, `/admin/homepage`, `/admin/email-templates`, `/admin/audit-logs`

## Notes

- Public availability is rule-based and advisory. All booking requests stay tentative until staff confirms them.
- Provider adapters log safe fallback states when Brevo or Microsoft Graph credentials are missing.
- Some deeper workflows are scaffolded as route and data structures first, ready for follow-up implementation against live Supabase data.
