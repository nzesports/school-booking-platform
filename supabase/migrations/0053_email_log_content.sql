-- Keep the subject and the exact branded HTML of each logged email so staff
-- can preview what a school actually received from the booking's Emails tab.
-- Rows logged before this migration have no stored content.
--
-- email_logs keeps its existing staff-read / service-write policies (0001).

alter table public.email_logs
  add column if not exists subject text,
  add column if not exists html_body text;
