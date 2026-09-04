-- Presentation training packs have their own lifecycle. Removing a training
-- pack must not retire the public presentation that the pack is attached to.
alter table public.presentation_types
  add column if not exists training_pack_enabled boolean not null default true;

