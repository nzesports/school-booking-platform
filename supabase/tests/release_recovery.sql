-- Checks for payment tiers through 0057. Run against a local database with 0054-0057
-- applied, e.g.
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0056_payment_tiers.sql
-- Everything runs in one transaction and is rolled back. A failed check
-- raises "FAIL: ..."; success ends with "0056 checks passed". All fixtures
-- (school, directory-only ambassadors, bookings) are created here.
--
-- Working interpretation under test: the gap runs from the FIRST session's
-- END to the SECOND session's START.
--   0 to under 120 min +$50; 120 to under 240 min +$100
--   240 or more requires review; app defers add-on until staff approval.
--   3+ sessions, overlapping, missing/invalid times            review
--
-- Sessions are placed on yesterday's NZ date (now() is fixed per transaction).

begin;

create function pg_temp.nzt(p_day date, p_time time) returns timestamptz
language sql immutable as $$ select (p_day + p_time) at time zone 'Pacific/Auckland' $$;

create function pg_temp.report(p_attendees integer default 150) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'presenter_name', '0056 Ambassador',
    'attendee_count', p_attendees,
    'delivered_at', now() - interval '1 day',
    'students_competed_in_esports', false,
    'parents_present', false,
    'year_levels', 'Years 7 to 8',
    'age_groups', 'Years 7 to 8',
    'attendance_rating', 5,
    'student_response_rating', 5,
    'teacher_response_rating', 5,
    'presentation_energy_rating', 5,
    'media_consent_confirmed', false
  )
$$;

-- One booking with a 08:00-09:00 session and a second 30-minute session
-- starting p_gap_minutes (+ p_extra_seconds) after the first ends. The report
-- is submitted on the second session. Returns the submission row.
create function pg_temp.submit_pair(
  p_amb uuid, p_school uuid, p_gap_minutes integer, p_sourced boolean default false,
  p_extra_seconds integer default 0, p_attendees integer default 150, p_staff_addon boolean default false
) returns table (
  outcome text, report_id uuid, payment_id uuid, session_count integer,
  payment_tier text, review_required boolean, review_reason text
)
language plpgsql as $$
#variable_conflict use_column
declare
  v_day date := (now() at time zone 'Pacific/Auckland')::date - 1;
  v_booking uuid;
  v_second_start timestamptz;
  v_second uuid;
begin
  insert into public.booking_requests (school_id, status) values (p_school, 'confirmed') returning id into v_booking;
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_booking, p_school, p_amb, 'confirmed', pg_temp.nzt(v_day, '08:00'), pg_temp.nzt(v_day, '09:00'));
  v_second_start := pg_temp.nzt(v_day, '09:00') + make_interval(mins => p_gap_minutes, secs => p_extra_seconds);
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_booking, p_school, p_amb, 'confirmed', v_second_start, v_second_start + interval '30 minutes')
    returning id into v_second;

  return query
  select submitted.outcome, submitted.report_id, submitted.payment_id, submitted.session_count,
    submitted.payment_tier, submitted.review_required, submitted.review_reason
  from public.submit_ambassador_report_group(
    v_second, p_amb, null, pg_temp.report(p_attendees), 25000, 5000, case when p_staff_addon then 0 else 5000 end, case when p_staff_addon then 0 else 10000 end, 100, p_sourced) submitted;
end;
$$;


-- Existing local finance fixtures are neutralized ONLY within this rolled-back test.
update public.payments set finance_email_status=null,finance_email_claim_id=null,finance_email_claimed_at=null;
create temporary table recovery_probe(label text,report_id uuid,payment_id uuid,original_amount integer);
do $$ declare s uuid; a uuid; r record; tag text; begin
 insert into public.schools(name) values('V3 recovery rollback fixture') returning id into s;
 insert into public.ambassador_profiles(user_id,status,display_name) values(null,'approved','V3 recovery fixture') returning id into a;
 foreach tag in array array['skip','extra','fraction','retry'] loop
  select * into r from pg_temp.submit_pair(a,s,60,false,0,150,true);
  update public.payments set payment_tier=null,covered_session_count=null where id=r.payment_id;
  insert into recovery_probe select tag,r.report_id,r.payment_id,amount_cents from public.payments where id=r.payment_id;
 end loop;
end $$;
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


DO $$ DECLARE rejected boolean; id uuid; BEGIN
  BEGIN PERFORM pg_temp.assert_recovery_safe(); RAISE EXCEPTION 'FAIL missing baseline accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Recovery blocked:%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('release.expected_data_fingerprint',pg_temp.release_data_fingerprint(),true);
