update public.ambassador_reports
set
  student_response_rating = coalesce(student_response_rating, student_engagement_rating),
  student_questions_themes = coalesce(student_questions_themes, notable_questions),
  media_consent_confirmed = media_consent_confirmed or media_consent_obtained
where
  student_engagement_rating is not null
  or notable_questions is not null
  or media_consent_obtained is not null;

alter table public.ambassador_reports
  drop column if exists student_engagement_rating,
  drop column if exists notable_questions,
  drop column if exists media_consent_obtained;

alter table public.presentation_resources
  drop column if exists audience;

drop view if exists public.ambassador_open_booking_sessions;
