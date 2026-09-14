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

## Local development with Supabase

Prerequisites:

- Node.js 20.9 or newer
- Docker Desktop using Linux containers

Install the dependencies, then start the complete seeded local platform with one command:

```bash
npm install
npm run dev:local
```

`dev:local` starts the Docker-backed Supabase stack, applies any pending local migrations, loads the seed data, creates rich demo data and test accounts, writes the local URL and keys to the ignored `.env.local` file, and starts Next.js on port `3000`. Once ready, it prints clickable links for every portal. It does not connect to or change the hosted Supabase project.

Open the local services at:

- App: http://localhost:3000
- Supabase Studio: http://127.0.0.1:56123
- Local email inbox: http://127.0.0.1:56124
- Supabase API: http://127.0.0.1:56121
- Postgres: `postgresql://postgres:postgres@127.0.0.1:56122/postgres`

The project uses ports `56120` through `56129` because the standard Supabase ports can fall inside Windows/Hyper-V reserved ranges.

Useful commands:

```bash
npm run local:status  # show local service URLs and status
npm run local:start   # start and seed Supabase without starting Next.js
npm run local:reset   # rebuild the local DB from migrations and reseed demo data
npm run local:seed    # re-run the idempotent account/demo seed
npm run local:stop    # stop this project's Supabase containers
npm run check         # typecheck, lint, and production build
```

After changing a migration, run `npm run local:reset`. Normal React/Next.js edits only need the already-running `npm run dev` process.

### Local test accounts

| Portal | Email | Password |
| --- | --- | --- |
| Super admin | `admin@local.test` | `LocalTest123!` |
| Staff | `staff@local.test` | `LocalTest123!` |
| School | `jordan.school@demo.esf.nz` | `DemoPass123!` |
| Approved ambassador | `aroha.ambassador@demo.esf.nz` | `DemoPass123!` |
| Ambassador awaiting approval | `sophie.ambassador@demo.esf.nz` | `DemoPass123!` |

Auth confirmation and reset emails are captured by the local email inbox instead of being delivered.

If Docker is not needed, copy `.env.example` to `.env.local` with the Supabase values blank and run `npm run dev`. The app then uses its built-in demo/fallback data, but authentication and database writes are unavailable.

## Testing

The Vitest suite covers core booking rules, formatting and sanitisation helpers, calendar links,
guest booking persistence, contact email handling, and key form behavior.

```bash
npm test
npm run test:unit
npm run test:component
npm run test:coverage
npm run typecheck
npm run lint
npm run build
# or run the full validation sequence:
npm run check
```

For a quick functional smoke test, run `npm run dev`, sign in with each local account above, and exercise the public booking flow plus the matching portal. A production build needs internet access the first time Next.js downloads the configured Google Fonts.

## Environment

Production runs at **https://book.nzesports.org.nz**. See [domain and email setup](docs/domain-and-email-setup.md) for Vercel, Supabase Auth, Brevo, and missing-email diagnostics.

Copy `.env.example` to `.env.local` and fill the values you use:

- `NEXT_PUBLIC_SITE_URL` must be `https://book.nzesports.org.nz` in Vercel Production; keep `http://localhost:3000` for local development.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` enable live Supabase auth/data/storage.
- `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME` enable transactional email;
  `BREVO_CONTACT_EMAIL` selects the inbox that receives website contact messages.
- `MICROSOFT_GRAPH_TENANT_ID`, `MICROSOFT_GRAPH_CLIENT_ID`, `MICROSOFT_GRAPH_CLIENT_SECRET`, `MICROSOFT_GRAPH_CALENDAR_ID`, and `MICROSOFT_GRAPH_USER_ID` enable Outlook calendar sync.

The Microsoft app registration needs `Calendars.ReadWrite` application permission with admin consent. `MICROSOFT_GRAPH_USER_ID` should be the UPN or object id of the shared mailbox/user that owns the configured calendar.

Uploads are capped at 25MB. Public assets accept PNG, JPG/JPEG, and WebP; private resource files additionally accept PDF, PowerPoint, Word, and TXT.

## Supabase setup

The local database contract lives in `supabase/migrations`, with reference data in `supabase/seed.sql`. `npm run local:start` and `npm run local:reset` apply these automatically.

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
