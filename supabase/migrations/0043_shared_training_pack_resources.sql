create table public.training_pack_resources (
  training_pack_id uuid not null references public.training_resource_packs(id) on delete cascade,
  resource_id uuid not null references public.presentation_resources(id) on delete cascade,
  primary key (training_pack_id, resource_id)
);
insert into public.training_pack_resources (training_pack_id, resource_id)
select training_pack_id, id from public.presentation_resources where training_pack_id is not null;
alter table public.training_pack_resources enable row level security;
create policy "staff manage pack resources" on public.training_pack_resources
for all to authenticated using (public.is_staff_like()) with check (public.is_staff_like());

-- Preserve the original pack field for old forms while allowing additional links.
create function public.sync_resource_primary_pack() returns trigger language plpgsql
set search_path = public as $$
begin
  if TG_OP = 'UPDATE' and OLD.training_pack_id is distinct from NEW.training_pack_id then
    delete from training_pack_resources where resource_id = NEW.id and training_pack_id = OLD.training_pack_id;
  end if;
  if NEW.training_pack_id is not null then
    insert into training_pack_resources values (NEW.training_pack_id, NEW.id) on conflict do nothing;
  end if;
  return NEW;
end;
$$;
create trigger sync_resource_primary_pack after insert or update of training_pack_id
on public.presentation_resources for each row execute function public.sync_resource_primary_pack();
