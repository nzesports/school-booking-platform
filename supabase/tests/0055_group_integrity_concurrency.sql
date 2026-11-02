-- Concurrency scenarios for 0055_group_integrity. LOCAL database only.
--
-- These need two (or three) independent connections, so they can't run in
-- one rolled-back transaction like 0055_group_integrity.sql. Part 1 commits
-- fixtures tagged "0055 Concurrency"; part 3 deletes them again. Run part 1
-- once in psql, then each scenario's steps in the connections named A, B
-- (and C) in the order given, then part 3.
--
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0055_group_integrity_concurrency.sql
-- runs part 1 only and prints the fixture ids; the interleaved steps of
-- part 2 and the cleanup in part 3 are comments for the harness to drive.
--
-- Actors are borrowed, read-only, from existing local data (one active staff
-- profile, one active approved ambassador user, one active school user).

-- ---------------------------------------------------------------------------
-- Part 1. Fixtures (committed). Prints the ids the scenarios use.

begin;

create temporary table c55 (key text primary key, id uuid) on commit preserve rows;

do $$
begin
  if exists (select 1 from public.schools where name = '0055 Concurrency School') then
    raise exception 'SETUP: 0055 concurrency fixtures already exist; run part 3 first';
  end if;

  insert into c55 select 'staff', id from public.profiles
    where role in ('staff', 'super_admin') and status = 'active' order by created_at limit 1;
  insert into c55 select 'amb_user', profile.id from public.profiles profile
    join public.ambassador_profiles ambassador on ambassador.user_id = profile.id
    where profile.role = 'ambassador' and profile.status = 'active'
      and ambassador.status = 'approved' and ambassador.deleted_at is null
    order by profile.created_at limit 1;
  insert into c55 select 'amb', ambassador.id from public.ambassador_profiles ambassador
    where ambassador.user_id = (select id from c55 where key = 'amb_user');
  insert into c55 select 'school_user', id from public.profiles
    where role = 'school' and status = 'active' order by created_at limit 1;
  if (select count(*) from c55) <> 4 then
    raise exception 'SETUP: needs one active staff profile, one active approved ambassador user and one active school user';
  end if;

  insert into public.schools (name) values ('0055 Concurrency School');
end;
$$;

do $$
declare
  v_school uuid := (select id from public.schools where name = '0055 Concurrency School');
  v_day date := (now() at time zone 'Pacific/Auckland')::date + 50;
  v_b uuid;
  v_id uuid;
