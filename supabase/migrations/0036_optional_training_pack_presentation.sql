-- Training packs can stand alone. The presentation relationship is optional
-- and should only be used when a pack belongs to a specific presentation.
alter table public.training_resource_packs
  alter column presentation_type_id drop not null;
