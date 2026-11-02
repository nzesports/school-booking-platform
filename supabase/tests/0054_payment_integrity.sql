-- Checks for 0054_payment_integrity. Run against a local database that has
-- the migration applied, e.g.
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0054_payment_integrity.sql
-- Everything runs in one transaction and is rolled back. A failed check
-- raises "FAIL: ..."; success ends with "0054 checks passed".
--
-- now() is fixed for the transaction, so "finished" sessions are placed on
-- yesterday's NZ date.
--
-- 0056 replaced submit_ambassador_report_group's flat second-session amount
-- with gap tiers (p_short_pair_cents, p_extended_pair_cents), so the calls
-- below pass both. Every pair here is touching (gap 0), the +$50 tier, so the
-- expected amounts are unchanged. Tier coverage: 0056_payment_tiers.sql.

begin;

do $$
declare
  v_school uuid;
  v_amb uuid;
  v_other_amb uuid;
  v_b1 uuid;
  v_b2 uuid;
  v_b3 uuid;
  v_b4 uuid;
  v_s1 uuid;
  v_s2 uuid;
  v_s3 uuid;
  v_s4 uuid;
  v_s5 uuid;
  v_s6 uuid;
  v_s7 uuid;
  v_s8 uuid;
  v_s9 uuid;
  v_s10 uuid;
  v_r1 uuid;
  v_r2 uuid;
  v_day date := (now() at time zone 'Pacific/Auckland')::date - 1;
  v_result record;
  v_payment public.payments%rowtype;
  v_report_id uuid;
  v_claim record;
  v_ok boolean;
  v_count integer;
  v_failed boolean;
  v_report jsonb := jsonb_build_object(
    'presenter_name', 'Check Ambassador',
    'attendee_count', 150,
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
  );
