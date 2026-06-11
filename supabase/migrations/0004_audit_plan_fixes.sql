alter table public.presentation_reviews
add column if not exists booking_session_id uuid references public.booking_sessions(id) on delete set null;

alter table public.ambassador_reports
add column if not exists student_engagement_rating smallint check (student_engagement_rating between 1 and 5),
add column if not exists notable_questions text,
add column if not exists media_consent_obtained boolean not null default false;

alter table public.booking_requests
alter column primary_contact_id drop not null;

alter table public.booking_activity_logs
add column if not exists actor_type text;

alter table public.training_modules
add column if not exists is_required boolean not null default true,
add column if not exists is_published boolean not null default true;
