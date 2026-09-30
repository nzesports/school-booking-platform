-- Internal staff notes on ambassador profiles: a short discussion thread per
-- ambassador (top-level notes with one level of replies) for staff and super
-- admins only. Ambassadors must never see these, so the table has no API
-- grants at all: the app reads and writes it with the service role after
-- checking staff access.

create table if not exists public.ambassador_notes (
  id uuid primary key default gen_random_uuid(),
  ambassador_profile_id uuid not null references public.ambassador_profiles(id) on delete cascade,
  parent_id uuid references public.ambassador_notes(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists ambassador_notes_profile_created_idx
  on public.ambassador_notes (ambassador_profile_id, created_at desc);
create index if not exists ambassador_notes_parent_idx
  on public.ambassador_notes (parent_id);

alter table public.ambassador_notes enable row level security;
revoke all on public.ambassador_notes from anon, authenticated;
