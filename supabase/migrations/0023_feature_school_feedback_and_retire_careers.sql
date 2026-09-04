update public.presentation_types
set
  is_active = false,
  is_public = false,
  updated_at = now()
where slug = 'careers';

update public.presentation_types
set
  sort_order = 3,
  updated_at = now()
where slug = 'understanding-esports';

with feedback_schools(name) as (
  values
    ('St Peter''s College, Palmerston North'),
    ('Havelock North Intermediate'),
    ('North West College'),
    ('Waiheke High School'),
    ('ANI'),
    ('Huntly College'),
    ('Ormiston Primary'),
    ('Wairarapa Cobham Intermediate')
)
insert into public.schools (name, status)
select name, 'active'
from feedback_schools
where not exists (
  select 1
  from public.schools
  where lower(public.schools.name) = lower(feedback_schools.name)
);

with featured_feedback(
  school_name,
  quote,
  attribution,
  rating,
  attendance_rating,
  student_response_rating,
  content_rating,
  presenter_energy_rating,
  had_esports_club,
  considering_club,
  mailing_list_opt_in,
  delivered_at
) as (
  values
    (
      'St Peter''s College, Palmerston North',
      'He hooked them in with the ESports which really helped him to get the message across. The year 10s were super engaged in it. I would recommend it for others too.',
      'School feedback',
      5.0,
      5.0, 5.0, 5.0, 5.0,
      'no', 'no', 'yes',
      '2026-08-06T09:00:00+12:00'::timestamptz
    ),
    (
      'Havelock North Intermediate',
      'That was the best special assembly we''ve had',
      'Attendee feedback',
      4.6,
      5.0, 4.3, 4.3, 5.0,
      'no', 'yes', 'yes',
      '2026-08-05T13:30:00+12:00'::timestamptz
    ),
    (
      'North West College',
      'Everyone loved it, including all of the teachers - most of whom were very skeptical of the presentation going into it.',
      'School feedback',
      5.0,
      5.0, 5.0, 5.0, 5.0,
      'no', 'yes', 'yes',
      '2026-06-05T01:30:00+12:00'::timestamptz
    ),
    (
      'Waiheke High School',
      'They really enjoyed it and wished there was longer to do more and ask more questions.',
      'School feedback',
      5.0,
      5.0, 5.0, 5.0, 5.0,
      'yes', null, 'yes',
      '2025-06-11T08:00:00+12:00'::timestamptz
    ),
    (
      'ANI',
      'The students loved the presentation they all want me to set up an esports club now, which is my next step.',
      'School feedback',
      5.0,
      5.0, 5.0, 5.0, 5.0,
      'no', 'yes', 'yes',
      '2025-06-09T13:30:00+12:00'::timestamptz
    ),
    (
      'Huntly College',
      'They loved the idea of Esports and are very keen to start something like it at school. Sam was an excellent presenter and held their attention. Especially in the game.',
      'School feedback',
      5.0,
      5.0, 5.0, 5.0, 5.0,
      'no', 'yes', 'yes',
      '2025-06-04T10:40:00+12:00'::timestamptz
    ),
    (
      'Ormiston Primary',
      'Belinda was great. The presentation was pitched at the right level for our year 5/6 learners',
      'School feedback',
      5.0,
      5.0, 5.0, 5.0, 5.0,
      'no', 'yes', 'yes',
      '2024-08-28T01:00:00+12:00'::timestamptz
    ),
    (
      'Wairarapa Cobham Intermediate',
      'Really engaging, insightful with useful info for future esporters',
      'School feedback',
      4.6,
      4.3, 4.3, 5.0, 5.0,
      'yes', null, 'yes',
      '2024-06-28T13:00:00+12:00'::timestamptz
    )
)
insert into public.presentation_reviews (
  school_id,
  quote,
  attribution,
  rating,
  details,
  is_approved,
  is_public,
  created_at
)
select
  school.id,
  feedback.quote,
  feedback.attribution,
  feedback.rating,
  jsonb_build_object(
    'featuredOnHomepage', true,
    'source', 'School Esports Presentation - School Feedback workbook',
    'originalRatingScale', 7,
    'attendanceRating', feedback.attendance_rating,
    'studentResponseRating', feedback.student_response_rating,
    'contentRating', feedback.content_rating,
    'presenterEnergyRating', feedback.presenter_energy_rating,
    'hadEsportsClub', feedback.had_esports_club,
    'consideringClub', feedback.considering_club,
    'mailingListOptIn', feedback.mailing_list_opt_in
  ),
  true,
  true,
  feedback.delivered_at
from featured_feedback feedback
join lateral (
  select id
  from public.schools
  where lower(public.schools.name) = lower(feedback.school_name)
  order by created_at asc
  limit 1
) school on true
where not exists (
  select 1
  from public.presentation_reviews existing
  where existing.school_id = school.id
    and existing.quote = feedback.quote
);

update public.presentation_reviews
set presentation_type_id = (
  select id
  from public.presentation_types
  where slug = 'digital-wellbeing'
  limit 1
)
where details ->> 'source' = 'School Esports Presentation - School Feedback workbook';
