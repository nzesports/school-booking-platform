-- Security review fixes (September 2026).
--
-- 1. School portal takeover. The public booking form attached a contact with
--    an attacker-chosen email to any existing school matched by name, and the
--    signup trigger then linked whoever signed up with that email to the
--    school. Contacts the public form adds to an existing school are now
--    flagged unverified, and signup never auto-links to an unverified contact.
--    Staff-created and imported contacts keep auto-linking as before.
-- 2. Self-approved ambassadors. The 0001 insert policy let any signed-in user
--    create their own ambassador_profiles row with status 'approved' (the
--    self-approval trigger only fires on update).
-- 3. Direct-API inserts into media_library, ambassador_reports and
--    booking_session_applications. The app writes all three with the service
--    role after its own checks; the RLS insert policies only let users bypass
--    those checks (forged report media URLs, reports on other ambassadors'
--    sessions, self-accepted applications).
-- 4. Deactivated staff kept staff RLS until their JWT expired.
-- 5. Users could rewrite their own profiles.email, and renaming yourself
--    re-pointed unclaimed historical reports to your ambassador profile.
-- 6. Staff-only notes were readable through the Data API by school users
--    (booking/session/school notes) and by anyone (presentation notes).
-- 7. Deleting a staff user who had sent a manual booking email failed on the
--    booking_email_sends.actor_id foreign key.
-- 8. The last active super admin's login could still be banned directly.

-- ---------------------------------------------------------------------------
-- 1. Unverified school contacts

alter table public.school_contacts
  add column if not exists unverified boolean not null default false;

comment on column public.school_contacts.unverified is
  'Added by the public booking form to a school that already existed. Signup never auto-links a user to an unverified contact.';

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_selected_role text := case
    when v_metadata->>'role' in ('school', 'ambassador') then v_metadata->>'role'
    else 'school'
  end;
  -- Staff invites carry role staff/super_admin in metadata. Metadata is
  -- user-writable, so it never grants those roles here (the inviting action
  -- sets the role with the service role); it only skips the school records a
  -- staff member does not need.
  v_is_staff_invite boolean := coalesce(v_metadata->>'role' in ('staff', 'super_admin'), false);
  v_selected_region_id uuid;
  v_school_record_id uuid;
  v_school_contact_id uuid;
  v_ambassador_profile_id uuid;
  v_travel_region_slug text;