SELECT set_config('release.expected_approval_hash',(SELECT md5(prosrc) FROM pg_proc WHERE oid='public.approve_ambassador_report_payment(uuid,uuid,text,text,text,text,text,timestamptz,text,integer,boolean,text,boolean)'::regprocedure),true);
SELECT pg_temp.assert_recovery_safe();
DO $$ DECLARE v_payment_id uuid; BEGIN
 SELECT payment_id INTO v_payment_id FROM recovery_probe LIMIT 1;
 BEGIN
  UPDATE public.payments SET payment_note='changed after cutover' WHERE payments.id=v_payment_id;
  PERFORM pg_temp.assert_recovery_safe(); RAISE EXCEPTION 'FAIL changed row accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Recovery blocked:%' THEN RAISE; END IF; END;
 BEGIN
  INSERT INTO public.schools(name) VALUES('new writer marker');
  PERFORM pg_temp.assert_recovery_safe(); RAISE EXCEPTION 'FAIL inserted row accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Recovery blocked:%' THEN RAISE; END IF; END;
 BEGIN
  PERFORM set_config('release.expected_approval_hash',repeat('0',32),true);
  PERFORM pg_temp.assert_recovery_safe(); RAISE EXCEPTION 'FAIL changed function accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Recovery blocked:%' THEN RAISE; END IF; END;
 BEGIN
  UPDATE public.payments SET finance_email_status='pending' WHERE payments.id=v_payment_id;
  -- Test the drain guard independently of the row-change guard.
  PERFORM set_config('release.expected_data_fingerprint',pg_temp.release_data_fingerprint(),true);
  PERFORM pg_temp.assert_recovery_safe(); RAISE EXCEPTION 'FAIL pending finance accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Recovery blocked: finance%' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS missing baseline, row/insert change, function change and pending finance are rejected';
END $$;
-- Subtransaction-aborted updates change row xmin, intentionally invalidating the
-- original fingerprint even though values returned. Fresh TEST baseline only:
SELECT set_config('release.expected_data_fingerprint',pg_temp.release_data_fingerprint(),true);
SELECT pg_temp.assert_recovery_safe();
drop function public.approve_ambassador_report_payment(uuid,uuid,text,text,text,text,text,timestamptz,text,integer,boolean,text,boolean);
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
declare
  v_report public.ambassador_reports%rowtype;
  v_payment public.payments%rowtype;
  v_extra integer := coalesce(p_extra_amount_cents, 0);
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

    if coalesce(p_skip_payment, false) and v_extra > 0 then
      raise exception 'A report approved with no payment cannot carry an extra amount.';
    end if;

    if (coalesce(p_skip_payment, false) or v_extra > 0) and v_note is null then
      raise exception 'Extra amounts and no-payment approvals require a note.';
    end if;
  end if;

  update public.ambassador_reports
  set
    reviewed_for_payment_at = now(),
    reviewed_for_payment_by = p_actor_id
  where id = v_report.id;

  if v_payment.id is null then
    return query select true, null::uuid, v_report.booking_session_id;
    return;
  end if;

  if coalesce(p_skip_payment, false) then
    update public.payments
    set
      status = 'not_eligible',
      amount_cents = 0,
      base_amount_cents = 0,
      sourcing_bonus_cents = 0,
      additional_session_cents = 0,
      extra_amount_cents = 0,
      finance_email_status = null,
      finance_email_claim_id = null,
      finance_email_claimed_at = null,
      finance_confirmation_token_hash = null,
      finance_confirmation_expires_at = null,
      staff_override = true,
      payment_note = v_note,
      eligibility_reason = format('Approved with no payment (replaced %s cents): %s', amount_cents, v_note),
      updated_by = p_actor_id,
      updated_at = now()
    where id = v_payment.id;

    update public.booking_sessions
    set
      payment_status = 'not_eligible',
      updated_at = now()
    where id = v_report.booking_session_id;

    return query select true, null::uuid, v_report.booking_session_id;
    return;
  end if;

  if p_invoice_number is null
    or p_bank_account_name is null
    or p_bank_account_number is null
    or p_token_hash is null
    or p_token_expires_at is null
    or p_finance_email is null then
    raise exception 'Payable reports require complete finance payment data.';
  end if;

  update public.payments
  set
    status = 'approved',
    amount_cents = base_amount_cents + sourcing_bonus_cents + additional_session_cents + v_extra,
    extra_amount_cents = v_extra,
    payment_note = case when v_extra > 0 then v_note else null end,
    invoice_number = coalesce(invoice_number, p_invoice_number),
    invoice_generated_at = coalesce(invoice_generated_at, now()),
    bank_account_name = p_bank_account_name,
    bank_account_number = p_bank_account_number,
    gst_number = nullif(p_gst_number, ''),
    sent_to_email = p_finance_email,
    finance_email_status = 'pending',
    finance_email_error = null,
    finance_confirmation_token_hash = p_token_hash,
    finance_confirmation_expires_at = p_token_expires_at,
    updated_by = p_actor_id,
    updated_at = now()
  where id = v_payment.id;

  update public.booking_sessions
  set
    status = 'payment_pending',
    payment_status = 'approved',
    updated_at = now()
  where id = v_report.booking_session_id;

  return query select true, v_payment.id, v_report.booking_session_id;
