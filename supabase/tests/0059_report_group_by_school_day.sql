-- Checks for one report per ambassador, school and NZ day (0059). Run against a
-- local database with 0054-0059 applied, e.g.
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0059_report_group_by_school_day.sql
-- Everything runs in one transaction and is rolled back. A failed check raises
-- "FAIL: ..."; success ends with "0059 checks passed". All fixtures are created
-- here. Amounts are passed as the app passes them: 0 for the pair add-on, which
-- staff add at approval.

begin;

create function pg_temp.nzt(p_day date, p_time time) returns timestamptz
language sql immutable as $$ select (p_day + p_time) at time zone 'Pacific/Auckland' $$;

create function pg_temp.report(p_attendees integer default 150) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'presenter_name', '0059 Ambassador',
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

create function pg_temp.school(p_name text) returns uuid
language sql as $$ insert into public.schools (name) values (p_name) returning id $$;

create function pg_temp.ambassador(p_name text) returns uuid
language sql as $$
  insert into public.ambassador_profiles (user_id, status, display_name)
  values (null, 'approved', p_name) returning id
$$;

create function pg_temp.booking(p_school uuid) returns uuid
language sql as $$
  insert into public.booking_requests (school_id, status) values (p_school, 'confirmed') returning id
$$;

create function pg_temp.session(
  p_booking uuid, p_school uuid, p_amb uuid, p_start timestamptz, p_end timestamptz,
  p_status text default 'confirmed'
) returns uuid
language sql as $$
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
  values (p_booking, p_school, p_amb, p_status, p_start, p_end) returning id
$$;

create function pg_temp.submit(p_session uuid, p_amb uuid, p_attendees integer default 150)
returns setof record
language sql as $$
  select submitted.outcome, submitted.report_id, submitted.payment_id, submitted.session_count,
    submitted.amount_cents, submitted.payment_tier, submitted.covered_session_ids
  from public.submit_ambassador_report_group(
    p_session, p_amb, null, pg_temp.report(p_attendees), 25000, 5000, 0, 0, 100, false
  ) submitted
$$;

do $$
declare
  v_yesterday date := (now() at time zone 'Pacific/Auckland')::date - 1;
  v_before date := (now() at time zone 'Pacific/Auckland')::date - 2;
  v_school uuid;
  v_amb uuid;
  v_other_amb uuid;
  v_b1 uuid;
  v_b2 uuid;
  v_b3 uuid;
  v_s1 uuid;
  v_s2 uuid;
  v_s3 uuid;
  v_s4 uuid;
  v_outcome text;
  v_report uuid;
  v_payment uuid;
  v_count integer;
  v_amount integer;
  v_tier text;
  v_covered uuid[];
  v_number integer;
  v_status text;
