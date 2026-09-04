-- Treat existing ambassador resources linked to a presentation as presentation
-- materials. Explicit training resources keep their training classification.
update public.presentation_resources
set category = 'presentation_material'
where presentation_type_id is not null
  and category = 'resource'
  and 'ambassador' = any(audiences);
