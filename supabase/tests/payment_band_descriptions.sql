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

DO $$ DECLARE s uuid; a uuid; r record; gap integer; reason text; BEGIN
 insert into public.schools(name) values('Band wording rollback fixture') returning id into s;
 insert into public.ambassador_profiles(user_id,status,display_name) values(null,'approved','Band fixture') returning id into a;
 FOREACH gap IN ARRAY ARRAY[90,120] LOOP
  SELECT * INTO r FROM pg_temp.submit_pair(a,s,gap,false,0,150,true);
  SELECT eligibility_reason INTO reason FROM public.payments WHERE id=r.payment_id;
  IF gap=90 AND reason NOT LIKE '%under 2 hours%' THEN RAISE EXCEPTION 'FAIL short gap description: %',reason; END IF;
  IF gap=120 AND reason NOT LIKE '%2 to under 4 hours%' THEN RAISE EXCEPTION 'FAIL extended description: %',reason; END IF;
 END LOOP;
 RAISE NOTICE 'PASS new stored descriptions match current boundaries';
END $$;
ROLLBACK;
