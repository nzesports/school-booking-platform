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
-- Since 0059 a report covers a whole school day, so each scenario has its own
-- school.

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
  v_school uuid;
  v_booking uuid;
  v_second_start timestamptz;
  v_second uuid;
begin
  insert into public.schools (name) values ('0056 Pair School') returning id into v_school;
  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_booking;
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_booking, v_school, p_amb, 'confirmed', pg_temp.nzt(v_day, '08:00'), pg_temp.nzt(v_day, '09:00'));
  v_second_start := pg_temp.nzt(v_day, '09:00') + make_interval(mins => p_gap_minutes, secs => p_extra_seconds);
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_booking, v_school, p_amb, 'confirmed', v_second_start, v_second_start + interval '30 minutes')
    returning id into v_second;

  return query
  select submitted.outcome, submitted.report_id, submitted.payment_id, submitted.session_count,
    submitted.payment_tier, submitted.review_required, submitted.review_reason
  from public.submit_ambassador_report_group(
    v_second, p_amb, null, pg_temp.report(p_attendees), 25000, 5000, case when p_staff_addon then 0 else 5000 end, case when p_staff_addon then 0 else 10000 end, 100, p_sourced) submitted;
end;
$$;

do $$
declare
  v_school uuid;
  v_amb uuid;
  v_day date := (now() at time zone 'Pacific/Auckland')::date - 1;
  v_case record;
  v_result record;
  v_payment public.payments%rowtype;
  v_report_id uuid;
  v_booking uuid;
  v_s1 uuid;
  v_s2 uuid;
  v_s3 uuid;
  v_count integer;
  v_failed boolean;
  v_approval record;
