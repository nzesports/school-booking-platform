-- Turn ambassador_profiles into the operational volunteer directory as well
-- as the portal-access record. Historical presenters may not have an auth
-- account, while deleted volunteers must keep their delivery/payment history.
alter table public.ambassador_profiles
  alter column user_id drop not null,
  add column if not exists display_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists avatar_url text,
  add column if not exists deleted_at timestamptz;

update public.ambassador_profiles ambassador
set
  display_name = coalesce(nullif(trim(ambassador.display_name), ''), profile.full_name),
  contact_email = coalesce(nullif(trim(ambassador.contact_email), ''), profile.email),
  contact_phone = coalesce(nullif(trim(ambassador.contact_phone), ''), profile.phone),
  avatar_url = coalesce(nullif(trim(ambassador.avatar_url), ''), profile.avatar_url)
from public.profiles profile
where profile.id = ambassador.user_id;

create index if not exists ambassador_profiles_deleted_at_idx
  on public.ambassador_profiles (deleted_at);

-- Resolve reports against either a portal user's name or a directory-only
-- volunteer name.
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
    left join public.profiles p on p.id = ap.user_id
    where ap.deleted_at is null
      and public.normalized_person_name(coalesce(ap.display_name, p.full_name)) =
        public.normalized_person_name(new.presenter_name)
    order by
      case when ap.status = 'approved' then 0 else 1 end,
      ap.created_at asc
    limit 1;
  end if;

  return new;
end;
$$;

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

drop trigger if exists link_historical_reports_after_ambassador_profile on public.ambassador_profiles;
create trigger link_historical_reports_after_ambassador_profile
after insert or update of user_id, display_name
on public.ambassador_profiles
for each row execute function public.link_historical_reports_after_ambassador_change();

-- Promote unmatched historical presenters into directory-only volunteer
-- profiles so the staff roster reflects actual delivery history.
with unmatched_presenters as (
  select
    public.normalized_person_name(report.presenter_name) as normalized_name,
    min(trim(report.presenter_name)) as display_name
  from public.ambassador_reports report
  where report.ambassador_profile_id is null
    and nullif(trim(report.presenter_name), '') is not null
  group by public.normalized_person_name(report.presenter_name)
)
insert into public.ambassador_profiles (
  user_id,
  display_name,
  status,
  open_to_travel
)
select
  null,
  presenter.display_name,
  'inactive',
  false
from unmatched_presenters presenter
where presenter.normalized_name <> ''
  and not exists (
    select 1
    from public.ambassador_profiles ambassador
    left join public.profiles profile on profile.id = ambassador.user_id
    where public.normalized_person_name(coalesce(ambassador.display_name, profile.full_name)) =
      presenter.normalized_name
  );

-- Once historical reports have a directory volunteer, carry that same link
-- onto the delivered session. This makes presentation counts and school
-- feedback attribution use the same ambassador identity.
update public.booking_sessions session
set assigned_ambassador_id = report.ambassador_profile_id
from public.ambassador_reports report
where report.booking_session_id = session.id
  and report.ambassador_profile_id is not null
  and session.assigned_ambassador_id is null;

-- A sourced booking pays the normal $250 delivery fee plus a separately
-- auditable $50 sourcing bonus. amount_cents remains the invoice total.
alter table public.payments
  add column if not exists base_amount_cents int not null default 25000,
  add column if not exists sourcing_bonus_cents int not null default 0;

update public.payments payment
set
  amount_cents = case
    when payment.amount_cents = 25000 then 30000
    else payment.amount_cents
  end,
  base_amount_cents = case
    when payment.amount_cents in (25000, 30000) then 25000
    else greatest(payment.amount_cents - 5000, 0)
  end,
  sourcing_bonus_cents = 5000
where exists (
  select 1
  from public.booking_sessions session
  join public.booking_requests booking on booking.id = session.booking_request_id
  where session.id = payment.booking_session_id
    and booking.ambassador_outreach_by = payment.ambassador_profile_id
    and booking.source in ('ambassador', 'ambassador_booked')
);

update public.payments
set
  base_amount_cents = amount_cents,
  sourcing_bonus_cents = 0
where sourcing_bonus_cents = 0;

alter table public.payments
  drop constraint if exists payments_amount_breakdown_check,
  add constraint payments_amount_breakdown_check
    check (amount_cents = base_amount_cents + sourcing_bonus_cents);

create index if not exists booking_requests_ambassador_outreach_by_idx
  on public.booking_requests (ambassador_outreach_by)
  where ambassador_outreach_by is not null;

insert into public.settings (setting_key, setting_value)
values (
  'ambassador_operations_schema',
  jsonb_build_object(
    'version', 1,
    'deliveryFeeCents', 25000,
    'sourcingBonusCents', 5000,
    'directoryProfiles', true
  )
)
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    updated_at = now();
