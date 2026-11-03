LOCAL RELEASE V3 — PREPARATION ONLY

V1 and V2 are superseded and must not be used operationally. Original files are
retained for audit. Production execution and cloud uploads remain stopped.

Forward procedure: preserve write exclusion (including Preview/direct writers),
disable cron and pause production through the already reviewed human procedure.
Verify finance pending_count=0 AND claim_count=0, plus actual request drain.
The generated selective transaction applies only0049,0054,0055,0056,0057;
it does not repair the migration ledger or rewrite historical payment records.
Save recovery_data_fingerprint and recovery_approval_hash printed immediately
before its successful COMMIT. Missing/failed COMMIT means reconcile first.

Recovery is a COMPATIBILITY implementation of the old12-argument approval API,
not the exact old0051 body: it retains old token behavior while zeroing all money
parts for no-payment and recomputing totals safely under retained constraints.
Whole-dollar extras are enforced. New app must NOT be served with recovered RPC.

Only before any new-version writes, while every writer remains stopped, use the
two fingerprints from that successful forward transaction in the SAME SQL
connection as recovery. Do not substitute fingerprints captured later:

SELECT set_config('release.expected_data_fingerprint', '<saved data fingerprint>', false);
SELECT set_config('release.expected_approval_hash', '<saved approval hash>', false);
-- Then execute recovery-approval.sql in this same connection.

Recovery acquires bounded public-table write locks, validates the13-argument RPC
hash and the fingerprint of every public-table row plus xmin, rejects pending
finance/claims, installs the12-argument compatibility function, verifies its hash
and asserts row data unchanged. Missing/invalid fingerprints abort. A changed
row, new/deleted row, or changed function blocks recovery; use reviewed forward
recovery instead. Fingerprints are an additional guard, not permission to admit
writes, not a general audit log, and not a full backup. No claim of safety after
new-version writes or against unobserved non-public/external-system changes.

After recovered function and prior immutable app match, run read-only checks
before reopening. Never perform app-only rollback against the new approval RPC.
Daily backups are not lossless recovery; restore remains untested.

Regression SQL is rollback-only and must run against the isolated local database.
The band description migration changes only function definitions for future
reports. It never rewrites existing eligibility descriptions or amounts.