begin
  insert into public.schools (name) values ('0056 Check School') returning id into v_school;
  insert into public.ambassador_profiles (user_id, status, display_name)
    values (null, 'approved', '0056 Ambassador') returning id into v_amb;

  -- 1. Pure tier function, exact boundaries and neighbours (as of 0057:
  -- under 2 hours is the +$50 tier, 2 to under 4 hours the +$100 one).
  for v_case in
    select * from (values
      (0, 0, 'pair_within_60', null::text),
      (1, 0, 'pair_within_60', null),
      (59, 0, 'pair_within_60', null),
      (60, 0, 'pair_within_60', null),
      (60, 1, 'pair_within_60', null),
      (61, 0, 'pair_within_60', null),
      (119, 0, 'pair_within_60', null),
      (120, 0, 'pair_120_to_240', null),
      (120, 1, 'pair_120_to_240', null),
      (121, 0, 'pair_120_to_240', null),
      (239, 59, 'pair_120_to_240', null),
      (240, 0, 'custom_review', 'gap_240_or_more'),
      (241, 0, 'custom_review', 'gap_240_or_more'),
      (-15, 0, 'custom_review', 'overlapping_times')
    ) as cases(gap, extra_seconds, tier, reason)
  loop
    select * into v_result from public.report_payment_tier(
      array[pg_temp.nzt(v_day, '08:00'), pg_temp.nzt(v_day, '09:00') + make_interval(mins => v_case.gap, secs => v_case.extra_seconds)],
      array[pg_temp.nzt(v_day, '09:00'), pg_temp.nzt(v_day, '09:30') + make_interval(mins => v_case.gap, secs => v_case.extra_seconds)]
    );
    if v_result.tier <> v_case.tier or v_result.review_reason is distinct from v_case.reason then
      raise exception 'FAIL 1: gap % min % s gave % / %, expected % / %',
        v_case.gap, v_case.extra_seconds, v_result.tier, v_result.review_reason, v_case.tier, v_case.reason;
    end if;
  end loop;

  select * into v_result from public.report_payment_tier(array[pg_temp.nzt(v_day, '08:00')], array[pg_temp.nzt(v_day, '09:00')]);
  if v_result.tier <> 'single' then raise exception 'FAIL 1: single %', v_result.tier; end if;
  select * into v_result from public.report_payment_tier(
    array[pg_temp.nzt(v_day, '08:00'), pg_temp.nzt(v_day, '09:00'), pg_temp.nzt(v_day, '10:00')],
    array[pg_temp.nzt(v_day, '09:00'), pg_temp.nzt(v_day, '10:00'), pg_temp.nzt(v_day, '11:00')]);
  if v_result.review_reason <> 'three_or_more_sessions' then raise exception 'FAIL 1: three %', v_result.review_reason; end if;
  select * into v_result from public.report_payment_tier(array[pg_temp.nzt(v_day, '08:00')], array[pg_temp.nzt(v_day, '08:00')]);
  if v_result.review_reason <> 'invalid_times' then raise exception 'FAIL 1: zero length %', v_result.review_reason; end if;
  select * into v_result from public.report_payment_tier(array[pg_temp.nzt(v_day, '08:00'), null], array[pg_temp.nzt(v_day, '09:00'), null]);
  if v_result.review_reason <> 'invalid_times' then raise exception 'FAIL 1: missing time %', v_result.review_reason; end if;

  -- 2. Report submission creates the tiered payment, normal and sourced.
  for v_case in
    select * from (values
      (0, 0, false, 'pair_within_60', 5000, 30000, false),
      (60, 0, false, 'pair_within_60', 5000, 30000, false),
      (60, 0, true, 'pair_within_60', 5000, 35000, false),
      (61, 0, false, 'pair_within_60', 5000, 30000, false),
      (120, 0, true, 'pair_120_to_240', 10000, 40000, false),
      (121, 0, false, 'pair_120_to_240', 10000, 35000, false),
      (180, 0, true, 'pair_120_to_240', 10000, 40000, false),
      (239, 0, false, 'pair_120_to_240', 10000, 35000, false),
      (240, 0, false, 'custom_review', 0, 25000, true),
      (300, 0, true, 'custom_review', 0, 30000, true),
      (-15, 0, false, 'custom_review', 0, 25000, true)
    ) as cases(gap, extra_seconds, sourced, tier, additional, amount, review)
  loop
    select * into v_result from pg_temp.submit_pair(v_amb, v_school, v_case.gap, v_case.sourced, v_case.extra_seconds);
    if v_result.outcome <> 'submitted' or v_result.payment_tier <> v_case.tier or v_result.review_required <> v_case.review then
      raise exception 'FAIL 2: gap % sourced % gave %', v_case.gap, v_case.sourced, row_to_json(v_result);
    end if;
    select * into v_payment from public.payments where id = v_result.payment_id;
    if v_payment.amount_cents <> v_case.amount
      or v_payment.additional_session_cents <> v_case.additional
      or v_payment.base_amount_cents <> 25000
      or v_payment.sourcing_bonus_cents <> (case when v_case.sourced then 5000 else 0 end)
      or v_payment.payment_tier <> v_case.tier
      or v_payment.review_required <> v_case.review
      or v_payment.covered_session_count <> 2
      or v_payment.status <> 'pending'
      or v_payment.custom_reviewed_at is not null then
      raise exception 'FAIL 2: gap % sourced % payment %', v_case.gap, v_case.sourced, row_to_json(v_payment);
    end if;
    if v_case.review and (v_payment.review_reason is null or v_payment.eligibility_reason not like '%custom review%') then
      raise exception 'FAIL 2: review payment must say why %', row_to_json(v_payment);
    end if;
    if v_case.tier = 'pair_120_to_240' and v_payment.eligibility_reason like '%back-to-back%' then
      raise exception 'FAIL 2: an extended gap must not be called back-to-back';
    end if;
    -- The invoice's coverage record is written exactly once for the sibling.
    select count(*) into v_count from public.booking_activity_logs
      where action = 'report.covered_by_same_day_report' and details->>'report_id' = v_result.report_id::text;
    if v_count <> 1 then raise exception 'FAIL 2: coverage records %', v_count; end if;
  end loop;

  -- 3. Single sessions: $250, sourced $300, no additional amount.
  insert into public.schools (name) values ('0056 Scenario School') returning id into v_school;
  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_booking;
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_booking, v_school, v_amb, 'confirmed', pg_temp.nzt(v_day, '14:00'), pg_temp.nzt(v_day, '15:00'))
    returning id into v_s1;
  select * into v_result from public.submit_ambassador_report_group(v_s1, v_amb, null, pg_temp.report(), 25000, 5000, 5000, 10000, 100, true);
  select * into v_payment from public.payments where id = v_result.payment_id;
  if v_payment.payment_tier <> 'single' or v_payment.amount_cents <> 30000 or v_payment.additional_session_cents <> 0
    or v_payment.covered_session_count <> 1 or v_payment.review_required then
    raise exception 'FAIL 3: sourced single %', row_to_json(v_payment);
  end if;

  -- 4. Three sessions: one delivery fee, one bonus, review, nothing guessed.
  insert into public.schools (name) values ('0056 Scenario School') returning id into v_school;
  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_booking;
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_booking, v_school, v_amb, 'confirmed', pg_temp.nzt(v_day, '08:00'), pg_temp.nzt(v_day, '09:00')),
           (v_booking, v_school, v_amb, 'confirmed', pg_temp.nzt(v_day, '09:00'), pg_temp.nzt(v_day, '10:00'));
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_booking, v_school, v_amb, 'confirmed', pg_temp.nzt(v_day, '10:00'), pg_temp.nzt(v_day, '11:00'))
    returning id into v_s3;
  select * into v_result from public.submit_ambassador_report_group(v_s3, v_amb, null, pg_temp.report(), 25000, 5000, 5000, 10000, 100, true);
  select * into v_payment from public.payments where id = v_result.payment_id;
  if v_result.session_count <> 3 or v_payment.review_reason <> 'three_or_more_sessions'
    or v_payment.amount_cents <> 30000 or v_payment.additional_session_cents <> 0 or v_payment.covered_session_count <> 3 then
    raise exception 'FAIL 4: three sessions %', row_to_json(v_payment);
  end if;
  -- Retry and sibling resubmission change nothing.
  select * into v_result from public.submit_ambassador_report_group(v_s3, v_amb, null, pg_temp.report(), 25000, 5000, 5000, 10000, 100, true);
  if v_result.outcome <> 'session-not-finished' then raise exception 'FAIL 4: retry %', v_result.outcome; end if;
  select count(*) into v_count from public.payments where booking_session_id in (
    select id from public.booking_sessions where booking_request_id = v_booking);
  if v_count <> 1 then raise exception 'FAIL 4: % payments for one report', v_count; end if;

  -- 5. Invalid times (a zero-length session) go to review.
  insert into public.schools (name) values ('0056 Scenario School') returning id into v_school;
  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_booking;
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_booking, v_school, v_amb, 'confirmed', pg_temp.nzt(v_day, '12:00'), pg_temp.nzt(v_day, '12:00'));
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_booking, v_school, v_amb, 'confirmed', pg_temp.nzt(v_day, '12:30'), pg_temp.nzt(v_day, '13:00'))
    returning id into v_s2;
  select * into v_result from public.submit_ambassador_report_group(v_s2, v_amb, null, pg_temp.report(), 25000, 5000, 5000, 10000, 100, false);
  if v_result.review_reason <> 'invalid_times' then raise exception 'FAIL 5: invalid times %', row_to_json(v_result); end if;

  -- 6. Below the attendance threshold: no payment at all, whatever the tier.
  select * into v_result from pg_temp.submit_pair(v_amb, v_school, 30, false, 0, 40);
  if v_result.payment_id is not null or v_result.payment_tier is not null or v_result.review_required then
    raise exception 'FAIL 6: below threshold %', row_to_json(v_result);
  end if;

  -- 7. Approving a review payment needs an explicit staff decision.
  select * into v_result from pg_temp.submit_pair(v_amb, v_school, 300, true);
  v_report_id := v_result.report_id;

  v_failed := false;
  begin
    perform public.approve_ambassador_report_payment(v_report_id, null, 'INV-0056-A', 'A Ambassador', '12-3456-7890123-00',
      null, null, null, 'finance@example.test', 0, false, 'Looked at it');
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL 7: approval without confirming the review must be refused'; end if;

  v_failed := false;
  begin
    perform public.approve_ambassador_report_payment(v_report_id, null, 'INV-0056-A', 'A Ambassador', '12-3456-7890123-00',
      null, null, null, 'finance@example.test', 0, false, null, true);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL 7: a $0 custom review still needs a note'; end if;

  v_failed := false;
  begin
    perform public.approve_ambassador_report_payment(v_report_id, null, 'INV-0056-A', 'A Ambassador', '12-3456-7890123-00',
      null, null, null, 'finance@example.test', 25100, false, 'Over the cap', true);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL 7: the custom amount stays within the $250 cap'; end if;

  if (select reviewed_for_payment_at from public.ambassador_reports where id = v_report_id) is not null
    or (select status from public.payments where id = v_result.payment_id) <> 'pending' then
    raise exception 'FAIL 7: a refused approval must change nothing';
  end if;

  -- The review can't be skipped by writing the row directly either.
  v_failed := false;
  begin
    update public.payments set status = 'approved' where id = v_result.payment_id;
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL 7: an unreviewed payment must not become approved'; end if;

  select * into v_approval from public.approve_ambassador_report_payment(v_report_id, null, 'INV-0056-A', 'A Ambassador',
    '12-3456-7890123-00', null, null, null, 'finance@example.test', 0, false, 'Base and bonus only, agreed', true);
  select * into v_payment from public.payments where id = v_result.payment_id;
  if not v_approval.did_approve or v_payment.status <> 'approved' or v_payment.amount_cents <> 30000
    or v_payment.base_amount_cents <> 25000 or v_payment.sourcing_bonus_cents <> 5000
    or v_payment.additional_session_cents <> 0 or v_payment.extra_amount_cents <> 0
    or v_payment.custom_reviewed_at is null or v_payment.payment_note <> 'Base and bonus only, agreed' then
    raise exception 'FAIL 7: explicit $0 custom approval %', row_to_json(v_payment);
  end if;

  -- Retry: nothing changes.
  select * into v_approval from public.approve_ambassador_report_payment(v_report_id, null, 'INV-0056-A', 'A Ambassador',
    '12-3456-7890123-00', null, null, null, 'finance@example.test', 15000, false, 'Second click', true);
  if v_approval.did_approve or (select amount_cents from public.payments where id = v_result.payment_id) <> 30000 then
    raise exception 'FAIL 7: approval retry must be a no-op';
  end if;

  -- A custom amount on top, itemized once.
  select * into v_result from pg_temp.submit_pair(v_amb, v_school, 300, false);
  select * into v_approval from public.approve_ambassador_report_payment(v_result.report_id, null, 'INV-0056-B', 'A Ambassador',
    '12-3456-7890123-00', null, null, null, 'finance@example.test', 15000, false, 'Long gap, agreed $150', true);
  select * into v_payment from public.payments where id = v_result.payment_id;
  if v_payment.amount_cents <> 40000 or v_payment.extra_amount_cents <> 15000 or v_payment.additional_session_cents <> 0
    or v_payment.base_amount_cents <> 25000 or v_payment.sourcing_bonus_cents <> 0 then
    raise exception 'FAIL 7: custom amount %', row_to_json(v_payment);
  end if;

  -- No payment, with a note, also records the review; all parts zero.
  select * into v_result from pg_temp.submit_pair(v_amb, v_school, 240, true);
  select * into v_approval from public.approve_ambassador_report_payment(v_result.report_id, null, null, null, null, null,
    null, null, null, 0, true, 'Paid on the other report');
  select * into v_payment from public.payments where id = v_result.payment_id;
  if v_payment.status <> 'not_eligible' or v_payment.amount_cents <> 0 or v_payment.base_amount_cents <> 0
    or v_payment.sourcing_bonus_cents <> 0 or v_payment.custom_reviewed_at is null then
    raise exception 'FAIL 7: no-payment review %', row_to_json(v_payment);
  end if;

  -- 8. An automatic tier payment approves as before; the flag is ignored.
  select * into v_result from pg_temp.submit_pair(v_amb, v_school, 150, false);
  select * into v_approval from public.approve_ambassador_report_payment(v_result.report_id, null, 'INV-0056-C', 'A Ambassador',
    '12-3456-7890123-00', null, null, null, 'finance@example.test', 0, false, null, true);
  select * into v_payment from public.payments where id = v_result.payment_id;
  if v_payment.status <> 'approved' or v_payment.amount_cents <> 35000 or v_payment.custom_reviewed_at is not null then
    raise exception 'FAIL 8: tier approval %', row_to_json(v_payment);
  end if;

  -- 9. Approved and paid payments are frozen; email fields still move.
  v_failed := false;
  begin
    update public.payments set amount_cents = 45000, extra_amount_cents = 10000 where id = v_payment.id;
  exception when raise_exception then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL 9: an approved payment must not be repriced'; end if;
  update public.payments set finance_email_status = 'sent', sent_to_finance_at = now() where id = v_payment.id;
  update public.payments set status = 'paid', paid_at = now() where id = v_payment.id;
  v_failed := false;
  begin
    update public.payments set additional_session_cents = 5000, amount_cents = 30000 where id = v_payment.id;
  exception when raise_exception then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL 9: a paid payment must not be repriced'; end if;
  v_failed := false;
  begin
    update public.payments set payment_tier = 'pair_within_60' where id = v_payment.id;
  exception when raise_exception then v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL 9: a paid payment''s tier is history'; end if;

  -- 10. A payment from before 0056 (no tier, flat second-session amount)
  --     keeps its amount through approval: nothing is repriced.
  insert into public.schools (name) values ('0056 Scenario School') returning id into v_school;
  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_booking;
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, report_status, starts_at, ends_at)
    values (v_booking, v_school, v_amb, 'report_submitted', 'submitted', pg_temp.nzt(v_day, '16:00'), pg_temp.nzt(v_day, '17:00'))
    returning id into v_s1;
  insert into public.ambassador_reports (booking_session_id, ambassador_profile_id, delivered_at, attendee_count)
    values (v_s1, v_amb, pg_temp.nzt(v_day, '16:00'), 150) returning id into v_report_id;
  insert into public.payments (booking_session_id, ambassador_profile_id, status, eligibility_reason,
      amount_cents, base_amount_cents, sourcing_bonus_cents, additional_session_cents)
    values (v_s1, v_amb, 'pending', 'Legacy flat pair', 30000, 25000, 0, 5000);
  select * into v_approval from public.approve_ambassador_report_payment(v_report_id, null, 'INV-0056-D', 'A Ambassador',
    '12-3456-7890123-00', null, null, null, 'finance@example.test', 0, false, null);
  select * into v_payment from public.payments where booking_session_id = v_s1;
  if v_payment.status <> 'approved' or v_payment.amount_cents <> 30000 or v_payment.additional_session_cents <> 5000
    or v_payment.payment_tier is not null or v_payment.review_required then
    raise exception 'FAIL 10: pre-0056 payment repriced %', row_to_json(v_payment);
  end if;

  -- 11. Constraints keep review rows coherent: (1) no reason, (2) an
  --     automatic additional amount, (3) review without the review tier.
  --     'not_eligible' keeps the live-payment unique index out of the way, so
  --     only the CHECK can refuse these rows.
  foreach v_count in array array[1, 2, 3] loop
    v_failed := false;
    begin
      insert into public.payments (booking_session_id, ambassador_profile_id, status, eligibility_reason,
          amount_cents, base_amount_cents, sourcing_bonus_cents, additional_session_cents,
          payment_tier, review_required, review_reason)
        values (v_s3, v_amb, 'not_eligible', 'bad',
          case v_count when 2 then 30000 else 25000 end, 25000, 0, case v_count when 2 then 5000 else 0 end,
          case v_count when 3 then null else 'custom_review' end, true,
          case v_count when 1 then null else 'gap_240_or_more' end);
    exception when check_violation then v_failed := true;
    end;
    if not v_failed then raise exception 'FAIL 11: incoherent review row % accepted', v_count; end if;
  end loop;

  raise notice '0056 checks passed';
