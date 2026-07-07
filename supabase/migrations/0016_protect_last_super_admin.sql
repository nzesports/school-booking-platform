-- Keep the platform from ever losing its final active super admin.
-- This is enforced in the database so direct SQL/API changes cannot bypass the
-- admin UI guards.

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
