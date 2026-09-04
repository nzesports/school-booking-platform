-- Published resources are the only resources visible outside Staff and Super Admin.
-- Audience selection controls which signed-in portal(s) receive each published item.
drop policy if exists "public read public resources" on public.presentation_resources;

create policy "public read public resources"
on public.presentation_resources for select
to anon, authenticated
using (
  is_active = true
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
      or audiences && array['school']
    )
  )
);

-- The working Digital Wellbeing slide deck is presenter-only NZ Esports IP.
update public.presentation_resources
set audiences = array['ambassador']::text[]
where lower(title) = 'digital wellbeing slide deck';