begin
  -- 1. Two back-to-back sessions booked separately: one report, one payment.
  v_school := pg_temp.school('0059 Separate Bookings');
  v_amb := pg_temp.ambassador('0059 Ambassador');
  v_b1 := pg_temp.booking(v_school);
  v_b2 := pg_temp.booking(v_school);
  v_s1 := pg_temp.session(v_b1, v_school, v_amb, pg_temp.nzt(v_yesterday, '09:30'), pg_temp.nzt(v_yesterday, '09:40'));
  v_s2 := pg_temp.session(v_b2, v_school, v_amb, pg_temp.nzt(v_yesterday, '10:00'), pg_temp.nzt(v_yesterday, '10:10'));

  select outcome, report_id, payment_id, session_count, amount_cents, payment_tier, covered_session_ids
  into v_outcome, v_report, v_payment, v_count, v_amount, v_tier, v_covered
  from pg_temp.submit(v_s1, v_amb)
    as (outcome text, report_id uuid, payment_id uuid, session_count integer, amount_cents integer, payment_tier text, covered_session_ids uuid[]);

  if v_outcome <> 'submitted' or v_count <> 2 or v_tier <> 'pair_within_60' or v_amount <> 25000 or v_covered <> array[v_s2] then
    raise exception 'FAIL 1: separate bookings not grouped: % % % % %', v_outcome, v_count, v_tier, v_amount, v_covered;
  end if;

  select count(*) into v_number from public.payments where booking_session_id in (v_s1, v_s2);
  if v_number <> 1 then raise exception 'FAIL 1: expected one payment, got %', v_number; end if;

  select count(*) into v_number from public.ambassador_reports where booking_session_id in (v_s1, v_s2);
  if v_number <> 1 then raise exception 'FAIL 1: expected one report, got %', v_number; end if;

  select count(*) into v_number from public.booking_sessions
  where id in (v_s1, v_s2) and status = 'report_submitted' and report_status = 'submitted';
  if v_number <> 2 then raise exception 'FAIL 1: both sessions should be reported, got %', v_number; end if;

  select count(*) into v_number from public.booking_requests where id in (v_b1, v_b2) and status = 'report_submitted';
  if v_number <> 2 then raise exception 'FAIL 1: both bookings should roll up, got %', v_number; end if;

  -- The finance invoice reads this record, and it names the other booking.
  select count(*) into v_number from public.booking_activity_logs
  where action = 'report.covered_by_same_day_report' and booking_session_id = v_s2
    and booking_request_id = v_b2 and details->>'report_id' = v_report::text;
  if v_number <> 1 then raise exception 'FAIL 1: coverage record missing or on the wrong booking'; end if;

  -- 2. The other session can't be reported a second time.
  select outcome into v_outcome
  from pg_temp.submit(v_s2, v_amb)
    as (outcome text, report_id uuid, payment_id uuid, session_count integer, amount_cents integer, payment_tier text, covered_session_ids uuid[]);
  if v_outcome = 'submitted' then raise exception 'FAIL 2: covered session was reported again'; end if;

  -- 3. Staff add the $50 at approval, so the pair pays $300 in total.
  perform public.approve_ambassador_report_payment(
    p_report_id => v_report,
    p_actor_id => null,
    p_invoice_number => 'INV-0059-1',
    p_bank_account_name => '0059 Ambassador',
    p_bank_account_number => '01-0000-0000000-00',
    p_finance_email => 'finance@example.test',
    p_extra_amount_cents => 5000,
    p_payment_note => 'Second session'
  );
  select amount_cents, status into v_amount, v_status from public.payments where id = v_payment;
  if v_amount <> 30000 or v_status <> 'approved' then
    raise exception 'FAIL 3: pair should pay $300, got % %', v_amount, v_status;
  end if;

  -- 4. One booking over two days: a report and a payment for each day.
  v_school := pg_temp.school('0059 Two Days');
  v_b1 := pg_temp.booking(v_school);
  v_s1 := pg_temp.session(v_b1, v_school, v_amb, pg_temp.nzt(v_before, '09:00'), pg_temp.nzt(v_before, '09:10'));
  v_s2 := pg_temp.session(v_b1, v_school, v_amb, pg_temp.nzt(v_before, '11:30'), pg_temp.nzt(v_before, '11:40'));
  v_s3 := pg_temp.session(v_b1, v_school, v_amb, pg_temp.nzt(v_yesterday, '09:00'), pg_temp.nzt(v_yesterday, '09:10'));
  v_s4 := pg_temp.session(v_b1, v_school, v_amb, pg_temp.nzt(v_yesterday, '11:30'), pg_temp.nzt(v_yesterday, '11:40'));

  select outcome, session_count, payment_tier into v_outcome, v_count, v_tier
  from pg_temp.submit(v_s1, v_amb, 220)
    as (outcome text, report_id uuid, payment_id uuid, session_count integer, amount_cents integer, payment_tier text, covered_session_ids uuid[]);
  if v_outcome <> 'submitted' or v_count <> 2 or v_tier <> 'pair_120_to_240' then
    raise exception 'FAIL 4: first day % % %', v_outcome, v_count, v_tier;
  end if;

  select status into v_status from public.booking_requests where id = v_b1;
  if v_status = 'report_submitted' then raise exception 'FAIL 4: booking rolled up with a day still to report'; end if;

  select outcome, session_count into v_outcome, v_count
  from pg_temp.submit(v_s3, v_amb, 180)
    as (outcome text, report_id uuid, payment_id uuid, session_count integer, amount_cents integer, payment_tier text, covered_session_ids uuid[]);
  if v_outcome <> 'submitted' or v_count <> 2 then raise exception 'FAIL 4: second day % %', v_outcome, v_count; end if;

  select count(*) into v_number from public.payments where booking_session_id in (v_s1, v_s2, v_s3, v_s4);
  if v_number <> 2 then raise exception 'FAIL 4: expected a payment per day, got %', v_number; end if;

  select status into v_status from public.booking_requests where id = v_b1;
  if v_status <> 'report_submitted' then raise exception 'FAIL 4: booking did not roll up, %', v_status; end if;

  -- 5. Another school on the same day stays separate.
  v_school := pg_temp.school('0059 School A');
  v_b1 := pg_temp.booking(v_school);
  v_s1 := pg_temp.session(v_b1, v_school, v_amb, pg_temp.nzt(v_yesterday, '13:00'), pg_temp.nzt(v_yesterday, '13:10'));
  v_b2 := pg_temp.booking(pg_temp.school('0059 School B'));
  v_s2 := pg_temp.session(v_b2, (select school_id from public.booking_requests where id = v_b2), v_amb,
    pg_temp.nzt(v_yesterday, '13:30'), pg_temp.nzt(v_yesterday, '13:40'));
  select outcome, session_count into v_outcome, v_count
  from pg_temp.submit(v_s1, v_amb)
    as (outcome text, report_id uuid, payment_id uuid, session_count integer, amount_cents integer, payment_tier text, covered_session_ids uuid[]);
  if v_outcome <> 'submitted' or v_count <> 1 then raise exception 'FAIL 5: other school grouped % %', v_outcome, v_count; end if;

  -- 6. Another ambassador at the same school stays separate.
  v_school := pg_temp.school('0059 Two Ambassadors');
  v_other_amb := pg_temp.ambassador('0059 Other Ambassador');
  v_b1 := pg_temp.booking(v_school);
  v_b2 := pg_temp.booking(v_school);
  v_s1 := pg_temp.session(v_b1, v_school, v_amb, pg_temp.nzt(v_yesterday, '09:00'), pg_temp.nzt(v_yesterday, '09:10'));
  v_s2 := pg_temp.session(v_b2, v_school, v_other_amb, pg_temp.nzt(v_yesterday, '09:30'), pg_temp.nzt(v_yesterday, '09:40'));
  select outcome, session_count into v_outcome, v_count
  from pg_temp.submit(v_s1, v_amb)
    as (outcome text, report_id uuid, payment_id uuid, session_count integer, amount_cents integer, payment_tier text, covered_session_ids uuid[]);
  if v_outcome <> 'submitted' or v_count <> 1 then raise exception 'FAIL 6: other ambassador grouped % %', v_outcome, v_count; end if;
  select outcome into v_outcome
  from pg_temp.submit(v_s2, v_other_amb)
    as (outcome text, report_id uuid, payment_id uuid, session_count integer, amount_cents integer, payment_tier text, covered_session_ids uuid[]);
  if v_outcome <> 'submitted' then raise exception 'FAIL 6: other ambassador blocked: %', v_outcome; end if;

  -- 7. A cancelled session in another booking isn't covered or counted.
  v_school := pg_temp.school('0059 Cancelled Neighbour');
  v_b1 := pg_temp.booking(v_school);
  v_b2 := pg_temp.booking(v_school);
  v_s1 := pg_temp.session(v_b1, v_school, v_amb, pg_temp.nzt(v_yesterday, '09:00'), pg_temp.nzt(v_yesterday, '09:10'));
  v_s2 := pg_temp.session(v_b2, v_school, v_amb, pg_temp.nzt(v_yesterday, '09:30'), pg_temp.nzt(v_yesterday, '09:40'), 'cancelled');
  select outcome, session_count, payment_tier into v_outcome, v_count, v_tier
  from pg_temp.submit(v_s1, v_amb)
    as (outcome text, report_id uuid, payment_id uuid, session_count integer, amount_cents integer, payment_tier text, covered_session_ids uuid[]);
  if v_outcome <> 'submitted' or v_count <> 1 or v_tier <> 'single' then
    raise exception 'FAIL 7: cancelled session counted % % %', v_outcome, v_count, v_tier;
  end if;
  select status into v_status from public.booking_sessions where id = v_s2;
  if v_status <> 'cancelled' then raise exception 'FAIL 7: cancelled session changed to %', v_status; end if;

  -- 8. A session still to come that day in another booking holds the report.
  v_school := pg_temp.school('0059 Later Today');
  v_b1 := pg_temp.booking(v_school);
  v_b2 := pg_temp.booking(v_school);
  v_s1 := pg_temp.session(v_b1, v_school, v_amb, now() - interval '3 minutes', now() - interval '2 minutes');
  v_s2 := pg_temp.session(v_b2, v_school, v_amb, now() + interval '1 minute', now() + interval '2 minutes');
  select outcome into v_outcome
  from pg_temp.submit(v_s1, v_amb)
    as (outcome text, report_id uuid, payment_id uuid, session_count integer, amount_cents integer, payment_tier text, covered_session_ids uuid[]);
  if v_outcome <> 'report-day-not-finished' then raise exception 'FAIL 8: expected a hold, got %', v_outcome; end if;

  -- 9. Three sessions across bookings go to staff for a custom review.
  v_school := pg_temp.school('0059 Three Sessions');
  v_b1 := pg_temp.booking(v_school);
  v_b2 := pg_temp.booking(v_school);
  v_b3 := pg_temp.booking(v_school);
  v_s1 := pg_temp.session(v_b1, v_school, v_amb, pg_temp.nzt(v_yesterday, '09:00'), pg_temp.nzt(v_yesterday, '09:10'));
  v_s2 := pg_temp.session(v_b2, v_school, v_amb, pg_temp.nzt(v_yesterday, '09:30'), pg_temp.nzt(v_yesterday, '09:40'));
  v_s3 := pg_temp.session(v_b3, v_school, v_amb, pg_temp.nzt(v_yesterday, '10:00'), pg_temp.nzt(v_yesterday, '10:10'));
  select outcome, session_count, payment_tier into v_outcome, v_count, v_tier
  from pg_temp.submit(v_s1, v_amb)
    as (outcome text, report_id uuid, payment_id uuid, session_count integer, amount_cents integer, payment_tier text, covered_session_ids uuid[]);
  if v_outcome <> 'submitted' or v_count <> 3 or v_tier <> 'custom_review' then
    raise exception 'FAIL 9: three sessions % % %', v_outcome, v_count, v_tier;
  end if;

  raise notice '0059 checks passed';
end;
$$;

rollback;