begin
  -- Directory-only ambassadors X and Y.
  insert into public.ambassador_profiles (user_id, status, display_name)
    values (null, 'approved', '0055 Concurrency X') returning id into v_id;
  insert into c55 values ('x', v_id);
  insert into public.ambassador_profiles (user_id, status, display_name)
    values (null, 'approved', '0055 Concurrency Y') returning id into v_id;
  insert into c55 values ('y', v_id);

  -- Booking P: two back-to-back open sessions (09:13-10:13, 10:13-11:13).
  insert into public.booking_requests (school_id, status) values (v_school, 'tentative') returning id into v_b;
  insert into c55 values ('p', v_b);
  insert into public.booking_sessions (booking_request_id, school_id, status, starts_at, ends_at)
    values (v_b, v_school, 'tentative', (v_day + time '09:13') at time zone 'Pacific/Auckland', (v_day + time '10:13') at time zone 'Pacific/Auckland')
    returning id into v_id;
  insert into c55 values ('p1', v_id);
  insert into public.booking_sessions (booking_request_id, school_id, status, starts_at, ends_at)
    values (v_b, v_school, 'tentative', (v_day + time '10:13') at time zone 'Pacific/Auckland', (v_day + time '11:13') at time zone 'Pacific/Auckland')
    returning id into v_id;
  insert into c55 values ('p2', v_id);

  -- Booking Q, another booking whose session overlaps P2 (10:43-11:43).
  insert into public.booking_requests (school_id, status) values (v_school, 'tentative') returning id into v_b;
  insert into c55 values ('q', v_b);
  insert into public.booking_sessions (booking_request_id, school_id, status, starts_at, ends_at)
    values (v_b, v_school, 'tentative', (v_day + time '10:43') at time zone 'Pacific/Auckland', (v_day + time '11:43') at time zone 'Pacific/Auckland')
    returning id into v_id;
  insert into c55 values ('q1', v_id);

  -- Booking W: two back-to-back sessions confirmed for the actor ambassador.
  insert into public.booking_requests (school_id, status) values (v_school, 'confirmed') returning id into v_b;
  insert into c55 values ('w', v_b);
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_b, v_school, (select id from c55 where key = 'amb'), 'confirmed',
      (v_day + 1 + time '09:13') at time zone 'Pacific/Auckland', (v_day + 1 + time '10:13') at time zone 'Pacific/Auckland')
    returning id into v_id;
  insert into c55 values ('w1', v_id);
  insert into public.booking_sessions (booking_request_id, school_id, assigned_ambassador_id, status, starts_at, ends_at)
    values (v_b, v_school, (select id from c55 where key = 'amb'), 'confirmed',
      (v_day + 1 + time '10:13') at time zone 'Pacific/Auckland', (v_day + 1 + time '11:13') at time zone 'Pacific/Auckland')
    returning id into v_id;
  insert into c55 values ('w2', v_id);

  -- Booking C: submitted by the school user, two upcoming open sessions.
  insert into public.booking_requests (school_id, status, submitted_by_user_id)
    values (v_school, 'tentative', (select id from c55 where key = 'school_user')) returning id into v_b;
  insert into c55 values ('c', v_b);
  insert into public.booking_sessions (booking_request_id, school_id, status, starts_at, ends_at)
    values (v_b, v_school, 'tentative', (v_day + 2 + time '09:13') at time zone 'Pacific/Auckland', (v_day + 2 + time '10:13') at time zone 'Pacific/Auckland')
    returning id into v_id;
  insert into c55 values ('c1', v_id);
  insert into public.booking_sessions (booking_request_id, school_id, status, starts_at, ends_at)
    values (v_b, v_school, 'tentative', (v_day + 2 + time '10:13') at time zone 'Pacific/Auckland', (v_day + 2 + time '11:13') at time zone 'Pacific/Auckland')
    returning id into v_id;
  insert into c55 values ('c2', v_id);

  -- Booking R: one open session overlapping c1 (09:43-10:43, same day as C).
  insert into public.booking_requests (school_id, status) values (v_school, 'tentative') returning id into v_b;
  insert into c55 values ('r', v_b);
  insert into public.booking_sessions (booking_request_id, school_id, status, starts_at, ends_at)
    values (v_b, v_school, 'tentative', (v_day + 2 + time '09:43') at time zone 'Pacific/Auckland', (v_day + 2 + time '10:43') at time zone 'Pacific/Auckland')
    returning id into v_id;
  insert into c55 values ('r1', v_id);
end;
$$;

-- c55 is private to this connection: copy the printed ids into psql
-- variables in each scenario connection, e.g. \set p1 'aaaaaaaa-...'.
select key, id from c55 order by key;

commit;

