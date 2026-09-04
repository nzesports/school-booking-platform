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
  ('Other', 'other-request-region', 14)
on conflict (slug) do nothing;

insert into public.presentation_types (
  title,
  slug,
  short_summary,
  full_description,
  year_levels,
  duration_minutes,
  delivery_formats,
  learning_outcomes,
  required_equipment,
  accent_color,
  is_active,
  is_public,
  sort_order
)
values
  (
    'Digital Wellbeing',
    'digital-wellbeing',
    'Help students build healthier gaming and screen habits through practical lessons on breaks, movement, sleep, hydration and nutrition.',
    '<p>A practical, student-friendly presentation that helps young people build healthier relationships with gaming and technology. Students learn how to recognise when their brain needs a break and explore how movement, sleep, hydration and nutrition can affect focus, mood and performance.</p><p>The presentation takes a positive approach to gaming while giving students simple, practical habits they can use both on and away from screens.</p>',
    'Years 5 to 6, Years 7 to 8, Years 9 to 13',
    10,
    array['Assembly', 'classroom'],
    E'Recognise the signs of screen fatigue :: Learn to identify signs such as tired eyes, headaches, frustration, reduced focus and the urge to keep playing when it is time to take a break.\nBuild healthier gaming routines :: Understand why regular breaks and physical activity are important for maintaining focus, energy and wellbeing during gaming and screen time.\nUnderstand the importance of sleep and hydration :: Explore how sleep and hydration can affect concentration, cognitive performance, mood and emotional regulation.\nMake better choices for sustained energy and focus :: Learn how everyday food and drink choices can support concentration and performance, with practical examples students can apply in their daily routines.',
    E'Projector or screen\nMicrophone if needed\nNo gaming equipment, computers or student devices are required.',
    '#18A83B',
    true,
    true,
    1
  ),
  (
    'Esports Pathways',
    'esports-pathways',
    'Explore the careers, study pathways and transferable skills behind gaming and esports, from school competition through to the wider global industry.',
    '<p>A practical presentation showing students where gaming and esports can lead beyond becoming a professional player. Students explore competitive pathways, career opportunities, further study options and the transferable skills they may already be developing through gaming.</p><p>The presentation also helps teachers recognise gaming as a useful way to engage students in conversations about learning, skills and future careers.</p>',
    'Years 9 to 13',
    10,
    array['Assembly', 'classroom', 'careers session'],
    E'Understand esports pathways :: Explore how students can progress from school esports into university competition, community events, national qualifiers, Junior E Blacks and national team opportunities.\nDiscover careers beyond professional gaming :: Learn about the wide range of careers connected to gaming and esports, including game development, live production, coaching, design, marketing, events, broadcasting and management.\nRecognise transferable skills :: Understand how gaming can develop useful skills including communication, teamwork, problem solving, leadership, organisation, critical thinking, adaptability, budgeting and technical literacy.\nExplore study and experience options :: Discover different pathways into the gaming, esports and creative industries through universities, polytechnics, private training establishments and volunteering.',
    E'Projector or screen\nMicrophone if needed\nNo gaming equipment, computers or student devices are required.',
    '#E0A11A',
    true,
    true,
    2
  ),
  (
    'Understanding the Gaming World',
    'understanding-esports',
    'A positive, practical introduction that helps parents and whānau understand young people''s gaming and support healthier habits and conversations.',
    '<p>A practical introduction to gaming and esports for parents and whānau. This presentation helps families better understand what gaming means to young people, addresses common concerns and tension points, and provides practical ways to support a healthier, more balanced relationship with gaming.</p><p>The presentation also introduces school esports, the E Blacks national team and the wide range of career opportunities connected to gaming and esports.</p>',
    'Parents & whānau, Teachers & school staff',
    25,
    array['Parent evening', 'whānau information session', 'school community event'],
    E'Understand the role gaming plays in young people''s lives :: Recognise gaming as a space for social connection, identity, achievement, competition and recreation.\nRecognise common gaming-related tension points :: Understand issues such as difficulty stopping, sleep, time management, online behaviour, stranger interactions and emotional regulation.\nUse practical strategies for healthier conversations about gaming :: Learn how timing, curiosity, boundaries and a balanced lifestyle can reduce conflict around gaming.\nUnderstand where gaming and esports can lead :: Explore pathways ranging from game development and design through to events, marketing, teaching, psychology, sports science and other careers.',
    E'Projector or presentation screen :: For displaying the presentation.\nMicrophone for larger audiences :: Recommended for parent evenings, halls or larger community sessions.\nAudience phones for Q&A, optional :: The presentation includes QR-based audience questions, so attendees can submit questions from their phones if that functionality is being used.',
    '#2563EB',
    true,
    true,
    3
  )
on conflict (slug) do nothing;

update public.presentation_types
set content_snippet = case slug
  when 'digital-wellbeing' then '<p>This is a practical wellbeing presentation rather than a lecture about reducing or stopping gaming. It acknowledges the positive social and personal experiences gaming can provide while helping students understand how to look after themselves when spending time on screens.</p><p>Students are introduced to simple concepts around brain fatigue, movement, sleep, hydration and nutrition, with advice designed to be easy to understand and put into practice.</p>'
  when 'esports-pathways' then '<p>This is not a presentation about simply becoming a professional gamer. It uses students'' existing interest in gaming to show the much wider range of careers, study options and transferable skills connected to the gaming and esports industries.</p><p>Students will see the competitive esports pathway, but will also learn that professional competition represents only a very small part of the wider industry.</p>'
  when 'understanding-esports' then '<p><strong>This is a positive, practical presentation rather than an anti-gaming talk.</strong> It helps parents understand why gaming matters to young people, puts common concerns into context and gives families practical ways to have better conversations and set healthier boundaries.</p>'
