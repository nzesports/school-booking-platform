-- Structured answers from the school post-session feedback form
-- (students competed, per-category ratings, club questions, mailing list).
alter table public.presentation_reviews
  add column if not exists details jsonb;