end;
$$;

-- Non-finite PostgreSQL timestamps must match the JS invalid-time rule.
do $$
declare r record;
begin
  select * into r from public.report_payment_tier(array['2026-01-01'::timestamptz],array['infinity'::timestamptz]);
  if r.tier <> 'custom_review' or r.review_reason <> 'invalid_times' then raise exception 'FAIL: infinite end accepted'; end if;
  select * into r from public.report_payment_tier(array['-infinity'::timestamptz],array['2026-01-01'::timestamptz]);
  if r.tier <> 'custom_review' or r.review_reason <> 'invalid_times' then raise exception 'FAIL: infinite start accepted'; end if;
end $$;

-- Concurrency (run by the independent harness with two connections; not
-- part of this rolled-back file):
--   C1. Two report submissions for the two sessions of one pair at once:
--       both take ROW EXCLUSIVE on booking_sessions, then the booking row
--       FOR UPDATE, so the second waits and then returns
--       'session-not-finished' (or 'group-already-reported'); exactly one
--       tiered payment exists.
--   C2. Two staff approving the same review payment: the report row
--       FOR UPDATE serializes them; the second returns did_approve = false
--       and the amount/custom_reviewed_at of the first stand.
--   C3. Approval racing a direct UPDATE of the payment's amount: once the
--       approval commits, the freeze trigger refuses the UPDATE.