end
where slug in ('digital-wellbeing', 'esports-pathways', 'understanding-esports');

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

insert into public.training_modules (
  title,
  description,
  sort_order,
  is_required,
  is_published,
  is_active
)
select
  'Platform Orientation',
  'Learn how to use the ambassador portal, submit reports, and manage your schedule.',
  1,
  true,
  true,
  true
where not exists (
  select 1 from public.training_modules where title = 'Platform Orientation'
);

insert into public.training_modules (
  title,
  description,
  sort_order,
  is_required,
  is_published,
  is_active
)
select
  'Delivery Best Practices',
  'Tips and techniques for delivering engaging presentations to school students.',
  2,
  true,
  true,
  true
where not exists (
  select 1 from public.training_modules where title = 'Delivery Best Practices'
);

insert into public.training_lessons (
  training_module_id,
  title,
  lesson_type,
  youtube_url,
  sort_order
)
select
  tm.id,
  'Portal walkthrough',
  'video',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  1
from public.training_modules tm
where tm.title = 'Platform Orientation'
  and not exists (
    select 1
    from public.training_lessons tl
    where tl.training_module_id = tm.id
      and tl.title = 'Portal walkthrough'
  );

insert into public.training_lessons (
  training_module_id,
  title,
  lesson_type,
  youtube_url,
  sort_order
)
select
  tm.id,
  'Engaging a room',
  'video',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  1
from public.training_modules tm
where tm.title = 'Delivery Best Practices'
  and not exists (
    select 1
    from public.training_lessons tl
    where tl.training_module_id = tm.id
      and tl.title = 'Engaging a room'
  );

insert into public.settings (setting_key, setting_value)
values
  (
    'booking_defaults',
    '{"startHour":"08:00","endHour":"16:00","slotIntervalMinutes":60,"publicHolidayBlock":true}'::jsonb
  ),
  (
    'payments',
    '{"defaultAmountCents":25000,"currency":"NZD","eligibleAttendeeThreshold":100,"financeEmail":"info@esf.nz"}'::jsonb
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
    'Free, school-ready presentations on digital wellbeing, screen time, esports careers and pathways, delivered by NZ Esports ambassadors during your school assembly.',
    1
  ),
  (
    'how_it_works',
    'How school bookings work',
    'Simple steps for schools to book',
    'Build a visit around your students, select your preferred date, and our team will confirm everything with you.',
    2
  ),
  (
    'cta',
    'Bring esports into the conversation, the right way',
    'Book a Presentation',
    'Gaming is already part of students’ lives. Invite our ambassadors to help your school create a supportive, balanced conversation around esports, play and positive digital habits.',
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
    'We have received your presentation request, {{contactName}}',
    '<p>Hi {{contactName}},</p><p>Thanks for your booking request for <strong>{{schoolName}}</strong>.</p><p>Your reference number is <strong>{{bookingId}}</strong>. Our team will review availability and follow up shortly.</p>',
    'Hi {{contactName}}, thanks for your booking request for {{schoolName}}. Reference: {{bookingId}}.'
  ),
  (
    'school_booking_confirmed',
    'School booking confirmed',
    'Your NZ Esports presentation has been confirmed',
    '<p>Hi {{contactName}},</p><p>Your <strong>{{presentationTitle}}</strong> session for <strong>{{schoolName}}</strong> on <strong>{{sessionDate}}</strong> has been confirmed.</p><p>{{calendarLinks}}</p>',
    'Hi {{contactName}}, your {{presentationTitle}} session for {{schoolName}} on {{sessionDate}} has been confirmed.'
  ),
  (
    'school_booking_cancelled',
    'School booking cancelled',
    'Your NZ Esports presentation has been cancelled',
    '<p>Hi {{contactName}},</p><p>Your <strong>{{presentationTitle}}</strong> session for <strong>{{schoolName}}</strong> on <strong>{{sessionDate}}</strong> has been cancelled.</p>',
    'Hi {{contactName}}, your {{presentationTitle}} session for {{schoolName}} on {{sessionDate}} has been cancelled.'
  ),
  (
    'ambassador_assignment_confirmation',
    'Ambassador assignment confirmation',
    'Session confirmed: {{presentationTitle}} at {{schoolName}}',
    '<p>Hi {{ambassadorName}},</p><p>You have been assigned to deliver <strong>{{presentationTitle}}</strong> at <strong>{{schoolName}}</strong> on <strong>{{sessionDate}}</strong>.</p><p>Location: {{sessionAddress}}</p>',
    'Hi {{ambassadorName}}, you have been assigned to deliver {{presentationTitle}} at {{schoolName}} on {{sessionDate}}. Location: {{sessionAddress}}.'
  ),
  (
    'invoice_to_finance',
    'Ambassador payment approval to finance',
    'Payment {{invoiceNumber}} - {{ambassadorName}}',
    '<p>Kia ora,</p><p>The ambassador payment below has been approved.</p><p><strong>Invoice reference:</strong> {{invoiceNumber}}<br><strong>Ambassador:</strong> {{ambassadorName}}<br><strong>Session:</strong> {{sessionDescription}}<br><strong>Amount:</strong> {{amountLabel}}<br><strong>Account name:</strong> {{bankAccountName}}<br><strong>Bank account:</strong> {{bankAccountNumber}}{{gstLine}}</p><p>Use <strong>{{invoiceNumber}}</strong> as the bank payment reference.</p>{{confirmationButton}}<p>This confirmation link expires after 30 days.</p>',
    'Approved payment {{invoiceNumber}} for {{ambassadorName}}. Amount: {{amountLabel}}. Account name: {{bankAccountName}}. Bank account: {{bankAccountNumber}}. Use {{invoiceNumber}} as the bank reference.'
  )
on conflict (template_key) do nothing;
