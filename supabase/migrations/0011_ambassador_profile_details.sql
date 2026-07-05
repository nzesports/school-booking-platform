-- Extra ambassador profile fields for the redesigned profile page: mailing
-- address, payout email, invoicing details, booking preferences, and weekly
-- availability. Stored as one jsonb blob so future profile fields don't need
-- further schema changes. The app tolerates this column being absent, but
-- the new fields only persist once this has run.
alter table public.ambassador_profiles
  add column if not exists profile_details jsonb not null default '{}'::jsonb;
