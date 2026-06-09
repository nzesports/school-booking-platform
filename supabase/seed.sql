insert into public.roles (name, description, is_system_role)
values
  ('super_admin', 'Full platform access', true),
  ('staff', 'Operational booking and delivery staff', true),
  ('ambassador', 'Approved presenter role', true),
  ('school', 'School contact role', true)
on conflict (name) do nothing;

insert into public.regions (name, slug, sort_order)
values
  ('Auckland Central', 'auckland-central', 1),
  ('South Auckland', 'south-auckland', 2),
  ('West Auckland', 'west-auckland', 3),
  ('East Auckland', 'east-auckland', 4),
  ('North Shore', 'north-shore', 5),
  ('Christchurch', 'christchurch', 6),
  ('Wellington', 'wellington', 7),
  ('Hamilton', 'hamilton', 8),
  ('Tauranga', 'tauranga', 9),
  ('Dunedin', 'dunedin', 10),
  ('Palmerston North', 'palmerston-north', 11),
  ('Nelson', 'nelson', 12),
  ('Queenstown', 'queenstown', 13),
  ('Other / request region', 'other-request-region', 14)
on conflict (slug) do nothing;

insert into public.presentation_types (
  title,
  slug,
  short_summary,
  full_description,
  year_levels,
  duration_minutes,
  delivery_formats,
  is_active,
  is_public,
  sort_order
)
values
  (
    'Digital Wellbeing',
    'digital-wellbeing',
    'Promote healthy habits, screen balance and positive digital choices.',
    'A practical presentation that helps students build healthy relationships with technology and gaming.',
    'Years 7 to 13',
    60,
    array['assembly', 'classroom'],
    true,
    true,
    1
  ),
  (
    'Esports Pathways',
    'esports-pathways',
    'Explore structured esports and the roles around it.',
    'An engaging session covering teamwork, competition, events, production, and future opportunities in esports.',
    'Years 7 to 13',
    50,
    array['assembly', 'workshop'],
    true,
    true,
    2
  ),
  (
    'Careers',
    'careers',
    'Connect digital interests to real education and career pathways.',
    'A careers-focused session that helps students connect esports, media, and tech interests to real opportunities.',
    'Years 9 to 13',
    45,
    array['assembly', 'classroom'],
    true,
    true,
    3
  ),
  (
    'Understanding Esports',
    'understanding-esports',
    'Help schools understand esports in a safe, structured education context.',
    'A foundational overview of esports for schools, students, and whānau-facing contexts.',
    'Years 7 to 13',
    45,
    array['assembly', 'online'],
    true,
    true,
    4
  )
on conflict (slug) do nothing;

insert into public.availability_rules (
  name,
  scope,
  day_of_week,
  start_time,
  end_time,
  slot_interval_minutes,
  is_active
)
values
  ('Default school hours Monday', 'global', 1, '08:00', '16:00', 60, true),
  ('Default school hours Tuesday', 'global', 2, '08:00', '16:00', 60, true),
  ('Default school hours Wednesday', 'global', 3, '08:00', '16:00', 60, true),
  ('Default school hours Thursday', 'global', 4, '08:00', '16:00', 60, true),
  ('Default school hours Friday', 'global', 5, '08:00', '16:00', 60, true);

insert into public.settings (setting_key, setting_value)
values
  (
    'booking_defaults',
    '{"startHour":"08:00","endHour":"16:00","slotIntervalMinutes":60,"publicHolidayBlock":true}'::jsonb
  ),
  (
    'payments',
    '{"defaultAmountCents":25000,"currency":"NZD","eligibleAttendeeThreshold":100}'::jsonb
  ),
  (
    'branding',
    '{"senderEmail":"info@esf.nz","primaryDomain":"schoolbookings.org.nz"}'::jsonb
  )
on conflict (setting_key) do nothing;

insert into public.homepage_sections (section_key, title, subtitle, body, sort_order)
values
  (
    'hero',
    'Inspiring the next generation through esports.',
    'School Presentations',
    'Curriculum-aligned, engaging presentations that educate, inspire and empower students to thrive in the digital age.',
    1
  ),
  (
    'how_it_works',
    'How school bookings work',
    'Simple for schools, operationally strong for staff',
    'Schools request sessions, staff review capacity, ambassadors apply, and confirmed sessions sync into internal workflows.',
    2
  ),
  (
    'cta',
    'Ready to book a presentation?',
    'Book a Presentation',
    'Start with one session or build a multi-session school request.',
    3
  )
on conflict (section_key) do nothing;

insert into public.faqs (question, answer, sort_order)
values
  (
    'How quickly are bookings confirmed?',
    'All requests start as tentative. Staff review regional availability and ambassador coverage before confirming.',
    1
  ),
  (
    'Can we request multiple sessions?',
    'Yes. One booking request can include multiple presentation sessions across one or more dates.',
    2
  ),
  (
    'What equipment do schools need?',
    'Most sessions need only a projector or screen. Specific requirements are listed on each presentation.',
    3
  );

insert into public.email_templates (template_key, name, subject, body_html, body_text)
values
  (
    'booking_request_received',
    'School booking request received',
    'We have received your presentation request',
    '<p>Thanks for your booking request. Our team will review availability and follow up shortly.</p>',
    'Thanks for your booking request. Our team will review availability and follow up shortly.'
  ),
  (
    'school_booking_confirmed',
    'School booking confirmed',
    'Your NZ Esports presentation has been confirmed',
    '<p>Your booking has been confirmed. We will send final session details and ambassador information next.</p>',
    'Your booking has been confirmed. We will send final session details and ambassador information next.'
  ),
  (
    'ambassador_assignment_confirmation',
    'Ambassador assignment confirmation',
    'You have been assigned to a new school presentation',
    '<p>You have been assigned to a new school presentation. Please review the session details in your ambassador dashboard.</p>',
    'You have been assigned to a new school presentation. Please review the session details in your ambassador dashboard.'
  )
on conflict (template_key) do nothing;
