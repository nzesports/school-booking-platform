-- The live handle_new_auth_user function errors on its school branch
-- ("Database error creating new user" for any school-role signup), which
-- breaks public school account registration. Re-apply the known-good
-- definition from 0005 to replace whatever drifted on the live database.
--
-- Run this in the Supabase SQL editor, then verify by signing up a test
-- school account. If it still fails, check Dashboard -> Logs -> Postgres
-- for the underlying error raised inside handle_new_auth_user.

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
