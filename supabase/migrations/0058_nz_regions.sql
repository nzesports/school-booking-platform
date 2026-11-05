-- Regions for the rest of New Zealand, so schools outside the original list
-- have somewhere real to go instead of "Other". Existing regions keep their
-- ids and order; "Other" stays last on the booking form.

insert into public.regions (slug, name, sort_order, is_active)
values
  ('northland', 'Northland', 14, true),
  ('waikato', 'Waikato', 15, true),
  ('bay-of-plenty', 'Bay of Plenty', 16, true),
  ('gisborne', 'Gisborne', 17, true),
  ('hawkes-bay', 'Hawke''s Bay', 18, true),
  ('taranaki', 'Taranaki', 19, true),
  ('manawatu-whanganui', 'Manawatū-Whanganui', 20, true),
  ('marlborough', 'Marlborough', 21, true),
  ('tasman', 'Tasman', 22, true),
  ('west-coast', 'West Coast', 23, true),
  ('canterbury', 'Canterbury', 24, true),
  ('otago', 'Otago', 25, true),
  ('southland', 'Southland', 26, true)
on conflict (slug) do nothing;

update public.regions
set sort_order = 27
where slug = 'other-request-region';