begin
  insert into public.schools (name) values ('0054 Check School') returning id into v_school;
  insert into public.ambassador_profiles (user_id, status, display_name)
    values (null, 'approved', '0054 Ambassador') returning id into v_amb;
  insert into public.ambassador_profiles (user_id, status, display_name)
    values (null, 'approved', '0054 Other Ambassador') returning id into v_other_amb;

  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_b1;
  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_b2;
  insert into public.booking_requests (school_id, status, source, ambassador_outreach_by)
    values (v_school, 'confirmed', 'ambassador_booked', v_amb) returning id into v_b3;
  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_b4;

  -- Booking 1, yesterday: two back-to-back sessions for v_amb, one for another
  -- ambassador, one cancelled, and one the next day.
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_b1, v_school, v_amb, 'confirmed', (v_day + time '09:00') at time zone 'Pacific/Auckland', (v_day + time '10:00') at time zone 'Pacific/Auckland')
    returning id into v_s1;
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_b1, v_school, v_amb, 'confirmed', (v_day + time '10:00') at time zone 'Pacific/Auckland', (v_day + time '11:00') at time zone 'Pacific/Auckland')
    returning id into v_s2;
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_b1, v_school, v_other_amb, 'confirmed', (v_day + time '11:00') at time zone 'Pacific/Auckland', (v_day + time '12:00') at time zone 'Pacific/Auckland')
    returning id into v_s3;
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_b1, v_school, v_amb, 'cancelled', (v_day + time '12:00') at time zone 'Pacific/Auckland', (v_day + time '13:00') at time zone 'Pacific/Auckland')
    returning id into v_s4;
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_b1, v_school, v_amb, 'confirmed', (v_day - 1 + time '09:00') at time zone 'Pacific/Auckland', (v_day - 1 + time '10:00') at time zone 'Pacific/Auckland')
    returning id into v_s5;
  -- Booking 2: same school, ambassador and day, separate booking.
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_b2, v_school, v_amb, 'confirmed', (v_day + time '13:00') at time zone 'Pacific/Auckland', (v_day + time '14:00') at time zone 'Pacific/Auckland')
    returning id into v_s6;
  -- Booking 3: sourced by v_amb, two sessions.
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_b3, v_school, v_amb, 'confirmed', (v_day + time '14:00') at time zone 'Pacific/Auckland', (v_day + time '15:00') at time zone 'Pacific/Auckland')
    returning id into v_s7;
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_b3, v_school, v_amb, 'confirmed', (v_day + time '15:00') at time zone 'Pacific/Auckland', (v_day + time '16:00') at time zone 'Pacific/Auckland')
    returning id into v_s8;
  -- Booking 4: a single session with a small group.
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_b4, v_school, v_amb, 'confirmed', (v_day + time '16:00') at time zone 'Pacific/Auckland', (v_day + time '17:00') at time zone 'Pacific/Auckland')
    returning id into v_s9;

  -- 1. Reporting the second session covers the first: one $300 payment.
  select * into v_result from public.submit_ambassador_report_group(v_s2, v_amb, null, v_report, 25000, 5000, 5000, 10000, 100, false);
  if v_result.outcome <> 'submitted' or v_result.session_count <> 2 or v_result.covered_session_ids <> array[v_s1] then
    raise exception 'FAIL 1: grouped submission %', row_to_json(v_result);
  end if;
  select * into v_payment from public.payments where id = v_result.payment_id;
  if v_payment.amount_cents <> 30000 or v_payment.base_amount_cents <> 25000
    or v_payment.additional_session_cents <> 5000 or v_payment.sourcing_bonus_cents <> 0 then
    raise exception 'FAIL 1: pair should pay $250 + $50 = $300, got %', row_to_json(v_payment);
  end if;
  v_report_id := v_result.report_id;

  select count(*) into v_count from public.booking_sessions
    where id in (v_s1, v_s2) and status = 'report_submitted' and report_status = 'submitted';
  if v_count <> 2 then raise exception 'FAIL 1: both paired sessions should be report_submitted'; end if;
  if exists (select 1 from public.booking_sessions where id in (v_s3, v_s5) and report_status <> 'not_submitted')
    or (select status from public.booking_sessions where id = v_s4) <> 'cancelled' then
    raise exception 'FAIL 1: other ambassador, other day and cancelled sessions must be untouched';
  end if;
  if (select status from public.booking_requests where id = v_b1) = 'report_submitted' then
    raise exception 'FAIL 1: booking 1 still has unreported sessions and must not roll forward';
  end if;

  -- 2. Retries and sibling submissions don't pay twice.
  select * into v_result from public.submit_ambassador_report_group(v_s2, v_amb, null, v_report, 25000, 5000, 5000, 10000, 100, false);
  if v_result.outcome <> 'session-not-finished' then raise exception 'FAIL 2: retry %', v_result.outcome; end if;
  select * into v_result from public.submit_ambassador_report_group(v_s1, v_amb, null, v_report, 25000, 5000, 5000, 10000, 100, false);
  if v_result.outcome <> 'session-not-finished' then raise exception 'FAIL 2: covered sibling %', v_result.outcome; end if;
  select * into v_result from public.submit_ambassador_report_group(v_s3, v_amb, null, v_report, 25000, 5000, 5000, 10000, 100, false);
  if v_result.outcome <> 'session-not-assigned' then raise exception 'FAIL 2: other ambassador %', v_result.outcome; end if;
  select count(*) into v_count from public.payments where booking_session_id in (v_s1, v_s2) and ambassador_profile_id = v_amb;
  if v_count <> 1 then raise exception 'FAIL 2: expected exactly one payment for the pair, found %', v_count; end if;

  -- Legacy coverage: before 0054 a sibling could remain unmarked after a report.
  -- It must not create another full-rate payment now.
  update public.booking_sessions set status='confirmed', report_status='not_submitted' where id=v_s1;
  select * into v_result from public.submit_ambassador_report_group(v_s1, v_amb, null, v_report, 25000, 5000, 5000, 10000, 100, false);
  if v_result.outcome <> 'group-already-reported' then
    raise exception 'FAIL legacy: an older sibling report must require staff review, got %', v_result.outcome;
  end if;
  select count(*) into v_count from public.payments where booking_session_id in (v_s1, v_s2) and ambassador_profile_id=v_amb;
  if v_count <> 1 then raise exception 'FAIL legacy: duplicate payment created'; end if;
  update public.booking_sessions set status='report_submitted', report_status='submitted' where id=v_s1;

  -- 3. A separate booking at the same school and day is its own $250 report;
  --    any adjustment is a manual staff extra at approval.
  select * into v_result from public.submit_ambassador_report_group(v_s6, v_amb, null, v_report, 25000, 5000, 5000, 10000, 100, false);
  if v_result.outcome <> 'submitted' or v_result.session_count <> 1 or v_result.amount_cents <> 25000 then
    raise exception 'FAIL 3: separate booking %', row_to_json(v_result);
  end if;

  -- 4. Sourced pair: sourcing bonus stays separate. $250 + $50 + $50.
  select * into v_result from public.submit_ambassador_report_group(v_s7, v_amb, null, v_report, 25000, 5000, 5000, 10000, 100, true);
  select * into v_payment from public.payments where id = v_result.payment_id;
  if v_payment.amount_cents <> 35000 or v_payment.sourcing_bonus_cents <> 5000 or v_payment.additional_session_cents <> 5000 then
    raise exception 'FAIL 4: sourced pair %', row_to_json(v_payment);
  end if;

  -- 5. Below the attendee threshold: report saved, no payment.
  select * into v_result from public.submit_ambassador_report_group(
    v_s9, v_amb, null, jsonb_set(v_report, '{attendee_count}', '40'), 25000, 5000, 5000, 10000, 100, false);
  if v_result.outcome <> 'submitted' or v_result.payment_id is not null or v_result.payment_status <> 'not_eligible' then
    raise exception 'FAIL 5: below threshold %', row_to_json(v_result);
  end if;
  if (select status from public.booking_requests where id = v_b4) <> 'report_submitted' then
    raise exception 'FAIL 5: a fully reported booking rolls forward';
  end if;

  -- 6. A same-day session still running blocks the day's report.
  if (now() at time zone 'Pacific/Auckland')::time >= time '02:00' then
    insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
      values (v_b4, v_school, v_other_amb, 'confirmed', now() - interval '90 minutes', now() - interval '60 minutes')
      returning id into v_s10;
    insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
      values (v_b4, v_school, v_other_amb, 'confirmed', now() - interval '30 minutes', now() + interval '30 minutes');
    select * into v_result from public.submit_ambassador_report_group(v_s10, v_other_amb, null, v_report, 25000, 5000, 5000, 10000, 100, false);
    if v_result.outcome <> 'report-day-not-finished' then raise exception 'FAIL 6: %', v_result.outcome; end if;
  end if;

  -- 7. Approval with a manual $50 extra recomputes the total from the parts.
  select * into v_result from public.approve_ambassador_report_payment(
    v_report_id, null, 'INV-0054-CHECK', 'Check Ambassador', '12-3456-7890123-00', null, null, null,
    'finance@example.test', 5000, false, 'Third session, separate booking');
  if not v_result.did_approve then raise exception 'FAIL 7: approval did not apply'; end if;
  select * into v_payment from public.payments where id = v_result.payment_id;
  if v_payment.status <> 'approved' or v_payment.amount_cents <> 35000 or v_payment.extra_amount_cents <> 5000
    or v_payment.finance_email_status is not null or v_payment.finance_confirmation_token_hash is not null then
    raise exception 'FAIL 7: approved payment %', row_to_json(v_payment);
  end if;
  select * into v_result from public.approve_ambassador_report_payment(
    v_report_id, null, 'INV-0054-CHECK', 'Check Ambassador', '12-3456-7890123-00', null, null, null,
    'finance@example.test', 5000, false, 'Third session, separate booking');
  if v_result.did_approve then raise exception 'FAIL 7: approval must be idempotent'; end if;
  if (select amount_cents from public.payments where id = v_payment.id) <> 35000 then
    raise exception 'FAIL 7: repeat approval changed the amount';
  end if;

  -- 8. No-payment approval: every part is $0, the replaced amount is recorded.
  select id into v_report_id from public.ambassador_reports where booking_session_id = v_s6;
  select * into v_result from public.approve_ambassador_report_payment(
    v_report_id, null, null, null, null, null, null, null, null, 0, true, 'Paid as an extra on INV-0054-CHECK');
  select * into v_payment from public.payments where booking_session_id = v_s6;
  if v_payment.status <> 'not_eligible' or v_payment.amount_cents <> 0 or v_payment.base_amount_cents <> 0
    or v_payment.eligibility_reason not like '%replaced 25000 cents%' then
    raise exception 'FAIL 8: no-payment approval %', row_to_json(v_payment);
  end if;

  -- 9. Invalid extras and missing notes are rejected inside the RPC.
  select id into v_report_id from public.ambassador_reports where booking_session_id = v_s7;
  foreach v_count in array array[5050, 25100, -100] loop
    v_failed := false;
    begin
      perform public.approve_ambassador_report_payment(
        v_report_id, null, 'INV-0054-BAD', 'Check Ambassador', '12-3456-7890123-00', null, null, null,
        'finance@example.test', v_count, false, 'note');
    exception when others then
      v_failed := true;
    end;
    if not v_failed then raise exception 'FAIL 9: extra % should be rejected', v_count; end if;
  end loop;
  v_failed := false;
  begin
    perform public.approve_ambassador_report_payment(
      v_report_id, null, 'INV-0054-BAD', 'Check Ambassador', '12-3456-7890123-00', null, null, null,
      'finance@example.test', 5000, false, '  ');
  exception when others then
    v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL 9: an extra without a note should be rejected'; end if;
  if (select reviewed_for_payment_at from public.ambassador_reports where id = v_report_id) is not null then
    raise exception 'FAIL 9: a rejected approval must not mark the report reviewed';
  end if;

  -- 10. The breakdown check rejects a total that doesn't add up.
  v_failed := false;
  begin
    update public.payments set amount_cents = amount_cents + 1 where booking_session_id = v_s7;
  exception when check_violation then
    v_failed := true;
  end;
  if not v_failed then raise exception 'FAIL 10: mismatched total accepted'; end if;

  -- 11. Finance email claims: one writer, stale completions change nothing,
  --     and a paid payment stays paid.
  select id into v_payment.id from public.payments where booking_session_id = v_s2;
  select * into v_claim from public.claim_finance_payment_email(
    v_payment.id, null, 'hash-one', now() + interval '30 days', 'finance@example.test', 600);
  if v_claim.claim_id is null or not v_claim.first_send then raise exception 'FAIL 11: first claim'; end if;
  if exists (select 1 from public.claim_finance_payment_email(
      v_payment.id, null, 'hash-two', now() + interval '30 days', 'finance@example.test', 600)) then
    raise exception 'FAIL 11: a second claim while one is pending must be refused';
  end if;
  if public.complete_finance_payment_email(v_payment.id, gen_random_uuid(), true, null, null) then
    raise exception 'FAIL 11: completion with the wrong claim must be ignored';
  end if;
  if not public.complete_finance_payment_email(v_payment.id, v_claim.claim_id, true, null, null) then
    raise exception 'FAIL 11: completion with the right claim';
  end if;
  select * into v_payment from public.payments where id = v_payment.id;
  if v_payment.finance_email_status <> 'sent' or v_payment.finance_confirmation_token_hash <> 'hash-one'
    or v_payment.finance_email_attempts <> 1 then
    raise exception 'FAIL 11: after send %', row_to_json(v_payment);
  end if;
  if public.complete_finance_payment_email(v_payment.id, v_claim.claim_id, false, 'late failure', null) then
    raise exception 'FAIL 11: a completed claim must not be completed again';
  end if;
  if exists (select 1 from public.claim_finance_payment_email(
      v_payment.id, null, 'hash-three', now() + interval '30 days', 'finance@example.test', 600)) then
    raise exception 'FAIL 11: a payment with a live link must not be re-sent';
  end if;
  update public.payments set status = 'paid', paid_at = now() where id = v_payment.id;
  if exists (select 1 from public.claim_finance_payment_email(
      v_payment.id, null, 'hash-four', now() + interval '30 days', 'finance@example.test', 600)) then
    raise exception 'FAIL 11: a paid payment must not be claimed';
  end if;

  -- 12. Staff reschedules can't double-book the ambassador; touching is fine.
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at, reschedule_previous_status)
    values (v_b2, v_school, v_other_amb, 'reschedule_requested', now() + interval '20 days', now() + interval '20 days 1 hour', 'confirmed')
    returning id into v_r1;
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_b3, v_school, v_other_amb, 'confirmed', now() + interval '30 days', now() + interval '30 days 1 hour')
    returning id into v_r2;
  select * into v_result from public.resolve_session_reschedule(
    v_r1, 'approve', now() + interval '30 days 30 minutes', now() + interval '30 days 90 minutes');
  if v_result.outcome <> 'ambassador-conflict' or v_result.conflict_session_id <> v_r2 then
    raise exception 'FAIL 12: overlap %', row_to_json(v_result);
  end if;
  if (select status from public.booking_sessions where id = v_r1) <> 'reschedule_requested' then
    raise exception 'FAIL 12: a refused reschedule must leave the session unchanged';
  end if;
  select * into v_result from public.resolve_session_reschedule(
    v_r1, 'approve', now() + interval '30 days 1 hour', now() + interval '30 days 2 hours');
  if v_result.outcome <> 'resolved' or v_result.restored_status <> 'confirmed' then
    raise exception 'FAIL 12: touching time %', row_to_json(v_result);
  end if;
  select * into v_result from public.resolve_session_reschedule(v_r1, 'approve', now() + interval '40 days', now() + interval '40 days 1 hour');
  if v_result.outcome <> 'not-pending' then raise exception 'FAIL 12: already resolved %', v_result.outcome; end if;

  raise notice '0054 checks passed';
end;
$$;

rollback;
