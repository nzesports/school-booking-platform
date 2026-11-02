-- Checks for 0055_group_integrity. Run against a local database that has the
-- migration applied, e.g.
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0055_group_integrity.sql
-- Everything runs in one transaction and is rolled back. A failed check
-- raises "FAIL: ..."; success ends with "0055 checks passed".
--
-- The actor checks need real portal users, so the test borrows one existing
-- active staff profile and one existing active, approved ambassador user from
-- the local (demo) data, read-only; it never touches their credentials. Every
-- booking, school and extra (directory-only) ambassador is created here.
-- Sessions sit 40+ days ahead, at times demo data doesn't use, so the actor
-- ambassador's own demo sessions can't clash with them.

begin;

create function pg_temp.nz(p_day date, p_time time) returns timestamptz
language sql immutable as $$ select (p_day + p_time) at time zone 'Pacific/Auckland' $$;

create function pg_temp.sess(
  p_booking uuid, p_school uuid, p_ambassador uuid, p_status text, p_day date, p_start time, p_end time
) returns uuid
language sql as $$
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
  values (p_booking, p_school, p_ambassador, p_status, pg_temp.nz(p_day, p_start), pg_temp.nz(p_day, p_end))
  returning id
$$;

do $$
declare
  v_staff uuid;
  v_amb_user uuid;
  v_amb uuid;
  v_dir1 uuid;
  v_dir2 uuid;
  v_dir3 uuid;
  v_dir4 uuid;
  v_dir5 uuid;
  v_school uuid;
  v_d1 date := (now() at time zone 'Pacific/Auckland')::date + 41;
  v_d2 date := (now() at time zone 'Pacific/Auckland')::date + 43;
  v_d3 date := (now() at time zone 'Pacific/Auckland')::date + 45;
  v_b1 uuid; v_b2 uuid; v_b3 uuid; v_b4 uuid; v_b5 uuid; v_b6 uuid; v_b7 uuid; v_b7b uuid; v_b8 uuid; v_b9 uuid;
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid;
  v_s1b uuid; v_s2b uuid;
  v_s5 uuid; v_s6 uuid; v_s7 uuid; v_s8 uuid; v_s9 uuid;
  v_s10 uuid; v_s11 uuid; v_s12 uuid; v_s13 uuid; v_s14 uuid; v_s15 uuid;
  v_s16 uuid; v_s17 uuid; v_s19 uuid; v_s20 uuid;
  v_s21 uuid; v_s22 uuid; v_s24 uuid; v_s25 uuid;
  v_r record;
  v_count integer;
  v_failed boolean;