-- Actual application call: no automatic add-on until explicit staff approval.
do $$
declare a uuid; school uuid; c record; sourced boolean; r record; p public.payments%rowtype; approved record; n integer:=0;
begin
 insert into public.schools(name) values ('0057 Staff Add-on Check') returning id into school;
 insert into public.ambassador_profiles(user_id,status,display_name) values(null,'approved','0057 Check') returning id into a;
 for c in select * from (values (0,0,5000),(60,0,5000),(119,59,5000),(120,0,10000),(239,59,10000)) v(gap,seconds,addon) loop
  foreach sourced in array array[false,true] loop
   n:=n+1;
   select * into r from pg_temp.submit_pair(a,school,c.gap,sourced,c.seconds,150,true);
   select * into p from public.payments where id=r.payment_id;
   if p.amount_cents<>25000+(case when sourced then 5000 else 0 end) or p.additional_session_cents<>0 then raise exception 'FAIL staff-add-on pending amount'; end if;
   select * into approved from public.approve_ambassador_report_payment(r.report_id,null,'INV-0057-'||n,'QA Ambassador','12-3456-7890123-00',null,null,null,'finance@example.test',c.addon,false,'Reviewed second-session add-on',false);
   select * into p from public.payments where id=r.payment_id;
   if not approved.did_approve or p.amount_cents<>25000+c.addon+(case when sourced then 5000 else 0 end) or p.extra_amount_cents<>c.addon or p.additional_session_cents<>0 then raise exception 'FAIL staff-add-on approved breakdown'; end if;
   select * into approved from public.approve_ambassador_report_payment(r.report_id,null,'INV-0057-'||n,'QA Ambassador','12-3456-7890123-00',null,null,null,'finance@example.test',25000,false,'Retry must not change amount',false);
   if approved.did_approve or (select amount_cents from public.payments where id=r.payment_id)<>p.amount_cents then raise exception 'FAIL staff-add-on retry'; end if;
  end loop;
 end loop;
 raise notice 'PASS 10 sourced/normal staff-add-on approvals, exact/subminute boundaries, preserved pending base and idempotent retry';
end $$;

rollback;
