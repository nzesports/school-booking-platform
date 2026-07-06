-- School-managed profile: logo shown across the platform, and free-form notes
-- (availability windows, site instructions) shared with the NZ Esports team.
alter table public.schools
  add column if not exists logo_url text,
  add column if not exists profile_notes text;