begin
  -- Actors borrowed from local data -------------------------------------
  select profile.id into v_staff
  from public.profiles profile
  where profile.role in ('staff', 'super_admin') and profile.status = 'active'
  order by profile.created_at limit 1;

  select profile.id, ambassador.id into v_amb_user, v_amb
  from public.profiles profile
  join public.ambassador_profiles ambassador on ambassador.user_id = profile.id
  where profile.role = 'ambassador' and profile.status = 'active'
    and ambassador.status = 'approved' and ambassador.deleted_at is null
  order by profile.created_at limit 1;

  if v_staff is null or v_amb_user is null then
    raise exception 'SETUP: needs one active staff profile and one active approved ambassador user in the local data';
  end if;

  insert into public.schools (name) values ('0055 Check School') returning id into v_school;
  insert into public.ambassador_profiles (user_id, status, display_name) values (null, 'approved', '0055 Dir 1') returning id into v_dir1;
  insert into public.ambassador_profiles (user_id, status, display_name) values (null, 'approved', '0055 Dir 2') returning id into v_dir2;
  insert into public.ambassador_profiles (user_id, status, display_name) values (null, 'approved', '0055 Dir 3') returning id into v_dir3;
  insert into public.ambassador_profiles (user_id, status, display_name) values (null, 'approved', '0055 Dir 4') returning id into v_dir4;
  insert into public.ambassador_profiles (user_id, status, display_name) values (null, 'approved', '0055 Dir 5') returning id into v_dir5;

  -- 1. Actor validation ---------------------------------------------------
  insert into public.booking_requests (school_id, status) values (v_school, 'tentative') returning id into v_b1;
  v_s1 := pg_temp.sess(v_b1, v_school, null, 'tentative', v_d1, '09:07', '10:07');
  v_s2 := pg_temp.sess(v_b1, v_school, null, 'tentative', v_d1, '10:07', '11:07');
  v_s3 := pg_temp.sess(v_b1, v_school, null, 'cancelled', v_d1, '11:07', '12:07');
  v_s4 := pg_temp.sess(v_b1, v_school, null, 'tentative', v_d1 + 1, '09:07', '10:07');

  select * into v_r from public.apply_to_session_group(v_s1, v_staff, null);
  if v_r.outcome <> 'ambassador-not-found' then raise exception 'FAIL 1: staff applying %', v_r.outcome; end if;
  select * into v_r from public.apply_to_session_group(v_s1, gen_random_uuid(), null);
  if v_r.outcome <> 'ambassador-not-found' then raise exception 'FAIL 1: unknown actor %', v_r.outcome; end if;
  select * into v_r from public.assign_ambassador_group(v_s1, v_amb_user, v_dir1);
  if v_r.outcome <> 'not-authorized' then raise exception 'FAIL 1: ambassador assigning %', v_r.outcome; end if;
  select * into v_r from public.resolve_session_withdrawal_group(v_s1, v_amb_user, 'reopen', null);
  if v_r.outcome <> 'not-authorized' then raise exception 'FAIL 1: ambassador resolving %', v_r.outcome; end if;
  update public.ambassador_profiles set status = 'inactive' where id = v_dir5;
  select * into v_r from public.assign_ambassador_group(v_s1, v_staff, v_dir5);
  if v_r.outcome <> 'ambassador-not-approved' then raise exception 'FAIL 1: unapproved target %', v_r.outcome; end if;
  update public.ambassador_profiles set status = 'approved' where id = v_dir5;
  if exists (select 1 from public.booking_session_applications where booking_session_id in (v_s1, v_s2))
    or exists (select 1 from public.booking_sessions where id in (v_s1, v_s2) and (status <> 'tentative' or assigned_ambassador_id is not null)) then
    raise exception 'FAIL 1: a refused actor changed something';
  end if;

  -- 2. Apply: whole day, cancelled and other-day sessions untouched -------
  select * into v_r from public.apply_to_session_group(v_s1, v_amb_user, 'Both please');
  if v_r.outcome <> 'applied' or v_r.session_ids <> array[v_s1, v_s2] then
    raise exception 'FAIL 2: apply %', row_to_json(v_r);
  end if;
  select count(*) into v_count from public.booking_session_applications
    where ambassador_profile_id = v_amb and status = 'applied' and booking_session_id in (v_s1, v_s2);
  if v_count <> 2 then raise exception 'FAIL 2: expected 2 applications, got %', v_count; end if;
  if exists (select 1 from public.booking_sessions where id in (v_s1, v_s2) and status <> 'applied')
    or (select status from public.booking_sessions where id = v_s3) <> 'cancelled'
    or (select status from public.booking_sessions where id = v_s4) <> 'tentative'
    or exists (select 1 from public.booking_session_applications where booking_session_id in (v_s3, v_s4)) then
    raise exception 'FAIL 2: group membership wrong';
  end if;
  if (select status from public.booking_requests where id = v_b1) <> 'applied' then
    raise exception 'FAIL 2: booking should roll up to applied';
  end if;
  select count(*) into v_count from public.booking_status_history where booking_session_id in (v_s1, v_s2) and new_status = 'applied';
  if v_count <> 2 then raise exception 'FAIL 2: expected 2 session history rows, got %', v_count; end if;

  -- Repeats are no-ops, from either session.
  select * into v_r from public.apply_to_session_group(v_s1, v_amb_user, null);
  if v_r.outcome <> 'already-applied' then raise exception 'FAIL 2: repeat %', v_r.outcome; end if;
  select * into v_r from public.apply_to_session_group(v_s2, v_amb_user, null);
  if v_r.outcome <> 'already-applied' then raise exception 'FAIL 2: sibling repeat %', v_r.outcome; end if;
  select count(*) into v_count from public.booking_status_history where booking_session_id in (v_s1, v_s2);
  if v_count <> 2 then raise exception 'FAIL 2: a repeat wrote history'; end if;

  -- 3. Withdraw an application while another applicant remains -----------
  insert into public.booking_session_applications (booking_session_id, ambassador_profile_id, status)
    values (v_s1, v_dir1, 'applied'), (v_s2, v_dir1, 'applied');
  select * into v_r from public.withdraw_application_group(v_s2, v_amb_user, 'Can no longer make it');
  if v_r.outcome <> 'withdrawn' or v_r.session_ids <> array[v_s1, v_s2] then
    raise exception 'FAIL 3: withdraw %', row_to_json(v_r);
  end if;
  if exists (select 1 from public.booking_session_applications where ambassador_profile_id = v_amb and booking_session_id in (v_s1, v_s2) and status <> 'withdrawn')
    or exists (select 1 from public.booking_sessions where id in (v_s1, v_s2) and status <> 'applied')
    or (select status from public.booking_requests where id = v_b1) <> 'applied' then
    raise exception 'FAIL 3: another applicant keeps the sessions and booking "applied"';
  end if;
  select * into v_r from public.withdraw_application_group(v_s1, v_amb_user, 'Again');
  if v_r.outcome <> 'application-not-found' then raise exception 'FAIL 3: repeat %', v_r.outcome; end if;

  -- Re-applying after withdrawing reuses the row.
  select * into v_r from public.apply_to_session_group(v_s1, v_amb_user, null);
  if v_r.outcome <> 'applied' then raise exception 'FAIL 3: re-apply %', v_r.outcome; end if;

  -- 4. Last applicant withdraws: sessions and booking reopen --------------
  insert into public.booking_requests (school_id, status) values (v_school, 'tentative') returning id into v_b2;
  v_s1b := pg_temp.sess(v_b2, v_school, null, 'tentative', v_d1, '13:07', '14:07');
  v_s2b := pg_temp.sess(v_b2, v_school, null, 'tentative', v_d1, '14:07', '15:07');
  perform public.apply_to_session_group(v_s1b, v_amb_user, null);
  select * into v_r from public.withdraw_application_group(v_s1b, v_amb_user, 'Changed plans');
  if v_r.outcome <> 'withdrawn'
    or exists (select 1 from public.booking_sessions where id in (v_s1b, v_s2b) and status <> 'tentative')
    or (select status from public.booking_requests where id = v_b2) <> 'tentative' then
    raise exception 'FAIL 4: reopen after the last withdrawal';
  end if;

  -- 5. Assignment overlap -------------------------------------------------
  insert into public.booking_requests (school_id, status) values (v_school, 'tentative') returning id into v_b3;
  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_b4;
  v_s5 := pg_temp.sess(v_b3, v_school, null, 'tentative', v_d2, '09:07', '10:07');
  v_s6 := pg_temp.sess(v_b3, v_school, null, 'tentative', v_d2, '10:07', '11:07');
  -- Another booking: dir2 is busy 10:37-11:37 (clashes with s6).
  v_s7 := pg_temp.sess(v_b4, v_school, v_dir2, 'confirmed', v_d2, '10:37', '11:37');
  -- dir3's other session starts exactly when s6 ends: allowed.
  v_s8 := pg_temp.sess(v_b4, v_school, v_dir3, 'confirmed', v_d2, '11:07', '12:07');
  -- dir4's only overlapping sessions are cancelled or declined: ignored.
  v_s9 := pg_temp.sess(v_b4, v_school, v_dir4, 'cancelled', v_d2, '09:00', '11:00');
  perform pg_temp.sess(v_b4, v_school, v_dir4, 'declined', v_d2, '09:30', '10:30');
  insert into public.booking_session_applications (booking_session_id, ambassador_profile_id, status)
    values (v_s5, v_dir1, 'applied'), (v_s5, v_dir3, 'applied');

  select * into v_r from public.assign_ambassador_group(v_s5, v_staff, v_dir2);
  if v_r.outcome <> 'ambassador-conflict' or v_r.conflict_session_id <> v_s7 then
    raise exception 'FAIL 5: cross-booking overlap %', row_to_json(v_r);
  end if;
  if exists (select 1 from public.booking_sessions where id in (v_s5, v_s6) and assigned_ambassador_id is not null)
    or exists (select 1 from public.booking_session_applications where booking_session_id = v_s5 and status <> 'applied')
    or exists (select 1 from public.booking_status_history where booking_session_id in (v_s5, v_s6)) then
    raise exception 'FAIL 5: a refused assignment changed something';
  end if;

  select * into v_r from public.assign_ambassador_group(v_s5, v_staff, v_dir3);
  if v_r.outcome <> 'assigned' or v_r.session_ids <> array[v_s5, v_s6] or v_r.declined_ambassador_ids <> array[v_dir1] then
    raise exception 'FAIL 5: touching assignment %', row_to_json(v_r);
  end if;
  if exists (select 1 from public.booking_sessions where id in (v_s5, v_s6)
      and (assigned_ambassador_id <> v_dir3 or status <> 'ambassador_assigned' or not share_contact_with_ambassador))
    or (select status from public.booking_session_applications where booking_session_id = v_s5 and ambassador_profile_id = v_dir3) <> 'accepted'
    or (select status from public.booking_session_applications where booking_session_id = v_s5 and ambassador_profile_id = v_dir1) <> 'declined'
    or (select status from public.booking_requests where id = v_b3) <> 'ambassador_assigned' then
    raise exception 'FAIL 5: assignment result';
  end if;
  -- The other booking's sessions are exactly as they were.
  if (select assigned_ambassador_id from public.booking_sessions where id = v_s7) <> v_dir2
    or (select status from public.booking_sessions where id = v_s9) <> 'cancelled' then
    raise exception 'FAIL 5: another booking was rewritten';
  end if;

  select * into v_r from public.assign_ambassador_group(v_s6, v_staff, v_dir3);
  if v_r.outcome <> 'already-assigned' then raise exception 'FAIL 5: repeat %', v_r.outcome; end if;

  -- Replacement: cancelled/declined clashes are ignored; the replaced
  -- ambassador's accepted application is withdrawn.
  select * into v_r from public.assign_ambassador_group(v_s6, v_staff, v_dir4);
  if v_r.outcome <> 'assigned' or v_r.previous_ambassador_id <> v_dir3 or v_r.session_ids <> array[v_s5, v_s6] then
    raise exception 'FAIL 5: replacement %', row_to_json(v_r);
  end if;
  if (select status from public.booking_session_applications where booking_session_id = v_s5 and ambassador_profile_id = v_dir3) <> 'withdrawn'
    or exists (select 1 from public.booking_sessions where id in (v_s5, v_s6) and assigned_ambassador_id <> v_dir4) then
    raise exception 'FAIL 5: replacement result';
  end if;

  -- 6. Sibling pair conflict: parallel sessions can't share one ambassador.
  insert into public.booking_requests (school_id, status) values (v_school, 'tentative') returning id into v_b5;
  v_s10 := pg_temp.sess(v_b5, v_school, null, 'tentative', v_d2, '13:07', '14:07');
  v_s11 := pg_temp.sess(v_b5, v_school, null, 'tentative', v_d2, '13:37', '14:37');
  select * into v_r from public.assign_ambassador_group(v_s10, v_staff, v_dir5);
  if v_r.outcome <> 'ambassador-conflict' or v_r.conflict_session_id not in (v_s10, v_s11) then
    raise exception 'FAIL 6: sibling overlap %', row_to_json(v_r);
  end if;
  if exists (select 1 from public.booking_sessions where id in (v_s10, v_s11) and assigned_ambassador_id is not null) then
    raise exception 'FAIL 6: half the pair was assigned';
  end if;

  -- 7. Terminal sessions are protected; a non-assignable member blocks all.
  insert into public.booking_requests (school_id, status) values (v_school, 'tentative') returning id into v_b6;
  v_s12 := pg_temp.sess(v_b6, v_school, null, 'completed_pending_report', v_d3, '08:07', '09:07');
  v_s13 := pg_temp.sess(v_b6, v_school, null, 'tentative', v_d3, '09:07', '10:07');
  select * into v_r from public.assign_ambassador_group(v_s12, v_staff, v_dir5);
  if v_r.outcome <> 'session-not-assignable' then raise exception 'FAIL 7: terminal anchor %', v_r.outcome; end if;
  select * into v_r from public.assign_ambassador_group(v_s13, v_staff, v_dir5);
  if v_r.outcome <> 'assigned' or v_r.session_ids <> array[v_s13] then
    raise exception 'FAIL 7: terminal sibling must not be a member %', row_to_json(v_r);
  end if;
  if (select assigned_ambassador_id from public.booking_sessions where id = v_s12) is not null then
    raise exception 'FAIL 7: delivered session changed ambassador';
  end if;
  -- Mixed active/completed: the completed session doesn't hold the roll-up back.
  if (select status from public.booking_requests where id = v_b6) <> 'ambassador_assigned' then
    raise exception 'FAIL 7: mixed group roll-up';
  end if;

  v_s14 := pg_temp.sess(v_b6, v_school, null, 'tentative', v_d3 + 1, '09:07', '10:07');
  v_s15 := pg_temp.sess(v_b6, v_school, null, 'requested', v_d3 + 1, '10:07', '11:07');
  select * into v_r from public.assign_ambassador_group(v_s14, v_staff, v_dir5);
  if v_r.outcome <> 'same-day-group-blocked' then raise exception 'FAIL 7: blocked group %', v_r.outcome; end if;
  if exists (select 1 from public.booking_sessions where id in (v_s14, v_s15) and assigned_ambassador_id is not null) then
    raise exception 'FAIL 7: blocked group was partly assigned';
  end if;

  -- 8. Unassign the whole day; repeat is refused without changes ----------
  select * into v_r from public.assign_ambassador_group(v_s5, v_staff, null);
  if v_r.outcome <> 'unassigned' or v_r.previous_ambassador_id <> v_dir4 or v_r.session_ids <> array[v_s5, v_s6] then
    raise exception 'FAIL 8: unassign %', row_to_json(v_r);
  end if;
  if exists (select 1 from public.booking_sessions where id in (v_s5, v_s6)
      and (assigned_ambassador_id is not null or status <> 'tentative' or share_contact_with_ambassador))
    or (select status from public.booking_requests where id = v_b3) <> 'tentative' then
    raise exception 'FAIL 8: unassign result';
  end if;
  select * into v_r from public.assign_ambassador_group(v_s5, v_staff, null);
  if v_r.outcome <> 'session-not-assigned' then raise exception 'FAIL 8: repeat %', v_r.outcome; end if;

  -- 9. Withdrawal requests ------------------------------------------------
  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_b7;
  v_s16 := pg_temp.sess(v_b7, v_school, v_amb, 'confirmed', v_d3, '13:07', '14:07');
  v_s17 := pg_temp.sess(v_b7, v_school, v_amb, 'ambassador_assigned', v_d3, '14:07', '15:07');
  insert into public.booking_session_applications (booking_session_id, ambassador_profile_id, status)
    values (v_s16, v_amb, 'accepted'), (v_s17, v_amb, 'accepted');

  select * into v_r from public.request_session_withdrawal_group(v_s5, v_amb_user, 'unavailable', 'Not mine');
  if v_r.outcome <> 'not-your-session' then raise exception 'FAIL 9: not yours %', v_r.outcome; end if;

  -- An invalid reason type fails inside the call and leaves nothing behind.
  v_failed := false;
  begin
    perform public.request_session_withdrawal_group(v_s16, v_amb_user, 'bogus', 'Family emergency');
  exception when check_violation then
    v_failed := true;
  end;
  if not v_failed or exists (select 1 from public.booking_sessions where id in (v_s16, v_s17) and status = 'withdrawal_requested') then
    raise exception 'FAIL 9: a failed request must change nothing';
  end if;

  select * into v_r from public.request_session_withdrawal_group(v_s16, v_amb_user, 'unavailable', 'Family emergency');
  if v_r.outcome <> 'requested' or v_r.session_ids <> array[v_s16, v_s17] then
    raise exception 'FAIL 9: request %', row_to_json(v_r);
  end if;
  if exists (select 1 from public.booking_sessions where id in (v_s16, v_s17)
      and (status <> 'withdrawal_requested' or withdrawal_reason_type <> 'unavailable' or withdrawal_requested_at is null)) then
    raise exception 'FAIL 9: request result';
  end if;
  select * into v_r from public.request_session_withdrawal_group(v_s17, v_amb_user, 'unavailable', 'Again');
  if v_r.outcome <> 'withdrawal-already-requested' then raise exception 'FAIL 9: repeat %', v_r.outcome; end if;

  -- A sibling that can't be withdrawn from blocks the whole request.
  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_b7b;
  v_s19 := pg_temp.sess(v_b7b, v_school, v_amb, 'confirmed', v_d3, '17:07', '18:07');
  v_s20 := pg_temp.sess(v_b7b, v_school, v_amb, 'reschedule_requested', v_d3, '18:07', '19:07');
  select * into v_r from public.request_session_withdrawal_group(v_s19, v_amb_user, 'other', 'Clash at work');
  if v_r.outcome <> 'same-day-group-blocked'
    or (select status from public.booking_sessions where id = v_s19) <> 'confirmed' then
    raise exception 'FAIL 9: blocked request %', row_to_json(v_r);
  end if;

  -- 10. Withdrawal decisions ----------------------------------------------
  -- Keep: each session returns to its own prior status.
  select * into v_r from public.resolve_session_withdrawal_group(v_s17, v_staff, 'keep', null);
  if v_r.outcome <> 'resolved' or v_r.ambassador_profile_id <> v_amb
    or (select status from public.booking_sessions where id = v_s16) <> 'confirmed'
    or (select status from public.booking_sessions where id = v_s17) <> 'ambassador_assigned'
    or exists (select 1 from public.booking_sessions where id in (v_s16, v_s17) and (assigned_ambassador_id <> v_amb or withdrawal_reason is not null)) then
    raise exception 'FAIL 10: keep %', row_to_json(v_r);
  end if;
  select * into v_r from public.resolve_session_withdrawal_group(v_s17, v_staff, 'keep', null);
  if v_r.outcome <> 'no-withdrawal-pending' then raise exception 'FAIL 10: repeat %', v_r.outcome; end if;

  -- Reopen: released, applications withdrawn; a confirmed booking stays confirmed.
  perform public.request_session_withdrawal_group(v_s16, v_amb_user, 'unavailable', 'Family emergency');
  select * into v_r from public.resolve_session_withdrawal_group(v_s16, v_staff, 'reopen', 'Covered elsewhere');
  if v_r.outcome <> 'resolved' or v_r.session_ids <> array[v_s16, v_s17]
    or exists (select 1 from public.booking_sessions where id in (v_s16, v_s17) and (status <> 'tentative' or assigned_ambassador_id is not null))
    or exists (select 1 from public.booking_session_applications where booking_session_id in (v_s16, v_s17) and status <> 'withdrawn')
    or (select status from public.booking_requests where id = v_b7) <> 'confirmed' then
    raise exception 'FAIL 10: reopen %', row_to_json(v_r);
  end if;

  -- Cancel (school rebooked): the booking is cancelled once nothing is left...
  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_b8;
  v_s21 := pg_temp.sess(v_b8, v_school, v_amb, 'confirmed', v_d3 + 2, '09:07', '10:07');
  v_s22 := pg_temp.sess(v_b8, v_school, v_amb, 'confirmed', v_d3 + 2, '10:07', '11:07');
  perform public.request_session_withdrawal_group(v_s21, v_amb_user, 'school_rescheduled', 'School moved it');
  select * into v_r from public.resolve_session_withdrawal_group(v_s21, v_staff, 'cancel_rebooked', null);
  if v_r.outcome <> 'resolved' or not v_r.booking_cancelled
    or exists (select 1 from public.booking_sessions where id in (v_s21, v_s22) and status <> 'cancelled')
    or (select status from public.booking_requests where id = v_b8) <> 'cancelled' then
    raise exception 'FAIL 10: cancel_rebooked %', row_to_json(v_r);
  end if;

  -- ...but never while another session (here a paid one) remains.
  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_b9;
  v_s24 := pg_temp.sess(v_b9, v_school, v_amb, 'confirmed', v_d3 + 3, '09:07', '10:07');
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at, payment_status)
    values (v_b9, v_school, v_amb, 'paid', now() - interval '20 days', now() - interval '20 days' + interval '1 hour', 'paid')
    returning id into v_s25;
  perform public.request_session_withdrawal_group(v_s24, v_amb_user, 'school_rescheduled', 'School moved it');
  select * into v_r from public.resolve_session_withdrawal_group(v_s24, v_staff, 'cancel_rebooked', null);
  if v_r.booking_cancelled
    or (select status from public.booking_requests where id = v_b9) <> 'confirmed'
    or (select status from public.booking_sessions where id = v_s25) <> 'paid' then
    raise exception 'FAIL 10: a booking with a paid session must not be cancelled';
  end if;

  -- 11. Withdrawal replacement through assignment -------------------------
  update public.booking_sessions set status = 'withdrawal_requested', withdrawal_requested_at = now(),
    withdrawal_reason = 'Away', assigned_ambassador_id = v_dir1
    where id in (v_s10, v_s11);
  update public.booking_sessions set ends_at = pg_temp.nz(v_d2, '13:37') where id = v_s10;
  select * into v_r from public.assign_ambassador_group(v_s10, v_staff, v_dir5);
  if v_r.outcome <> 'assigned' or not v_r.replaced_withdrawal or v_r.previous_ambassador_id <> v_dir1
    or exists (select 1 from public.booking_sessions where id in (v_s10, v_s11)
      and (assigned_ambassador_id <> v_dir5 or status <> 'ambassador_assigned' or withdrawal_requested_at is not null)) then
    raise exception 'FAIL 11: replacement of a pending withdrawal %', row_to_json(v_r);
  end if;

  raise notice '0055 part 1 checks passed';
