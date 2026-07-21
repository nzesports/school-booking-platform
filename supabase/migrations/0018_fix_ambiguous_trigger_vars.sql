-- School signups fail with 42702 (column reference "school_contact_id" is
-- ambiguous), which aborts the whole /auth/v1/signup transaction — no auth
-- user, profile, or confirmation email is ever created.
--
-- Cause: handle_new_auth_user declared a variable named school_contact_id,
-- identical to the column on school_contact_users. plpgsql substitutes
-- variables inside ON CONFLICT (...) index-inference expressions, so
-- "on conflict (school_contact_id, user_id)" is ambiguous between the column
-- and the variable. 0010 re-applied the 0005 body, which carries the same
-- collision, so the error persisted.
--
-- Fix: same logic, with all local variables renamed to a v_ prefix so no
-- variable can shadow a column. Run this in the Supabase SQL editor, then
-- verify with a test school signup.

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

  if v_selected_role = 'school' then
    select sc.id, sc.school_id
    into v_school_contact_id, v_school_record_id
    from public.school_contacts sc
    where lower(sc.email) = lower(coalesce(new.email, v_metadata->>'email', ''))
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