begin
  v_selected_region_id := public.region_id_from_slug(v_metadata->>'region_slug');

  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    role,
    status
  )
  values (
    new.id,
    coalesce(new.email, v_metadata->>'email', ''),
    v_metadata->>'full_name',
    v_metadata->>'phone',
    v_selected_role,
    'active'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    phone = coalesce(excluded.phone, public.profiles.phone),
    role = excluded.role;

  if v_selected_role = 'school' and not v_is_staff_invite then
    select sc.id, sc.school_id
    into v_school_contact_id, v_school_record_id
    from public.school_contacts sc
    where lower(sc.email) = lower(coalesce(new.email, v_metadata->>'email', ''))
      and not sc.unverified
    order by sc.is_primary desc, sc.created_at asc
    limit 1;

    if v_school_contact_id is not null then
      insert into public.school_contact_users (
        school_contact_id,
        user_id
      )
      values (
        v_school_contact_id,
        new.id
      )
      on conflict (school_contact_id, user_id) do nothing;
    else
      insert into public.schools (
        name,
        region_id,
        status
      )
      values (
        coalesce(v_metadata->>'school_name', split_part(coalesce(new.email, ''), '@', 1)),
        v_selected_region_id,
        'pending_review'
      )
      returning id into v_school_record_id;

      insert into public.school_contacts (
        school_id,
        full_name,
        email,
        phone,
        is_primary,
        can_access_portal,
        marketing_consent
      )
      values (
        v_school_record_id,
        coalesce(v_metadata->>'full_name', split_part(coalesce(new.email, ''), '@', 1)),
        coalesce(new.email, v_metadata->>'email', ''),
        v_metadata->>'phone',
        true,
        true,
        coalesce((v_metadata->>'marketing_consent')::boolean, false)
      )
      returning id into v_school_contact_id;

      insert into public.school_contact_users (
        school_contact_id,
        user_id
      )
      values (
        v_school_contact_id,
        new.id
      )
      on conflict (school_contact_id, user_id) do nothing;
    end if;
  elsif v_selected_role = 'ambassador' then
    insert into public.ambassador_profiles (
      user_id,
      region_id,
      bio,
      experience,
      referred_by,
      open_to_travel,
      status
    )
    values (
      new.id,
      v_selected_region_id,
      v_metadata->>'experience',
      v_metadata->>'experience',
      nullif(v_metadata->>'referred_by', ''),
      coalesce((v_metadata->>'open_to_travel')::boolean, false),
      'applied'
    )
    returning id into v_ambassador_profile_id;

    if jsonb_typeof(v_metadata->'travel_regions') = 'array' then
      for v_travel_region_slug in
        select jsonb_array_elements_text(v_metadata->'travel_regions')
      loop
        insert into public.ambassador_travel_regions (
          ambassador_profile_id,
          region_id
        )
        select
          v_ambassador_profile_id,
          id
        from public.regions
        where slug = v_travel_region_slug
        on conflict do nothing;
      end loop;
    end if;

    perform public.notify_staff_about_ambassador_application(
      v_ambassador_profile_id,
      coalesce(v_metadata->>'full_name', split_part(coalesce(new.email, ''), '@', 1))
    );
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2 & 3. Remove self-service insert policies. The signup trigger (security
-- definer) and the server actions (service role) are unaffected.

drop policy if exists "ambassadors create own profile" on public.ambassador_profiles;
drop policy if exists "authenticated users insert media" on public.media_library;
drop policy if exists "ambassadors create own reports" on public.ambassador_reports;
drop policy if exists "ambassadors apply to booking sessions" on public.booking_session_applications;

-- ---------------------------------------------------------------------------
-- 4. Only active profiles hold a role for RLS purposes.

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and status = 'active'
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- 5. Profile email is owned by auth.users; approval-state guard hardened for
-- pooled connections where request.jwt.claims is '' rather than null.

create or replace function public.prevent_profile_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
begin
  if v_claims is null or (v_claims::jsonb->>'role') = 'service_role' then
    return new;
  end if;

  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and not public.is_staff_like() then
    raise exception 'Only staff can change role or status.';
  end if;

  if new.email is distinct from old.email and not public.is_staff_like() then
    raise exception 'Email changes go through account settings.';
  end if;

  if (
      (new.role is distinct from old.role
        and (new.role = 'super_admin' or old.role = 'super_admin'))
      or (new.status is distinct from old.status and old.role = 'super_admin')
    )
     and public.current_role() is distinct from 'super_admin' then
    raise exception 'Only a super admin can change super admin access.';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_ambassador_self_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
begin
  if v_claims is null or (v_claims::jsonb->>'role') = 'service_role' then
    return new;
  end if;

  if (
      new.status is distinct from old.status
      or new.approved_at is distinct from old.approved_at
      or new.approved_by is distinct from old.approved_by
    )
     and not public.is_staff_like() then
    raise exception 'Only staff can change ambassador approval state.';
  end if;

  return new;
end;
$$;

-- A user renaming themselves through the Data API must not claim unlinked
-- historical reports; staff edits, service-role writes and signup still link.
create or replace function public.link_historical_reports_after_ambassador_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  target_ambassador_id uuid;
  target_name text;
begin
  if v_claims is not null
     and (v_claims::jsonb->>'role') is distinct from 'service_role'
     and not public.is_staff_like() then
    return new;
  end if;

  if tg_table_name = 'ambassador_profiles' then
    target_ambassador_id := new.id;
    target_name := new.display_name;

    if nullif(trim(target_name), '') is null and new.user_id is not null then
      select p.full_name
        into target_name
      from public.profiles p
      where p.id = new.user_id;
    end if;
  else
    select ap.id
      into target_ambassador_id
    from public.ambassador_profiles ap
    where ap.user_id = new.id
      and ap.deleted_at is null
    limit 1;

    target_name := new.full_name;
  end if;

  if target_ambassador_id is not null and nullif(trim(target_name), '') is not null then
    update public.ambassador_reports report
    set ambassador_profile_id = target_ambassador_id
    where report.ambassador_profile_id is null
      and public.normalized_person_name(report.presenter_name) =
        public.normalized_person_name(target_name);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Hide staff-only columns from the Data API. RLS is row-level only, so
-- replace the table-wide SELECT grant with a grant on every other column.
-- The app reads these tables with the service role, which is unaffected.
-- Columns added to these tables later need an explicit grant if a
-- user-scoped client ever has to read them.

do $$
declare
  v_target record;
  v_columns text;
begin
  for v_target in
    select *
    from (values
      ('booking_requests', array['internal_notes', 'staff_owner_id']),
      ('booking_sessions', array['internal_notes', 'withdrawal_reason']),
      ('schools', array['notes']),
      ('presentation_types', array['internal_notes'])
    ) as hidden(table_name, columns)
  loop
    select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
      into v_columns
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = v_target.table_name
      and c.column_name <> all (v_target.columns);

    execute format('revoke select on public.%I from anon, authenticated', v_target.table_name);
    execute format('grant select (%s) on public.%I to anon, authenticated', v_columns, v_target.table_name);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Keep the send record when its staff author is deleted.

alter table public.booking_email_sends
  alter column actor_id drop not null,
  drop constraint if exists booking_email_sends_actor_id_fkey,
  add constraint booking_email_sends_actor_id_fkey
    foreign key (actor_id) references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 8. There must always be at least one super admin who can sign in. The
-- 0016/0019 guard stops the last active super admin's profile being demoted,
-- deactivated or deleted; this closes the remaining route, banning their
-- login directly (for example from the Supabase dashboard). The app always
-- deactivates the profile before banning, so its own flows pass the profile
-- guard first.

create or replace function public.prevent_banning_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  if new.banned_until is null
     or new.banned_until <= now()
     or (old.banned_until is not null and old.banned_until > now()) then
    return new;
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = new.id
      and role = 'super_admin'
      and status = 'active'
  ) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('public.profiles.active_super_admin_guard')::bigint);

  select count(*)::int
  into v_remaining
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role = 'super_admin'
    and p.status = 'active'
    and p.id <> new.id
    and (u.banned_until is null or u.banned_until <= now());

  if v_remaining = 0 then
    raise exception 'At least one active super admin is required.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_banning_last_super_admin on auth.users;
create trigger prevent_banning_last_super_admin
before update of banned_until on auth.users
for each row execute function public.prevent_banning_last_super_admin();