end;
$$;

-- Part 2: withdrawal cycles, school cancellation and reschedule requests,
-- staff status changes. Also borrows one existing active school user (read
-- only). The trigger below exists only inside this rolled-back transaction:
-- it makes one chosen session's status change fail, to prove a failure after
-- the parent step leaves nothing behind.

create function public.t55_fail_session_update() returns trigger
language plpgsql as $$
begin
  if new.id::text = current_setting('t55.fail_session', true) and new.status is distinct from old.status then
    raise exception 'T55 injected session update failure';
  end if;
  return new;
end;
$$;

create trigger t55_fail_session_update before update on public.booking_sessions
  for each row execute function public.t55_fail_session_update();

do $$
declare
  v_staff uuid;
  v_amb_user uuid;
  v_amb uuid;
  v_school_user uuid;
  v_school uuid;
  v_dir uuid;
  v_dir2 uuid;
  v_linked uuid;
  v_d date := (now() at time zone 'Pacific/Auckland')::date + 60;
  v_b uuid; v_b0 uuid; v_b2 uuid; v_b4 uuid; v_b5 uuid; v_b6 uuid; v_b7 uuid; v_b8 uuid; v_b9 uuid;
  v_s uuid; v_legacy uuid; v_other uuid;
  v_done uuid; v_conf uuid; v_tent uuid; v_started uuid; v_gone uuid; v_left uuid;
  v_r1 uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_o1 uuid;
  v_r record;
  v_count integer;
  v_failed boolean;
