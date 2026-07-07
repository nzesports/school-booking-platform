-- 0015: classify library items as general resources, training content, or
-- presentation materials (the decks ambassadors grab before a session).
alter table public.presentation_resources
  add column if not exists category text not null default 'resource'
  check (category in ('resource', 'training', 'presentation_material'));

-- Existing slide decks are what the Materials tab is for — move them over.
update public.presentation_resources
set category = 'presentation_material'
where resource_type in ('slide_deck', 'ppt', 'pptx')
  and category = 'resource';

-- Ambassador prep content (scripts, walkthrough videos, delivery checklists)
-- belongs on the Training tab. School-facing flyers and checklists stay as
-- general resources — the school portal ignores categories entirely.
update public.presentation_resources
set category = 'training'
where category = 'resource'
  and 'ambassador' = any(audiences);
