create or replace function public.prevent_profile_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('request.jwt.claims', true) is null
     or (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role' then
    return new;
  end if;

  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and not public.is_staff_like() then
    raise exception 'Only staff can change role or status.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_privilege_change on public.profiles;

create trigger prevent_profile_privilege_change
before update on public.profiles
for each row execute function public.prevent_profile_privilege_change();

drop policy if exists "users insert own profile" on public.profiles;

create or replace function public.prevent_ambassador_self_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('request.jwt.claims', true) is null
     or (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role' then
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

drop trigger if exists prevent_ambassador_self_approval on public.ambassador_profiles;

create trigger prevent_ambassador_self_approval
before update on public.ambassador_profiles
for each row execute function public.prevent_ambassador_self_approval();

delete from public.ambassador_profiles a
using public.ambassador_profiles b
where a.user_id = b.user_id
  and a.created_at > b.created_at;

create unique index if not exists ambassador_profiles_user_id_key
  on public.ambassador_profiles(user_id);

create unique index if not exists presentation_reviews_session_key
  on public.presentation_reviews(booking_session_id)
  where booking_session_id is not null;

drop policy if exists "public submit booking requests" on public.booking_requests;
drop policy if exists "public and staff create booking sessions" on public.booking_sessions;

create policy "staff create booking requests"
on public.booking_requests for insert
to authenticated
with check (public.is_staff_like());

create policy "staff create booking sessions"
on public.booking_sessions for insert
to authenticated
with check (public.is_staff_like());

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
