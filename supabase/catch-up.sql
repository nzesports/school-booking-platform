-- ============================================================================
-- CATCH-UP MIGRATIONS — paste this whole file into the Supabase SQL editor
-- and run it once. Your live database is missing several migrations from the
-- repo (0004, 0006/0007 pieces, 0009, 0010, 0011, 0012, 0013). Everything below is
-- idempotent, so running it twice is safe.
-- ============================================================================

-- ---------------------------------------------------------------- from 0004
alter table public.presentation_reviews
  add column if not exists booking_session_id uuid references public.booking_sessions(id) on delete set null;

alter table public.booking_requests
  alter column primary_contact_id drop not null;

alter table public.booking_activity_logs
  add column if not exists actor_type text;

alter table public.training_modules
  add column if not exists is_required boolean not null default true,
  add column if not exists is_published boolean not null default true;

-- ---------------------------------------------------- from 0006 + 0007 (resources)
alter table public.presentation_resources
  add column if not exists audiences text[] not null default '{}',
  add column if not exists tags text[] not null default '{}';

-- The original policy references the legacy singular `audience` column, so it
-- must be dropped BEFORE that column can be removed.
drop policy if exists "relevant users read resources" on public.presentation_resources;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'presentation_resources'
      and column_name = 'audience'
  ) then
    update public.presentation_resources
    set audiences = array[audience]
    where audiences = '{}';

    alter table public.presentation_resources drop column audience;
  end if;
end $$;

create index if not exists presentation_resources_audiences_idx
  on public.presentation_resources using gin (audiences);

create index if not exists presentation_resources_tags_idx
  on public.presentation_resources using gin (tags);

create policy "relevant users read resources"
on public.presentation_resources for select
to authenticated
using (
  public.is_staff_like()
  or (audiences && array['ambassador'] and public.current_ambassador_profile_id() is not null)
  or (audiences && array['school'])
);

drop view if exists public.ambassador_open_booking_sessions;

-- ---------------------------------------------------------------- from 0009
alter table public.presentation_types
  add column if not exists youtube_url text;

-- ---------------------------------------------------------------- from 0011
alter table public.ambassador_profiles
  add column if not exists profile_details jsonb not null default '{}'::jsonb;

-- ------------------------------------------------- from 0010 (school signup fix)
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  selected_role text := case
    when metadata->>'role' in ('school', 'ambassador') then metadata->>'role'
    else 'school'
  end;
  selected_region_id uuid;
  school_record_id uuid;
  school_contact_id uuid;
  ambassador_profile_id uuid;
  travel_region_slug text;
begin
  selected_region_id := public.region_id_from_slug(metadata->>'region_slug');

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
    coalesce(new.email, metadata->>'email', ''),
    metadata->>'full_name',
    metadata->>'phone',
    selected_role,
    'active'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    phone = coalesce(excluded.phone, public.profiles.phone),
    role = excluded.role;

  if selected_role = 'school' then
    select sc.id, sc.school_id
    into school_contact_id, school_record_id
    from public.school_contacts sc
    where lower(sc.email) = lower(coalesce(new.email, metadata->>'email', ''))
    order by sc.is_primary desc, sc.created_at asc
    limit 1;

    if school_contact_id is not null then
      insert into public.school_contact_users (
        school_contact_id,
        user_id
      )
      values (
        school_contact_id,
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
        coalesce(metadata->>'school_name', split_part(coalesce(new.email, ''), '@', 1)),
        selected_region_id,
        'pending_review'
      )
      returning id into school_record_id;

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
        school_record_id,
        coalesce(metadata->>'full_name', split_part(coalesce(new.email, ''), '@', 1)),
        coalesce(new.email, metadata->>'email', ''),
        metadata->>'phone',
        true,
        true,
        coalesce((metadata->>'marketing_consent')::boolean, false)
      )
      returning id into school_contact_id;

      insert into public.school_contact_users (
        school_contact_id,
        user_id
      )
      values (
        school_contact_id,
        new.id
      )
      on conflict (school_contact_id, user_id) do nothing;
    end if;
  elsif selected_role = 'ambassador' then
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
      selected_region_id,
      metadata->>'experience',
      metadata->>'experience',
      nullif(metadata->>'referred_by', ''),
      coalesce((metadata->>'open_to_travel')::boolean, false),
      'applied'
    )
    returning id into ambassador_profile_id;

    if jsonb_typeof(metadata->'travel_regions') = 'array' then
      for travel_region_slug in
        select jsonb_array_elements_text(metadata->'travel_regions')
      loop
        insert into public.ambassador_travel_regions (
          ambassador_profile_id,
          region_id
        )
        select
          ambassador_profile_id,
          id
        from public.regions
        where slug = travel_region_slug
        on conflict do nothing;
      end loop;
    end if;

    perform public.notify_staff_about_ambassador_application(
      ambassador_profile_id,
      coalesce(metadata->>'full_name', split_part(coalesce(new.email, ''), '@', 1))
    );
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------- from 0012
-- Structured answers from the school post-session feedback form.
alter table public.presentation_reviews
  add column if not exists details jsonb;

