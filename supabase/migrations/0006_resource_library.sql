alter table public.presentation_resources
  add column if not exists audiences text[] not null default '{}',
  add column if not exists tags text[] not null default '{}';

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
  end if;
end $$;

create index if not exists presentation_resources_audiences_idx
  on public.presentation_resources using gin (audiences);

create index if not exists presentation_resources_tags_idx
  on public.presentation_resources using gin (tags);

drop policy if exists "relevant users read resources" on public.presentation_resources;

create policy "relevant users read resources"
on public.presentation_resources for select
to authenticated
using (
  public.is_staff_like()
  or (audiences && array['ambassador'] and public.current_ambassador_profile_id() is not null)
  or (audiences && array['school'])
);