begin
  select profile.id into v_staff from public.profiles profile
  where profile.role in ('staff', 'super_admin') and profile.status = 'active' order by profile.created_at limit 1;
  select profile.id, ambassador.id into v_amb_user, v_amb
  from public.profiles profile
  join public.ambassador_profiles ambassador on ambassador.user_id = profile.id
  where profile.role = 'ambassador' and profile.status = 'active'
    and ambassador.status = 'approved' and ambassador.deleted_at is null
  order by profile.created_at limit 1;
  select profile.id into v_school_user from public.profiles profile
  where profile.role = 'school' and profile.status = 'active' order by profile.created_at limit 1;

  if v_school_user is null then
    raise exception 'SETUP: part 2 needs one active school user in the local data';
  end if;

  insert into public.schools (name) values ('0055 Part 2 School') returning id into v_school;
  insert into public.ambassador_profiles (user_id, status, display_name) values (null, 'approved', '0055 P2 Dir') returning id into v_dir;
  insert into public.ambassador_profiles (user_id, status, display_name) values (null, 'approved', '0055 P2 Dir 2') returning id into v_dir2;

  -- 12. Withdrawal "keep" restores the exact prior status, over several
  --     request cycles in one transaction (history timestamps all tie).
  insert into public.booking_requests (school_id, status) values (v_school, 'tentative') returning id into v_b;
  v_s := pg_temp.sess(v_b, v_school, null, 'tentative', v_d, '09:19', '10:19');

  select * into v_r from public.assign_ambassador_group(v_s, v_staff, v_amb);
  if v_r.outcome <> 'assigned' then raise exception 'FAIL 12: first assignment %', row_to_json(v_r); end if;
  perform public.request_session_withdrawal_group(v_s, v_amb_user, 'unavailable', 'Cycle one');
  if (select withdrawal_previous_status from public.booking_sessions where id = v_s) <> 'ambassador_assigned' then
    raise exception 'FAIL 12: the request must record its prior status';
  end if;
  perform public.resolve_session_withdrawal_group(v_s, v_staff, 'keep', null);
  if (select status from public.booking_sessions where id = v_s) <> 'ambassador_assigned' then
    raise exception 'FAIL 12: cycle one should restore ambassador_assigned';
  end if;

  perform public.request_session_withdrawal_group(v_s, v_amb_user, 'unavailable', 'Cycle two');
  perform public.resolve_session_withdrawal_group(v_s, v_staff, 'reopen', null);
  select * into v_r from public.assign_ambassador_group(v_s, v_staff, v_amb);
  if v_r.outcome <> 'assigned' then raise exception 'FAIL 12: reassignment %', row_to_json(v_r); end if;
  select * into v_r from public.update_booking_status_batch(v_staff, 'confirmed', jsonb_build_array(jsonb_build_object('id', v_b)));
  if v_r.outcome <> 'updated' or (select status from public.booking_sessions where id = v_s) <> 'confirmed' then
    raise exception 'FAIL 12: confirmation %', row_to_json(v_r);
  end if;

  perform public.request_session_withdrawal_group(v_s, v_amb_user, 'unavailable', 'Cycle three');
  perform public.resolve_session_withdrawal_group(v_s, v_staff, 'keep', null);
  if (select status from public.booking_sessions where id = v_s) <> 'confirmed' then
    raise exception 'FAIL 12: cycle three must restore confirmed, not an older history row';
  end if;
  perform public.request_session_withdrawal_group(v_s, v_amb_user, 'other', 'Cycle four');
  perform public.resolve_session_withdrawal_group(v_s, v_staff, 'keep', null);
  if (select status from public.booking_sessions where id = v_s) <> 'confirmed'
    or (select withdrawal_previous_status from public.booking_sessions where id = v_s) is not null then
    raise exception 'FAIL 12: cycle four, and the column must be cleared once resolved';
  end if;

  -- A request made before 0055 (no recorded prior status) falls back to history.
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at,
      withdrawal_requested_at, withdrawal_reason)
    values (v_b, v_school, v_amb, 'withdrawal_requested', pg_temp.nz(v_d + 1, '09:19'), pg_temp.nz(v_d + 1, '10:19'), now(), 'Legacy')
    returning id into v_legacy;
  insert into public.booking_status_history (booking_request_id, booking_session_id, old_status, new_status, reason)
    values (v_b, v_legacy, 'confirmed', 'withdrawal_requested', 'Legacy');
  perform public.resolve_session_withdrawal_group(v_legacy, v_staff, 'keep', null);
  if (select status from public.booking_sessions where id = v_legacy) <> 'confirmed' then
    raise exception 'FAIL 12: legacy fallback';
  end if;

  -- Unassigning and assigning clear a pending request's recorded status.
  perform public.request_session_withdrawal_group(v_s, v_amb_user, 'unavailable', 'Cycle five');
  perform public.assign_ambassador_group(v_s, v_staff, null);
  if (select withdrawal_previous_status from public.booking_sessions where id = v_s) is not null then
    raise exception 'FAIL 12: unassigning must clear withdrawal_previous_status';
  end if;

  -- 13. A profile linked to a portal user is assignable only while that
  --     user is an active ambassador (directory-only profiles: part 1).
  if not exists (select 1 from public.ambassador_profiles where user_id = v_school_user) then
    insert into public.ambassador_profiles (user_id, status, display_name)
      values (v_school_user, 'approved', '0055 Linked To A School User') returning id into v_linked;
    select * into v_r from public.assign_ambassador_group(v_s, v_staff, v_linked);
    if v_r.outcome <> 'ambassador-not-approved' then
      raise exception 'FAIL 13: a non-ambassador portal user must not be assigned %', v_r.outcome;
    end if;
  else
    raise notice '13 skipped: the borrowed school user already has an ambassador profile';
  end if;

  -- 14. School cancellation ------------------------------------------------
  insert into public.booking_requests (school_id, status, submitted_by_user_id)
    values (v_school, 'confirmed', v_school_user) returning id into v_b4;
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, report_status, starts_at, ends_at)
    values (v_b4, v_school, v_dir, 'report_submitted', 'submitted', now() - interval '10 days', now() - interval '10 days' + interval '1 hour')
    returning id into v_done;
  insert into public.payments (booking_session_id, ambassador_profile_id, status, eligibility_reason,
      amount_cents, base_amount_cents, sourcing_bonus_cents, additional_session_cents)
    values (v_done, v_dir, 'pending', '0055 check', 25000, 25000, 0, 0);
  v_conf := pg_temp.sess(v_b4, v_school, v_dir2, 'confirmed', v_d + 3, '09:19', '10:19');
  v_tent := pg_temp.sess(v_b4, v_school, null, 'tentative', v_d + 3, '10:19', '11:19');
  insert into public.booking_session_applications (booking_session_id, ambassador_profile_id, status) values (v_tent, v_dir, 'applied');
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_b4, v_school, v_dir, 'confirmed', now() - interval '30 minutes', now() + interval '30 minutes')
    returning id into v_started;
  v_gone := pg_temp.sess(v_b4, v_school, null, 'cancelled', v_d + 4, '09:19', '10:19');

  select * into v_r from public.cancel_school_booking(v_b4, v_staff, 'Not a school');
  if v_r.outcome <> 'booking-not-owned' then raise exception 'FAIL 14: staff actor %', v_r.outcome; end if;
  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_b0;
  select * into v_r from public.cancel_school_booking(v_b0, v_school_user, 'Not mine');
  if v_r.outcome <> 'booking-not-owned' then raise exception 'FAIL 14: someone else''s booking %', v_r.outcome; end if;

  -- Injected failure on the second session: nothing at all changes.
  perform set_config('t55.fail_session', v_tent::text, true);
  v_failed := false;
  begin
    perform public.cancel_school_booking(v_b4, v_school_user, 'Exams');
  exception when others then
    v_failed := sqlerrm like '%T55 injected%';
  end;
  perform set_config('t55.fail_session', '', true);
  if not v_failed
    or (select status from public.booking_requests where id = v_b4) <> 'confirmed'
    or (select status from public.booking_sessions where id = v_conf) <> 'confirmed'
    or (select status from public.booking_session_applications where booking_session_id = v_tent) <> 'applied'
    or exists (select 1 from public.booking_status_history where booking_request_id = v_b4) then
    raise exception 'FAIL 14: a failed cancellation must leave parent and children as they were';
  end if;

  select * into v_r from public.cancel_school_booking(v_b4, v_school_user, 'Exams');
  if v_r.outcome <> 'cancelled' or v_r.booking_cancelled or v_r.session_ids <> array[v_conf, v_tent] then
    raise exception 'FAIL 14: partial cancellation %', row_to_json(v_r);
  end if;
  if (select status from public.booking_sessions where id = v_done) <> 'report_submitted'
    or (select status from public.payments where booking_session_id = v_done) <> 'pending'
    or (select status from public.booking_sessions where id = v_started) <> 'confirmed'
    or (select status from public.booking_session_applications where booking_session_id = v_tent) <> 'declined'
    or (select status from public.booking_requests where id = v_b4) <> 'confirmed'
    or exists (select 1 from public.booking_sessions where id in (v_conf, v_tent) and (status <> 'cancelled' or share_contact_with_ambassador)) then
    raise exception 'FAIL 14: delivered, started and paid rows must stay; upcoming ones cancel';
  end if;
  select * into v_r from public.cancel_school_booking(v_b4, v_school_user, 'Again');
  if v_r.outcome <> 'booking-not-cancellable' then raise exception 'FAIL 14: repeat %', v_r.outcome; end if;

  -- Whole booking: parent and children cancelled together.
  insert into public.booking_requests (school_id, status, submitted_by_user_id)
    values (v_school, 'ambassador_assigned', v_school_user) returning id into v_b2;
  perform pg_temp.sess(v_b2, v_school, v_dir2, 'ambassador_assigned', v_d + 5, '09:19', '10:19');
  perform pg_temp.sess(v_b2, v_school, v_dir2, 'withdrawal_requested', v_d + 5, '10:19', '11:19');
  select * into v_r from public.cancel_school_booking(v_b2, v_school_user, null);
  if v_r.outcome <> 'cancelled' or not v_r.booking_cancelled
    or (select status from public.booking_requests where id = v_b2) <> 'cancelled'
    or exists (select 1 from public.booking_sessions where booking_request_id = v_b2 and status <> 'cancelled')
    or not exists (select 1 from public.booking_status_history where booking_request_id = v_b2 and booking_session_id is null and new_status = 'cancelled') then
    raise exception 'FAIL 14: whole cancellation %', row_to_json(v_r);
  end if;

  -- A cancelled booking is never revived through a leftover open session.
  v_left := pg_temp.sess(v_b2, v_school, null, 'tentative', v_d + 6, '09:19', '10:19');
  select * into v_r from public.apply_to_session_group(v_left, v_amb_user, null);
  if v_r.outcome <> 'session-not-open' then raise exception 'FAIL 14: apply revived a cancelled booking %', v_r.outcome; end if;
  select * into v_r from public.assign_ambassador_group(v_left, v_staff, v_dir);
  if v_r.outcome <> 'session-not-assignable' then raise exception 'FAIL 14: assign revived a cancelled booking %', v_r.outcome; end if;
  if (select status from public.booking_requests where id = v_b2) <> 'cancelled' then
    raise exception 'FAIL 14: cancelled booking changed';
  end if;

  -- 15. School reschedule requests ------------------------------------------
  insert into public.booking_requests (school_id, status, submitted_by_user_id)
    values (v_school, 'confirmed', v_school_user) returning id into v_b6;
  v_r1 := pg_temp.sess(v_b6, v_school, v_dir2, 'confirmed', v_d + 7, '09:19', '10:19');

  select * into v_r from public.request_school_session_reschedule(v_b6, v_r1, v_staff, v_d + 20, 'Clash', null, null);
  if v_r.outcome <> 'booking-not-owned' then raise exception 'FAIL 15: staff actor %', v_r.outcome; end if;
  select * into v_r from public.request_school_session_reschedule(v_b6, v_r1, v_school_user, v_d + 20, 'Clash', 'tentative', null);
  if v_r.outcome <> 'change-request-failed' then raise exception 'FAIL 15: stale status %', v_r.outcome; end if;
  select * into v_r from public.request_school_session_reschedule(v_b6, v_r1, v_school_user, v_d + 20, 'Clash', 'confirmed', now());
  if v_r.outcome <> 'change-request-failed' then raise exception 'FAIL 15: stale start %', v_r.outcome; end if;
  if (select status from public.booking_sessions where id = v_r1) <> 'confirmed' then
    raise exception 'FAIL 15: a refused request changed the session';
  end if;

  select * into v_r from public.request_school_session_reschedule(
    v_b6, v_r1, v_school_user, v_d + 20, 'Clash', 'confirmed', pg_temp.nz(v_d + 7, '09:19'));
  if v_r.outcome <> 'requested'
    or (select status from public.booking_sessions where id = v_r1) <> 'reschedule_requested'
    or (select reschedule_previous_status from public.booking_sessions where id = v_r1) <> 'confirmed'
    or (select reschedule_requested_date from public.booking_sessions where id = v_r1) <> v_d + 20
    or not exists (select 1 from public.booking_status_history where booking_session_id = v_r1 and new_status = 'reschedule_requested') then
    raise exception 'FAIL 15: request %', row_to_json(v_r);
  end if;
  select * into v_r from public.request_school_session_reschedule(v_b6, v_r1, v_school_user, v_d + 21, 'Again', null, null);
  if v_r.outcome <> 'session-not-reschedulable' then raise exception 'FAIL 15: repeat %', v_r.outcome; end if;
  select * into v_r from public.request_school_session_reschedule(v_b2, v_left, v_school_user, v_d + 21, 'Revive', null, null);
  if v_r.outcome <> 'session-not-reschedulable' then raise exception 'FAIL 15: cancelled booking %', v_r.outcome; end if;

  -- 16. Staff booking status ------------------------------------------------
  insert into public.booking_requests (school_id, status) values (v_school, 'tentative') returning id into v_b5;
  v_t1 := pg_temp.sess(v_b5, v_school, null, 'tentative', v_d + 8, '09:19', '10:19');
  v_t2 := pg_temp.sess(v_b5, v_school, null, 'applied', v_d + 8, '10:19', '11:19');
  insert into public.booking_sessions (booking_request_id, school_id, status, report_status, starts_at, ends_at)
    values (v_b5, v_school, 'report_submitted', 'submitted', now() - interval '5 days', now() - interval '5 days' + interval '1 hour')
    returning id into v_t3;
  v_t4 := pg_temp.sess(v_b5, v_school, null, 'cancelled', v_d + 9, '09:19', '10:19');

  select * into v_r from public.update_booking_status_batch(v_amb_user, 'confirmed', jsonb_build_array(jsonb_build_object('id', v_b5)));
  if v_r.outcome <> 'not-authorized' then raise exception 'FAIL 16: ambassador actor %', v_r.outcome; end if;
  select * into v_r from public.update_booking_status_batch(v_staff, 'confirmed',
    jsonb_build_array(jsonb_build_object('id', v_b5, 'expected_status', 'confirmed')));
  if v_r.outcome <> 'booking-status-changed' or v_r.booking_id <> v_b5 then
    raise exception 'FAIL 16: stale expected status %', row_to_json(v_r);
  end if;
  select * into v_r from public.update_booking_status_batch(v_staff, 'closed', jsonb_build_array(jsonb_build_object('id', v_b5)));
  if v_r.outcome <> 'cannot-complete-future' then raise exception 'FAIL 16: future completion %', v_r.outcome; end if;

  -- Injected failure after the parent step: the parent rolls back too.
  perform set_config('t55.fail_session', v_t2::text, true);
  v_failed := false;
  begin
    perform public.update_booking_status_batch(v_staff, 'confirmed',
      jsonb_build_array(jsonb_build_object('id', v_b5, 'expected_status', 'tentative')));
  exception when others then
    v_failed := sqlerrm like '%T55 injected%';
  end;
  perform set_config('t55.fail_session', '', true);
  if not v_failed
    or (select status from public.booking_requests where id = v_b5) <> 'tentative'
    or (select status from public.booking_sessions where id = v_t1) <> 'tentative'
    or exists (select 1 from public.booking_status_history where booking_request_id = v_b5) then
    raise exception 'FAIL 16: a failed status change must leave parent and children as they were';
  end if;

  select * into v_r from public.update_booking_status_batch(v_staff, 'confirmed',
    jsonb_build_array(jsonb_build_object('id', v_b5, 'expected_status', 'tentative')), 'Confirmed by phone');
  if v_r.outcome <> 'updated' or v_r.old_status <> 'tentative' or v_r.changed_session_ids <> array[v_t1, v_t2]
    or (select status from public.booking_requests where id = v_b5) <> 'confirmed'
    or (select status from public.booking_sessions where id = v_t3) <> 'report_submitted'
    or (select status from public.booking_sessions where id = v_t4) <> 'cancelled'
    or (select internal_notes from public.booking_requests where id = v_b5) not like '%Confirmed by phone%' then
    raise exception 'FAIL 16: confirmation %', row_to_json(v_r);
  end if;

  -- Reschedule requested remembers each session's status; confirming clears it.
  perform public.update_booking_status_batch(v_staff, 'reschedule_requested', jsonb_build_array(jsonb_build_object('id', v_b5)));
  if exists (select 1 from public.booking_sessions where id in (v_t1, v_t2)
      and (status <> 'reschedule_requested' or reschedule_previous_status <> 'confirmed')) then
    raise exception 'FAIL 16: reschedule_requested cascade';
  end if;
  perform public.update_booking_status_batch(v_staff, 'confirmed', jsonb_build_array(jsonb_build_object('id', v_b5)));
  if exists (select 1 from public.booking_sessions where id in (v_t1, v_t2)
      and (status <> 'confirmed' or reschedule_previous_status is not null)) then
    raise exception 'FAIL 16: confirming clears the reschedule';
  end if;

  -- Cancelling never touches the delivered session.
  perform public.update_booking_status_batch(v_staff, 'cancelled', jsonb_build_array(jsonb_build_object('id', v_b5)));
  if (select status from public.booking_sessions where id = v_t3) <> 'report_submitted'
    or exists (select 1 from public.booking_sessions where id in (v_t1, v_t2) and status <> 'cancelled') then
    raise exception 'FAIL 16: cancellation cascade';
  end if;

  -- Un-cancelling brings back an assigned session only if its ambassador is free.
  update public.booking_sessions set assigned_ambassador_id = v_dir where id = v_t1;
  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_b7;
  v_o1 := pg_temp.sess(v_b7, v_school, v_dir, 'confirmed', v_d + 8, '09:49', '10:49');
  select * into v_r from public.update_booking_status_batch(v_staff, 'confirmed',
    jsonb_build_array(jsonb_build_object('id', v_b5, 'expected_status', 'cancelled')));
  if v_r.outcome <> 'reinstate-ambassador-conflict' or v_r.conflict_session_id <> v_o1 or v_r.booking_id <> v_b5
    or (select status from public.booking_requests where id = v_b5) <> 'cancelled'
    or (select status from public.booking_sessions where id = v_t1) <> 'cancelled' then
    raise exception 'FAIL 16: reinstated overlap %', row_to_json(v_r);
  end if;
  update public.booking_sessions set status = 'cancelled' where id = v_o1;
  select * into v_r from public.update_booking_status_batch(v_staff, 'confirmed',
    jsonb_build_array(jsonb_build_object('id', v_b5, 'expected_status', 'cancelled')));
  if v_r.outcome <> 'updated'
    or exists (select 1 from public.booking_sessions where id in (v_t1, v_t2, v_t4) and status <> 'confirmed')
    or (select status from public.booking_sessions where id = v_t3) <> 'report_submitted' then
    raise exception 'FAIL 16: explicit staff reinstatement %', row_to_json(v_r);
  end if;

  -- A clash that already exists between live sessions doesn't block an
  -- unrelated status change.
  insert into public.booking_requests (school_id, status) values (v_school, 'tentative') returning id into v_b8;
  perform pg_temp.sess(v_b8, v_school, v_dir2, 'ambassador_assigned', v_d + 10, '09:19', '10:19');
  perform pg_temp.sess(v_b8, v_school, v_dir2, 'ambassador_assigned', v_d + 10, '09:49', '10:49');
  select * into v_r from public.update_booking_status_batch(v_staff, 'confirmed', jsonb_build_array(jsonb_build_object('id', v_b8)));
  if v_r.outcome <> 'updated' then raise exception 'FAIL 16: legacy clash blocked confirmation %', v_r.outcome; end if;

  -- Bulk: one stale booking refuses the whole batch.
  insert into public.booking_requests (school_id, status) values (v_school, 'tentative') returning id into v_b9;
  v_other := pg_temp.sess(v_b9, v_school, null, 'tentative', v_d + 11, '09:19', '10:19');
  update public.booking_requests set status = 'tentative' where id = v_b8;
  select * into v_r from public.update_booking_status_batch(v_staff, 'declined',
    jsonb_build_array(
      jsonb_build_object('id', v_b8, 'expected_status', 'tentative'),
      jsonb_build_object('id', v_b9, 'expected_status', 'confirmed')
    ), null, true);
  if v_r.outcome <> 'booking-status-changed' or v_r.booking_id <> v_b9
    or (select status from public.booking_requests where id = v_b8) <> 'tentative'
    or (select status from public.booking_sessions where id = v_other) <> 'tentative' then
    raise exception 'FAIL 16: bulk stale refusal %', row_to_json(v_r);
  end if;
  select count(*) into v_count from public.update_booking_status_batch(v_staff, 'declined',
    jsonb_build_array(
      jsonb_build_object('id', v_b8, 'expected_status', 'tentative'),
      jsonb_build_object('id', v_b9, 'expected_status', 'tentative')
    ), null, true) result where result.outcome = 'updated';
  if v_count <> 2
    or exists (select 1 from public.booking_requests where id in (v_b8, v_b9) and status <> 'declined')
    or (select status from public.booking_sessions where id = v_other) <> 'declined' then
    raise exception 'FAIL 16: bulk update';
  end if;

  raise notice '0055 part 2 checks passed';
