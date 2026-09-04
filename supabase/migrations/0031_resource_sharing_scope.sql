-- Sharing permission is an internal safety label for portal users. It is not a
-- publishing destination and must never make a resource visible on the website.
alter table public.presentation_resources
  add column if not exists sharing_scope text not null default 'internal'
    check (sharing_scope in ('internal', 'public'));

update public.presentation_resources
set sharing_scope = 'public'
where
  category = 'resource'
  and audiences && array['public', 'school'];

-- Preserve the intent of existing labels while removing presentation/training
-- content from the public-website audience.
update public.presentation_resources
set
  sharing_scope = case
    when 'public' = any(audiences) then 'public'
    else 'internal'
  end,
  audiences = array_remove(audiences, 'public')
where category in ('training', 'presentation_material');

update public.presentation_resources
set audiences = array_remove(audiences, 'school')
where
  category in ('training', 'presentation_material')
  and sharing_scope = 'internal';

-- The working Digital Wellbeing deck is always internal NZ Esports IP.
update public.presentation_resources
set
  sharing_scope = 'internal',
  audiences = array['ambassador']::text[]
where lower(title) = 'digital wellbeing slide deck';

drop policy if exists "public read public resources" on public.presentation_resources;

create policy "public read public resources"
on public.presentation_resources for select
to anon, authenticated
using (
  category = 'resource'
  and is_active = true
  and is_current = true
  and 'public' = any(audiences)
);

drop policy if exists "relevant users read resources" on public.presentation_resources;

create policy "relevant users read resources"
on public.presentation_resources for select
to authenticated
using (
  public.is_staff_like()
  or (
    is_active = true
    and is_current = true
    and (
      (audiences && array['ambassador'] and public.current_ambassador_profile_id() is not null)
      or (audiences && array['school'] and sharing_scope = 'public')
    )
  )
);
