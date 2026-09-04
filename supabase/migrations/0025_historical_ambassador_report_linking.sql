-- Historical report imports can predate an ambassador's portal account.
-- Keep the report and presenter name now, then attach it automatically when
-- an ambassador profile with the same normalized full name is created.

alter table public.ambassador_reports
  alter column ambassador_profile_id drop not null;

create or replace function public.normalized_person_name(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function public.resolve_historical_report_ambassador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ambassador_profile_id is null and nullif(trim(new.presenter_name), '') is not null then
    select ap.id
      into new.ambassador_profile_id
    from public.ambassador_profiles ap
    join public.profiles p on p.id = ap.user_id
    where public.normalized_person_name(p.full_name) =
      public.normalized_person_name(new.presenter_name)
    order by
      case when ap.status = 'approved' then 0 else 1 end,
      ap.created_at asc
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists resolve_historical_report_ambassador on public.ambassador_reports;
create trigger resolve_historical_report_ambassador
before insert or update of presenter_name, ambassador_profile_id
on public.ambassador_reports
for each row execute function public.resolve_historical_report_ambassador();

create or replace function public.link_historical_reports_after_ambassador_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_ambassador_id uuid;
  target_name text;
begin
  if tg_table_name = 'ambassador_profiles' then
    target_ambassador_id := new.id;

    select p.full_name
      into target_name
    from public.profiles p
    where p.id = new.user_id;
  else
    select ap.id
      into target_ambassador_id
    from public.ambassador_profiles ap
    where ap.user_id = new.id
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

drop trigger if exists link_historical_reports_after_ambassador_profile on public.ambassador_profiles;
create trigger link_historical_reports_after_ambassador_profile
after insert or update of user_id
on public.ambassador_profiles
for each row execute function public.link_historical_reports_after_ambassador_change();

drop trigger if exists link_historical_reports_after_profile_name on public.profiles;
create trigger link_historical_reports_after_profile_name
after update of full_name
on public.profiles
for each row execute function public.link_historical_reports_after_ambassador_change();

-- Reconcile any historical rows that already have a matching account.
update public.ambassador_reports report
set ambassador_profile_id = (
  select ap.id
  from public.ambassador_profiles ap
  join public.profiles p on p.id = ap.user_id
  where public.normalized_person_name(p.full_name) =
    public.normalized_person_name(report.presenter_name)
  order by
    case when ap.status = 'approved' then 0 else 1 end,
    ap.created_at asc
  limit 1
)
where report.ambassador_profile_id is null
  and exists (
    select 1
    from public.ambassador_profiles ap
    join public.profiles p on p.id = ap.user_id
    where public.normalized_person_name(p.full_name) =
      public.normalized_person_name(report.presenter_name)
  );

insert into public.settings (setting_key, setting_value)
values (
  'historical_report_linking_schema',
  jsonb_build_object('version', 1, 'enabled', true)
)
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    updated_at = now();
