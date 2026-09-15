-- Rate limits are persistent across application instances. No public table access.
create table public.booking_access_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  requests integer not null default 1
);
alter table public.booking_access_rate_limits enable row level security;
revoke all on public.booking_access_rate_limits from anon, authenticated;

create function public.allow_booking_access_request(p_key text, p_limit integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare total integer;
begin
  insert into booking_access_rate_limits as limits(key_hash) values (p_key)
  on conflict (key_hash) do update set
    requests = case when limits.window_started_at < now() - interval '1 hour' then 1 else limits.requests + 1 end,
    window_started_at = case when limits.window_started_at < now() - interval '1 hour' then now() else limits.window_started_at end
  returning requests into total;
  return total <= p_limit;
end;
$$;
revoke all on function public.allow_booking_access_request(text, integer) from public, anon, authenticated;
grant execute on function public.allow_booking_access_request(text, integer) to service_role;

-- Service-role only: the server verifies the signed email grant first. Recheck
-- ownership here and commit the session, parent status, and audit rows together.
create function public.change_guest_booking_session(
  p_email text, p_booking_id uuid, p_session_id uuid, p_action text,
  p_expected_start timestamptz, p_expected_status text, p_expected_updated_at timestamptz,
  p_new_start timestamptz default null, p_notes text default ''
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  session booking_sessions%rowtype;
  next_status text;
  new_end timestamptz;
begin
  -- Serializes against staff assignments and new bookings as well as other
  -- guest changes, so the overlap check and mutation cannot race a write.
  lock table booking_sessions in share row exclusive mode;
  select s.* into session from booking_sessions s
    join booking_requests b on b.id = s.booking_request_id
    join school_contacts c on c.id = b.primary_contact_id
    where s.id = p_session_id and b.id = p_booking_id
      and lower(trim(c.email)) = lower(trim(p_email)) for update of s;
  if not found or session.starts_at <= now()
    or session.updated_at is distinct from p_expected_updated_at or session.starts_at is distinct from p_expected_start or session.status is distinct from p_expected_status
    or session.status not in ('requested','tentative','applied','ambassador_needed','ambassador_assigned','confirmed','reschedule_requested','withdrawal_requested')
  then return false; end if;
  if p_action = 'cancel' then
    next_status := 'cancelled';
  elsif p_action = 'reschedule' then
    if session.status in ('withdrawal_requested','reschedule_requested') or p_new_start is null
      or (p_new_start at time zone 'Pacific/Auckland')::date < (now() at time zone 'Pacific/Auckland')::date + 7
      or (p_new_start at time zone 'Pacific/Auckland')::date > (now() at time zone 'Pacific/Auckland')::date + 365
      or p_new_start = session.starts_at then return false; end if;
    new_end := p_new_start + (session.ends_at - session.starts_at);
    if exists (select 1 from booking_sessions other where other.id <> session.id
      and other.status in ('requested','tentative','applied','ambassador_needed','ambassador_assigned','confirmed','reschedule_requested','withdrawal_requested')
      and (other.school_id = session.school_id or other.assigned_ambassador_id = session.assigned_ambassador_id)
      and other.starts_at < new_end and other.ends_at > p_new_start)
    then return false; end if;
    next_status := session.status;
  else return false;
  end if;
  update booking_sessions set status = next_status,
    starts_at = case when p_action = 'reschedule' then p_new_start else starts_at end,
    ends_at = case when p_action = 'reschedule' then new_end else ends_at end,
    share_contact_with_ambassador = case when p_action = 'cancel' then false else share_contact_with_ambassador end,
    reschedule_requested_date = null, reschedule_request_notes = null,
    reschedule_requested_at = null, reschedule_previous_status = null
    where id = session.id;
  if not exists(select 1 from booking_sessions where booking_request_id = p_booking_id and status not in ('cancelled','declined')) then
    update booking_requests set status = 'cancelled' where id = p_booking_id;
  end if;
  insert into booking_status_history(booking_request_id, booking_session_id, old_status, new_status, reason)
    values(p_booking_id, session.id, session.status, next_status, 'School self-service ' || p_action || ': ' || left(p_notes, 2000));
  insert into booking_activity_logs(booking_request_id, booking_session_id, action, actor_type, details)
    values(p_booking_id, session.id, 'session.' || case when p_action = 'cancel' then 'cancelled' else 'rescheduled' end || '_by_school', 'school',
      jsonb_build_object('access', 'verified_booking_email', 'previous_starts_at', session.starts_at,
        'starts_at', coalesce(p_new_start, session.starts_at), 'notes', left(p_notes, 2000)));
  return true;
end;
$$;
revoke all on function public.change_guest_booking_session(text, uuid, uuid, text, timestamptz, text, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.change_guest_booking_session(text, uuid, uuid, text, timestamptz, text, timestamptz, timestamptz, text) to service_role;