-- ---------------------------------------------------------------------------
-- Part 2. Scenarios. Placeholders :'staff', :'amb_user', :'x', :'y', :'p1',
-- :'p2', :'q1', :'w1' etc. are the ids printed above. "blocks" means the
-- statement must wait until the other connection commits or rolls back.
--
-- S1. Cross-booking assignment race (overlap serialization).
--   A: begin; select outcome from assign_ambassador_group(:'p1', :'staff', :'x');   -> assigned
--   B: begin; select outcome from assign_ambassador_group(:'q1', :'staff', :'x');   -> blocks (table lock)
--   A: commit;
--   B: (unblocks)                                                                  -> ambassador-conflict, conflict_session_id = :'p2'
--   B: commit;
--   Check: select id, assigned_ambassador_id from booking_sessions where id in (:'p1', :'p2', :'q1');
--          -> p1, p2 = x; q1 null. Never both bookings with x.
--   Reset: select assign_ambassador_group(:'p1', :'staff', null);
--
-- S2. Same group, two staff assigning different ambassadors at once.
--   A: begin; select outcome, session_ids from assign_ambassador_group(:'p1', :'staff', :'x');  -> assigned, {p1,p2}
--   B: begin; select outcome, session_ids from assign_ambassador_group(:'p2', :'staff', :'y');  -> blocks
--   A: commit;
--   B: -> assigned, {p1,p2}, previous_ambassador_id = x (whole group moves to y; never split x/y)
--   B: commit;
--   Check: both sessions have y; x's applications (if any) withdrawn; booking P 'ambassador_assigned'.
--   Reset: select assign_ambassador_group(:'p1', :'staff', null);
--
-- S3. Apply racing an assignment (application vs. fill).
--   A: begin; select outcome from assign_ambassador_group(:'p1', :'staff', :'x');  -> assigned
--   B: select outcome from apply_to_session_group(:'p1', :'amb_user', null);        -> blocks (ROW EXCLUSIVE waits for SHARE ROW EXCLUSIVE)
--   A: commit;
--   B: -> session-not-open; no application row for p1/p2 from the actor.
--   Reverse order: reset, then
--   B: begin; select outcome from apply_to_session_group(:'p1', :'amb_user', null); -> applied
--   A: select outcome, declined_ambassador_ids from assign_ambassador_group(:'p1', :'staff', :'x'); -> blocks
--   B: commit;
--   A: -> assigned; declined_ambassador_ids = {:'amb'}; actor's applications on p1, p2 are 'declined'.
--   Reset: unassign; delete from booking_session_applications where booking_session_id in (:'p1', :'p2');
--          update booking_sessions set status = 'tentative' where id in (:'p1', :'p2');
--          update booking_requests set status = 'tentative' where id = :'p';
--
-- S4. Double apply (two tabs). Idempotency under concurrency.
--   A: begin; select outcome from apply_to_session_group(:'p1', :'amb_user', 'tab 1');  -> applied
--   B: select outcome from apply_to_session_group(:'p2', :'amb_user', 'tab 2');         -> blocks (booking row lock)
--   A: commit;
--   B: -> already-applied
--   Check: exactly 2 application rows (p1, p2), 2 'applied' history rows, booking P 'applied'.
--
-- S5. Withdraw application racing an assignment of someone else.
--   (After S4.) A: begin; select outcome from withdraw_application_group(:'p1', :'amb_user', 'Plans changed'); -> withdrawn
--   B: select outcome from assign_ambassador_group(:'p1', :'staff', :'x');            -> blocks
--   A: commit;
--   B: -> assigned, declined_ambassador_ids = {} (the withdrawn application is not re-declined)
--
-- S6. Withdrawal request racing a staff unassignment.
--   A: begin; select outcome from request_session_withdrawal_group(:'w1', :'amb_user', 'unavailable', 'Away that week'); -> requested
--   B: select outcome from assign_ambassador_group(:'w2', :'staff', null);          -> blocks
--   A: commit;
--   B: -> unassigned; session_ids {w1,w2}; both sessions unassigned, withdrawal fields cleared.
--   Check: booking W stays 'confirmed' (roll-up never touches a confirmed booking).
--   Reset: update booking_sessions set assigned_ambassador_id = :'amb', status = 'confirmed' where id in (:'w1', :'w2');
--
-- S7. Two staff resolving the same withdrawal differently.
--   (Request w1 first and commit.)
--   A: begin; select outcome from resolve_session_withdrawal_group(:'w1', :'staff', 'keep', null);    -> resolved
--   B: select outcome from resolve_session_withdrawal_group(:'w2', :'staff', 'reopen', null);         -> blocks
--   A: commit;
--   B: -> no-withdrawal-pending; both sessions back to 'confirmed' with the ambassador; one decision only.
--
-- S8. Assignment racing a guest reschedule into the ambassador's time.
--   (Assign x to P and commit.) Use the app's manage-booking flow, or
--   change_verified_booking_session as the postgres role, to move Q1 onto a
--   free time while
--   A: begin; select outcome from assign_ambassador_group(:'q1', :'staff', :'x');   -> ambassador-conflict (p2 overlap)
--   The guest call blocks until A ends; both paths take SHARE ROW EXCLUSIVE first, so no deadlock.
--
-- S9. Deadlock check (lock order). Run S1, S3 and S6 with a third connection C
--   submitting a report (submit_ambassador_report_group, ROW EXCLUSIVE then booking row)
--   for any finished session at the same time. Expect waits, never
--   "deadlock detected".
--
-- S10. Failure rollback. In A:
--   begin; select request_session_withdrawal_group(:'w1', :'amb_user', 'bogus', 'x');  -> ERROR (check constraint)
--   rollback;
--   Check: w1 and w2 unchanged, no new history/activity rows.
--
-- S11. School cancellation racing a staff confirmation (parent/child consistency).
--   A: begin; select outcome, booking_cancelled from cancel_school_booking(:'c', :'school_user', 'Plans changed'); -> cancelled, true
--   B: select outcome from update_booking_status_batch(:'staff', 'confirmed',
--        jsonb_build_array(jsonb_build_object('id', :'c', 'expected_status', 'tentative')));       -> blocks
--   A: commit;
--   B: -> booking-status-changed. Booking C and c1, c2 all 'cancelled'; never cancelled parent with
--      confirmed children or the reverse.
--   Reverse order (after resetting C and c1, c2 to 'tentative'): B first and commit -> confirmed;
--   then A -> cancelled; C, c1, c2 all 'cancelled'.
--   Without expected_status, B (if second) re-confirms deliberately: C confirmed and c1, c2 come
--   back as 'confirmed' together (explicit staff reinstatement), never split.
--
-- S12. Staff confirmation racing an assignment.
--   A: begin; select outcome from assign_ambassador_group(:'c1', :'staff', :'y');   -> assigned (c1, c2), C rolls up to ambassador_assigned
--   B: select outcome from update_booking_status_batch(:'staff', 'confirmed',
--        jsonb_build_array(jsonb_build_object('id', :'c', 'expected_status', 'tentative')));       -> blocks
--   A: commit;
--   B: -> booking-status-changed (staff saw 'tentative'); retry with 'ambassador_assigned' -> updated,
--      c1, c2 'confirmed' and still assigned to y.
--
-- S13. Reschedule request racing a school cancellation.
--   A: begin; select outcome from cancel_school_booking(:'c', :'school_user', null);
--   B: select outcome from request_school_session_reschedule(:'c', :'c1', :'school_user',
--        (now() + interval '80 days')::date, 'Move please', 'confirmed', <c1 starts_at>);         -> blocks
--   A: commit;
--   B: -> session-not-reschedulable (booking cancelled). c1 stays 'cancelled' with no reschedule fields.
--
-- S14. Two bulk status changes over overlapping selections (lock order).
--   A: begin; select * from update_booking_status_batch(:'staff', 'tentative',
--        jsonb_build_array(jsonb_build_object('id', :'p'), jsonb_build_object('id', :'q')), null, true);
--   B: select * from update_booking_status_batch(:'staff', 'confirmed',
--        jsonb_build_array(jsonb_build_object('id', :'q'), jsonb_build_object('id', :'p')), null, true); -> blocks
--   A: commit;  B: -> two 'updated' rows. Never "deadlock detected" (table lock first, rows in id order).
--
-- S15. Un-cancel racing an assignment into the same time.
--   Setup (commit each): reset C, c1, c2 to 'tentative'; assign_ambassador_group(:'c1', :'staff', :'y');
--   cancel_school_booking(:'c', :'school_user', null). y's c1/c2 are now cancelled but still assigned.
--   A: begin; select outcome from assign_ambassador_group(:'r1', :'staff', :'y');  -> assigned (c1 is cancelled, so no clash)
--   B: select outcome, conflict_session_id from update_booking_status_batch(:'staff', 'tentative',
--        jsonb_build_array(jsonb_build_object('id', :'c', 'expected_status', 'cancelled')));  -> blocks
--   A: commit;
--   B: -> reinstate-ambassador-conflict, conflict_session_id = :'r1'; C, c1, c2 stay cancelled.
--   Reverse order: B first -> updated (c1, c2 back as tentative with y); then A -> ambassador-conflict.
--   Either way y never ends up with two live overlapping sessions.
--
-- S17. Two staff logging bookings for the same ambassador at overlapping times.
--   Both first create an empty booking (committed) as the manual form does:
--     insert into booking_requests (school_id, status, staff_owner_id)
--       values ((select id from schools where name = '0055 Concurrency School'), 'confirmed', :'staff') returning id;  -> :m1, :m2
--   A: begin; select outcome from insert_booking_session_checked(:'staff', :'m1', jsonb_build_object(
--        'assigned_ambassador_id', :'x', 'status', 'confirmed', 'report_status', 'not_submitted',
--        'starts_at', now() + interval '90 days', 'ends_at', now() + interval '90 days 1 hour',
--        'year_levels', 'Years 9', 'expected_student_count', 50));                              -> inserted
--   B: same call for :'m2' starting 30 minutes later                                         -> blocks
--   A: commit;
--   B: -> ambassador-conflict (A's session). With B starting exactly at A's end -> inserted.
--   The same holds with B as assign_ambassador_group onto an overlapping session, in either order.
--
-- S16. Confirming a school-moved date while the school moves it again.
--   Staff: open the reschedule-confirm panel for a flagged session
--          (expectedStartsAt = T1, expectedFlaggedAt = F1).
--   Guest: move the session again (new start T2) and commit.
--   Staff: confirm -> "the school changed this session again"; flag stays set.
--   Variant: the guest moves it away and back to T1 - the start matches but the
--   new move stamp F2 doesn't, so the confirm is still refused.

-- ---------------------------------------------------------------------------
-- Part 3. Cleanup (run when done). Sessions, applications, history and
-- activity rows cascade from the bookings.
--
--   begin;
--   delete from public.booking_requests where school_id = (select id from public.schools where name = '0055 Concurrency School');
--   delete from public.ambassador_profiles where display_name in ('0055 Concurrency X', '0055 Concurrency Y') and user_id is null;
--   delete from public.schools where name = '0055 Concurrency School';
--   commit;