end;
$$;

-- Part 3: insert_booking_session_checked (staff manual and ambassador-logged
-- bookings).

create function pg_temp.session_payload(
  p_target uuid, p_status text, p_starts timestamptz, p_ends timestamptz,
  p_report text default 'not_submitted', p_delivery text default 'in_person'
) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'assigned_ambassador_id', p_target,
    'status', p_status,
    'starts_at', p_starts,
    'ends_at', p_ends,
    'report_status', p_report,
    'delivery_mode', p_delivery,
    'meeting_url', case when p_delivery = 'online' then 'https://meet.example.test/x' end,
    'year_levels', 'Years 9 to 10',
    'expected_student_count', 80,
    'presentation_type_id', null,
    -- Not an allowed key: must be ignored.
    'payment_status', 'paid'
  )
$$;

do $$
declare
  v_staff uuid;
  v_amb_user uuid;
  v_amb uuid;
  v_school uuid;
  v_dir uuid;
  v_linked uuid;
  v_d date := (now() at time zone 'Pacific/Auckland')::date + 70;
  v_busy uuid; v_busy_booking uuid; v_own uuid; v_past uuid;
  v_m1 uuid; v_m2 uuid; v_m3 uuid; v_m4 uuid; v_m5 uuid; v_m6 uuid;
  v_a1 uuid; v_a2 uuid; v_a3 uuid;
  v_r record;
