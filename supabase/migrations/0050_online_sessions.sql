-- Online (video-call) sessions.
--
-- Schools book online sessions through a private, unlisted link the staff
-- team shares (it is never linked from the website). They are recorded like
-- any other booking and counted in the same metrics, but tagged online with
-- no region, and staff add the video-call link before confirming.
--
-- The app reads and writes these columns with the service role. Following
-- 0048, user-scoped Data API clients get no grant on new booking_sessions
-- columns, so meeting links are never exposed through the Data API.

alter table public.booking_sessions
  add column if not exists delivery_mode text not null default 'in_person',
  add column if not exists meeting_url text;

alter table public.booking_sessions
  drop constraint if exists booking_sessions_delivery_mode_check,
  add constraint booking_sessions_delivery_mode_check
    check (delivery_mode in ('in_person', 'online'));

comment on column public.booking_sessions.delivery_mode is
  'in_person (default) or online. Online sessions are booked via the private online booking link or logged by staff.';
comment on column public.booking_sessions.meeting_url is
  'Video-call link for online sessions, added by staff and sent in the confirmation email.';

-- "Here's your video-call link" emails, sent to the school and the assigned
-- ambassador when staff add or change the link on a confirmed online session.
-- Editable in Email templates; existing rows are never overwritten.
insert into public.email_templates (template_key, name, subject, body_html, body_text)
values
  (
    'school_meeting_link',
    'School video-call link',
    'Your video-call link for {{presentationTitle}}',
    '<p>Hi {{contactName}},</p><p>Here''s the video-call link for your online <strong>{{presentationTitle}}</strong> session for <strong>{{schoolName}}</strong> on <strong>{{sessionDate}}</strong>.</p>{{meetingButton}}<p>It opens in a web browser, so you don''t need a special account or app. We recommend joining a few minutes early to check your screen and sound.</p>{{sessionSummary}}{{calendarLinks}}',
    'Hi {{contactName}}, here''s the video-call link for your online {{presentationTitle}} session for {{schoolName}} on {{sessionDate}}: {{meetingUrl}}'
  ),
  (
    'ambassador_meeting_link',
    'Ambassador video-call link',
    'Video-call link: {{presentationTitle}} with {{schoolName}}',
    '<p>Hi {{ambassadorName}},</p><p>Here''s the video-call link for your online <strong>{{presentationTitle}}</strong> session with <strong>{{schoolName}}</strong> on <strong>{{sessionDate}}</strong>.</p>{{meetingButton}}<p>The school has been sent the same link.</p>',
    'Hi {{ambassadorName}}, here''s the video-call link for your online {{presentationTitle}} session with {{schoolName}} on {{sessionDate}}: {{meetingUrl}}'
  )
on conflict (template_key) do nothing;
