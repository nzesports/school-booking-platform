# Silent booking import and manual emails

## Deployment order

1. Apply `supabase/migrations/0044_booking_import_manual_emails.sql` to the booking platform database. Apply preceding migrations in their normal order; do not reset or seed the database.
2. Deploy the application changes. `/api/booking-import/readiness` must return `ready: true` and `policyVersion: 1` from the live site. The import script also checks the database fingerprint.
3. Export fresh data and regenerate the reconciliation if anything has changed since the saved export. Keep private source files and exports under the git-ignored `artifacts/booking-import/` directory. Never commit the personal data.
4. Apply only the reviewed reconciliation. The database transaction imports all resolved operations together, including their manual-only policy. It never calls email or calendar services. Unresolved rows and test bookings are excluded.

The local Supabase CLI account currently does not list the booking project. The service-role key can export booking data but cannot apply schema migrations. An account with access to the booking project must apply the migration before importing. Do not work around this by importing confirmed rows into the old application.

## Commands

Use the repository checkout and its configured `.env.local`. Replace paths with the exact export, transcript and live site URL.

```sh
node --env-file=.env.local scripts/export-bookings.mjs artifacts/booking-import/before-import.json
node scripts/reconcile-booking-import.mjs artifacts/booking-import/before-import.json /path/to/report.xls artifacts/booking-import/screenshot-transcription.txt artifacts/booking-import/reconciliation.json
node --env-file=.env.local scripts/apply-booking-import.mjs artifacts/booking-import/reconciliation.json https://YOUR-LIVE-SITE
```

The export refuses to overwrite an existing snapshot. Use a new filename for subsequent exports. The screenshot transcript is tied to the exact XLS bytes through its first-line SHA-256 checksum. It maps each zero-based report row to `code|source status|school|position`; overlapping screenshot rows are included only once. Check creation timestamps when otherwise-identical sessions appear in a different order in the report and screenshots.

Reconciliation preserves existing data and flags conflicts; it does not convert existing closed/reported sessions back to confirmed. New Active sessions become confirmed regardless of date. Imported sessions are excluded from inferred/automatic completion. Source details, including positions and original status, are retained for audit. New bookings use Digital Wellbeing and preserve the supplied times and durations.

The apply script checks for drift before writing, uses an atomic service-role-only RPC, and writes a verification report. The batch/hash ledger makes an identical replay a no-op. A changed plan cannot reuse an applied batch ID. Post-import checks compare records with the plan and look for sent emails associated with imported bookings during execution.

## Manual email behavior

Staff/admin users can open a session’s Emails tab, review history and preview its current status email. Confirmation sends the saved preview to the saved recipient. The server rechecks the session/template/contact and claims the preview once before sending. Expired or changed previews must be recreated. A timeout is an uncertain delivery result: check provider logs before preparing a fresh send. Manual sends never enable automatic notifications or change booking status.

All booking-linked transactional mail checks the persistent policy at the final sender. For imported bookings, subsequent normal booking mutations may send school status notifications (including confirmation, cancellation and rescheduling) through a server-scoped exception. This does not clear the stored import guard, trigger any catch-up emails, or apply to non-imported manual-only bookings. The data-only importer never enters this delivery context. A policy lookup failure blocks sending. Scheduled reminders, feedback and ambassador notifications remain suppressed for historical imports; the automatic session job also skips imported completion.

## Verification

Run only `npm run typecheck` and `npm run lint`. The user performs application checks: list/calendar consistency, teacher positions, silent imports, pending-to-confirmed automatic emails (single and bulk changes), suppressed historical reminders, explicit manual send confirmation, duplicate-click prevention, email history and successful refresh of outcomes. No real email is sent as part of implementation verification.