begin
  select profile.id into v_staff from public.profiles profile
  where profile.role in ('staff', 'super_admin') and profile.status = 'active' order by profile.created_at limit 1;
  select profile.id, ambassador.id into v_amb_user, v_amb
  from public.profiles profile
  join public.ambassador_profiles ambassador on ambassador.user_id = profile.id
  where profile.role = 'ambassador' and profile.status = 'active'
    and ambassador.status = 'approved' and ambassador.deleted_at is null
  order by profile.created_at limit 1;
  select id into v_linked from public.ambassador_profiles where display_name = '0055 Linked To A School User';

  insert into public.schools (name) values ('0055 Part 3 School') returning id into v_school;
  insert into public.ambassador_profiles (user_id, status, display_name) values (null, 'approved', '0055 P3 Dir') returning id into v_dir;

  -- dir is busy 09:00-10:00 on day d in another booking; also has a cancelled
  -- session 09:00-10:00 on d+1 and a delivered one three days ago.
  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_busy_booking;
  v_busy := pg_temp.sess(v_busy_booking, v_school, v_dir, 'confirmed', v_d, '09:00', '10:00');
  perform pg_temp.sess(v_busy_booking, v_school, v_dir, 'cancelled', v_d + 1, '09:00', '10:00');
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_busy_booking, v_school, v_dir, 'closed', now() - interval '3 days', now() - interval '3 days' + interval '1 hour')
    returning id into v_past;

  -- 17a. Staff: overlap refused, touching allowed, one session only.
  insert into public.booking_requests (school_id, status, staff_owner_id) values (v_school, 'confirmed', v_staff) returning id into v_m1;
  select * into v_r from public.insert_booking_session_checked(v_staff, v_m1,
    pg_temp.session_payload(v_dir, 'confirmed', pg_temp.nz(v_d, '09:30'), pg_temp.nz(v_d, '10:15')));
  if v_r.outcome <> 'ambassador-conflict' or v_r.conflict_session_id <> v_busy
    or exists (select 1 from public.booking_sessions where booking_request_id = v_m1) then
    raise exception 'FAIL 17a: staff overlap %', row_to_json(v_r);
  end if;
  select * into v_r from public.insert_booking_session_checked(v_staff, v_m1,
    pg_temp.session_payload(v_dir, 'confirmed', pg_temp.nz(v_d, '10:00'), pg_temp.nz(v_d, '10:45'), 'not_submitted', 'online'));
  if v_r.outcome <> 'inserted' then raise exception 'FAIL 17a: touching session %', row_to_json(v_r); end if;
  if not exists (
    select 1 from public.booking_sessions
    where id = v_r.session_id and school_id = v_school and assigned_ambassador_id = v_dir
      and share_contact_with_ambassador and payment_status = 'not_eligible' and status = 'confirmed'
      and delivery_mode = 'online' and meeting_url = 'https://meet.example.test/x' and region_id is null
  ) then
    raise exception 'FAIL 17a: inserted fields';
  end if;
  select * into v_r from public.insert_booking_session_checked(v_staff, v_m1,
    pg_temp.session_payload(null, 'tentative', pg_temp.nz(v_d + 2, '09:00'), pg_temp.nz(v_d + 2, '10:00')));
  if v_r.outcome <> 'invalid-session' then raise exception 'FAIL 17a: a second session %', v_r.outcome; end if;

  -- 17b. Cancelled sessions don't clash; unassigned sessions aren't checked.
  insert into public.booking_requests (school_id, status, staff_owner_id) values (v_school, 'confirmed', v_staff) returning id into v_m2;
  select * into v_r from public.insert_booking_session_checked(v_staff, v_m2,
    pg_temp.session_payload(v_dir, 'confirmed', pg_temp.nz(v_d + 1, '09:00'), pg_temp.nz(v_d + 1, '10:00')));
  if v_r.outcome <> 'inserted' then raise exception 'FAIL 17b: cancelled clash %', v_r.outcome; end if;

  -- 17c. Settled record-only history is saved unchecked; other past
  --      assigned sessions are checked; 'reviewed' only for settled history.
  insert into public.booking_requests (school_id, status, staff_owner_id, manual_email_only) values (v_school, 'closed', v_staff, true) returning id into v_m3;
  select * into v_r from public.insert_booking_session_checked(v_staff, v_m3,
    pg_temp.session_payload(v_dir, 'closed', pg_temp.nz(v_d, '09:00'), pg_temp.nz(v_d, '10:00'), 'reviewed'));
  if v_r.outcome <> 'invalid-session' then raise exception 'FAIL 17c: future history bypass %', v_r.outcome; end if;
  select * into v_r from public.insert_booking_session_checked(v_staff, v_m3,
    pg_temp.session_payload(v_dir, 'closed', now() - interval '3 days', now() - interval '3 days' + interval '45 minutes', 'reviewed'));
  if v_r.outcome <> 'inserted' then raise exception 'FAIL 17c: settled history %', v_r.outcome; end if;
  insert into public.booking_requests (school_id, status, staff_owner_id) values (v_school, 'completed_pending_report', v_staff) returning id into v_m4;
  select * into v_r from public.insert_booking_session_checked(v_staff, v_m4,
    pg_temp.session_payload(v_dir, 'completed_pending_report', now() - interval '3 days', now() - interval '3 days' + interval '45 minutes'));
  if v_r.outcome <> 'ambassador-conflict' or v_r.conflict_session_id not in (
      v_past, (select id from public.booking_sessions where booking_request_id = v_m3)) then
    raise exception 'FAIL 17c: past assigned session must be checked %', row_to_json(v_r);
  end if;
  select * into v_r from public.insert_booking_session_checked(v_staff, v_m4,
    pg_temp.session_payload(null, 'confirmed', pg_temp.nz(v_d + 3, '09:00'), pg_temp.nz(v_d + 3, '10:00'), 'reviewed'));
  if v_r.outcome <> 'invalid-session' then raise exception 'FAIL 17c: reviewed but not closed %', v_r.outcome; end if;
  select * into v_r from public.insert_booking_session_checked(v_staff, v_m4,
    pg_temp.session_payload(null, 'confirmed', pg_temp.nz(v_d + 3, '10:00'), pg_temp.nz(v_d + 3, '10:00')));
  if v_r.outcome <> 'invalid-session' then raise exception 'FAIL 17c: zero length %', v_r.outcome; end if;

  -- 17d. Staff ownership and target.
  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_m5;
  select * into v_r from public.insert_booking_session_checked(v_staff, v_m5,
    pg_temp.session_payload(null, 'tentative', pg_temp.nz(v_d + 4, '09:00'), pg_temp.nz(v_d + 4, '10:00')));
  if v_r.outcome <> 'not-authorized' then raise exception 'FAIL 17d: not the owner %', v_r.outcome; end if;
  select * into v_r from public.insert_booking_session_checked(gen_random_uuid(), v_m5,
    pg_temp.session_payload(null, 'tentative', pg_temp.nz(v_d + 4, '09:00'), pg_temp.nz(v_d + 4, '10:00')));
  if v_r.outcome <> 'not-authorized' then raise exception 'FAIL 17d: unknown actor %', v_r.outcome; end if;
  insert into public.booking_requests (school_id, status, staff_owner_id) values (v_school, 'confirmed', v_staff) returning id into v_m6;
  update public.ambassador_profiles set deleted_at = now() where id = v_dir;
  select * into v_r from public.insert_booking_session_checked(v_staff, v_m6,
    pg_temp.session_payload(v_dir, 'confirmed', pg_temp.nz(v_d + 5, '09:00'), pg_temp.nz(v_d + 5, '10:00')));
  if v_r.outcome <> 'ambassador-not-approved' then raise exception 'FAIL 17d: deleted target %', v_r.outcome; end if;
  update public.ambassador_profiles set deleted_at = null where id = v_dir;
  if v_linked is not null then
    select * into v_r from public.insert_booking_session_checked(v_staff, v_m6,
      pg_temp.session_payload(v_linked, 'confirmed', pg_temp.nz(v_d + 5, '09:00'), pg_temp.nz(v_d + 5, '10:00')));
    if v_r.outcome <> 'ambassador-not-approved' then
      raise exception 'FAIL 17d: linked user who is not an active ambassador %', v_r.outcome;
    end if;
  end if;
  if exists (select 1 from public.booking_sessions where booking_request_id in (v_m5, v_m6)) then
    raise exception 'FAIL 17d: a refused insert left a session';
  end if;

  -- 17e. Ambassador-logged bookings: only themselves, upcoming, in person,
  --      assigned/confirmed, free at that time, on a booking they submitted.
  insert into public.booking_requests (school_id, status, submitted_by_user_id)
    values (v_school, 'ambassador_assigned', v_amb_user) returning id into v_a1;
  v_own := pg_temp.sess(v_busy_booking, v_school, v_amb, 'confirmed', v_d + 6, '09:00', '10:00');

  select * into v_r from public.insert_booking_session_checked(v_amb_user, v_a1,
    pg_temp.session_payload(v_dir, 'ambassador_assigned', pg_temp.nz(v_d + 7, '09:00'), pg_temp.nz(v_d + 7, '10:00')));
  if v_r.outcome <> 'invalid-session' then raise exception 'FAIL 17e: someone else as target %', v_r.outcome; end if;
  select * into v_r from public.insert_booking_session_checked(v_amb_user, v_a1,
    pg_temp.session_payload(null, 'ambassador_assigned', pg_temp.nz(v_d + 7, '09:00'), pg_temp.nz(v_d + 7, '10:00')));
  if v_r.outcome <> 'invalid-session' then raise exception 'FAIL 17e: unassigned %', v_r.outcome; end if;
  select * into v_r from public.insert_booking_session_checked(v_amb_user, v_a1,
    pg_temp.session_payload(v_amb, 'tentative', pg_temp.nz(v_d + 7, '09:00'), pg_temp.nz(v_d + 7, '10:00')));
  if v_r.outcome <> 'invalid-session' then raise exception 'FAIL 17e: status %', v_r.outcome; end if;
  select * into v_r from public.insert_booking_session_checked(v_amb_user, v_a1,
    pg_temp.session_payload(v_amb, 'confirmed', now() - interval '2 hours', now() - interval '1 hour'));
  if v_r.outcome <> 'invalid-session' then raise exception 'FAIL 17e: past %', v_r.outcome; end if;
  select * into v_r from public.insert_booking_session_checked(v_amb_user, v_a1,
    pg_temp.session_payload(v_amb, 'confirmed', pg_temp.nz(v_d + 7, '09:00'), pg_temp.nz(v_d + 7, '10:00'), 'not_submitted', 'online'));
  if v_r.outcome <> 'invalid-session' then raise exception 'FAIL 17e: online %', v_r.outcome; end if;
  select * into v_r from public.insert_booking_session_checked(v_amb_user, v_a1,
    pg_temp.session_payload(v_amb, 'confirmed', pg_temp.nz(v_d + 6, '09:59'), pg_temp.nz(v_d + 6, '10:30')));
  if v_r.outcome <> 'ambassador-conflict' or v_r.conflict_session_id <> v_own then
    raise exception 'FAIL 17e: own clash %', row_to_json(v_r);
  end if;
  select * into v_r from public.insert_booking_session_checked(v_amb_user, v_a1,
    pg_temp.session_payload(v_amb, 'ambassador_assigned', pg_temp.nz(v_d + 6, '10:00'), pg_temp.nz(v_d + 6, '10:45')));
  if v_r.outcome <> 'inserted'
    or (select payment_status from public.booking_sessions where id = v_r.session_id) <> 'not_eligible' then
    raise exception 'FAIL 17e: touching own session %', row_to_json(v_r);
  end if;

  insert into public.booking_requests (school_id, status) values (v_school, 'ambassador_assigned') returning id into v_a2;
  select * into v_r from public.insert_booking_session_checked(v_amb_user, v_a2,
    pg_temp.session_payload(v_amb, 'confirmed', pg_temp.nz(v_d + 8, '09:00'), pg_temp.nz(v_d + 8, '10:00')));
  if v_r.outcome <> 'not-authorized' then raise exception 'FAIL 17e: someone else''s booking %', v_r.outcome; end if;
  -- Staff can't add to an ambassador's booking through this either.
  insert into public.booking_requests (school_id, status, submitted_by_user_id)
    values (v_school, 'ambassador_assigned', v_amb_user) returning id into v_a3;
  select * into v_r from public.insert_booking_session_checked(v_staff, v_a3,
    pg_temp.session_payload(v_amb, 'confirmed', pg_temp.nz(v_d + 9, '09:00'), pg_temp.nz(v_d + 9, '10:00')));
  if v_r.outcome <> 'not-authorized' then raise exception 'FAIL 17e: staff on an ambassador booking %', v_r.outcome; end if;

  raise notice '0055 checks passed';
end;
$$;

rollback;