end;
$$;

revoke all on function public.approve_ambassador_report_payment(
  uuid, uuid, text, text, text, text, text, timestamptz, text, integer, boolean, text
) from public, anon, authenticated;
grant execute on function public.approve_ambassador_report_payment(
  uuid, uuid, text, text, text, text, text, timestamptz, text, integer, boolean, text
) to service_role;


DO $$ DECLARE f record; result record; p public.payments%rowtype; BEGIN
 FOR f IN SELECT * FROM recovery_probe LOOP
  SELECT * INTO p FROM public.payments WHERE id=f.payment_id;
  IF p.amount_cents<>f.original_amount OR p.status<>'pending' THEN RAISE EXCEPTION 'FAIL existing payment changed during recovery'; END IF;
  IF f.label='fraction' THEN
   BEGIN
    PERFORM public.approve_ambassador_report_payment(p_report_id=>f.report_id,p_actor_id=>null,p_extra_amount_cents=>1,p_payment_note=>'fraction rejected');
    RAISE EXCEPTION 'FAIL fractional extra accepted';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Extra payment amounts must be whole%' THEN RAISE; END IF; END;
   IF (SELECT reviewed_for_payment_at IS NOT NULL FROM public.ambassador_reports WHERE id=f.report_id) THEN RAISE EXCEPTION 'FAIL rejected approval persisted'; END IF;
   CONTINUE;
  END IF;
  SELECT * INTO result FROM public.approve_ambassador_report_payment(
   p_report_id=>f.report_id,p_actor_id=>null,p_invoice_number=>'V3-'||f.label,
   p_bank_account_name=>'Fixture',p_bank_account_number=>'00-0000-0000000-00',
   p_token_hash=>'fixture-token-'||f.label,p_token_expires_at=>now()+interval '1 day',p_finance_email=>'fixture@example.invalid',
   p_extra_amount_cents=>CASE WHEN f.label='extra' THEN 10000 ELSE 0 END,
   p_skip_payment=>f.label='skip',p_payment_note=>'Local recovery regression');
  SELECT * INTO p FROM public.payments WHERE id=f.payment_id;
  IF NOT result.did_approve THEN RAISE EXCEPTION 'FAIL approval'; END IF;
  IF f.label='skip' THEN
   IF p.status<>'not_eligible' OR p.amount_cents<>0 OR p.base_amount_cents<>0 OR p.sourcing_bonus_cents<>0 OR p.additional_session_cents<>0 OR p.extra_amount_cents<>0 OR p.finance_confirmation_token_hash IS NOT NULL THEN RAISE EXCEPTION 'FAIL no-payment breakdown'; END IF;
  ELSE
   IF p.amount_cents<>f.original_amount+(CASE WHEN f.label='extra' THEN 10000 ELSE 0 END) OR p.finance_confirmation_token_hash<>('fixture-token-'||f.label) THEN RAISE EXCEPTION 'FAIL recovered amount/token'; END IF;
  END IF;
  SELECT * INTO result FROM public.approve_ambassador_report_payment(p_report_id=>f.report_id,p_actor_id=>null);
  IF result.did_approve THEN RAISE EXCEPTION 'FAIL repeat approval'; END IF;
 END LOOP;
 IF has_function_privilege('anon','public.approve_ambassador_report_payment(uuid,uuid,text,text,text,text,text,timestamptz,text,integer,boolean,text)','execute') OR has_function_privilege('authenticated','public.approve_ambassador_report_payment(uuid,uuid,text,text,text,text,text,timestamptz,text,integer,boolean,text)','execute') THEN RAISE EXCEPTION 'FAIL recovery ACL'; END IF;
 RAISE NOTICE 'PASS retained-constraint-safe skip, whole-dollar extra, rejected fractions, token, idempotency, existing amounts and ACL';
END $$;
ROLLBACK;
