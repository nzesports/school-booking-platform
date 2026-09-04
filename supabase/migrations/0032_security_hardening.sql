-- Security hardening pass from the data-connectivity audit.
--
-- 1. RLS helper functions become SECURITY DEFINER so school-side policies work
--    and the profiles-policy recursion hazard is removed.
-- 2. presentation_reviews gets policies (RLS was enabled with none).
-- 3. Plain staff can no longer grant or revoke the super_admin role.
-- 4. Training content is scoped to staff and ambassadors instead of any
--    authenticated account.
-- 5. The unused ambassador_open_bookings view is dropped (it was recreated in
--    0021 without security_invoker, exposing open-session rows to anon).
-- 6. One ambassador report per booking session is enforced in the database.

-- ---------------------------------------------------------------------------
-- 1. Helper functions as SECURITY DEFINER.
--
-- is_school_contact_for_school() was invoker-rights SQL, so for school users
-- its lookup on school_contact_users (which only has a staff-only policy)
-- always returned 0 rows — every school-side RLS clause on schools,
-- school_contacts, booking_requests, and booking_sessions was dead. Definer
-- rights let the helper read the mapping tables regardless of the caller's own
-- row access, while the function bodies stay scoped to auth.uid().
-- current_role()/is_staff_like()/current_ambassador_profile_id() get the same
-- treatment to remove the recursion hazard where profiles' own SELECT policy
-- calls is_staff_like(), which reads profiles.

create or replace function public.is_school_contact_for_school(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.school_contact_users scu
    join public.school_contacts sc on sc.id = scu.school_contact_id
    where scu.user_id = auth.uid()
      and sc.school_id = target_school_id
  )
$$;

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
  limit 1
$$;

create or replace function public.is_staff_like()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in ('staff', 'super_admin'), false)
$$;

create or replace function public.current_ambassador_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.ambassador_profiles
  where user_id = auth.uid()
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- 2. presentation_reviews policies. RLS has been enabled since 0001 with zero
-- policies, so every authenticated read silently returned nothing. Staff get
-- full access and schools can read their own reviews. Writes stay
-- service-role-only: the app inserts reviews via the admin client, so no
-- school insert policy is added.

drop policy if exists "staff manage presentation reviews" on public.presentation_reviews;
create policy "staff manage presentation reviews"
on public.presentation_reviews for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

drop policy if exists "schools read own presentation reviews" on public.presentation_reviews;
create policy "schools read own presentation reviews"
on public.presentation_reviews for select
to authenticated
using (public.is_school_contact_for_school(school_id));

-- ---------------------------------------------------------------------------
-- 3. Stop staff self-promotion to super_admin. The 0005 trigger only required
-- is_staff_like() to change role/status, so any staff account could grant
-- itself (or another account) super_admin. Changing role to or from
-- super_admin, or touching a super_admin profile's status, now requires the
-- caller to be a super admin. Plain staff keep their existing ability to
-- change roles/statuses of non-super-admin profiles. The last-active-super-
-- admin guard from 0016/0019 is a separate trigger and is left untouched.

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

drop trigger if exists prevent_profile_privilege_change on public.profiles;

create trigger prevent_profile_privilege_change
before update on public.profiles
for each row execute function public.prevent_profile_privilege_change();

-- ---------------------------------------------------------------------------
-- 4. Training content is internal material. The 0001 policies let any
-- authenticated account (including school logins) read every module and
-- lesson. Reads are now limited to staff and users with an ambassador
-- profile; non-staff still only see active modules and lessons belonging to
-- them. training_lessons has no is_active column of its own, so lessons are
-- scoped through their parent module.

drop policy if exists "authenticated read training" on public.training_modules;
create policy "authenticated read training"
on public.training_modules for select
to authenticated
using (
  public.is_staff_like()
  or (is_active and public.current_ambassador_profile_id() is not null)
);

drop policy if exists "authenticated read training lessons" on public.training_lessons;
create policy "authenticated read training lessons"
on public.training_lessons for select
to authenticated
using (
  public.is_staff_like()
  or (
    public.current_ambassador_profile_id() is not null
    and exists (
      select 1
      from public.training_modules module
      where module.id = training_lessons.training_module_id
        and module.is_active
    )
  )
);

-- ---------------------------------------------------------------------------
-- 5. Drop the ambassador_open_bookings view. 0021 recreated it without
-- security_invoker, so PostgREST's default grants exposed open-session data
-- (school scheduling details) to anon. The app never queries the view.

drop view if exists public.ambassador_open_bookings;

-- ---------------------------------------------------------------------------
-- 6. One ambassador report per booking session. Duplicate prevention was
-- app-level only. Dedupe first, keeping the earliest report per session (the
-- app resolves duplicates to the oldest report), then enforce with a partial
-- unique index — mirroring presentation_reviews_session_key from 0005.

delete from public.ambassador_reports a
using public.ambassador_reports b
where a.booking_session_id is not null
  and a.booking_session_id = b.booking_session_id
  and a.id <> b.id
  and (a.submitted_at, a.id) > (b.submitted_at, b.id);

create unique index if not exists ambassador_reports_session_key
  on public.ambassador_reports (booking_session_id)
  where booking_session_id is not null;
