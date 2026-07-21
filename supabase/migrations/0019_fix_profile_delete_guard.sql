-- Deleting any non-super-admin profile silently did nothing: the 0016 guard
-- trigger ended with "return new", and NEW is NULL in a DELETE trigger, which
-- cancels the delete without an error. It also broke the auth.users -> profiles
-- ON DELETE CASCADE (the suppressed cascade surfaces as an FK violation), so
-- test users could not be removed from the Authentication dashboard either.
--
-- Fix: DELETE paths always return OLD; only the last-active-super-admin case
-- raises. Run this in the Supabase SQL editor.

create or replace function public.prevent_removing_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  still_active_super_admins integer;
begin
  if tg_op = 'DELETE' then
    if old.role = 'super_admin' and old.status = 'active' then
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
