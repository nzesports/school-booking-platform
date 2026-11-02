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