-- ---------------------------------------------------------------- from 0013
-- School-managed profile: logo + notes for the delivery team.
alter table public.schools
  add column if not exists logo_url text,
  add column if not exists profile_notes text;

-- ---------------------------------------------------------------- from 0014
-- Overall review ratings with one-decimal precision (4.5 instead of 5).
alter table public.presentation_reviews
  alter column rating type numeric(3,1) using rating::numeric(3,1);

update public.presentation_reviews
set rating = round((
    (details->>'attendanceRating')::numeric +
    (details->>'studentResponseRating')::numeric +
    (details->>'contentRating')::numeric +
    (details->>'presenterEnergyRating')::numeric
  ) / 4, 1)
where details ? 'attendanceRating'
  and details ? 'studentResponseRating'
  and details ? 'contentRating'
  and details ? 'presenterEnergyRating';

-- ---------------------------------------------------------------- from 0015
-- Resource category: general resource, training content, or presentation
-- material (decks surfaced on the ambassador Materials tab).
alter table public.presentation_resources
  add column if not exists category text not null default 'resource'
  check (category in ('resource', 'training', 'presentation_material'));

update public.presentation_resources
set category = 'presentation_material'
where resource_type in ('slide_deck', 'ppt', 'pptx')
  and category = 'resource';

-- Ambassador prep content (scripts, walkthrough videos, delivery checklists)
-- belongs on the Training tab. School-facing flyers and checklists stay as
-- general resources — the school portal ignores categories entirely.
update public.presentation_resources
set category = 'training'
where category = 'resource'
  and 'ambassador' = any(audiences);

-- ---------------------------------------------------------------- from 0016
-- Keep the platform from ever losing its final active super admin.
create or replace function public.active_super_admin_count()
returns integer
language sql
stable
as $$
  select count(*)::int
  from public.profiles
  where role = 'super_admin'
    and status = 'active'
$$;

create or replace function public.prevent_removing_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  still_active_super_admins integer;
begin
  if tg_op = 'DELETE'
    and old.role = 'super_admin'
    and old.status = 'active' then
    perform pg_advisory_xact_lock(hashtext('public.profiles.active_super_admin_guard')::bigint);

    select count(*)::int
    into still_active_super_admins
    from public.profiles
    where role = 'super_admin'
      and status = 'active'
      and id <> old.id;

    if still_active_super_admins = 0 then
      raise exception 'At least one active super admin is required.';
    end if;

    return old;
  end if;

  if tg_op = 'UPDATE'
    and old.role = 'super_admin'
    and old.status = 'active'
    and (
      new.role is distinct from 'super_admin'
      or new.status is distinct from 'active'
    ) then
    perform pg_advisory_xact_lock(hashtext('public.profiles.active_super_admin_guard')::bigint);

    select count(*)::int
    into still_active_super_admins
    from public.profiles
    where role = 'super_admin'
      and status = 'active'
      and id <> old.id;

    if still_active_super_admins = 0 then
      raise exception 'At least one active super admin is required.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_removing_last_super_admin on public.profiles;

create trigger prevent_removing_last_super_admin
before update or delete on public.profiles
for each row execute function public.prevent_removing_last_super_admin();

-- ---------------------------------------------------------------- from 0017
-- Ambassador withdrawal requests: reason + timestamp live on the session so
-- staff can review pending requests without loading booking_status_history.
alter table public.booking_sessions
  add column if not exists withdrawal_reason text,
  add column if not exists withdrawal_requested_at timestamptz;
