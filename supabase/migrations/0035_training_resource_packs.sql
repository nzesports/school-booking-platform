-- Training packs are managed independently from public presentations. A pack
-- may optionally be linked to a presentation, but deleting it never deletes
-- or retires that presentation.
create table if not exists public.training_resource_packs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  presentation_type_id uuid references public.presentation_types(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists training_resource_packs_presentation_key
  on public.training_resource_packs (presentation_type_id)
  where presentation_type_id is not null;

drop trigger if exists set_training_resource_packs_updated_at on public.training_resource_packs;
create trigger set_training_resource_packs_updated_at
before update on public.training_resource_packs
for each row execute function public.set_updated_at();

alter table public.presentation_resources
  add column if not exists training_pack_id uuid
  references public.training_resource_packs(id) on delete set null;

-- Preserve the existing presentation-based packs as first-class pack rows.
insert into public.training_resource_packs (title, presentation_type_id)
select presentation.title, presentation.id
from public.presentation_types presentation
where coalesce(presentation.training_pack_enabled, true)
on conflict (presentation_type_id) where presentation_type_id is not null do nothing;

-- Keep every existing training resource in the equivalent migrated pack.
update public.presentation_resources resource
set training_pack_id = pack.id
from public.training_resource_packs pack
where resource.category = 'training'
  and resource.training_pack_id is null
  and resource.presentation_type_id = pack.presentation_type_id;

alter table public.training_resource_packs enable row level security;

drop policy if exists "staff read training resource packs" on public.training_resource_packs;
create policy "staff read training resource packs"
on public.training_resource_packs for select
to authenticated
using (public.is_staff_like());

drop policy if exists "staff manage training resource packs" on public.training_resource_packs;
create policy "staff manage training resource packs"
on public.training_resource_packs for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

