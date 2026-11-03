-- Prepared only: execute AFTER verified write-stop and final readiness. No ledger repair.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='approve_ambassador_report_payment' AND pronargs=12
 AND md5(regexp_replace(prosrc,'\s+','','g'))='2825c90f6152961b7d3cfd4295ded4d6') THEN
 RAISE EXCEPTION 'Release aborted: approval baseline changed'; END IF;
END $$;
-- Session-local helpers; no persistent objects, permissions, or row changes.
-- Fingerprint includes every public table's row contents AND xmin. An update
-- then reversal still changes xmin; insert/delete and membership changes alter
-- the aggregate. Capture ONLY in the forward transaction before admitting writes.
CREATE OR REPLACE FUNCTION pg_temp.release_data_fingerprint() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE t record; h text; parts text := '';
BEGIN
  FOR t IN SELECT c.oid, n.nspname, c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname
  LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(row_hash, '''' ORDER BY row_hash), '''')) FROM (SELECT md5(to_jsonb(r)::text || r.xmin::text) row_hash FROM %I.%I r) s', t.nspname,t.relname) INTO h;
    parts := parts || t.relname || ':' || h || ';';
  END LOOP;
  RETURN md5(parts);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.lock_release_tables() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname
  LOOP
    EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',t.relname);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assert_recovery_safe() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE expected_data text := current_setting('release.expected_data_fingerprint',true);
  expected_function text := current_setting('release.expected_approval_hash',true);
  actual_function text;
BEGIN
  IF expected_data IS NULL OR expected_data !~ '^[0-9a-f]{32}$'
    OR expected_function IS NULL OR expected_function !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'Recovery blocked: supply the two fingerprints captured by the successful forward transaction';
  END IF;
  PERFORM pg_temp.lock_release_tables();
  SELECT md5(p.prosrc) INTO actual_function FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='approve_ambassador_report_payment' AND p.pronargs=13;
  IF actual_function IS DISTINCT FROM expected_function THEN
    RAISE EXCEPTION 'Recovery blocked: approval function changed';
  END IF;
  IF pg_temp.release_data_fingerprint() IS DISTINCT FROM expected_data THEN
    RAISE EXCEPTION 'Recovery blocked: public data changed after cutover; use reviewed forward recovery';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payments WHERE finance_email_status='pending' OR finance_email_claim_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Recovery blocked: finance delivery has not drained';
  END IF;
END $$;

SELECT pg_temp.lock_release_tables();
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.payments p WHERE finance_email_status='pending' OR to_jsonb(p)->>'finance_email_claim_id' IS NOT NULL) THEN RAISE EXCEPTION 'Release blocked: finance delivery has not drained'; END IF; END $$;
CREATE TEMP TABLE release_payment_baseline ON COMMIT DROP AS
 SELECT id,status,amount_cents,base_amount_cents,sourcing_bonus_cents,extra_amount_cents FROM public.payments;


-- 0049_ambassador_staff_notes.sql
-- Internal staff notes on ambassador profiles: a short discussion thread per
-- ambassador (top-level notes with one level of replies) for staff and super
-- admins only. Ambassadors must never see these, so the table has no API
-- grants at all: the app reads and writes it with the service role after
-- checking staff access.

