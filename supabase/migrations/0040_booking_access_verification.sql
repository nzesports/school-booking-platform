-- Email proof, revocable opaque sessions, and service-role-only access.
alter table public.booking_requests add column guest_access_version bigint not null default 0;
create table public.booking_access_challenges (
  challenge_hash text primary key check (challenge_hash ~ '^[0-9a-f]{64}$'),
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  email text not null,
  reference_code text not null,
  access_version bigint not null,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  consumed_at timestamptz
);
create table public.booking_access_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  email text not null,
  reference_code text not null,
  access_version bigint not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  revoked_at timestamptz,
  change_attempts integer not null default 0
);
alter table public.booking_access_challenges enable row level security;
alter table public.booking_access_sessions enable row level security;
revoke all on public.booking_access_challenges, public.booking_access_sessions from public, anon, authenticated;
grant all on public.booking_access_challenges, public.booking_access_sessions to service_role;
create index on public.booking_access_challenges (expires_at);
create index on public.booking_access_sessions (expires_at);

create function public.verify_booking_access_code(p_challenge_hash text, p_code_hash text, p_token_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare challenge booking_access_challenges%rowtype;
begin
  select * into challenge from booking_access_challenges where challenge_hash = p_challenge_hash for update;
  if not found or challenge.consumed_at is not null or challenge.expires_at <= now() or challenge.attempts >= 5 then return false; end if;
  update booking_access_challenges set attempts = attempts + 1 where challenge_hash = p_challenge_hash;
  if challenge.code_hash <> p_code_hash then return false; end if;
  -- Lock the booking so a concurrent staff revocation cannot race issuance.
  perform 1 from booking_requests b join school_contacts c on c.id = b.primary_contact_id
    where b.id = challenge.booking_request_id and b.reference_code = challenge.reference_code
      and b.guest_access_version = challenge.access_version
      and lower(trim(c.email)) = challenge.email for update of b, c;
  if not found then return false; end if;
  update booking_access_challenges set consumed_at = now() where challenge_hash = p_challenge_hash;
  insert into booking_access_sessions(token_hash, booking_request_id, email, reference_code, access_version)
    values(p_token_hash, challenge.booking_request_id, challenge.email, challenge.reference_code, challenge.access_version);
  return true;
end;
$$;

create function public.get_booking_access_session(p_token_hash text)
returns table(booking_id uuid, email text, reference_code text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  return query update booking_access_sessions a set last_seen_at = now()
    from booking_requests b, school_contacts c
    where a.token_hash = p_token_hash and b.id = a.booking_request_id and c.id = b.primary_contact_id
      and a.revoked_at is null and a.expires_at > now() and a.last_seen_at > now() - interval '15 minutes'
      and b.guest_access_version = a.access_version and b.reference_code = a.reference_code
      and lower(trim(c.email)) = a.email
    returning a.booking_request_id, a.email, a.reference_code, a.expires_at;
end;
$$;

create function public.change_authenticated_booking_session(
  p_token_hash text, p_booking_id uuid, p_session_id uuid, p_action text,
  p_expected_start timestamptz, p_expected_status text, p_expected_updated_at timestamptz,
  p_new_start timestamptz default null, p_notes text default ''
) returns boolean language plpgsql security definer set search_path = public as $$
declare access booking_access_sessions%rowtype;
begin
  select * into access from booking_access_sessions where token_hash = p_token_hash for update;
  if not found or access.revoked_at is not null or access.expires_at <= now()
    or access.last_seen_at <= now() - interval '15 minutes' or access.booking_request_id <> p_booking_id
    or access.change_attempts >= 5 then return false; end if;
  update booking_access_sessions set change_attempts = change_attempts + 1, last_seen_at = now() where token_hash = p_token_hash;
  -- Match the existing mutation's table-first lock order, then lock ownership.
  lock table booking_sessions in share row exclusive mode;
  perform 1 from booking_requests where id = p_booking_id and guest_access_version = access.access_version for update;
  if not found then return false; end if;
  if not exists(select 1 from booking_sessions where id = p_session_id and booking_request_id = p_booking_id
    and starts_at > now() + interval '24 hours') then return false; end if;
  -- The budget also applies across newly verified sessions for this booking.
  if not allow_booking_access_request('booking-changes:' || p_booking_id::text, 10) then return false; end if;
  return change_verified_booking_session(access.email, access.reference_code, p_booking_id, p_session_id,
    p_action, p_expected_start, p_expected_status, p_expected_updated_at, p_new_start, p_notes);
end;
$$;

create function public.revoke_booking_guest_access(p_booking_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update booking_requests set guest_access_version = guest_access_version + 1 where id = p_booking_id;
  return found;
end;
$$;

revoke all on function public.verify_booking_access_code(text,text,text), public.get_booking_access_session(text),
  public.change_authenticated_booking_session(text,uuid,uuid,text,timestamptz,text,timestamptz,timestamptz,text),
  public.revoke_booking_guest_access(uuid) from public, anon, authenticated;
grant execute on function public.verify_booking_access_code(text,text,text), public.get_booking_access_session(text),
  public.change_authenticated_booking_session(text,uuid,uuid,text,timestamptz,text,timestamptz,timestamptz,text),
  public.revoke_booking_guest_access(uuid) to service_role;
-- Existing definer functions may call this internally; API clients cannot skip verification.
revoke execute on function public.change_verified_booking_session(text,text,uuid,uuid,text,timestamptz,text,timestamptz,timestamptz,text) from service_role;

-- Randomise NEW six-digit references, retaining every existing reference.
-- A transaction lock prevents two simultaneous inserts selecting the same code.
create function public.generate_random_booking_reference()
returns text language plpgsql security definer set search_path = public as $$
declare candidate text; random_value bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('booking-reference-creation', 0));
  for attempt in 1..1000 loop
    random_value := ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint;
    if random_value >= 4294800000 then continue; end if;
    candidate := (100000 + random_value % 900000)::text;
    if not exists(select 1 from booking_requests where reference_code = candidate) then return candidate; end if;
  end loop;
  raise exception 'Could not allocate a booking reference';
end;
$$;
revoke all on function public.generate_random_booking_reference() from public, anon, authenticated;
grant execute on function public.generate_random_booking_reference() to service_role;
alter table public.booking_requests alter column reference_code set default public.generate_random_booking_reference();

-- Expired access records contain no plaintext secrets. Prune on the existing
-- maintenance schedule; retain at most a day for troubleshooting.
create function public.prune_booking_access_records()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from booking_access_challenges where expires_at < now() - interval '1 day';
  delete from booking_access_sessions where expires_at < now() - interval '1 day';
  delete from booking_access_rate_limits where window_started_at < now() - interval '1 day';
end;
$$;
revoke all on function public.prune_booking_access_records() from public, anon, authenticated;
grant execute on function public.prune_booking_access_records() to service_role;
