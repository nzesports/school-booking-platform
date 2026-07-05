-- Adds a promotional video link to presentations, editable from the admin
-- presentation editor and embedded on the public presentation detail page.
alter table public.presentation_types
  add column if not exists youtube_url text;