create table if not exists public.ambassador_notes (
  id uuid primary key default gen_random_uuid(),
  ambassador_profile_id uuid not null references public.ambassador_profiles(id) on delete cascade,
  parent_id uuid references public.ambassador_notes(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists ambassador_notes_profile_created_idx
  on public.ambassador_notes (ambassador_profile_id, created_at desc);
create index if not exists ambassador_notes_parent_idx
  on public.ambassador_notes (parent_id);

alter table public.ambassador_notes enable row level security;
revoke all on public.ambassador_notes from anon, authenticated;

-- 0054_payment_integrity.sql
-- Payment, report and reschedule integrity.
--
-- 1. Payment breakdown. 0051's approval RPC changed amount_cents (top-ups) and
--    zeroed it (no-payment approvals), but 0026's check still demanded
--    amount_cents = base + sourcing, so both paths failed. The breakdown is now
--    base + sourcing bonus + second-session amount + staff extra, every part a
--    non-negative integer, staff extras whole dollars up to $250. A no-payment
--    approval zeroes every part (so earnings and bonus totals stay right) and
--    records the amount it replaced in its eligibility reason.
-- 2. Finance emails. A send claims the payment with a single-writer claim id;
--    only the claim's completion may record the outcome, and it never touches
--    the payment status, so a stale send cannot overwrite a newer one or undo a
--    finance confirmation. A claim left pending (crashed request) can be taken
--    over once it is older than the stale window.
-- 3. Reports. One report covers the ambassador's back-to-back sessions of one
--    booking on one NZ day (the grouping the report form and open-bookings
--    cards already show). Report, covered sessions and the single payment are
--    written in one transaction, serialized per booking. A two-session group
--    pays the delivery fee plus a $50 second-session amount ($300); the
--    sourcing bonus stays separate. Sessions in a different booking are not
--    grouped: staff add any adjustment manually at approval.
-- 4. Reschedules. Staff approval checks the assigned ambassador's other
--    sessions for a real time overlap under the same table lock the guest
--    reschedule path uses.
--
-- Every function is service-role only, like the RPCs before it.

alter table public.payments
  add column if not exists additional_session_cents integer not null default 0,
  add column if not exists finance_email_claim_id uuid,
  add column if not exists finance_email_claimed_at timestamptz;

-- Refuse to apply over rows the new rules would reject, rather than silently
-- rewriting payment history.
do $$
declare
  v_invalid integer;
  v_duplicates integer;
begin
  select count(*) into v_invalid
  from public.payments payment
  where not (
    payment.amount_cents >= 0
    and payment.base_amount_cents >= 0
    and payment.sourcing_bonus_cents >= 0
    and payment.additional_session_cents >= 0
    and payment.extra_amount_cents between 0 and 25000
    and payment.extra_amount_cents % 100 = 0
    and payment.amount_cents = payment.base_amount_cents + payment.sourcing_bonus_cents
      + payment.additional_session_cents + payment.extra_amount_cents
  );

  if v_invalid > 0 then
    raise exception '0054: % payment row(s) have an amount that does not match their breakdown. Fix them before applying this migration.', v_invalid;
  end if;

  select count(*) into v_duplicates
  from (
    select 1
    from public.payments payment
    where payment.status in ('pending', 'eligible', 'approved', 'paid')
      and payment.ambassador_profile_id is not null
    group by payment.booking_session_id, payment.ambassador_profile_id
    having count(*) > 1
  ) duplicate;

  if v_duplicates > 0 then
    raise exception '0054: % session(s) have more than one live payment for the same ambassador. Resolve them before applying this migration.', v_duplicates;
  end if;
end;
$$;

alter table public.payments
  drop constraint if exists payments_amount_breakdown_check,
  drop constraint if exists payments_extra_amount_cents_check,
  add constraint payments_extra_amount_cents_check
    check (extra_amount_cents between 0 and 25000 and extra_amount_cents % 100 = 0),
  add constraint payments_amount_breakdown_check
    check (
      amount_cents >= 0
      and base_amount_cents >= 0
      and sourcing_bonus_cents >= 0
      and additional_session_cents >= 0
      and amount_cents = base_amount_cents + sourcing_bonus_cents + additional_session_cents + extra_amount_cents
    );

-- Backstop for the report RPC: one live payment per session and ambassador.
create unique index if not exists payments_live_session_ambassador_key
  on public.payments (booking_session_id, ambassador_profile_id)
  where status in ('pending', 'eligible', 'approved', 'paid');

-- ---------------------------------------------------------------------------
-- Approval. Same signature as 0051. The total is recomputed from the
-- breakdown (never accumulated), and approval leaves the payment "Ready for
-- finance" with no confirmation token: the token is created by the send
-- claim below, so p_token_hash / p_token_expires_at are accepted but unused.

create or replace function public.approve_ambassador_report_payment(
  p_report_id uuid,
  p_actor_id uuid,
  p_invoice_number text default null,
  p_bank_account_name text default null,
  p_bank_account_number text default null,
  p_gst_number text default null,
  p_token_hash text default null,
  p_token_expires_at timestamptz default null,
  p_finance_email text default null,
  p_extra_amount_cents integer default 0,
  p_skip_payment boolean default false,
  p_payment_note text default null
)
returns table (
  did_approve boolean,
  payment_id uuid,
  booking_session_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_report public.ambassador_reports%rowtype;
  v_payment public.payments%rowtype;
  v_extra integer := coalesce(p_extra_amount_cents, 0);
  v_skip boolean := coalesce(p_skip_payment, false);
  v_note text := nullif(btrim(coalesce(p_payment_note, '')), '');
begin
  select * into v_report
  from public.ambassador_reports report
  where report.id = p_report_id
  for update;

  if not found then
    return;
  end if;

  if v_report.reviewed_for_payment_at is not null then
    return query select false, null::uuid, v_report.booking_session_id;
    return;
  end if;

  select * into v_payment
  from public.payments payment
  where payment.booking_session_id = v_report.booking_session_id
    and payment.ambassador_profile_id = v_report.ambassador_profile_id
    and payment.status in ('pending', 'eligible')
  order by payment.created_at desc
  limit 1
  for update;

  if v_payment.id is not null then
    if v_extra < 0 or v_extra > 25000 or v_extra % 100 <> 0 then
      raise exception 'Extra payment amounts must be whole dollars between $0 and $250.';
    end if;

    if v_skip and v_extra > 0 then
      raise exception 'A report approved with no payment cannot carry an extra amount.';
    end if;

    if (v_skip or v_extra > 0)
      and (v_note is null or char_length(v_note) < 3 or char_length(v_note) > 500) then
      raise exception 'Extra amounts and no-payment approvals require a note of 3 to 500 characters.';
    end if;
  end if;

  update public.ambassador_reports report
  set
    reviewed_for_payment_at = now(),
    reviewed_for_payment_by = p_actor_id
  where report.id = v_report.id;

  if v_payment.id is null then
    return query select true, null::uuid, v_report.booking_session_id;
    return;
  end if;

  if v_skip then
    update public.payments payment
    set
      status = 'not_eligible',
      amount_cents = 0,
      base_amount_cents = 0,
      sourcing_bonus_cents = 0,
      additional_session_cents = 0,
      extra_amount_cents = 0,
      staff_override = true,
      payment_note = v_note,
      eligibility_reason = format(
        'Approved with no payment (replaced %s cents: %s base, %s sourcing bonus, %s second session): %s',
        payment.amount_cents,
        payment.base_amount_cents,
        payment.sourcing_bonus_cents,
        payment.additional_session_cents,
        v_note
      ),
      finance_email_status = null,
      finance_email_claim_id = null,
      finance_email_claimed_at = null,
      finance_confirmation_token_hash = null,
      finance_confirmation_expires_at = null,
      updated_by = p_actor_id,
      updated_at = now()
    where payment.id = v_payment.id;

    update public.booking_sessions session
    set
      payment_status = 'not_eligible',
      updated_at = now()
    where session.id = v_report.booking_session_id;

    return query select true, null::uuid, v_report.booking_session_id;
    return;
  end if;

  if p_invoice_number is null
    or p_bank_account_name is null
    or p_bank_account_number is null
    or p_finance_email is null then
    raise exception 'Payable reports require complete finance payment data.';
  end if;

  update public.payments payment
  set
    status = 'approved',
    extra_amount_cents = v_extra,
    amount_cents = payment.base_amount_cents + payment.sourcing_bonus_cents
      + payment.additional_session_cents + v_extra,
    payment_note = case when v_extra > 0 then v_note else null end,
    invoice_number = coalesce(payment.invoice_number, p_invoice_number),
    invoice_generated_at = coalesce(payment.invoice_generated_at, now()),
    bank_account_name = p_bank_account_name,
    bank_account_number = p_bank_account_number,
    gst_number = nullif(p_gst_number, ''),
    sent_to_email = p_finance_email,
    finance_email_status = null,
    finance_email_error = null,
    finance_email_claim_id = null,
    finance_email_claimed_at = null,
    finance_confirmation_token_hash = null,
    finance_confirmation_expires_at = null,
    updated_by = p_actor_id,
    updated_at = now()
  where payment.id = v_payment.id;

  update public.booking_sessions session
  set
    status = 'payment_pending',
    payment_status = 'approved',
    updated_at = now()
  where session.id = v_report.booking_session_id;

  return query select true, v_payment.id, v_report.booking_session_id;
end;
$$;

revoke all on function public.approve_ambassador_report_payment(
  uuid, uuid, text, text, text, text, text, timestamptz, text, integer, boolean, text
) from public, anon, authenticated;
grant execute on function public.approve_ambassador_report_payment(
  uuid, uuid, text, text, text, text, text, timestamptz, text, integer, boolean, text
) to service_role;

-- ---------------------------------------------------------------------------
-- Finance email claim. Returns no row when the payment can't be sent now:
-- not approved (including paid), already with finance on a live link, or
-- another send is in flight and not yet stale. The new token replaces the old
-- one at claim time, so only the link in the newest email confirms payment.

create or replace function public.claim_finance_payment_email(
  p_payment_id uuid,
  p_actor_id uuid,
  p_token_hash text,
  p_token_expires_at timestamptz,
  p_finance_email text,
  p_stale_after_seconds integer default 600
)
returns table (
  claim_id uuid,
  first_send boolean,
  invoice_number text,
  booking_session_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_payment public.payments%rowtype;
  v_claim uuid := gen_random_uuid();
begin
  if p_token_hash is null
    or p_token_expires_at is null
    or p_token_expires_at <= now()
    or nullif(btrim(coalesce(p_finance_email, '')), '') is null then
    raise exception 'A finance email claim needs a fresh confirmation token and a finance address.';
  end if;

  select * into v_payment
  from public.payments payment
  where payment.id = p_payment_id
  for update;

  if not found or v_payment.status <> 'approved' or v_payment.invoice_number is null then
    return;
  end if;

  if not (
    v_payment.finance_email_status is null
    or v_payment.finance_email_status = 'failed'
    or (
      v_payment.finance_email_status = 'sent'
      and (
        v_payment.finance_confirmation_expires_at is null
        or v_payment.finance_confirmation_expires_at <= now()
      )
    )
    or (
      v_payment.finance_email_status = 'pending'
      and (
        v_payment.finance_email_claimed_at is null
        or v_payment.finance_email_claimed_at
          <= now() - make_interval(secs => greatest(coalesce(p_stale_after_seconds, 600), 60))
      )
    )
  ) then
    return;
  end if;

  update public.payments payment
  set
    finance_email_status = 'pending',
    finance_email_claim_id = v_claim,
    finance_email_claimed_at = now(),
    finance_email_error = null,
    finance_confirmation_token_hash = p_token_hash,
    finance_confirmation_expires_at = p_token_expires_at,
    sent_to_email = p_finance_email,
    updated_by = p_actor_id,
    updated_at = now()
  where payment.id = v_payment.id;

  return query select
    v_claim,
    v_payment.sent_to_finance_at is null,
    v_payment.invoice_number,
    v_payment.booking_session_id;
end;
$$;

-- Records the outcome of one claimed send. Matches the claim id, so a send
-- whose claim was taken over (or already completed) changes nothing. Only
-- email fields are written: a payment finance has already confirmed stays paid.
create or replace function public.complete_finance_payment_email(
  p_payment_id uuid,
  p_claim_id uuid,
  p_sent boolean,
  p_error text default null,
  p_actor_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_updated uuid;
begin
  update public.payments payment
  set
    finance_email_status = case when p_sent then 'sent' else 'failed' end,
    finance_email_attempts = payment.finance_email_attempts + 1,
    finance_email_last_attempt_at = v_now,
    finance_email_error = case
      when p_sent then null
      else left(coalesce(nullif(btrim(coalesce(p_error, '')), ''), 'The finance email could not be sent.'), 1000)
    end,
    sent_to_finance_at = case when p_sent then v_now else payment.sent_to_finance_at end,
    finance_email_claim_id = null,
    finance_email_claimed_at = null,
    updated_by = coalesce(p_actor_id, payment.updated_by),
    updated_at = v_now
  where payment.id = p_payment_id
    and payment.finance_email_claim_id = p_claim_id
    and payment.finance_email_status = 'pending'
  returning payment.id into v_updated;

  return v_updated is not null;
end;
$$;

revoke all on function public.claim_finance_payment_email(uuid, uuid, text, timestamptz, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_finance_payment_email(uuid, uuid, text, timestamptz, text, integer)
  to service_role;
revoke all on function public.complete_finance_payment_email(uuid, uuid, boolean, text, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_finance_payment_email(uuid, uuid, boolean, text, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Grouped report submission. outcome is 'submitted' or an error code the app
-- shows as-is. Nothing is written unless the whole group succeeds.

create or replace function public.submit_ambassador_report_group(
  p_session_id uuid,
  p_ambassador_profile_id uuid,
  p_actor_id uuid,
  p_report jsonb,
  p_delivery_cents integer,
  p_sourcing_bonus_cents integer,
  p_second_session_cents integer,
  p_eligible_threshold integer,
  p_is_sourced boolean
)
returns table (
  outcome text,
  report_id uuid,
  payment_id uuid,
  covered_session_ids uuid[],
  session_count integer,
  payment_status text,
  amount_cents integer
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_request_id uuid;
  v_session public.booking_sessions%rowtype;
  v_day date;
  v_group uuid[];
  v_covered uuid[];
  v_count integer;
  v_attendees integer := (p_report->>'attendee_count')::integer;
  v_eligible boolean;
  v_sourcing integer := case when coalesce(p_is_sourced, false) then coalesce(p_sourcing_bonus_cents, 0) else 0 end;
  v_second integer := 0;
  v_amount integer := 0;
  v_reason text;
  v_report_id uuid;
  v_payment_id uuid;
begin
  if p_delivery_cents is null or p_delivery_cents < 0
    or coalesce(p_sourcing_bonus_cents, 0) < 0
    or coalesce(p_second_session_cents, 0) < 0
    or p_eligible_threshold is null
    or v_attendees is null or v_attendees < 0 then
    raise exception 'Invalid report or payout inputs.';
  end if;

  -- Acquire the write lock before the booking row. Guest rescheduling takes
  -- its table lock before that row too; reversing the order can deadlock.
  -- ROW EXCLUSIVE is the mode these updates need and allows independent
  -- report submissions to proceed concurrently.
  lock table public.booking_sessions in row exclusive mode;

  select session.booking_request_id into v_request_id
  from public.booking_sessions session
  where session.id = p_session_id;

  if not found then
    return query select 'session-not-assigned', null::uuid, null::uuid, null::uuid[], 0, null::text, 0;
    return;
  end if;

  -- Serializes every report for this booking, so two submissions for sibling
  -- sessions can't both see the other unreported and both pay.
  perform 1 from public.booking_requests booking where booking.id = v_request_id for update;

  select * into v_session
  from public.booking_sessions session
  where session.id = p_session_id
  for update;

  if v_session.assigned_ambassador_id is distinct from p_ambassador_profile_id then
    return query select 'session-not-assigned', null::uuid, null::uuid, null::uuid[], 0, null::text, 0;
    return;
  end if;

  if v_session.ends_at > now()
    or v_session.status not in ('confirmed', 'completed_pending_report')
    or v_session.report_status <> 'not_submitted' then
    return query select 'session-not-finished', null::uuid, null::uuid, null::uuid[], 0, null::text, 0;
    return;
  end if;

  if exists (
    select 1 from public.ambassador_reports report where report.booking_session_id = v_session.id
  ) then
    return query select 'report-already-submitted', null::uuid, null::uuid, null::uuid[], 0, null::text, 0;
    return;
  end if;

  v_day := (v_session.starts_at at time zone 'Pacific/Auckland')::date;

  -- Older reports may predate sibling coverage. Never create a second full
  -- payment for an unmarked sibling of an already-reported booking/day.
  -- Preserve existing history and route the adjustment to staff review.
  if exists (
    select 1
    from public.ambassador_reports prior_report
    join public.booking_sessions prior_session on prior_session.id = prior_report.booking_session_id
    where prior_session.booking_request_id = v_request_id
      and prior_report.ambassador_profile_id = p_ambassador_profile_id
      and (prior_session.starts_at at time zone 'Pacific/Auckland')::date = v_day
  ) then
    return query select 'group-already-reported', null::uuid, null::uuid, null::uuid[], 0, null::text, 0;
    return;
  end if;

  -- The day's report covers every session of it, so it waits until the last
  -- one has finished instead of leaving a later session to be paid in full.
  if exists (
    select 1
    from public.booking_sessions other
    where other.booking_request_id = v_request_id
      and other.id <> v_session.id
      and other.assigned_ambassador_id = p_ambassador_profile_id
      and (other.starts_at at time zone 'Pacific/Auckland')::date = v_day
      and other.status not in ('cancelled', 'declined')
      and other.report_status = 'not_submitted'
      and other.ends_at > now()
  ) then
    return query select 'report-day-not-finished', null::uuid, null::uuid, null::uuid[], 0, null::text, 0;
    return;
  end if;

  select array_agg(grouped.id order by grouped.starts_at, grouped.id) into v_group
  from (
    select other.id, other.starts_at
    from public.booking_sessions other
    where other.booking_request_id = v_request_id
      and other.assigned_ambassador_id = p_ambassador_profile_id
      and (other.starts_at at time zone 'Pacific/Auckland')::date = v_day
      and other.status in ('confirmed', 'completed_pending_report')
      and other.report_status = 'not_submitted'
      and other.ends_at <= now()
      and not exists (
        select 1 from public.ambassador_reports report where report.booking_session_id = other.id
      )
    for update
  ) grouped;

  v_count := coalesce(array_length(v_group, 1), 0);

  if v_count = 0 or not (v_session.id = any(v_group)) then
    return query select 'session-not-finished', null::uuid, null::uuid, null::uuid[], 0, null::text, 0;
    return;
  end if;

  -- Never pay a session twice, e.g. one paid by a report from before 0054.
  if exists (
    select 1
    from public.payments payment
    where payment.booking_session_id = any(v_group)
      and payment.ambassador_profile_id = p_ambassador_profile_id
      and payment.status in ('pending', 'eligible', 'approved', 'paid')
  ) then
    return query select 'payment-already-exists', null::uuid, null::uuid, null::uuid[], 0, null::text, 0;
    return;
  end if;

  v_covered := array_remove(v_group, v_session.id);
  v_eligible := v_attendees >= p_eligible_threshold;

  insert into public.ambassador_reports (
    booking_session_id,
    ambassador_profile_id,
    presenter_name,
    school_roll_size,
    primary_contact_name,
    primary_contact_email,
    delivered_at,
    students_competed_in_esports,
    attendee_count,
    year_levels,
    age_groups,
    parents_present,
    attendee_quotes,
    attendance_rating,
    student_response_rating,
    teacher_response_rating,
    presentation_energy_rating,
    presentation_feedback,
    student_questions_themes,
    additional_notes,
    media_consent_confirmed,
    submitted_at
  )
  values (
    v_session.id,
    p_ambassador_profile_id,
    p_report->>'presenter_name',
    (p_report->>'school_roll_size')::integer,
    p_report->>'primary_contact_name',
    p_report->>'primary_contact_email',
    coalesce((p_report->>'delivered_at')::timestamptz, v_session.starts_at),
    (p_report->>'students_competed_in_esports')::boolean,
    v_attendees,
    p_report->>'year_levels',
    p_report->>'age_groups',
    (p_report->>'parents_present')::boolean,
    p_report->>'attendee_quotes',
    (p_report->>'attendance_rating')::integer,
    (p_report->>'student_response_rating')::integer,
    (p_report->>'teacher_response_rating')::integer,
    (p_report->>'presentation_energy_rating')::integer,
    p_report->>'presentation_feedback',
    p_report->>'student_questions_themes',
    p_report->>'additional_notes',
    coalesce((p_report->>'media_consent_confirmed')::boolean, false),
    now()
  )
  returning id into v_report_id;

  update public.booking_sessions session
  set
    report_status = 'submitted',
    status = 'report_submitted',
    payment_status = case
      when session.id = v_session.id and v_eligible then 'eligible'
      else 'not_eligible'
    end,
    actual_student_count = case
      when session.id = v_session.id then v_attendees
      else session.actual_student_count
    end,
    updated_at = now()
  where session.id = any(v_group);

  if v_eligible then
    -- Only the second session has a confirmed rate. A third or later session
    -- is covered by the report but not paid automatically.
    v_second := case when v_count >= 2 then coalesce(p_second_session_cents, 0) else 0 end;
    v_amount := p_delivery_cents + v_sourcing + v_second;
    v_reason := format('Attendee count %s meets threshold of %s.', v_attendees, p_eligible_threshold)
      || case when v_sourcing > 0 then ' Includes the sourcing bonus.' else '' end
      || case when v_count >= 2 then format(' One report for %s back-to-back sessions; the second session adds its fixed amount.', v_count) else '' end
      || case when v_count > 2 then ' Sessions after the second are not paid automatically: add any amount for them when approving.' else '' end;

    insert into public.payments (
      booking_session_id,
      ambassador_profile_id,
      status,
      eligibility_reason,
      amount_cents,
      base_amount_cents,
      sourcing_bonus_cents,
      additional_session_cents
    )
    values (
      v_session.id,
      p_ambassador_profile_id,
      'pending',
      v_reason,
      v_amount,
      p_delivery_cents,
      v_sourcing,
      v_second
    )
    returning id into v_payment_id;
  end if;

  insert into public.booking_activity_logs (
    booking_request_id, booking_session_id, action, actor_id, actor_type, details
  )
  select
    v_request_id,
    covered.id,
    'report.covered_by_same_day_report',
    p_actor_id,
    'ambassador',
    jsonb_build_object('report_id', v_report_id, 'reported_session_id', v_session.id)
  from unnest(v_covered) as covered(id);

  -- Roll the booking forward only once none of its sessions still need a report.
  if not exists (
    select 1
    from public.booking_sessions other
    where other.booking_request_id = v_request_id
      and other.status not in ('report_submitted', 'payment_pending', 'paid', 'closed', 'cancelled', 'declined')
  ) then
    update public.booking_requests booking
    set status = 'report_submitted'
    where booking.id = v_request_id;
  end if;

  return query select
    'submitted',
    v_report_id,
    v_payment_id,
    v_covered,
    v_count,
    case when v_eligible then 'eligible' else 'not_eligible' end,
    v_amount;
end;
$$;

revoke all on function public.submit_ambassador_report_group(
  uuid, uuid, uuid, jsonb, integer, integer, integer, integer, boolean
) from public, anon, authenticated;
grant execute on function public.submit_ambassador_report_group(
  uuid, uuid, uuid, jsonb, integer, integer, integer, integer, boolean
) to service_role;

-- ---------------------------------------------------------------------------
-- Staff reschedule decision. Overlap is strict (touching back-to-back
-- sessions are fine). Existing overlaps elsewhere are reported, never changed.

create or replace function public.resolve_session_reschedule(
  p_session_id uuid,
  p_decision text,
  p_new_start timestamptz default null,
  p_new_end timestamptz default null
)
returns table (
  outcome text,
  restored_status text,
  previous_starts_at timestamptz,
  previous_ends_at timestamptz,
  conflict_session_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_session public.booking_sessions%rowtype;
  v_status text;
  v_conflict uuid;
begin
  if p_decision is null or p_decision not in ('approve', 'decline') then
    raise exception 'Unknown reschedule decision.';
  end if;

  if p_decision = 'approve'
    and (p_new_start is null or p_new_end is null or p_new_end <= p_new_start) then
    raise exception 'An approved reschedule needs a valid new time.';
  end if;

  -- Same lock as the guest reschedule path (0052): also waits for, and
  -- blocks, concurrent assignments and session edits.
  lock table public.booking_sessions in share row exclusive mode;

  select * into v_session
  from public.booking_sessions session
  where session.id = p_session_id
  for update;

  if not found or v_session.status <> 'reschedule_requested' then
    return query select 'not-pending', null::text, null::timestamptz, null::timestamptz, null::uuid;
    return;
  end if;

  v_status := coalesce(
    nullif(v_session.reschedule_previous_status, ''),
    case when v_session.assigned_ambassador_id is not null then 'ambassador_assigned' else 'tentative' end
  );

  if p_decision = 'approve' and v_session.assigned_ambassador_id is not null then
    select other.id into v_conflict
    from public.booking_sessions other
    where other.id <> v_session.id
      and other.assigned_ambassador_id = v_session.assigned_ambassador_id
      and other.status not in ('cancelled', 'declined')
      and other.starts_at < p_new_end
      and other.ends_at > p_new_start
    order by other.starts_at
    limit 1;

    if v_conflict is not null then
      return query select 'ambassador-conflict', v_status, v_session.starts_at, v_session.ends_at, v_conflict;
      return;
    end if;
  end if;

  update public.booking_sessions session
  set
    status = v_status,
    starts_at = case when p_decision = 'approve' then p_new_start else session.starts_at end,
    ends_at = case when p_decision = 'approve' then p_new_end else session.ends_at end,
    reschedule_requested_date = null,
    reschedule_request_notes = null,
    reschedule_requested_at = null,
    reschedule_previous_status = null
  where session.id = v_session.id;

  return query select 'resolved', v_status, v_session.starts_at, v_session.ends_at, null::uuid;
end;
$$;

revoke all on function public.resolve_session_reschedule(uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.resolve_session_reschedule(uuid, text, timestamptz, timestamptz)
  to service_role;

-- 0055_group_integrity.sql
-- Same-day group integrity for applications, withdrawals and assignments.
--
-- Back-to-back sessions of one booking on one NZ day are one opportunity
-- (lib/same-day-sessions.ts, submit_ambassador_report_group in 0054). The app
-- used to apply an action to one session and then repeat it, one request at a
-- time, for the day's other sessions, so a failure or a concurrent change
-- could leave the day half done. Each function below changes the whole group
-- in one transaction, or nothing:
--
--   apply_to_session_group             ambassador applies
--   withdraw_application_group         ambassador withdraws an application
--   request_session_withdrawal_group   assigned ambassador asks to withdraw
--   resolve_session_withdrawal_group   staff decide a withdrawal request
--   assign_ambassador_group            staff assign, replace or unassign
--
-- Each validates the actor (role, active account, approved ambassador
-- profile) and the transition itself, writes applications, session status,
-- status history, activity logs and the parent booking roll-up together, and
-- returns an outcome code the app shows as-is. The app sends notifications and
-- emails only after the call has returned, i.e. after commit.
--
-- Group membership is the same as the per-session repeats it replaces: the
-- anchor session plus the same booking's sessions on the anchor's NZ day that
-- are in the state the action applies to. Cancelled and declined sessions are
-- never members; delivered/closed sessions never change assignment.
--
-- Locking. Every function takes its booking_sessions table lock first, then
-- the parent booking row, then the booking's session rows in id order - the
-- same table-first order as the guest (0037-0052), reschedule (0054) and
-- report (0054) paths, so none of them can deadlock with each other.
-- Assignment changes, school cancellations and reschedule requests, and
-- staff status changes take SHARE ROW EXCLUSIVE (self-conflicting): they are
-- serialized with each other, staff reschedules and guest changes, so an
-- overlap or state check and its write can't race another writer. A batch
-- locks its bookings in id order.
-- Applications and withdrawal requests don't move people or times and take
-- ROW EXCLUSIVE, like report submission; the booking row lock serializes them
-- per booking.
--
-- Overlap is strict: one session ending exactly when the next starts is fine.
-- Existing overlaps that don't involve a session being newly assigned are
-- reported nowhere and changed by nothing.
--
-- Further down, the same treatment for the school's own cancellation and
-- reschedule request and for staff booking-status changes (single and bulk):
--
--   cancel_school_booking               school cancels its booking
--   request_school_session_reschedule   school asks to move one session
--   update_booking_status_batch         staff set a booking status
--   insert_booking_session_checked      first session of a staff manual or
--                                       ambassador-logged booking
--
-- Every public function is service-role only, like the RPCs before it.

-- The exact status a session had when its current withdrawal request was
-- made, so "keep" restores it without reading status history (whose rows all
-- share now() inside one transaction, so their order can tie). Set by the
-- request, cleared whenever the request ends. Requests made before 0055 have
-- none and fall back to history. Like 0052's columns, user-scoped Data API
-- clients get no grant on it (0048): only the service role reads it.
alter table public.booking_sessions
  add column if not exists withdrawal_previous_status text;

alter table public.booking_sessions
  drop constraint if exists booking_sessions_withdrawal_previous_status_check,
  add constraint booking_sessions_withdrawal_previous_status_check
    check (withdrawal_previous_status is null or withdrawal_previous_status in ('ambassador_assigned', 'confirmed'));

-- ---------------------------------------------------------------------------
-- Internal helpers. Not callable through the API.

-- The approved, non-deleted ambassador profile of an active ambassador user.
create or replace function public.group_actor_ambassador_profile(p_actor_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ambassador.id
  from public.profiles profile
  join public.ambassador_profiles ambassador on ambassador.user_id = profile.id
  where profile.id = p_actor_id
    and profile.role = 'ambassador'
    and profile.status = 'active'
    and ambassador.status = 'approved'
    and ambassador.deleted_at is null
  limit 1
$$;

-- Same rule as portal access (lib/services/auth.ts requirePortalAccess):
-- an approved, non-deleted profile, and - if it is linked to a portal user -
-- that user is an active ambassador. Directory-only profiles (no user_id,
-- 0026) stay assignable.
create or replace function public.group_ambassador_is_assignable(p_ambassador_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ambassador_profiles ambassador
    left join public.profiles profile on profile.id = ambassador.user_id
    where ambassador.id = p_ambassador_profile_id
      and ambassador.status = 'approved'
      and ambassador.deleted_at is null
      and (
        ambassador.user_id is null
        or (profile.role = 'ambassador' and profile.status = 'active')
      )
  )
$$;

create or replace function public.group_actor_is_staff(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = p_actor_id
      and profile.role in ('staff', 'super_admin')
      and profile.status = 'active'
  )
$$;

-- Same rule as the app's former refreshPreConfirmationBookingStatus: a booking
-- that hasn't been confirmed yet reads "ambassador assigned" once every active
-- session has an ambassador, "applied" while an unassigned one has a live
-- application, otherwise "tentative". Confirmed, delivered, cancelled and
-- other later booking states are never changed. The caller holds the booking
-- row lock, so the status read here can't be stale.
create or replace function public.rollup_pre_confirmation_booking_status(
  p_booking_id uuid,
  p_actor_id uuid,
  p_actor_type text,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_next text;
  v_active integer;
  v_unassigned integer;
begin
  select booking.status into v_status
  from public.booking_requests booking
  where booking.id = p_booking_id;

  if v_status is null
    or v_status not in ('requested', 'tentative', 'applied', 'ambassador_assigned') then
    return null;
  end if;

  select
    count(*),
    count(*) filter (where session.assigned_ambassador_id is null)
  into v_active, v_unassigned
  from public.booking_sessions session
  where session.booking_request_id = p_booking_id
    and session.status not in (
      'cancelled', 'declined', 'completed_pending_report', 'report_submitted',
      'payment_pending', 'paid', 'closed'
    );

  if v_active = 0 then
    return null;
  end if;

  v_next := case
    when v_unassigned = 0 then 'ambassador_assigned'
    when exists (
      select 1
      from public.booking_session_applications application
      join public.booking_sessions session on session.id = application.booking_session_id
      where session.booking_request_id = p_booking_id
        and session.assigned_ambassador_id is null
        and session.status not in (
          'cancelled', 'declined', 'completed_pending_report', 'report_submitted',
          'payment_pending', 'paid', 'closed'
        )
        and application.status = 'applied'
    ) then 'applied'
    else 'tentative'
  end;

  if v_next = v_status then
    return null;
  end if;

  update public.booking_requests booking
  set status = v_next
  where booking.id = p_booking_id;

  insert into public.booking_status_history (booking_request_id, old_status, new_status, changed_by, reason)
  values (p_booking_id, v_status, v_next, p_actor_id, p_reason);

  insert into public.booking_activity_logs (booking_request_id, action, actor_id, actor_type, details)
  values (
    p_booking_id,
    'booking.status_rolled_up',
    p_actor_id,
    p_actor_type,
    jsonb_build_object('old_status', v_status, 'new_status', v_next)
  );

  return v_next;
end;
$$;

revoke all on function public.group_actor_ambassador_profile(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.group_actor_is_staff(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.group_ambassador_is_assignable(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.rollup_pre_confirmation_booking_status(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Ambassador applies. Members: the anchor plus the day's unassigned, open,
-- not-yet-started sessions the ambassador has no live application for. An
-- anchor the ambassador already applied for (or was declined/accepted on)
-- changes nothing, so a repeat is a no-op.

create or replace function public.apply_to_session_group(
  p_session_id uuid,
  p_actor_id uuid,
  p_message text default null
)
returns table (outcome text, booking_request_id uuid, session_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ambassador uuid := public.group_actor_ambassador_profile(p_actor_id);
  v_booking uuid;
  v_booking_status text;
  v_anchor public.booking_sessions%rowtype;
  v_day date;
  v_members uuid[];
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if v_ambassador is null then
    return query select 'ambassador-not-found', null::uuid, null::uuid[];
    return;
  end if;

  lock table public.booking_sessions in row exclusive mode;

  select session.booking_request_id into v_booking
  from public.booking_sessions session
  where session.id = p_session_id;

  if v_booking is null then
    return query select 'session-not-open', null::uuid, null::uuid[];
    return;
  end if;

  select booking.status into v_booking_status
  from public.booking_requests booking where booking.id = v_booking for update;
  perform 1 from public.booking_sessions session
    where session.booking_request_id = v_booking order by session.id for update;

  select * into v_anchor from public.booking_sessions session where session.id = p_session_id;

  -- A cancelled or declined booking stays closed, even if a leftover
  -- session still reads as open.
  if not found
    or v_booking_status in ('cancelled', 'declined')
    or v_anchor.assigned_ambassador_id is not null
    or v_anchor.status not in ('tentative', 'applied') then
    return query select 'session-not-open', v_booking, null::uuid[];
    return;
  end if;

  if v_anchor.starts_at <= now() then
    return query select 'session-already-started', v_booking, null::uuid[];
    return;
  end if;

  if exists (
    select 1 from public.booking_session_applications application
    where application.booking_session_id = v_anchor.id
      and application.ambassador_profile_id = v_ambassador
      and application.status <> 'withdrawn'
  ) then
    return query select 'already-applied', v_booking, null::uuid[];
    return;
  end if;

  v_day := (v_anchor.starts_at at time zone 'Pacific/Auckland')::date;

  select array_agg(session.id order by session.starts_at, session.id) into v_members
  from public.booking_sessions session
  where session.booking_request_id = v_booking
    and (session.starts_at at time zone 'Pacific/Auckland')::date = v_day
    and session.assigned_ambassador_id is null
    and session.status in ('tentative', 'applied')
    and session.starts_at > now()
    and not exists (
      select 1 from public.booking_session_applications application
      where application.booking_session_id = session.id
        and application.ambassador_profile_id = v_ambassador
        and application.status <> 'withdrawn'
    );

  insert into public.booking_session_applications as application (
    booking_session_id, ambassador_profile_id, status, message, applied_at, reviewed_at, reviewed_by
  )
  select member.id, v_ambassador, 'applied', v_message, now(), null, null
  from unnest(v_members) as member(id)
  on conflict (booking_session_id, ambassador_profile_id) do update
  set
    status = 'applied',
    message = excluded.message,
    applied_at = now(),
    reviewed_at = null,
    reviewed_by = null
  where application.status = 'withdrawn';

  with moved as (
    update public.booking_sessions session
    set status = 'applied'
    where session.id = any(v_members)
      and session.status = 'tentative'
    returning session.id
  )
  insert into public.booking_status_history (
    booking_request_id, booking_session_id, old_status, new_status, changed_by, reason
  )
  select v_booking, moved.id, 'tentative', 'applied', p_actor_id, 'Ambassador applied'
  from moved;

  insert into public.booking_activity_logs (
    booking_request_id, booking_session_id, action, actor_id, actor_type, details
  )
  select v_booking, member.id, 'session.applied', p_actor_id, 'ambassador',
    jsonb_build_object('ambassador_profile_id', v_ambassador)
  from unnest(v_members) as member(id);

  perform public.rollup_pre_confirmation_booking_status(
    v_booking, p_actor_id, 'ambassador', 'Booking application state changed');

  return query select 'applied', v_booking, v_members;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ambassador withdraws an application. Members: the anchor plus the day's
-- open (tentative/applied) sessions they have a live application for. A
-- session left with no live application and no ambassador reopens as
-- "tentative".

create or replace function public.withdraw_application_group(
  p_session_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns table (outcome text, booking_request_id uuid, session_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ambassador uuid := public.group_actor_ambassador_profile(p_actor_id);
  v_booking uuid;
  v_anchor public.booking_sessions%rowtype;
  v_day date;
  v_members uuid[];
begin
  if v_ambassador is null then
    return query select 'ambassador-not-found', null::uuid, null::uuid[];
    return;
  end if;

  lock table public.booking_sessions in row exclusive mode;

  select session.booking_request_id into v_booking
  from public.booking_sessions session
  where session.id = p_session_id;

  if v_booking is null then
    return query select 'application-not-found', null::uuid, null::uuid[];
    return;
  end if;

  perform 1 from public.booking_requests booking where booking.id = v_booking for update;
  perform 1 from public.booking_sessions session
    where session.booking_request_id = v_booking order by session.id for update;

  select * into v_anchor from public.booking_sessions session where session.id = p_session_id;

  if not found or not exists (
    select 1 from public.booking_session_applications application
    where application.booking_session_id = v_anchor.id
      and application.ambassador_profile_id = v_ambassador
      and application.status = 'applied'
  ) then
    return query select 'application-not-found', v_booking, null::uuid[];
    return;
  end if;

  v_day := (v_anchor.starts_at at time zone 'Pacific/Auckland')::date;

  select array_agg(session.id order by session.starts_at, session.id) into v_members
  from public.booking_sessions session
  where session.booking_request_id = v_booking
    and (
      session.id = v_anchor.id
      or (
        (session.starts_at at time zone 'Pacific/Auckland')::date = v_day
        and session.status in ('tentative', 'applied')
      )
    )
    and exists (
      select 1 from public.booking_session_applications application
      where application.booking_session_id = session.id
        and application.ambassador_profile_id = v_ambassador
        and application.status = 'applied'
    );

  update public.booking_session_applications application
  set status = 'withdrawn', reviewed_at = now(), reviewed_by = p_actor_id
  where application.booking_session_id = any(v_members)
    and application.ambassador_profile_id = v_ambassador
    and application.status = 'applied';

  with reopened as (
    update public.booking_sessions session
    set status = 'tentative'
    where session.id = any(v_members)
      and session.status = 'applied'
      and session.assigned_ambassador_id is null
      and not exists (
        select 1 from public.booking_session_applications application
        where application.booking_session_id = session.id
          and application.status = 'applied'
      )
    returning session.id
  )
  insert into public.booking_status_history (
    booking_request_id, booking_session_id, old_status, new_status, changed_by, reason
  )
  select v_booking, reopened.id, 'applied', 'tentative', p_actor_id, 'Last ambassador application was withdrawn'
  from reopened;

  insert into public.booking_activity_logs (
    booking_request_id, booking_session_id, action, actor_id, actor_type, details
  )
  select v_booking, member.id, 'session.application_withdrawn', p_actor_id, 'ambassador',
    jsonb_build_object(
      'ambassador_profile_id', v_ambassador,
      'reason', p_reason,
      'remaining_applications', (
        select count(*) from public.booking_session_applications application
        where application.booking_session_id = member.id and application.status = 'applied'
      )
    )
  from unnest(v_members) as member(id);

  perform public.rollup_pre_confirmation_booking_status(
    v_booking, p_actor_id, 'ambassador', 'Booking application state changed');

  return query select 'withdrawn', v_booking, v_members;
end;
$$;

-- ---------------------------------------------------------------------------
-- Assigned ambassador asks to withdraw. Members: the anchor plus the day's
-- upcoming, not-yet-delivered sessions assigned to them. Sessions already in a
-- withdrawal request are left as they are, so a repeat (or completing a group
-- a pre-0055 partial request left half done) never rewrites them. If any
-- other member can't be withdrawn from (e.g. it has a reschedule pending),
-- nothing changes.

create or replace function public.request_session_withdrawal_group(
  p_session_id uuid,
  p_actor_id uuid,
  p_reason_type text,
  p_reason text
)
returns table (outcome text, booking_request_id uuid, session_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ambassador uuid := public.group_actor_ambassador_profile(p_actor_id);
  v_booking uuid;
  v_anchor public.booking_sessions%rowtype;
  v_day date;
  v_pending uuid[];
  v_anchor_pending boolean;
begin
  if v_ambassador is null then
    return query select 'ambassador-not-found', null::uuid, null::uuid[];
    return;
  end if;

  lock table public.booking_sessions in row exclusive mode;

  select session.booking_request_id into v_booking
  from public.booking_sessions session
  where session.id = p_session_id;

  if v_booking is null then
    return query select 'not-your-session', null::uuid, null::uuid[];
    return;
  end if;

  perform 1 from public.booking_requests booking where booking.id = v_booking for update;
  perform 1 from public.booking_sessions session
    where session.booking_request_id = v_booking order by session.id for update;

  select * into v_anchor from public.booking_sessions session where session.id = p_session_id;

  if not found or v_anchor.assigned_ambassador_id is distinct from v_ambassador then
    return query select 'not-your-session', v_booking, null::uuid[];
    return;
  end if;

  if v_anchor.starts_at <= now() then
    return query select 'session-already-started', v_booking, null::uuid[];
    return;
  end if;

  v_anchor_pending := v_anchor.status <> 'withdrawal_requested' and v_anchor.withdrawal_requested_at is null;

  if v_anchor_pending and v_anchor.status not in ('ambassador_assigned', 'confirmed') then
    return query select 'withdrawal-not-allowed', v_booking, null::uuid[];
    return;
  end if;

  v_day := (v_anchor.starts_at at time zone 'Pacific/Auckland')::date;

  select array_agg(session.id order by session.starts_at, session.id) into v_pending
  from public.booking_sessions session
  where session.booking_request_id = v_booking
    and (session.starts_at at time zone 'Pacific/Auckland')::date = v_day
    and session.assigned_ambassador_id = v_ambassador
    and session.starts_at > now()
    and session.status in (
      'requested', 'tentative', 'applied', 'ambassador_assigned', 'confirmed', 'reschedule_requested'
    )
    and session.withdrawal_requested_at is null;

  if coalesce(array_length(v_pending, 1), 0) = 0 then
    return query select 'withdrawal-already-requested', v_booking, null::uuid[];
    return;
  end if;

  if exists (
    select 1 from public.booking_sessions session
    where session.id = any(v_pending)
      and session.status not in ('ambassador_assigned', 'confirmed')
  ) then
    return query select 'same-day-group-blocked', v_booking, null::uuid[];
    return;
  end if;

  with prior as (
    select session.id, session.status
    from public.booking_sessions session
    where session.id = any(v_pending)
  ),
  requested as (
    update public.booking_sessions session
    set
      status = 'withdrawal_requested',
      withdrawal_reason = p_reason,
      withdrawal_reason_type = p_reason_type,
      withdrawal_requested_at = now(),
      withdrawal_previous_status = prior.status
    from prior
    where session.id = prior.id
    returning session.id, prior.status as prior_status
  ),
  history as (
    insert into public.booking_status_history (
      booking_request_id, booking_session_id, old_status, new_status, changed_by, reason
    )
    select v_booking, requested.id, requested.prior_status, 'withdrawal_requested', p_actor_id, p_reason
    from requested
  )
  insert into public.booking_activity_logs (
    booking_request_id, booking_session_id, action, actor_id, actor_type, details
  )
  select v_booking, requested.id, 'session.withdrawal_requested', p_actor_id, 'ambassador',
    jsonb_build_object(
      'reason', p_reason,
      'reason_type', p_reason_type,
      'prior_status', requested.prior_status,
      'ambassador_profile_id', v_ambassador
    )
  from requested;

  return query select 'requested', v_booking, v_pending;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff decide a withdrawal request. Members: the anchor plus the day's other
-- sessions with a pending withdrawal from the same ambassador.
--   reopen          the ambassador is released; sessions return to "tentative"
--   cancel_rebooked the school was rebooked; sessions are cancelled (and the
--                   booking too, if nothing else is left)
--   keep            the ambassador stays; each session returns to the status
--                   it had before the request
-- Released ambassadors' applications are marked withdrawn.

create or replace function public.resolve_session_withdrawal_group(
  p_session_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_note text default null
)
returns table (
  outcome text,
  booking_request_id uuid,
  session_ids uuid[],
  ambassador_profile_id uuid,
  booking_cancelled boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_booking uuid;
  v_booking_status text;
  v_anchor public.booking_sessions%rowtype;
  v_assignee uuid;
  v_day date;
  v_ids uuid[];
  v_next text[];
  v_original text[];
  v_release boolean := p_decision in ('reopen', 'cancel_rebooked');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_reason text;
  v_action text;
  v_cancelled boolean := false;
begin
  if p_decision is null or p_decision not in ('reopen', 'cancel_rebooked', 'keep') then
    raise exception 'Unknown withdrawal decision.';
  end if;

  if not public.group_actor_is_staff(p_actor_id) then
    return query select 'not-authorized', null::uuid, null::uuid[], null::uuid, false;
    return;
  end if;

  lock table public.booking_sessions in share row exclusive mode;

  select session.booking_request_id into v_booking
  from public.booking_sessions session
  where session.id = p_session_id;

  if v_booking is null then
    return query select 'no-withdrawal-pending', null::uuid, null::uuid[], null::uuid, false;
    return;
  end if;

  select booking.status into v_booking_status
  from public.booking_requests booking where booking.id = v_booking for update;
  perform 1 from public.booking_sessions session
    where session.booking_request_id = v_booking order by session.id for update;

  select * into v_anchor from public.booking_sessions session where session.id = p_session_id;

  if not found or v_anchor.status <> 'withdrawal_requested' then
    return query select 'no-withdrawal-pending', v_booking, null::uuid[], null::uuid, false;
    return;
  end if;

  v_assignee := v_anchor.assigned_ambassador_id;
  v_day := (v_anchor.starts_at at time zone 'Pacific/Auckland')::date;

  -- Keeping the ambassador restores each session's status from the current
  -- request's withdrawal_previous_status. Only a request made before 0055
  -- (column empty) falls back to its latest history row, as the app did
  -- before; anything unexpected restores to "ambassador_assigned".
  select
    array_agg(member.id order by member.starts_at, member.id),
    array_agg(
      case
        when p_decision = 'reopen' then 'tentative'
        when p_decision = 'cancel_rebooked' then 'cancelled'
        when member.withdrawal_previous_status is not null then member.withdrawal_previous_status
        when latest.old_status in ('ambassador_assigned', 'confirmed') then latest.old_status
        else 'ambassador_assigned'
      end
      order by member.starts_at, member.id
    ),
    array_agg(member.withdrawal_reason order by member.starts_at, member.id)
  into v_ids, v_next, v_original
  from public.booking_sessions member
  left join lateral (
    select history.old_status
    from public.booking_status_history history
    where member.withdrawal_previous_status is null
      and history.booking_session_id = member.id
      and history.new_status = 'withdrawal_requested'
    order by history.created_at desc
    limit 1
  ) latest on true
  where member.booking_request_id = v_booking
    and member.status = 'withdrawal_requested'
    and (
      member.id = v_anchor.id
      or (
        (member.starts_at at time zone 'Pacific/Auckland')::date = v_day
        and member.assigned_ambassador_id is not distinct from v_assignee
      )
    );

  update public.booking_sessions session
  set
    status = change.next_status,
    assigned_ambassador_id = case when p_decision = 'reopen' then null else session.assigned_ambassador_id end,
    share_contact_with_ambassador = case when v_release then false else session.share_contact_with_ambassador end,
    withdrawal_reason = null,
    withdrawal_reason_type = null,
    withdrawal_requested_at = null,
    withdrawal_previous_status = null
  from unnest(v_ids, v_next) as change(id, next_status)
  where session.id = change.id;

  if v_release and v_assignee is not null then
    update public.booking_session_applications application
    set status = 'withdrawn', reviewed_at = now(), reviewed_by = p_actor_id
    where application.booking_session_id = any(v_ids)
      and application.ambassador_profile_id = v_assignee;
  end if;

  if p_decision = 'cancel_rebooked'
    and v_booking_status not in ('cancelled', 'declined')
    and not exists (
      select 1 from public.booking_sessions session
      where session.booking_request_id = v_booking
        and session.status not in ('cancelled', 'declined')
    ) then
    update public.booking_requests booking set status = 'cancelled' where booking.id = v_booking;
    insert into public.booking_status_history (booking_request_id, old_status, new_status, changed_by, reason)
    values (v_booking, v_booking_status, 'cancelled', p_actor_id, 'Every session cancelled after the school was rebooked');
    v_cancelled := true;
  end if;

  v_reason := coalesce(v_note, case p_decision
    when 'reopen' then 'Withdrawal approved by staff - session reopened'
    when 'cancel_rebooked' then 'Withdrawal resolved - school rebooked, session cancelled'
    else 'Withdrawal declined by staff - ambassador kept assigned'
  end);
  v_action := case p_decision
    when 'reopen' then 'session.withdrawal_approved'
    when 'cancel_rebooked' then 'session.withdrawal_cancelled_rebooked'
    else 'session.withdrawal_declined'
  end;

  insert into public.booking_status_history (
    booking_request_id, booking_session_id, old_status, new_status, changed_by, reason
  )
  select v_booking, change.id, 'withdrawal_requested', change.next_status, p_actor_id, v_reason
  from unnest(v_ids, v_next) as change(id, next_status);

  insert into public.booking_activity_logs (
    booking_request_id, booking_session_id, action, actor_id, actor_type, details
  )
  select v_booking, change.id, v_action, p_actor_id, 'staff',
    jsonb_build_object(
      'ambassador_profile_id', v_assignee,
      'original_reason', change.original_reason,
      'note', v_note,
      'restored_status', case when v_release then null else change.next_status end
    )
  from unnest(v_ids, v_next, v_original) as change(id, next_status, original_reason);

  if v_release then
    perform public.rollup_pre_confirmation_booking_status(
      v_booking, p_actor_id, 'staff', 'Ambassador withdrawal changed assignment coverage');
  end if;

  return query select 'resolved', v_booking, v_ids, v_assignee, v_cancelled;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff assign, replace or (p_ambassador_profile_id null) unassign. Members:
-- the anchor plus the day's undelivered sessions that shared the anchor's
-- previous ambassador (or, for a first assignment, had none). One ambassador
-- covers the whole day.
--
-- An assignment is refused with 'ambassador-conflict' (and the clashing
-- session) when a newly assigned session overlaps another live session of
-- the ambassador - in another booking, or a sibling in this group, e.g. two
-- parallel classes. Members already assigned to the ambassador are not
-- re-checked, so a pre-existing clash neither blocks nor gets rewritten.

create or replace function public.assign_ambassador_group(
  p_session_id uuid,
  p_actor_id uuid,
  p_ambassador_profile_id uuid default null
)
returns table (
  outcome text,
  booking_request_id uuid,
  session_ids uuid[],
  previous_ambassador_id uuid,
  declined_ambassador_ids uuid[],
  replaced_withdrawal boolean,
  conflict_session_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_booking uuid;
  v_booking_status text;
  v_target_user uuid;
  v_anchor public.booking_sessions%rowtype;
  v_previous uuid;
  v_day date;
  v_members uuid[];
  v_changed uuid[];
  v_declined uuid[];
  v_replaced boolean := false;
  v_conflict uuid;
  v_non_terminal constant text[] := array[
    'requested', 'tentative', 'applied', 'ambassador_assigned', 'confirmed',
    'withdrawal_requested', 'reschedule_requested'
  ];
  v_assignable constant text[] := array[
    'tentative', 'applied', 'ambassador_assigned', 'confirmed',
    'withdrawal_requested', 'reschedule_requested'
  ];
begin
  if not public.group_actor_is_staff(p_actor_id) then
    return query select 'not-authorized', null::uuid, null::uuid[], null::uuid, null::uuid[], false, null::uuid;
    return;
  end if;

  if p_ambassador_profile_id is not null
    and not public.group_ambassador_is_assignable(p_ambassador_profile_id) then
    return query select 'ambassador-not-approved', null::uuid, null::uuid[], null::uuid, null::uuid[], false, null::uuid;
    return;
  end if;

  lock table public.booking_sessions in share row exclusive mode;

  select session.booking_request_id into v_booking
  from public.booking_sessions session
  where session.id = p_session_id;

  if v_booking is null then
    return query select 'session-not-found', null::uuid, null::uuid[], null::uuid, null::uuid[], false, null::uuid;
    return;
  end if;

  select booking.status into v_booking_status
  from public.booking_requests booking where booking.id = v_booking for update;
  perform 1 from public.booking_sessions session
    where session.booking_request_id = v_booking order by session.id for update;

  -- Re-checked under the locks: the profile (and its portal user, if it has
  -- one) can't be declined, deleted or deactivated between check and write.
  if p_ambassador_profile_id is not null then
    select ambassador.user_id into v_target_user
    from public.ambassador_profiles ambassador
    where ambassador.id = p_ambassador_profile_id
    for share;

    if v_target_user is not null then
      perform 1 from public.profiles profile where profile.id = v_target_user for share;
    end if;

    if not public.group_ambassador_is_assignable(p_ambassador_profile_id) then
      return query select 'ambassador-not-approved', v_booking, null::uuid[], null::uuid, null::uuid[], false, null::uuid;
      return;
    end if;

    -- A cancelled or declined booking is never brought back by assigning
    -- one of its (inconsistent) leftover sessions.
    if v_booking_status in ('cancelled', 'declined') then
      return query select 'session-not-assignable', v_booking, null::uuid[], null::uuid, null::uuid[], false, null::uuid;
      return;
    end if;
  end if;

  select * into v_anchor from public.booking_sessions session where session.id = p_session_id;

  if not found then
    return query select 'session-not-found', v_booking, null::uuid[], null::uuid, null::uuid[], false, null::uuid;
    return;
  end if;

  v_previous := v_anchor.assigned_ambassador_id;

  if not (v_anchor.status = any(v_non_terminal)) then
    return query select 'session-not-assignable', v_booking, null::uuid[], v_previous, null::uuid[], false, null::uuid;
    return;
  end if;

  v_day := (v_anchor.starts_at at time zone 'Pacific/Auckland')::date;

  select array_agg(session.id order by session.starts_at, session.id) into v_members
  from public.booking_sessions session
  where session.booking_request_id = v_booking
    and session.status = any(v_non_terminal)
    and (
      session.id = v_anchor.id
      or (
        (session.starts_at at time zone 'Pacific/Auckland')::date = v_day
        and session.assigned_ambassador_id is not distinct from v_previous
      )
    );

  -- Unassign ------------------------------------------------------------
  if p_ambassador_profile_id is null then
    if v_previous is null then
      return query select 'session-not-assigned', v_booking, null::uuid[], null::uuid, null::uuid[], false, null::uuid;
      return;
    end if;

    with prior as (
      select
        session.id,
        session.status as old_status,
        case
          when exists (
            select 1 from public.booking_session_applications application
            where application.booking_session_id = session.id and application.status = 'applied'
          ) then 'applied'
          else 'tentative'
        end as next_status
      from public.booking_sessions session
      where session.id = any(v_members)
    ),
    unassigned as (
      update public.booking_sessions session
      set
        assigned_ambassador_id = null,
        share_contact_with_ambassador = false,
        status = prior.next_status,
        withdrawal_reason = null,
        withdrawal_reason_type = null,
        withdrawal_requested_at = null,
        withdrawal_previous_status = null
      from prior
      where session.id = prior.id
      returning session.id, prior.old_status, prior.next_status
    ),
    history as (
      insert into public.booking_status_history (
        booking_request_id, booking_session_id, old_status, new_status, changed_by, reason
      )
      select v_booking, unassigned.id, unassigned.old_status, unassigned.next_status, p_actor_id,
        'Ambassador unassigned by staff'
      from unassigned
    )
    insert into public.booking_activity_logs (
      booking_request_id, booking_session_id, action, actor_id, actor_type, details
    )
    select v_booking, unassigned.id, 'session.ambassador_unassigned', p_actor_id, 'staff',
      jsonb_build_object('previous_ambassador_profile_id', v_previous)
    from unassigned;

    update public.booking_session_applications application
    set status = 'withdrawn', reviewed_at = now(), reviewed_by = p_actor_id
    where application.booking_session_id = any(v_members)
      and application.ambassador_profile_id = v_previous
      and application.status = 'accepted';

    perform public.rollup_pre_confirmation_booking_status(
      v_booking, p_actor_id, 'staff', 'Ambassador assignment changed');

    return query select 'unassigned', v_booking, v_members, v_previous, null::uuid[], false, null::uuid;
    return;
  end if;

  -- Assign or replace -----------------------------------------------------
  if not (v_anchor.status = any(v_assignable)) then
    return query select 'assign-failed', v_booking, null::uuid[], v_previous, null::uuid[], false, null::uuid;
    return;
  end if;

  if exists (
    select 1 from public.booking_sessions session
    where session.id = any(v_members) and not (session.status = any(v_assignable))
  ) then
    return query select 'same-day-group-blocked', v_booking, null::uuid[], v_previous, null::uuid[], false, null::uuid;
    return;
  end if;

  -- Members whose ambassador or status actually changes. Confirmed and
  -- reschedule-requested sessions keep their status; others read
  -- "ambassador assigned" (which also ends a pending withdrawal).
  select array_agg(session.id order by session.starts_at, session.id) into v_changed
  from public.booking_sessions session
  where session.id = any(v_members)
    and (
      session.assigned_ambassador_id is distinct from p_ambassador_profile_id
      or session.status not in ('ambassador_assigned', 'confirmed', 'reschedule_requested')
    );

  if coalesce(array_length(v_changed, 1), 0) = 0 then
    return query select 'already-assigned', v_booking, null::uuid[], v_previous, null::uuid[], false, null::uuid;
    return;
  end if;

  -- Overlap, for sessions newly given to this ambassador: against their other
  -- live sessions (any booking, including this group's) and against each
  -- other.
  select other.id into v_conflict
  from public.booking_sessions member
  join public.booking_sessions other
    on other.id <> member.id
   and other.starts_at < member.ends_at
   and other.ends_at > member.starts_at
   and other.status not in ('cancelled', 'declined')
  where member.id = any(v_changed)
    and member.assigned_ambassador_id is distinct from p_ambassador_profile_id
    and (
      other.assigned_ambassador_id = p_ambassador_profile_id
      or other.id = any(v_members)
    )
  order by other.starts_at, other.id
  limit 1;

  if v_conflict is not null then
    return query select 'ambassador-conflict', v_booking, null::uuid[], v_previous, null::uuid[], false, v_conflict;
    return;
  end if;

  v_replaced := v_previous is not null
    and v_previous <> p_ambassador_profile_id
    and exists (
      select 1 from public.booking_sessions session
      where session.id = any(v_changed) and session.status = 'withdrawal_requested'
    );

  with prior as (
    select
      session.id,
      session.status as old_status,
      case
        when session.status in ('confirmed', 'reschedule_requested') then session.status
        else 'ambassador_assigned'
      end as next_status
    from public.booking_sessions session
    where session.id = any(v_changed)
  ),
  assigned as (
    update public.booking_sessions session
    set
      assigned_ambassador_id = p_ambassador_profile_id,
      share_contact_with_ambassador = true,
      status = prior.next_status,
      withdrawal_reason = null,
      withdrawal_reason_type = null,
      withdrawal_requested_at = null,
      withdrawal_previous_status = null
    from prior
    where session.id = prior.id
    returning session.id, prior.old_status, prior.next_status
  ),
  history as (
    insert into public.booking_status_history (
      booking_request_id, booking_session_id, old_status, new_status, changed_by, reason
    )
    select v_booking, assigned.id, assigned.old_status, assigned.next_status, p_actor_id,
      'Ambassador manually assigned by staff'
    from assigned
  )
  insert into public.booking_activity_logs (
    booking_request_id, booking_session_id, action, actor_id, actor_type, details
  )
  select v_booking, assigned.id, 'session.ambassador_assigned', p_actor_id, 'staff',
    jsonb_build_object(
      'ambassador_profile_id', p_ambassador_profile_id,
      'previous_ambassador_profile_id', v_previous
    )
  from assigned;

  -- The replaced ambassador no longer holds these sessions.
  if v_previous is not null and v_previous <> p_ambassador_profile_id then
    update public.booking_session_applications application
    set status = 'withdrawn', reviewed_at = now(), reviewed_by = p_actor_id
    where application.booking_session_id = any(v_changed)
      and application.ambassador_profile_id = v_previous
      and application.status in ('applied', 'accepted');
  end if;

  update public.booking_session_applications application
  set status = 'accepted', reviewed_at = now(), reviewed_by = p_actor_id
  where application.booking_session_id = any(v_changed)
    and application.ambassador_profile_id = p_ambassador_profile_id;

  with declined as (
    update public.booking_session_applications application
    set status = 'declined', reviewed_at = now(), reviewed_by = p_actor_id
    where application.booking_session_id = any(v_changed)
      and application.status = 'applied'
      and application.ambassador_profile_id <> p_ambassador_profile_id
    returning application.ambassador_profile_id
  )
  select array_agg(distinct declined.ambassador_profile_id) into v_declined from declined;

  perform public.rollup_pre_confirmation_booking_status(
    v_booking, p_actor_id, 'staff', 'Ambassador assignment changed');

  return query select 'assigned', v_booking, v_changed, v_previous,
    coalesce(v_declined, array[]::uuid[]), v_replaced, null::uuid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared by the school functions: an active school user owns a booking when
-- it belongs to one of their schools or they submitted it (the school
-- portal's visibility rule, as in requestSchoolBookingChangeAction).

create or replace function public.school_actor_owns_booking(
  p_actor_id uuid,
  p_school_id uuid,
  p_submitted_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles profile
    where profile.id = p_actor_id and profile.role = 'school' and profile.status = 'active'
  )
  and (
    coalesce(p_submitted_by = p_actor_id, false)
    or exists (
      select 1
      from public.school_contact_users contact_user
      join public.school_contacts contact on contact.id = contact_user.school_contact_id
      where contact_user.user_id = p_actor_id
        and contact.school_id = p_school_id
    )
  )
$$;

revoke all on function public.school_actor_owns_booking(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- School cancels its booking from the portal. Upcoming, undelivered sessions
-- (re-evaluated under the locks) are cancelled; a session that has started
-- may have been delivered and stays for staff, as do completed, reported and
-- paid sessions and their reports and payments. The booking itself is
-- cancelled only when nothing else is left; otherwise its pre-confirmation
-- status rolls up. Live applications on the cancelled sessions are declined.
-- Returns the cancelled session ids for the app's emails and notices.

create or replace function public.cancel_school_booking(
  p_booking_id uuid,
  p_actor_id uuid,
  p_notes text default null
)
returns table (
  outcome text,
  booking_cancelled boolean,
  session_ids uuid[],
  previous_status text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_booking public.booking_requests%rowtype;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_reason text;
  v_active uuid[];
  v_total integer;
  v_whole boolean;
  v_non_terminal constant text[] := array[
    'requested', 'tentative', 'applied', 'ambassador_assigned', 'confirmed',
    'withdrawal_requested', 'reschedule_requested'
  ];
begin
  v_reason := coalesce(v_notes, 'School cancelled booking');

  lock table public.booking_sessions in share row exclusive mode;

  select * into v_booking from public.booking_requests booking where booking.id = p_booking_id for update;

  if not found then
    return query select 'booking-not-found', false, null::uuid[], null::text;
    return;
  end if;

  perform 1 from public.booking_sessions session
    where session.booking_request_id = p_booking_id order by session.id for update;

  if not public.school_actor_owns_booking(p_actor_id, v_booking.school_id, v_booking.submitted_by_user_id) then
    return query select 'booking-not-owned', false, null::uuid[], v_booking.status;
    return;
  end if;

  -- Also stops a second, racing cancellation from doing anything.
  if not (v_booking.status = any(v_non_terminal)) then
    return query select 'booking-not-cancellable', false, null::uuid[], v_booking.status;
    return;
  end if;

  select
    array_agg(session.id order by session.starts_at, session.id)
      filter (where session.status = any(v_non_terminal) and session.starts_at > now()),
    count(*)
  into v_active, v_total
  from public.booking_sessions session
  where session.booking_request_id = p_booking_id;

  if coalesce(array_length(v_active, 1), 0) = 0 and v_total > 0 then
    return query select 'booking-not-cancellable', false, null::uuid[], v_booking.status;
    return;
  end if;

  v_whole := not exists (
    select 1 from public.booking_sessions session
    where session.booking_request_id = p_booking_id
      and session.status not in ('cancelled', 'declined')
      and not (session.id = any(coalesce(v_active, array[]::uuid[])))
  );

  with prior as (
    select session.id, session.status
    from public.booking_sessions session
    where session.id = any(v_active)
  ),
  cancelled as (
    update public.booking_sessions session
    set
      status = 'cancelled',
      share_contact_with_ambassador = false,
      withdrawal_reason = null,
      withdrawal_reason_type = null,
      withdrawal_requested_at = null,
      withdrawal_previous_status = null,
      reschedule_requested_date = null,
      reschedule_request_notes = null,
      reschedule_requested_at = null,
      reschedule_previous_status = null,
      reschedule_confirmation_needed_at = null
    from prior
    where session.id = prior.id
    returning session.id, prior.status as old_status
  ),
  history as (
    insert into public.booking_status_history (
      booking_request_id, booking_session_id, old_status, new_status, changed_by, reason
    )
    select p_booking_id, cancelled.id, cancelled.old_status, 'cancelled', p_actor_id, v_reason
    from cancelled
  )
  insert into public.booking_activity_logs (
    booking_request_id, booking_session_id, action, actor_id, actor_type, details
  )
  select p_booking_id, cancelled.id, 'session.cancelled_by_school', p_actor_id, 'school',
    jsonb_build_object('notes', v_notes)
  from cancelled;

  update public.booking_session_applications application
  set status = 'declined', reviewed_at = now(), reviewed_by = p_actor_id
  where application.booking_session_id = any(v_active)
    and application.status = 'applied';

  if v_whole then
    update public.booking_requests booking
    set status = 'cancelled', requested_different_time = false, requested_time_notes = v_notes
    where booking.id = p_booking_id;

    insert into public.booking_status_history (booking_request_id, old_status, new_status, changed_by, reason)
    values (p_booking_id, v_booking.status, 'cancelled', p_actor_id, v_reason);
  else
    perform public.rollup_pre_confirmation_booking_status(
      p_booking_id, p_actor_id, 'school', 'School cancelled upcoming sessions');
  end if;

  insert into public.booking_activity_logs (booking_request_id, action, actor_id, actor_type, details)
  values (p_booking_id, 'booking.cancelled_by_school', p_actor_id, 'school', jsonb_build_object('notes', v_notes));

  return query select 'cancelled', v_whole, coalesce(v_active, array[]::uuid[]), v_booking.status;
end;
$$;

-- ---------------------------------------------------------------------------
-- School asks to move one session. The session must still be upcoming, in a
-- requestable state and in a live booking; when the app passes the status
-- and start time it read, a session changed since (cancelled, moved,
-- already requested) is refused instead of overwritten.

create or replace function public.request_school_session_reschedule(
  p_booking_id uuid,
  p_session_id uuid,
  p_actor_id uuid,
  p_preferred_date date,
  p_notes text,
  p_expected_status text default null,
  p_expected_starts_at timestamptz default null
)
returns table (outcome text, previous_status text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_booking public.booking_requests%rowtype;
  v_session public.booking_sessions%rowtype;
begin
  if p_preferred_date is null then
    raise exception 'A reschedule request needs a preferred date.';
  end if;

  -- Same table-first order as staff reschedule decisions (0054) and guest
  -- changes (0052).
  lock table public.booking_sessions in share row exclusive mode;

  select * into v_booking from public.booking_requests booking where booking.id = p_booking_id for update;

  if not found then
    return query select 'session-not-reschedulable', null::text;
    return;
  end if;

  perform 1 from public.booking_sessions session
    where session.booking_request_id = p_booking_id order by session.id for update;

  select * into v_session
  from public.booking_sessions session
  where session.id = p_session_id and session.booking_request_id = p_booking_id;

  if not found then
    return query select 'session-not-reschedulable', null::text;
    return;
  end if;

  if not public.school_actor_owns_booking(p_actor_id, v_session.school_id, v_booking.submitted_by_user_id) then
    return query select 'booking-not-owned', v_session.status;
    return;
  end if;

  if v_booking.status in ('cancelled', 'declined')
    or v_session.status not in ('requested', 'tentative', 'applied', 'ambassador_assigned', 'confirmed')
    or v_session.starts_at <= now() then
    return query select 'session-not-reschedulable', v_session.status;
    return;
  end if;

  if (p_expected_status is not null and v_session.status <> p_expected_status)
    or (p_expected_starts_at is not null and v_session.starts_at <> p_expected_starts_at) then
    return query select 'change-request-failed', v_session.status;
    return;
  end if;

  update public.booking_sessions session
  set
    status = 'reschedule_requested',
    reschedule_requested_date = p_preferred_date,
    reschedule_request_notes = p_notes,
    reschedule_requested_at = now(),
    reschedule_previous_status = v_session.status
  where session.id = v_session.id;

  insert into public.booking_status_history (
    booking_request_id, booking_session_id, old_status, new_status, changed_by, reason
  )
  values (p_booking_id, v_session.id, v_session.status, 'reschedule_requested', p_actor_id,
    p_preferred_date::text || ': ' || coalesce(p_notes, ''));

  insert into public.booking_activity_logs (
    booking_request_id, booking_session_id, action, actor_id, actor_type, details
  )
  values (p_booking_id, v_session.id, 'session.reschedule_requested', p_actor_id, 'school',
    jsonb_build_object('preferred_date', p_preferred_date::text, 'notes', p_notes, 'previous_status', v_session.status));

  return query select 'requested', v_session.status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff set the status of one booking or a batch. Same cascade as the app's
-- former cascadeBookingStatusToSessions / reinstateCancelledSessions, now in
-- one transaction with the parent, history and activity:
--   * requested / tentative / closed / completed_pending_report / cancelled /
--     declined move the booking's undelivered sessions to that status;
--   * confirmed confirms requested..ambassador_assigned and reschedule-
--     requested sessions, clearing reschedule details, and clears the
--     school-moved-date flag on confirmed sessions;
--   * reschedule_requested parks upcoming sessions, remembering their status;
--   * un-cancelling a cancelled/declined booking (an explicit staff action)
--     brings back its upcoming sessions, or its past ones when marked
--     delivered.
-- Delivered, reported and paid sessions are never rewritten. Completion
-- statuses are refused while a live session hasn't ended.
--
-- p_bookings is [{"id": uuid, "expected_status": text|null}]. When the app
-- sends the status staff were looking at, a booking changed meanwhile (a
-- school cancellation, an assignment roll-up, another staff member) refuses
-- the whole batch with 'booking-status-changed' instead of overwriting it.
-- Without it, the status read under the locks is used.
--
-- Sessions brought back with an ambassador are checked against that
-- ambassador's live sessions (and each other) like a new assignment and
-- refused with 'reinstate-ambassador-conflict'; overlaps that already exist
-- between live sessions are left alone.
--
-- Returns one 'updated' row per booking with the ids of its changed sessions
-- (for the post-commit emails), or a single refusal row.

create or replace function public.update_booking_status_batch(
  p_actor_id uuid,
  p_status text,
  p_bookings jsonb,
  p_reason text default null,
  p_bulk boolean default false,
  p_email_choice text default 'skip'
)
returns table (
  outcome text,
  booking_id uuid,
  old_status text,
  changed_session_ids uuid[],
  conflict_session_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ids uuid[];
  v_count integer;
  v_booking_ids uuid[];
  v_old_statuses text[];
  v_refused uuid;
  v_conflict uuid;
  v_plan_ids uuid[];
  v_plan_next text[];
  v_plan_kind text[];
  v_cascade_to text;
  v_cascade_from text[];
  v_reinstate_to text;
  v_note text := nullif(btrim(coalesce(p_reason, '')), '');
  v_reason text;
  v_removed constant text[] := array['cancelled', 'declined'];
  v_completion constant text[] := array[
    'completed_pending_report', 'report_submitted', 'payment_pending', 'paid', 'closed'
  ];
  v_non_terminal constant text[] := array[
    'requested', 'tentative', 'applied', 'ambassador_assigned', 'confirmed',
    'withdrawal_requested', 'reschedule_requested'
  ];
begin
  if p_status is null or p_status not in (
    'requested', 'tentative', 'applied', 'ambassador_assigned', 'confirmed', 'reschedule_requested',
    'completed_pending_report', 'report_submitted', 'payment_pending', 'paid', 'closed',
    'cancelled', 'declined'
  ) then
    raise exception 'Unknown booking status.';
  end if;

  if not public.group_actor_is_staff(p_actor_id) then
    return query select 'not-authorized', null::uuid, null::text, null::uuid[], null::uuid;
    return;
  end if;

  select array_agg(distinct (item->>'id')::uuid) into v_ids
  from jsonb_array_elements(coalesce(p_bookings, '[]'::jsonb)) item;

  if v_ids is null then
    return query select 'booking-not-found', null::uuid, null::text, null::uuid[], null::uuid;
    return;
  end if;

  lock table public.booking_sessions in share row exclusive mode;
  perform 1 from public.booking_requests booking where booking.id = any(v_ids) order by booking.id for update;
  perform 1 from public.booking_sessions session
    where session.booking_request_id = any(v_ids) order by session.id for update;

  select count(*), array_agg(booking.id order by booking.id), array_agg(booking.status order by booking.id)
  into v_count, v_booking_ids, v_old_statuses
  from public.booking_requests booking
  where booking.id = any(v_ids);

  if v_count <> array_length(v_ids, 1) then
    return query select 'booking-not-found', null::uuid, null::text, null::uuid[], null::uuid;
    return;
  end if;

  select booking.id into v_refused
  from public.booking_requests booking
  join jsonb_array_elements(p_bookings) item on (item->>'id')::uuid = booking.id
  where nullif(item->>'expected_status', '') is not null
    and booking.status <> item->>'expected_status'
  order by booking.id
  limit 1;

  if v_refused is not null then
    return query select 'booking-status-changed', v_refused,
      (select booking.status from public.booking_requests booking where booking.id = v_refused),
      null::uuid[], null::uuid;
    return;
  end if;

  if p_status = any(v_completion) then
    select session.booking_request_id into v_refused
    from public.booking_sessions session
    where session.booking_request_id = any(v_ids)
      and session.status not in ('cancelled', 'declined')
      and session.ends_at > now()
    order by session.booking_request_id
    limit 1;

    if v_refused is not null then
      return query select 'cannot-complete-future', v_refused, null::text, null::uuid[], null::uuid;
      return;
    end if;
  end if;

  if p_status in ('requested', 'tentative', 'closed', 'completed_pending_report', 'cancelled', 'declined') then
    v_cascade_to := p_status;
    v_cascade_from := v_non_terminal;
  elsif p_status = 'confirmed' then
    v_cascade_to := 'confirmed';
    v_cascade_from := array['requested', 'tentative', 'applied', 'ambassador_assigned', 'reschedule_requested'];
  end if;

  v_reinstate_to := coalesce(v_cascade_to, case when p_status = any(v_completion) then 'closed' else 'tentative' end);

  select array_agg(plan.id order by plan.id), array_agg(plan.next_status order by plan.id), array_agg(plan.kind order by plan.id)
  into v_plan_ids, v_plan_next, v_plan_kind
  from (
    select session.id,
      case when p_status = 'reschedule_requested' then 'reschedule_requested' else v_cascade_to end as next_status,
      'cascade' as kind
    from public.booking_sessions session
    where session.booking_request_id = any(v_ids)
      and (
        (p_status = 'reschedule_requested'
          and session.status in ('requested', 'tentative', 'applied', 'ambassador_assigned', 'confirmed')
          and session.starts_at > now())
        or (v_cascade_to is not null and session.status = any(v_cascade_from) and session.status <> v_cascade_to)
      )
    union all
    select session.id, v_reinstate_to, 'reinstate'
    from public.booking_sessions session
    join public.booking_requests booking on booking.id = session.booking_request_id
    where session.booking_request_id = any(v_ids)
      and booking.status = any(v_removed)
      and not (p_status = any(v_removed))
      and session.status = any(v_removed)
      and case when p_status = any(v_completion) then session.ends_at < now() else session.starts_at > now() end
  ) plan;

  -- Sessions coming back with their ambassador must not double-book them.
  select other.id, back.booking_request_id into v_conflict, v_refused
  from unnest(v_plan_ids, v_plan_kind) as plan(id, kind)
  join public.booking_sessions back on back.id = plan.id
  join public.booking_sessions other
    on other.id <> back.id
   and other.assigned_ambassador_id = back.assigned_ambassador_id
   and other.starts_at < back.ends_at
   and other.ends_at > back.starts_at
  where plan.kind = 'reinstate'
    and back.assigned_ambassador_id is not null
    and (
      other.status not in ('cancelled', 'declined')
      or other.id = any(
        select reinstated.id from unnest(v_plan_ids, v_plan_kind) as reinstated(id, kind)
        where reinstated.kind = 'reinstate'
      )
    )
  order by other.starts_at, other.id
  limit 1;

  if v_conflict is not null then
    return query select 'reinstate-ambassador-conflict', v_refused, null::text, null::uuid[], v_conflict;
    return;
  end if;

  v_reason := case
    when p_bulk then format('Bulk status update to %s', p_status)
    else coalesce(v_note, format('Status updated to %s', p_status))
  end;

  update public.booking_requests booking
  set
    status = p_status,
    internal_notes = case
      when p_bulk or v_note is null then booking.internal_notes
      when nullif(btrim(coalesce(booking.internal_notes, '')), '') is null then v_note
      else btrim(booking.internal_notes) || E'\n' || v_note
    end
  where booking.id = any(v_ids);

  with plan as (
    select plan.id, plan.next_status, session.status as old_status
    from unnest(v_plan_ids, v_plan_next) as plan(id, next_status)
    join public.booking_sessions session on session.id = plan.id
  ),
  changed as (
    update public.booking_sessions session
    set
      status = plan.next_status,
      reschedule_previous_status = case
        when plan.next_status = 'reschedule_requested' then plan.old_status
        when p_status = 'confirmed' then null
        else session.reschedule_previous_status
      end,
      reschedule_requested_at = case
        when plan.next_status = 'reschedule_requested' then now()
        when p_status = 'confirmed' then null
        else session.reschedule_requested_at
      end,
      reschedule_requested_date = case when p_status = 'confirmed' then null else session.reschedule_requested_date end,
      reschedule_request_notes = case when p_status = 'confirmed' then null else session.reschedule_request_notes end,
      withdrawal_reason = case when plan.old_status = 'withdrawal_requested' then null else session.withdrawal_reason end,
      withdrawal_reason_type = case when plan.old_status = 'withdrawal_requested' then null else session.withdrawal_reason_type end,
      withdrawal_requested_at = case when plan.old_status = 'withdrawal_requested' then null else session.withdrawal_requested_at end,
      withdrawal_previous_status = case when plan.old_status = 'withdrawal_requested' then null else session.withdrawal_previous_status end
    from plan
    where session.id = plan.id
    returning session.id, session.booking_request_id, plan.old_status, plan.next_status
  )
  insert into public.booking_status_history (
    booking_request_id, booking_session_id, old_status, new_status, changed_by, reason
  )
  select changed.booking_request_id, changed.id, changed.old_status, changed.next_status, p_actor_id, v_reason
  from changed;

  if p_status = 'confirmed' then
    update public.booking_sessions session
    set reschedule_confirmation_needed_at = null
    where session.booking_request_id = any(v_ids)
      and session.status = 'confirmed'
      and session.reschedule_confirmation_needed_at is not null;
  end if;

  insert into public.booking_status_history (booking_request_id, old_status, new_status, changed_by, reason)
  select old.id, old.status, p_status, p_actor_id, v_reason
  from unnest(v_booking_ids, v_old_statuses) as old(id, status);

  insert into public.booking_activity_logs (booking_request_id, action, actor_id, actor_type, details)
  select old.id, 'booking.status_updated', p_actor_id, 'staff',
    jsonb_build_object(
      'status', p_status,
      'old_status', old.status,
      'email_choice', coalesce(p_email_choice, 'skip'),
      'bulk', coalesce(p_bulk, false)
    )
  from unnest(v_booking_ids, v_old_statuses) as old(id, status);

  return query
  select 'updated', old.id, old.status,
    coalesce((
      select array_agg(session.id order by session.starts_at, session.id)
      from public.booking_sessions session
      where session.id = any(coalesce(v_plan_ids, array[]::uuid[]))
        and session.booking_request_id = old.id
    ), array[]::uuid[]),
    null::uuid
  from unnest(v_booking_ids, v_old_statuses) as old(id, status);
end;
$$;

revoke all on function public.cancel_school_booking(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_school_booking(uuid, uuid, text) to service_role;

revoke all on function public.request_school_session_reschedule(uuid, uuid, uuid, date, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.request_school_session_reschedule(uuid, uuid, uuid, date, text, text, timestamptz)
  to service_role;

revoke all on function public.update_booking_status_batch(uuid, text, jsonb, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.update_booking_status_batch(uuid, text, jsonb, text, boolean, text)
  to service_role;

revoke all on function public.apply_to_session_group(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_to_session_group(uuid, uuid, text) to service_role;

revoke all on function public.withdraw_application_group(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.withdraw_application_group(uuid, uuid, text) to service_role;

revoke all on function public.request_session_withdrawal_group(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.request_session_withdrawal_group(uuid, uuid, text, text) to service_role;

revoke all on function public.resolve_session_withdrawal_group(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_session_withdrawal_group(uuid, uuid, text, text) to service_role;

revoke all on function public.assign_ambassador_group(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_ambassador_group(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- The first session of a booking staff log by hand (saveManualBookingAction)
-- or an ambassador logs for themselves (saveAmbassadorBookingAction). Those
-- inserted assigned sessions directly, outside the overlap check every other
-- assignment path has. The booking row is created by the app just before;
-- this function only adds its one session, under the same locks as an
-- assignment, and the app deletes the booking again if it refuses.
--
-- p_session holds exactly these keys (anything else is ignored):
--   presentation_type_id, assigned_ambassador_id, status, starts_at, ends_at,
--   year_levels, expected_student_count, actual_student_count,
--   internal_notes, report_status, delivery_mode, meeting_url
-- school_id and region_id come from the booking (region only for in-person
-- sessions); payment_status is always 'not_eligible'.
--
-- Staff (who own the booking): any ambassador that assignment would accept,
-- directory-only profiles included; record-only history may be saved
-- settled ('closed' + report 'reviewed').
-- Ambassadors (who submitted the booking): only themselves, only an upcoming
-- in-person 'ambassador_assigned' or 'confirmed' session, report not
-- submitted.
--
-- An assigned session that isn't cancelled, declined or settled history is
-- refused with 'ambassador-conflict' (and the clashing session) when it
-- overlaps another live session of that ambassador. Touching end-to-start is
-- fine. Settled record-only history is a record of what already happened and
-- is saved as before, unchecked.

create or replace function public.insert_booking_session_checked(
  p_actor_id uuid,
  p_booking_id uuid,
  p_session jsonb
)
returns table (outcome text, session_id uuid, conflict_session_id uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_booking public.booking_requests%rowtype;
  v_is_staff boolean := public.group_actor_is_staff(p_actor_id);
  v_actor_ambassador uuid;
  v_target uuid := nullif(p_session->>'assigned_ambassador_id', '')::uuid;
  v_target_user uuid;
  v_status text := p_session->>'status';
  v_report_status text := coalesce(nullif(p_session->>'report_status', ''), 'not_submitted');
  v_delivery text := coalesce(nullif(p_session->>'delivery_mode', ''), 'in_person');
  v_starts timestamptz := (p_session->>'starts_at')::timestamptz;
  v_ends timestamptz := (p_session->>'ends_at')::timestamptz;
  v_region uuid;
  v_conflict uuid;
  v_id uuid;
begin
  if not v_is_staff then
    v_actor_ambassador := public.group_actor_ambassador_profile(p_actor_id);

    if v_actor_ambassador is null then
      return query select 'not-authorized', null::uuid, null::uuid;
      return;
    end if;
  end if;

  if v_starts is null or v_ends is null or v_ends <= v_starts
    or v_delivery not in ('in_person', 'online')
    or v_report_status not in ('not_submitted', 'reviewed')
    or v_status is null or v_status not in (
      'tentative', 'applied', 'ambassador_assigned', 'confirmed', 'reschedule_requested',
      'completed_pending_report', 'cancelled', 'closed'
    )
    or (v_report_status = 'reviewed' and v_status <> 'closed') then
    return query select 'invalid-session', null::uuid, null::uuid;
    return;
  end if;

  lock table public.booking_sessions in share row exclusive mode;

  select * into v_booking from public.booking_requests booking where booking.id = p_booking_id for update;

  if not found then
    return query select 'booking-not-found', null::uuid, null::uuid;
    return;
  end if;

  -- Only the person who just created the booking adds its first session.
  if (v_is_staff and v_booking.staff_owner_id is distinct from p_actor_id)
    or (not v_is_staff and v_booking.submitted_by_user_id is distinct from p_actor_id) then
    return query select 'not-authorized', null::uuid, null::uuid;
    return;
  end if;

  if v_booking.school_id is null
    or exists (select 1 from public.booking_sessions session where session.booking_request_id = p_booking_id) then
    return query select 'invalid-session', null::uuid, null::uuid;
    return;
  end if;

  -- The history exception is only for an actual record-only past booking,
  -- never a way to insert an overlapping future assignment as "reviewed".
  if v_report_status = 'reviewed' and (
    not coalesce(v_booking.manual_email_only, false) or v_starts > now()
  ) then
    return query select 'invalid-session', null::uuid, null::uuid;
    return;
  end if;

  if not v_is_staff and (
    v_target is distinct from v_actor_ambassador
    or v_status not in ('ambassador_assigned', 'confirmed')
    or v_report_status <> 'not_submitted'
    or v_delivery <> 'in_person'
    or v_starts <= now()
  ) then
    return query select 'invalid-session', null::uuid, null::uuid;
    return;
  end if;

  if v_target is not null then
    select ambassador.user_id into v_target_user
    from public.ambassador_profiles ambassador
    where ambassador.id = v_target
    for share;

    if v_target_user is not null then
      perform 1 from public.profiles profile where profile.id = v_target_user for share;
    end if;

    if not public.group_ambassador_is_assignable(v_target) then
      return query select 'ambassador-not-approved', null::uuid, null::uuid;
      return;
    end if;

    if v_status not in ('cancelled', 'declined')
      and not (v_status = 'closed' and v_report_status = 'reviewed') then
      select other.id into v_conflict
      from public.booking_sessions other
      where other.assigned_ambassador_id = v_target
        and other.status not in ('cancelled', 'declined')
        and other.starts_at < v_ends
        and other.ends_at > v_starts
      order by other.starts_at, other.id
      limit 1;

      if v_conflict is not null then
        return query select 'ambassador-conflict', null::uuid, v_conflict;
        return;
      end if;
    end if;
  end if;

  if v_delivery = 'in_person' then
    select school.region_id into v_region from public.schools school where school.id = v_booking.school_id;
  end if;

  insert into public.booking_sessions (
    booking_request_id, presentation_type_id, region_id, school_id,
    assigned_ambassador_id, share_contact_with_ambassador, delivery_mode, meeting_url,
    status, starts_at, ends_at, year_levels, expected_student_count, actual_student_count,
    internal_notes, report_status, payment_status
  )
  values (
    p_booking_id,
    nullif(p_session->>'presentation_type_id', '')::uuid,
    v_region,
    v_booking.school_id,
    v_target,
    v_target is not null,
    v_delivery,
    case when v_delivery = 'online' then nullif(p_session->>'meeting_url', '') end,
    v_status,
    v_starts,
    v_ends,
    p_session->>'year_levels',
    nullif(p_session->>'expected_student_count', '')::integer,
    nullif(p_session->>'actual_student_count', '')::integer,
    nullif(p_session->>'internal_notes', ''),
    v_report_status,
    'not_eligible'
  )
  returning id into v_id;

  return query select 'inserted', v_id, null::uuid;
end;
$$;

revoke all on function public.insert_booking_session_checked(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.insert_booking_session_checked(uuid, uuid, jsonb) to service_role;

-- 0056_payment_tiers.sql
-- Same-day payment tiers and explicit staff review.
--
-- One report still covers the ambassador's sessions of one booking on one NZ
-- day (0054's grouping, locking and idempotency are unchanged) and the payment
-- still carries one delivery fee and at most one sourcing bonus. What the
-- second session adds now depends on the gap between the sessions:
--
--   one session                                  +$0    ($250, sourced $300)
--   two sessions, gap 0 to 60 minutes inclusive  +$50   ($300, sourced $350)
--   two sessions, gap over 120 and under 240     +$100  ($350, sourced $400)
--
-- The gap is measured from the first session's END to the second session's
-- START (working interpretation, also stated in the UI and tests).
--
-- Everything else needs an explicit staff custom review and is never paid
-- automatically: a gap over 60 up to and including 120 minutes, a gap of 240
-- minutes or more, three or more sessions, overlapping sessions, or a missing
-- or invalid start/end time. Such a payment is created 'pending' with
-- review_required, the reason, no additional amount (nothing is guessed) and
-- only the recognised delivery fee and sourcing bonus. It can only be approved
-- with an explicit staff decision recorded by approve_ambassador_report_payment:
-- a custom amount (the existing whole-dollar staff extra, $0 to $250, so $0 is
-- an explicit choice) plus a note, or no payment with a note.
--
-- Nothing is repriced: existing rows (pending, approved, paid) keep their
-- amounts; their payment_tier stays null ("before 0056"). Approved and paid
-- payments are frozen from here on (see the trigger below).

alter table public.payments
  add column if not exists payment_tier text,
  add column if not exists covered_session_count integer,
  add column if not exists review_required boolean not null default false,
  add column if not exists review_reason text,
  add column if not exists review_gap_minutes integer,
  add column if not exists custom_reviewed_at timestamptz,
  add column if not exists custom_reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.payments
  drop constraint if exists payments_payment_tier_check,
  add constraint payments_payment_tier_check
    check (payment_tier is null or payment_tier in ('single', 'pair_within_60', 'pair_120_to_240', 'custom_review')),
  drop constraint if exists payments_review_reason_check,
  add constraint payments_review_reason_check
    check (review_reason is null or review_reason in (
      'gap_over_60_to_120', 'gap_240_or_more', 'three_or_more_sessions', 'overlapping_times', 'invalid_times'
    )),
  drop constraint if exists payments_covered_session_count_check,
  add constraint payments_covered_session_count_check
    check (covered_session_count is null or covered_session_count >= 1),
  -- A review payment always says why, and never carries an automatic
  -- additional amount: the staff decision goes in the (capped) extra.
  drop constraint if exists payments_review_consistency_check,
  add constraint payments_review_consistency_check
    check (
      case
        when payment_tier is null then not review_required
        else review_required = (payment_tier = 'custom_review')
      end
      and (not review_required or (review_reason is not null and additional_session_cents = 0))
      and (review_required or review_reason is null)
    ),
  -- An unreviewed review payment can't be approved or paid.
  drop constraint if exists payments_review_before_approval_check,
  add constraint payments_review_before_approval_check
    check (not (review_required and status in ('approved', 'paid') and custom_reviewed_at is null));

-- Approved and paid payments are history: their amounts, itemization, tier and
-- invoice number can't change. Finance-email and confirmation fields still can.
create or replace function public.freeze_settled_payment_amounts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('approved', 'paid') and (
    new.amount_cents is distinct from old.amount_cents
    or new.base_amount_cents is distinct from old.base_amount_cents
    or new.sourcing_bonus_cents is distinct from old.sourcing_bonus_cents
    or new.additional_session_cents is distinct from old.additional_session_cents
    or new.extra_amount_cents is distinct from old.extra_amount_cents
    or new.payment_tier is distinct from old.payment_tier
    or new.review_required is distinct from old.review_required
    or new.review_reason is distinct from old.review_reason
    or new.custom_reviewed_at is distinct from old.custom_reviewed_at
    or new.invoice_number is distinct from old.invoice_number
  ) then
    raise exception 'Approved and paid payments can''t be repriced (payment %).', old.id;
  end if;

  return new;
end;
$$;

drop trigger if exists freeze_settled_payment_amounts on public.payments;
create trigger freeze_settled_payment_amounts
  before update on public.payments
  for each row execute function public.freeze_settled_payment_amounts();

-- ---------------------------------------------------------------------------
-- Tier of one report group. Pure: the caller passes the group's sessions in
-- start order. Shared by the report RPC and the SQL tests.

create or replace function public.report_payment_tier(
  p_starts timestamptz[],
  p_ends timestamptz[]
)
returns table (tier text, review_reason text, gap_minutes integer)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_count integer := coalesce(array_length(p_starts, 1), 0);
  v_gap_seconds numeric;
  v_index integer;
begin
  if v_count = 0 or coalesce(array_length(p_ends, 1), 0) <> v_count then
    return query select 'custom_review', 'invalid_times', null::integer;
    return;
  end if;

  for v_index in 1..v_count loop
    if p_starts[v_index] is null or p_ends[v_index] is null
      or not isfinite(p_starts[v_index]) or not isfinite(p_ends[v_index])
      or p_ends[v_index] <= p_starts[v_index] then
      return query select 'custom_review', 'invalid_times', null::integer;
      return;
    end if;
  end loop;

  if v_count = 1 then
    return query select 'single', null::text, null::integer;
    return;
  end if;

  if v_count >= 3 then
    return query select 'custom_review', 'three_or_more_sessions', null::integer;
    return;
  end if;

  -- First session's end to second session's start.
  v_gap_seconds := extract(epoch from (p_starts[2] - p_ends[1]));

  if v_gap_seconds < 0 then
    return query select 'custom_review', 'overlapping_times', floor(v_gap_seconds / 60)::integer;
  elsif v_gap_seconds <= 3600 then
    return query select 'pair_within_60', null::text, floor(v_gap_seconds / 60)::integer;
  elsif v_gap_seconds <= 7200 then
    return query select 'custom_review', 'gap_over_60_to_120', floor(v_gap_seconds / 60)::integer;
  elsif v_gap_seconds < 14400 then
    return query select 'pair_120_to_240', null::text, floor(v_gap_seconds / 60)::integer;
  else
    return query select 'custom_review', 'gap_240_or_more', floor(v_gap_seconds / 60)::integer;
  end if;
end;
$$;

revoke all on function public.report_payment_tier(timestamptz[], timestamptz[]) from public, anon, authenticated;
grant execute on function public.report_payment_tier(timestamptz[], timestamptz[]) to service_role;

-- ---------------------------------------------------------------------------
-- Grouped report submission. 0054's function with the flat second-session
-- amount replaced by the tiers above; grouping, locks, refusals, coverage log
-- and roll-up are unchanged. The 0054 signature is dropped so nothing can
-- still create a flat-rate payment.

drop function if exists public.submit_ambassador_report_group(
  uuid, uuid, uuid, jsonb, integer, integer, integer, integer, boolean
);

create or replace function public.submit_ambassador_report_group(
  p_session_id uuid,
  p_ambassador_profile_id uuid,
  p_actor_id uuid,
  p_report jsonb,
  p_delivery_cents integer,
  p_sourcing_bonus_cents integer,
  p_short_pair_cents integer,
  p_extended_pair_cents integer,
  p_eligible_threshold integer,
  p_is_sourced boolean
)
returns table (
  outcome text,
  report_id uuid,
  payment_id uuid,
  covered_session_ids uuid[],
  session_count integer,
  payment_status text,
  amount_cents integer,
  payment_tier text,
  review_required boolean,
  review_reason text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_request_id uuid;
  v_session public.booking_sessions%rowtype;
  v_day date;
  v_group uuid[];
  v_starts timestamptz[];
  v_ends timestamptz[];
  v_covered uuid[];
  v_count integer;
  v_attendees integer := (p_report->>'attendee_count')::integer;
  v_eligible boolean;
  v_sourcing integer := case when coalesce(p_is_sourced, false) then coalesce(p_sourcing_bonus_cents, 0) else 0 end;
  v_additional integer := 0;
  v_amount integer := 0;
  v_reason text;
  v_tier text;
  v_review_reason text;
  v_gap integer;
  v_report_id uuid;
  v_payment_id uuid;
begin
  if p_delivery_cents is null or p_delivery_cents < 0
    or coalesce(p_sourcing_bonus_cents, 0) < 0
    or coalesce(p_short_pair_cents, 0) < 0
    or coalesce(p_extended_pair_cents, 0) < 0
    or p_eligible_threshold is null
    or v_attendees is null or v_attendees < 0 then
    raise exception 'Invalid report or payout inputs.';
  end if;

  -- Same lock order as 0054: table, then booking row, then sessions.
  lock table public.booking_sessions in row exclusive mode;

  select session.booking_request_id into v_request_id
  from public.booking_sessions session
  where session.id = p_session_id;

  if not found then
    return query select 'session-not-assigned', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  perform 1 from public.booking_requests booking where booking.id = v_request_id for update;

  select * into v_session
  from public.booking_sessions session
  where session.id = p_session_id
  for update;

  if v_session.assigned_ambassador_id is distinct from p_ambassador_profile_id then
    return query select 'session-not-assigned', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  if v_session.ends_at > now()
    or v_session.status not in ('confirmed', 'completed_pending_report')
    or v_session.report_status <> 'not_submitted' then
    return query select 'session-not-finished', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  if exists (
    select 1 from public.ambassador_reports report where report.booking_session_id = v_session.id
  ) then
    return query select 'report-already-submitted', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  v_day := (v_session.starts_at at time zone 'Pacific/Auckland')::date;

  if exists (
    select 1
    from public.ambassador_reports prior_report
    join public.booking_sessions prior_session on prior_session.id = prior_report.booking_session_id
    where prior_session.booking_request_id = v_request_id
      and prior_report.ambassador_profile_id = p_ambassador_profile_id
      and (prior_session.starts_at at time zone 'Pacific/Auckland')::date = v_day
  ) then
    return query select 'group-already-reported', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  if exists (
    select 1
    from public.booking_sessions other
    where other.booking_request_id = v_request_id
      and other.id <> v_session.id
      and other.assigned_ambassador_id = p_ambassador_profile_id
      and (other.starts_at at time zone 'Pacific/Auckland')::date = v_day
      and other.status not in ('cancelled', 'declined')
      and other.report_status = 'not_submitted'
      and other.ends_at > now()
  ) then
    return query select 'report-day-not-finished', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  select
    array_agg(grouped.id order by grouped.starts_at, grouped.id),
    array_agg(grouped.starts_at order by grouped.starts_at, grouped.id),
    array_agg(grouped.ends_at order by grouped.starts_at, grouped.id)
  into v_group, v_starts, v_ends
  from (
    select other.id, other.starts_at, other.ends_at
    from public.booking_sessions other
    where other.booking_request_id = v_request_id
      and other.assigned_ambassador_id = p_ambassador_profile_id
      and (other.starts_at at time zone 'Pacific/Auckland')::date = v_day
      and other.status in ('confirmed', 'completed_pending_report')
      and other.report_status = 'not_submitted'
      and other.ends_at <= now()
      and not exists (
        select 1 from public.ambassador_reports report where report.booking_session_id = other.id
      )
    for update
  ) grouped;

  v_count := coalesce(array_length(v_group, 1), 0);

  if v_count = 0 or not (v_session.id = any(v_group)) then
    return query select 'session-not-finished', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  if exists (
    select 1
    from public.payments payment
    where payment.booking_session_id = any(v_group)
      and payment.ambassador_profile_id = p_ambassador_profile_id
      and payment.status in ('pending', 'eligible', 'approved', 'paid')
  ) then
    return query select 'payment-already-exists', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  v_covered := array_remove(v_group, v_session.id);
  v_eligible := v_attendees >= p_eligible_threshold;

  select tiered.tier, tiered.review_reason, tiered.gap_minutes
  into v_tier, v_review_reason, v_gap
  from public.report_payment_tier(v_starts, v_ends) tiered;

  insert into public.ambassador_reports (
    booking_session_id, ambassador_profile_id, presenter_name, school_roll_size,
    primary_contact_name, primary_contact_email, delivered_at, students_competed_in_esports,
    attendee_count, year_levels, age_groups, parents_present, attendee_quotes,
    attendance_rating, student_response_rating, teacher_response_rating,
    presentation_energy_rating, presentation_feedback, student_questions_themes,
    additional_notes, media_consent_confirmed, submitted_at
  )
  values (
    v_session.id,
    p_ambassador_profile_id,
    p_report->>'presenter_name',
    (p_report->>'school_roll_size')::integer,
    p_report->>'primary_contact_name',
    p_report->>'primary_contact_email',
    coalesce((p_report->>'delivered_at')::timestamptz, v_session.starts_at),
    (p_report->>'students_competed_in_esports')::boolean,
    v_attendees,
    p_report->>'year_levels',
    p_report->>'age_groups',
    (p_report->>'parents_present')::boolean,
    p_report->>'attendee_quotes',
    (p_report->>'attendance_rating')::integer,
    (p_report->>'student_response_rating')::integer,
    (p_report->>'teacher_response_rating')::integer,
    (p_report->>'presentation_energy_rating')::integer,
    p_report->>'presentation_feedback',
    p_report->>'student_questions_themes',
    p_report->>'additional_notes',
    coalesce((p_report->>'media_consent_confirmed')::boolean, false),
    now()
  )
  returning id into v_report_id;

  update public.booking_sessions session
  set
    report_status = 'submitted',
    status = 'report_submitted',
    payment_status = case
      when session.id = v_session.id and v_eligible then 'eligible'
      else 'not_eligible'
    end,
    actual_student_count = case
      when session.id = v_session.id then v_attendees
      else session.actual_student_count
    end,
    updated_at = now()
  where session.id = any(v_group);

  if v_eligible then
    v_additional := case v_tier
      when 'pair_within_60' then coalesce(p_short_pair_cents, 0)
      when 'pair_120_to_240' then coalesce(p_extended_pair_cents, 0)
      else 0
    end;
    v_amount := p_delivery_cents + v_sourcing + v_additional;
    v_reason := format('Attendee count %s meets threshold of %s.', v_attendees, p_eligible_threshold)
      || case when v_sourcing > 0 then ' Includes the sourcing bonus.' else '' end
      || case v_tier
        when 'pair_within_60' then format(' One report for 2 sessions, approximately %s minutes apart (first end to second start, up to 1 hour): adds the second-session amount.', v_gap)
        when 'pair_120_to_240' then format(' One report for 2 sessions, approximately %s minutes apart (first end to second start, over 2 and under 4 hours): adds the extended-gap amount.', v_gap)
        when 'custom_review' then ' Needs staff custom review before approval: ' || case v_review_reason
          when 'gap_over_60_to_120' then format('the sessions are approximately %s minutes apart (over 1 hour, up to 2 hours).', v_gap)
          when 'gap_240_or_more' then format('the sessions are approximately %s minutes apart (4 hours or more).', v_gap)
          when 'three_or_more_sessions' then format('the report covers %s sessions.', v_count)
          when 'overlapping_times' then 'the sessions overlap.'
          else 'a session has a missing or invalid time.'
        end || ' Only the delivery fee and any sourcing bonus are recognised so far.'
        else ''
      end;

    insert into public.payments (
      booking_session_id, ambassador_profile_id, status, eligibility_reason,
      amount_cents, base_amount_cents, sourcing_bonus_cents, additional_session_cents,
      payment_tier, covered_session_count, review_required, review_reason, review_gap_minutes
    )
    values (
      v_session.id, p_ambassador_profile_id, 'pending', v_reason,
      v_amount, p_delivery_cents, v_sourcing, v_additional,
      v_tier, v_count, v_tier = 'custom_review', v_review_reason, v_gap
    )
    returning id into v_payment_id;
  end if;

  -- Atomic coverage record read by the finance invoice (payment-automation.ts).
  insert into public.booking_activity_logs (
    booking_request_id, booking_session_id, action, actor_id, actor_type, details
  )
  select
    v_request_id,
    covered.id,
    'report.covered_by_same_day_report',
    p_actor_id,
    'ambassador',
    jsonb_build_object('report_id', v_report_id, 'reported_session_id', v_session.id)
  from unnest(v_covered) as covered(id);

  if not exists (
    select 1
    from public.booking_sessions other
    where other.booking_request_id = v_request_id
      and other.status not in ('report_submitted', 'payment_pending', 'paid', 'closed', 'cancelled', 'declined')
  ) then
    update public.booking_requests booking
    set status = 'report_submitted'
    where booking.id = v_request_id;
  end if;

  return query select
    'submitted',
    v_report_id,
    v_payment_id,
    v_covered,
    v_count,
    case when v_eligible then 'eligible' else 'not_eligible' end,
    v_amount,
    case when v_eligible then v_tier else null end,
    v_eligible and v_tier = 'custom_review',
    case when v_eligible then v_review_reason else null end;
end;
$$;

revoke all on function public.submit_ambassador_report_group(
  uuid, uuid, uuid, jsonb, integer, integer, integer, integer, integer, boolean
) from public, anon, authenticated;
grant execute on function public.submit_ambassador_report_group(
  uuid, uuid, uuid, jsonb, integer, integer, integer, integer, integer, boolean
) to service_role;

-- ---------------------------------------------------------------------------
-- Approval. 0054's function plus p_review_confirmed. A payment that needs a
-- custom review can only be approved with p_review_confirmed = true and a
-- note of 3 to 500 characters (even with a $0 extra), or with no payment and a
-- note; either records custom_reviewed_at/by. Other payments behave exactly as
-- in 0054. The 0054 signature is dropped so the review can't be bypassed.

drop function if exists public.approve_ambassador_report_payment(
  uuid, uuid, text, text, text, text, text, timestamptz, text, integer, boolean, text
);

create or replace function public.approve_ambassador_report_payment(
  p_report_id uuid,
  p_actor_id uuid,
  p_invoice_number text default null,
  p_bank_account_name text default null,
  p_bank_account_number text default null,
  p_gst_number text default null,
  p_token_hash text default null,
  p_token_expires_at timestamptz default null,
  p_finance_email text default null,
  p_extra_amount_cents integer default 0,
  p_skip_payment boolean default false,
  p_payment_note text default null,
  p_review_confirmed boolean default false
)
returns table (
  did_approve boolean,
  payment_id uuid,
  booking_session_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_report public.ambassador_reports%rowtype;
  v_payment public.payments%rowtype;
  v_extra integer := coalesce(p_extra_amount_cents, 0);
  v_skip boolean := coalesce(p_skip_payment, false);
  v_note text := nullif(btrim(coalesce(p_payment_note, '')), '');
  v_needs_review boolean := false;
begin
  select * into v_report
  from public.ambassador_reports report
  where report.id = p_report_id
  for update;

  if not found then
    return;
  end if;

  -- Retries and double clicks change nothing.
  if v_report.reviewed_for_payment_at is not null then
    return query select false, null::uuid, v_report.booking_session_id;
    return;
  end if;

  select * into v_payment
  from public.payments payment
  where payment.booking_session_id = v_report.booking_session_id
    and payment.ambassador_profile_id = v_report.ambassador_profile_id
    and payment.status in ('pending', 'eligible')
  order by payment.created_at desc
  limit 1
  for update;

  if v_payment.id is not null then
    v_needs_review := v_payment.review_required and v_payment.custom_reviewed_at is null;

    if v_extra < 0 or v_extra > 25000 or v_extra % 100 <> 0 then
      raise exception 'Extra payment amounts must be whole dollars between $0 and $250.';
    end if;

    if v_skip and v_extra > 0 then
      raise exception 'A report approved with no payment cannot carry an extra amount.';
    end if;

    if (v_skip or v_extra > 0 or v_needs_review)
      and (v_note is null or char_length(v_note) < 3 or char_length(v_note) > 500) then
      raise exception 'Extra amounts, custom reviews and no-payment approvals require a note of 3 to 500 characters.';
    end if;

    if v_needs_review and not v_skip and not coalesce(p_review_confirmed, false) then
      raise exception 'This payment needs a staff custom review: confirm the custom amount (which may be $0) before approving.';
    end if;
  end if;

  update public.ambassador_reports report
  set
    reviewed_for_payment_at = now(),
    reviewed_for_payment_by = p_actor_id
  where report.id = v_report.id;

  if v_payment.id is null then
    return query select true, null::uuid, v_report.booking_session_id;
    return;
  end if;

  if v_skip then
    update public.payments payment
    set
      status = 'not_eligible',
      amount_cents = 0,
      base_amount_cents = 0,
      sourcing_bonus_cents = 0,
      additional_session_cents = 0,
      extra_amount_cents = 0,
      staff_override = true,
      payment_note = v_note,
      eligibility_reason = format(
        'Approved with no payment (replaced %s cents: %s base, %s sourcing bonus, %s additional session): %s',
        payment.amount_cents,
        payment.base_amount_cents,
        payment.sourcing_bonus_cents,
        payment.additional_session_cents,
        v_note
      ),
      custom_reviewed_at = case when v_needs_review then now() else payment.custom_reviewed_at end,
      custom_reviewed_by = case when v_needs_review then p_actor_id else payment.custom_reviewed_by end,
      finance_email_status = null,
      finance_email_claim_id = null,
      finance_email_claimed_at = null,
      finance_confirmation_token_hash = null,
      finance_confirmation_expires_at = null,
      updated_by = p_actor_id,
      updated_at = now()
    where payment.id = v_payment.id;

    update public.booking_sessions session
    set
      payment_status = 'not_eligible',
      updated_at = now()
    where session.id = v_report.booking_session_id;

    return query select true, null::uuid, v_report.booking_session_id;
    return;
  end if;

  if p_invoice_number is null
    or p_bank_account_name is null
    or p_bank_account_number is null
    or p_finance_email is null then
    raise exception 'Payable reports require complete finance payment data.';
  end if;

  update public.payments payment
  set
    status = 'approved',
    extra_amount_cents = v_extra,
    -- Recomputed from the parts; a review payment's additional amount is 0.
    amount_cents = payment.base_amount_cents + payment.sourcing_bonus_cents
      + payment.additional_session_cents + v_extra,
    payment_note = case when v_extra > 0 or v_needs_review then v_note else null end,
    custom_reviewed_at = case when v_needs_review then now() else payment.custom_reviewed_at end,
    custom_reviewed_by = case when v_needs_review then p_actor_id else payment.custom_reviewed_by end,
    invoice_number = coalesce(payment.invoice_number, p_invoice_number),
    invoice_generated_at = coalesce(payment.invoice_generated_at, now()),
    bank_account_name = p_bank_account_name,
    bank_account_number = p_bank_account_number,
    gst_number = nullif(p_gst_number, ''),
    sent_to_email = p_finance_email,
    finance_email_status = null,
    finance_email_error = null,
    finance_email_claim_id = null,
    finance_email_claimed_at = null,
    finance_confirmation_token_hash = null,
    finance_confirmation_expires_at = null,
    updated_by = p_actor_id,
    updated_at = now()
  where payment.id = v_payment.id;

  update public.booking_sessions session
  set
    status = 'payment_pending',
    payment_status = 'approved',
    updated_at = now()
  where session.id = v_report.booking_session_id;

  return query select true, v_payment.id, v_report.booking_session_id;
end;
$$;

revoke all on function public.approve_ambassador_report_payment(
  uuid, uuid, text, text, text, text, text, timestamptz, text, integer, boolean, text, boolean
) from public, anon, authenticated;
grant execute on function public.approve_ambassador_report_payment(
  uuid, uuid, text, text, text, text, text, timestamptz, text, integer, boolean, text, boolean
) to service_role;

-- 0057_two_hour_short_pair.sql
-- The less-than-2-hours tier (+$50 add-on) now covers gaps under 2 hours
-- (was up to 1 hour), and 2 to under 4 hours is the +$100 tier, so a 61 to
-- 119 minute gap no longer needs a staff custom review. The tier keeps its
-- stored name, pair_within_60, so existing payments and their check
-- constraints are unchanged. 4 hours or more still needs a custom review.

create or replace function public.report_payment_tier(
  p_starts timestamptz[],
  p_ends timestamptz[]
)
returns table (tier text, review_reason text, gap_minutes integer)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_count integer := coalesce(array_length(p_starts, 1), 0);
  v_gap_seconds numeric;
  v_index integer;
begin
  if v_count = 0 or coalesce(array_length(p_ends, 1), 0) <> v_count then
    return query select 'custom_review', 'invalid_times', null::integer;
    return;
  end if;

  for v_index in 1..v_count loop
    if p_starts[v_index] is null or p_ends[v_index] is null
      or not isfinite(p_starts[v_index]) or not isfinite(p_ends[v_index])
      or p_ends[v_index] <= p_starts[v_index] then
      return query select 'custom_review', 'invalid_times', null::integer;
      return;
    end if;
  end loop;

  if v_count = 1 then
    return query select 'single', null::text, null::integer;
    return;
  end if;

  if v_count >= 3 then
    return query select 'custom_review', 'three_or_more_sessions', null::integer;
    return;
  end if;

  -- First session's end to second session's start.
  v_gap_seconds := extract(epoch from (p_starts[2] - p_ends[1]));

  if v_gap_seconds < 0 then
    return query select 'custom_review', 'overlapping_times', floor(v_gap_seconds / 60)::integer;
  elsif v_gap_seconds < 7200 then
    return query select 'pair_within_60', null::text, floor(v_gap_seconds / 60)::integer;
  elsif v_gap_seconds < 14400 then
    return query select 'pair_120_to_240', null::text, floor(v_gap_seconds / 60)::integer;
  else
    return query select 'custom_review', 'gap_240_or_more', floor(v_gap_seconds / 60)::integer;
  end if;
end;
$$;

revoke all on function public.report_payment_tier(timestamptz[], timestamptz[]) from public, anon, authenticated;
grant execute on function public.report_payment_tier(timestamptz[], timestamptz[]) to service_role;

-- Update descriptions for NEW reports only; never rewrite historical records.
create or replace function public.submit_ambassador_report_group(
  p_session_id uuid,
  p_ambassador_profile_id uuid,
  p_actor_id uuid,
  p_report jsonb,
  p_delivery_cents integer,
  p_sourcing_bonus_cents integer,
  p_short_pair_cents integer,
  p_extended_pair_cents integer,
  p_eligible_threshold integer,
  p_is_sourced boolean
)
returns table (
  outcome text,
  report_id uuid,
  payment_id uuid,
  covered_session_ids uuid[],
  session_count integer,
  payment_status text,
  amount_cents integer,
  payment_tier text,
  review_required boolean,
  review_reason text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_request_id uuid;
  v_session public.booking_sessions%rowtype;
  v_day date;
  v_group uuid[];
  v_starts timestamptz[];
  v_ends timestamptz[];
  v_covered uuid[];
  v_count integer;
  v_attendees integer := (p_report->>'attendee_count')::integer;
  v_eligible boolean;
  v_sourcing integer := case when coalesce(p_is_sourced, false) then coalesce(p_sourcing_bonus_cents, 0) else 0 end;
  v_additional integer := 0;
  v_amount integer := 0;
  v_reason text;
  v_tier text;
  v_review_reason text;
  v_gap integer;
  v_report_id uuid;
  v_payment_id uuid;
begin
  if p_delivery_cents is null or p_delivery_cents < 0
    or coalesce(p_sourcing_bonus_cents, 0) < 0
    or coalesce(p_short_pair_cents, 0) < 0
    or coalesce(p_extended_pair_cents, 0) < 0
    or p_eligible_threshold is null
    or v_attendees is null or v_attendees < 0 then
    raise exception 'Invalid report or payout inputs.';
  end if;

  -- Same lock order as 0054: table, then booking row, then sessions.
  lock table public.booking_sessions in row exclusive mode;

  select session.booking_request_id into v_request_id
  from public.booking_sessions session
  where session.id = p_session_id;

  if not found then
    return query select 'session-not-assigned', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  perform 1 from public.booking_requests booking where booking.id = v_request_id for update;

  select * into v_session
  from public.booking_sessions session
  where session.id = p_session_id
  for update;

  if v_session.assigned_ambassador_id is distinct from p_ambassador_profile_id then
    return query select 'session-not-assigned', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  if v_session.ends_at > now()
    or v_session.status not in ('confirmed', 'completed_pending_report')
    or v_session.report_status <> 'not_submitted' then
    return query select 'session-not-finished', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  if exists (
    select 1 from public.ambassador_reports report where report.booking_session_id = v_session.id
  ) then
    return query select 'report-already-submitted', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  v_day := (v_session.starts_at at time zone 'Pacific/Auckland')::date;

  if exists (
    select 1
    from public.ambassador_reports prior_report
    join public.booking_sessions prior_session on prior_session.id = prior_report.booking_session_id
    where prior_session.booking_request_id = v_request_id
      and prior_report.ambassador_profile_id = p_ambassador_profile_id
      and (prior_session.starts_at at time zone 'Pacific/Auckland')::date = v_day
  ) then
    return query select 'group-already-reported', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  if exists (
    select 1
    from public.booking_sessions other
    where other.booking_request_id = v_request_id
      and other.id <> v_session.id
      and other.assigned_ambassador_id = p_ambassador_profile_id
      and (other.starts_at at time zone 'Pacific/Auckland')::date = v_day
      and other.status not in ('cancelled', 'declined')
      and other.report_status = 'not_submitted'
      and other.ends_at > now()
  ) then
    return query select 'report-day-not-finished', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  select
    array_agg(grouped.id order by grouped.starts_at, grouped.id),
    array_agg(grouped.starts_at order by grouped.starts_at, grouped.id),
    array_agg(grouped.ends_at order by grouped.starts_at, grouped.id)
  into v_group, v_starts, v_ends
  from (
    select other.id, other.starts_at, other.ends_at
    from public.booking_sessions other
    where other.booking_request_id = v_request_id
      and other.assigned_ambassador_id = p_ambassador_profile_id
      and (other.starts_at at time zone 'Pacific/Auckland')::date = v_day
      and other.status in ('confirmed', 'completed_pending_report')
      and other.report_status = 'not_submitted'
      and other.ends_at <= now()
      and not exists (
        select 1 from public.ambassador_reports report where report.booking_session_id = other.id
      )
    for update
  ) grouped;

  v_count := coalesce(array_length(v_group, 1), 0);

  if v_count = 0 or not (v_session.id = any(v_group)) then
    return query select 'session-not-finished', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  if exists (
    select 1
    from public.payments payment
    where payment.booking_session_id = any(v_group)
      and payment.ambassador_profile_id = p_ambassador_profile_id
      and payment.status in ('pending', 'eligible', 'approved', 'paid')
  ) then
    return query select 'payment-already-exists', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  v_covered := array_remove(v_group, v_session.id);
  v_eligible := v_attendees >= p_eligible_threshold;

  select tiered.tier, tiered.review_reason, tiered.gap_minutes
  into v_tier, v_review_reason, v_gap
  from public.report_payment_tier(v_starts, v_ends) tiered;

  insert into public.ambassador_reports (
    booking_session_id, ambassador_profile_id, presenter_name, school_roll_size,
    primary_contact_name, primary_contact_email, delivered_at, students_competed_in_esports,
    attendee_count, year_levels, age_groups, parents_present, attendee_quotes,
    attendance_rating, student_response_rating, teacher_response_rating,
    presentation_energy_rating, presentation_feedback, student_questions_themes,
    additional_notes, media_consent_confirmed, submitted_at
  )
  values (
    v_session.id,
    p_ambassador_profile_id,
    p_report->>'presenter_name',
    (p_report->>'school_roll_size')::integer,
    p_report->>'primary_contact_name',
    p_report->>'primary_contact_email',
    coalesce((p_report->>'delivered_at')::timestamptz, v_session.starts_at),
    (p_report->>'students_competed_in_esports')::boolean,
    v_attendees,
    p_report->>'year_levels',
    p_report->>'age_groups',
    (p_report->>'parents_present')::boolean,
    p_report->>'attendee_quotes',
    (p_report->>'attendance_rating')::integer,
    (p_report->>'student_response_rating')::integer,
    (p_report->>'teacher_response_rating')::integer,
    (p_report->>'presentation_energy_rating')::integer,
    p_report->>'presentation_feedback',
    p_report->>'student_questions_themes',
    p_report->>'additional_notes',
    coalesce((p_report->>'media_consent_confirmed')::boolean, false),
    now()
  )
  returning id into v_report_id;

  update public.booking_sessions session
  set
    report_status = 'submitted',
    status = 'report_submitted',
    payment_status = case
      when session.id = v_session.id and v_eligible then 'eligible'
      else 'not_eligible'
    end,
    actual_student_count = case
      when session.id = v_session.id then v_attendees
      else session.actual_student_count
    end,
    updated_at = now()
  where session.id = any(v_group);

  if v_eligible then
    v_additional := case v_tier
      when 'pair_within_60' then coalesce(p_short_pair_cents, 0)
      when 'pair_120_to_240' then coalesce(p_extended_pair_cents, 0)
      else 0
    end;
    v_amount := p_delivery_cents + v_sourcing + v_additional;
    v_reason := format('Attendee count %s meets threshold of %s.', v_attendees, p_eligible_threshold)
      || case when v_sourcing > 0 then ' Includes the sourcing bonus.' else '' end
      || case v_tier
        when 'pair_within_60' then format(' One report for 2 sessions, approximately %s minutes apart (first end to second start, under 2 hours): adds the second-session amount.', v_gap)
        when 'pair_120_to_240' then format(' One report for 2 sessions, approximately %s minutes apart (first end to second start, 2 to under 4 hours): adds the extended-gap amount.', v_gap)
        when 'custom_review' then ' Needs staff custom review before approval: ' || case v_review_reason
          when 'gap_over_60_to_120' then format('the sessions are approximately %s minutes apart (over 1 hour, up to 2 hours).', v_gap)
          when 'gap_240_or_more' then format('the sessions are approximately %s minutes apart (4 hours or more).', v_gap)
          when 'three_or_more_sessions' then format('the report covers %s sessions.', v_count)
          when 'overlapping_times' then 'the sessions overlap.'
          else 'a session has a missing or invalid time.'
        end || ' Only the delivery fee and any sourcing bonus are recognised so far.'
        else ''
      end;

    insert into public.payments (
      booking_session_id, ambassador_profile_id, status, eligibility_reason,
      amount_cents, base_amount_cents, sourcing_bonus_cents, additional_session_cents,
      payment_tier, covered_session_count, review_required, review_reason, review_gap_minutes
    )
    values (
      v_session.id, p_ambassador_profile_id, 'pending', v_reason,
      v_amount, p_delivery_cents, v_sourcing, v_additional,
      v_tier, v_count, v_tier = 'custom_review', v_review_reason, v_gap
    )
    returning id into v_payment_id;
  end if;

  -- Atomic coverage record read by the finance invoice (payment-automation.ts).
  insert into public.booking_activity_logs (
    booking_request_id, booking_session_id, action, actor_id, actor_type, details
  )
  select
    v_request_id,
    covered.id,
    'report.covered_by_same_day_report',
    p_actor_id,
    'ambassador',
    jsonb_build_object('report_id', v_report_id, 'reported_session_id', v_session.id)
  from unnest(v_covered) as covered(id);

  if not exists (
    select 1
    from public.booking_sessions other
    where other.booking_request_id = v_request_id
      and other.status not in ('report_submitted', 'payment_pending', 'paid', 'closed', 'cancelled', 'declined')
  ) then
    update public.booking_requests booking
    set status = 'report_submitted'
    where booking.id = v_request_id;
  end if;

  return query select
    'submitted',
    v_report_id,
    v_payment_id,
    v_covered,
    v_count,
    case when v_eligible then 'eligible' else 'not_eligible' end,
    v_amount,
    case when v_eligible then v_tier else null end,
    v_eligible and v_tier = 'custom_review',
    case when v_eligible then v_review_reason else null end;
end;
$$;

revoke all on function public.submit_ambassador_report_group(
  uuid, uuid, uuid, jsonb, integer, integer, integer, integer, integer, boolean
) from public, anon, authenticated;
grant execute on function public.submit_ambassador_report_group(
  uuid, uuid, uuid, jsonb, integer, integer, integer, integer, integer, boolean
) to service_role;
DO $$ BEGIN
 IF EXISTS ((SELECT id,status,amount_cents,base_amount_cents,sourcing_bonus_cents,extra_amount_cents FROM public.payments
 EXCEPT SELECT * FROM release_payment_baseline)
 UNION ALL
 (SELECT * FROM release_payment_baseline EXCEPT SELECT id,status,amount_cents,base_amount_cents,sourcing_bonus_cents,extra_amount_cents FROM public.payments)) THEN
 RAISE EXCEPTION 'Release aborted: existing payment money/status changed'; END IF;
END $$;
-- Save these exact opaque fingerprints with the successful COMMIT result.
SELECT pg_temp.release_data_fingerprint() AS recovery_data_fingerprint, (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.approve_ambassador_report_payment(uuid,uuid,text,text,text,text,text,timestamptz,text,integer,boolean,text,boolean)'::regprocedure) AS recovery_approval_hash;
NOTIFY pgrst, 'reload schema';
COMMIT;
