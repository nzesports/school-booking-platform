create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_role()
returns text
language sql
stable
as $$
  select role
  from public.profiles
  where id = auth.uid()
  limit 1
$$;

create or replace function public.is_staff_like()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_role() in ('staff', 'super_admin'), false)
$$;

create or replace function public.current_ambassador_profile_id()
returns uuid
language sql
stable
as $$
  select id
  from public.ambassador_profiles
  where user_id = auth.uid()
  limit 1
$$;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_system_role boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null,
  created_at timestamptz not null default now(),
  unique(role_id, permission_key)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  role text not null default 'school',
  avatar_url text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.regions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  parent_region_id uuid references public.regions(id),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region_id uuid references public.regions(id),
  address text,
  suburb text,
  city text,
  postcode text,
  website text,
  roll_size int,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_contacts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  position text,
  is_primary boolean not null default false,
  can_access_portal boolean not null default false,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_contact_users (
  id uuid primary key default gen_random_uuid(),
  school_contact_id uuid not null references public.school_contacts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(school_contact_id, user_id)
);

create or replace function public.is_school_contact_for_school(target_school_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.school_contact_users scu
    join public.school_contacts sc on sc.id = scu.school_contact_id
    where scu.user_id = auth.uid()
      and sc.school_id = target_school_id
  )
$$;

create table if not exists public.presentation_types (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  short_summary text,
  full_description text,
  content_snippet text,
  year_levels text,
  year_level_min int,
  year_level_max int,
  duration_minutes int not null default 60,
  delivery_formats text[] not null default '{}',
  learning_outcomes text,
  required_equipment text,
  downloadable_one_pager_url text,
  internal_notes text,
  is_active boolean not null default true,
  is_public boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.presentation_regions (
  id uuid primary key default gen_random_uuid(),
  presentation_type_id uuid not null references public.presentation_types(id) on delete cascade,
  region_id uuid not null references public.regions(id) on delete cascade,
  is_available boolean not null default true,
  unique(presentation_type_id, region_id)
);

create table if not exists public.presentation_reviews (
  id uuid primary key default gen_random_uuid(),
  presentation_type_id uuid references public.presentation_types(id) on delete set null,
  school_id uuid references public.schools(id) on delete set null,
  quote text not null,
  attribution text,
  rating int,
  is_approved boolean not null default false,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.ambassador_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  region_id uuid references public.regions(id),
  bio text,
  experience text,
  bank_account_name text,
  bank_account_number text,
  emergency_contact_name text,
  emergency_contact_phone text,
  police_vetting_status text,
  transport_access boolean not null default false,
  open_to_travel boolean not null default false,
  status text not null default 'applied',
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ambassador_travel_regions (
  id uuid primary key default gen_random_uuid(),
  ambassador_profile_id uuid not null references public.ambassador_profiles(id) on delete cascade,
  region_id uuid not null references public.regions(id) on delete cascade,
  available_from date,
  available_to date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.ambassador_availability (
  id uuid primary key default gen_random_uuid(),
  ambassador_profile_id uuid not null references public.ambassador_profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  region_id uuid references public.regions(id),
  status text not null default 'available',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope text not null default 'global',
  region_id uuid references public.regions(id),
  presentation_type_id uuid references public.presentation_types(id),
  day_of_week int,
  start_time time not null,
  end_time time not null,
  slot_interval_minutes int not null default 60,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.availability_overrides (
  id uuid primary key default gen_random_uuid(),
  override_date date not null,
  scope text not null default 'global',
  region_id uuid references public.regions(id),
  presentation_type_id uuid references public.presentation_types(id),
  start_time time,
  end_time time,
  is_available boolean not null default false,
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id),
  primary_contact_id uuid references public.school_contacts(id),
  region_id uuid references public.regions(id),
  status text not null default 'tentative',
  source text not null default 'public',
  submitted_by_user_id uuid references public.profiles(id),
  ambassador_outreach_by uuid references public.ambassador_profiles(id),
  staff_owner_id uuid references public.profiles(id),
  school_notes text,
  internal_notes text,
  requested_different_time boolean not null default false,
  requested_time_notes text,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_sessions (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  presentation_type_id uuid references public.presentation_types(id),
  region_id uuid references public.regions(id),
  school_id uuid references public.schools(id),
  assigned_ambassador_id uuid references public.ambassador_profiles(id),
  status text not null default 'ambassador_needed',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  year_levels text,
  expected_student_count int,
  actual_student_count int,
  location_address text,
  internal_notes text,
  share_contact_with_ambassador boolean not null default false,
  calendar_event_id text,
  report_status text not null default 'not_submitted',
  payment_status text not null default 'not_eligible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_session_applications (
  id uuid primary key default gen_random_uuid(),
  booking_session_id uuid not null references public.booking_sessions(id) on delete cascade,
  ambassador_profile_id uuid not null references public.ambassador_profiles(id) on delete cascade,
  status text not null default 'applied',
  message text,
  applied_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  unique(booking_session_id, ambassador_profile_id)
);

create table if not exists public.booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid references public.booking_requests(id) on delete cascade,
  booking_session_id uuid references public.booking_sessions(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references public.profiles(id),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.booking_activity_logs (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid references public.booking_requests(id) on delete cascade,
  booking_session_id uuid references public.booking_sessions(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ambassador_reports (
  id uuid primary key default gen_random_uuid(),
  booking_session_id uuid not null references public.booking_sessions(id) on delete cascade,
  ambassador_profile_id uuid not null references public.ambassador_profiles(id),
  presenter_name text,
  school_roll_size int,
  primary_contact_name text,
  primary_contact_email text,
  delivered_at timestamptz not null,
  first_presentation_to_school boolean,
  students_competed_in_esports boolean,
  attendee_count int not null,
  year_levels text,
  age_groups text,
  parents_present boolean,
  media_consent_confirmed boolean not null default false,
  attendee_quotes text,
  attendance_rating int,
  student_response_rating int,
  teacher_response_rating int,
  presentation_energy_rating int,
  student_questions_themes text,
  presentation_feedback text,
  additional_notes text,
  submitted_at timestamptz not null default now(),
  reviewed_for_payment_at timestamptz,
  reviewed_for_payment_by uuid references public.profiles(id)
);

create table if not exists public.media_library (
  id uuid primary key default gen_random_uuid(),
  title text,
  description text,
  media_type text not null,
  storage_path text,
  public_url text,
  youtube_url text,
  uploaded_by uuid references public.profiles(id),
  school_id uuid references public.schools(id),
  booking_session_id uuid references public.booking_sessions(id),
  report_id uuid references public.ambassador_reports(id),
  presentation_type_id uuid references public.presentation_types(id),
  consent_status text not null default 'needs_consent_check',
  usage_status text not null default 'internal_only',
  is_public boolean not null default false,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_session_id uuid not null references public.booking_sessions(id) on delete cascade,
  ambassador_profile_id uuid references public.ambassador_profiles(id),
  amount_cents int not null default 25000,
  currency text not null default 'NZD',
  status text not null default 'not_eligible',
  eligibility_reason text,
  staff_override boolean not null default false,
  sent_to_finance_at timestamptz,
  paid_at timestamptz,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.presentation_resources (
  id uuid primary key default gen_random_uuid(),
  presentation_type_id uuid references public.presentation_types(id) on delete set null,
  title text not null,
  description text,
  resource_type text not null,
  storage_path text,
  public_url text,
  youtube_url text,
  version_label text,
  is_current boolean not null default true,
  is_active boolean not null default true,
  audience text not null default 'ambassador',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_modules (
  id uuid primary key default gen_random_uuid(),
  presentation_type_id uuid references public.presentation_types(id) on delete set null,
  title text not null,
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_lessons (
  id uuid primary key default gen_random_uuid(),
  training_module_id uuid not null references public.training_modules(id) on delete cascade,
  title text not null,
  lesson_type text not null default 'video',
  content text,
  youtube_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_progress (
  id uuid primary key default gen_random_uuid(),
  ambassador_profile_id uuid not null references public.ambassador_profiles(id) on delete cascade,
  training_module_id uuid references public.training_modules(id) on delete cascade,
  training_lesson_id uuid references public.training_lessons(id) on delete cascade,
  status text not null default 'not_started',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ambassador_profile_id, training_lesson_id)
);

create table if not exists public.homepage_sections (
  id uuid primary key default gen_random_uuid(),
  section_key text not null unique,
  title text,
  subtitle text,
  body text,
  image_url text,
  data jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order int not null default 0,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name text not null,
  subject text not null,
  body_html text not null,
  body_text text,
  brevo_template_id text,
  is_active boolean not null default true,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  template_key text,
  recipient_email text not null,
  recipient_type text,
  related_booking_request_id uuid references public.booking_requests(id),
  related_booking_session_id uuid references public.booking_sessions(id),
  brevo_message_id text,
  status text not null default 'queued',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  notification_type text not null,
  related_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  booking_session_id uuid not null references public.booking_sessions(id) on delete cascade,
  provider text not null default 'outlook',
  external_event_id text,
  sync_status text not null default 'pending',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace view public.ambassador_open_booking_sessions
with (security_invoker = true)
as
select
  bs.id,
  bs.booking_request_id,
  pt.title as presentation_title,
  r.name as region_name,
  bs.starts_at,
  bs.ends_at,
  bs.year_levels,
  bs.expected_student_count,
  bs.status
from public.booking_sessions bs
left join public.presentation_types pt on pt.id = bs.presentation_type_id
left join public.regions r on r.id = bs.region_id
where bs.status in ('ambassador_needed', 'ambassador_applied');

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_regions_updated_at
before update on public.regions
for each row execute function public.set_updated_at();

create trigger set_schools_updated_at
before update on public.schools
for each row execute function public.set_updated_at();

create trigger set_school_contacts_updated_at
before update on public.school_contacts
for each row execute function public.set_updated_at();

create trigger set_presentation_types_updated_at
before update on public.presentation_types
for each row execute function public.set_updated_at();

create trigger set_ambassador_profiles_updated_at
before update on public.ambassador_profiles
for each row execute function public.set_updated_at();

create trigger set_availability_rules_updated_at
before update on public.availability_rules
for each row execute function public.set_updated_at();

create trigger set_booking_requests_updated_at
before update on public.booking_requests
for each row execute function public.set_updated_at();

create trigger set_booking_sessions_updated_at
before update on public.booking_sessions
for each row execute function public.set_updated_at();

create trigger set_media_library_updated_at
before update on public.media_library
for each row execute function public.set_updated_at();

create trigger set_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

create trigger set_presentation_resources_updated_at
before update on public.presentation_resources
for each row execute function public.set_updated_at();

create trigger set_training_modules_updated_at
before update on public.training_modules
for each row execute function public.set_updated_at();

create trigger set_training_lessons_updated_at
before update on public.training_lessons
for each row execute function public.set_updated_at();

create trigger set_training_progress_updated_at
before update on public.training_progress
for each row execute function public.set_updated_at();

create trigger set_homepage_sections_updated_at
before update on public.homepage_sections
for each row execute function public.set_updated_at();

create trigger set_faqs_updated_at
before update on public.faqs
for each row execute function public.set_updated_at();

create trigger set_email_templates_updated_at
before update on public.email_templates
for each row execute function public.set_updated_at();

create trigger set_calendar_events_updated_at
before update on public.calendar_events
for each row execute function public.set_updated_at();

alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.regions enable row level security;
alter table public.schools enable row level security;
alter table public.school_contacts enable row level security;
alter table public.school_contact_users enable row level security;
alter table public.presentation_types enable row level security;
alter table public.presentation_regions enable row level security;
alter table public.presentation_reviews enable row level security;
alter table public.ambassador_profiles enable row level security;
alter table public.ambassador_travel_regions enable row level security;
alter table public.ambassador_availability enable row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_overrides enable row level security;
alter table public.booking_requests enable row level security;
alter table public.booking_sessions enable row level security;
alter table public.booking_session_applications enable row level security;
alter table public.booking_status_history enable row level security;
alter table public.booking_activity_logs enable row level security;
alter table public.ambassador_reports enable row level security;
alter table public.media_library enable row level security;
alter table public.payments enable row level security;
alter table public.presentation_resources enable row level security;
alter table public.training_modules enable row level security;
alter table public.training_lessons enable row level security;
alter table public.training_progress enable row level security;
alter table public.homepage_sections enable row level security;
alter table public.faqs enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.calendar_events enable row level security;

create policy "public can read public presentation types"
on public.presentation_types for select
to anon, authenticated
using (is_active and is_public);

create policy "staff manage presentation types"
on public.presentation_types for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "public can read active faqs"
on public.faqs for select
to anon, authenticated
using (is_active);

create policy "staff manage faqs"
on public.faqs for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "public can read active homepage sections"
on public.homepage_sections for select
to anon, authenticated
using (is_active);

create policy "staff manage homepage sections"
on public.homepage_sections for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "users read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_staff_like());

create policy "users insert own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid() or public.is_staff_like());

create policy "users update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid() or public.is_staff_like())
with check (id = auth.uid() or public.is_staff_like());

create policy "staff manage roles"
on public.roles for all
to authenticated
using (public.current_role() = 'super_admin')
with check (public.current_role() = 'super_admin');

create policy "staff manage role permissions"
on public.role_permissions for all
to authenticated
using (public.current_role() = 'super_admin')
with check (public.current_role() = 'super_admin');

create policy "public can read active regions"
on public.regions for select
to anon, authenticated
using (is_active or public.is_staff_like());

create policy "staff manage regions"
on public.regions for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "staff and schools read schools"
on public.schools for select
to authenticated
using (
  public.is_staff_like()
  or public.is_school_contact_for_school(id)
);

create policy "staff manage schools"
on public.schools for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "staff and mapped users read school contacts"
on public.school_contacts for select
to authenticated
using (
  public.is_staff_like()
  or exists (
    select 1
    from public.school_contact_users scu
    where scu.school_contact_id = school_contacts.id
      and scu.user_id = auth.uid()
  )
);

create policy "staff manage school contacts"
on public.school_contacts for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "staff manage school contact mappings"
on public.school_contact_users for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "staff and school users read booking requests"
on public.booking_requests for select
to authenticated
using (
  public.is_staff_like()
  or (school_id is not null and public.is_school_contact_for_school(school_id))
  or submitted_by_user_id = auth.uid()
);

create policy "public submit booking requests"
on public.booking_requests for insert
to anon, authenticated
with check (true);

create policy "staff manage booking requests"
on public.booking_requests for update
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "staff and related users read booking sessions"
on public.booking_sessions for select
to authenticated
using (
  public.is_staff_like()
  or (school_id is not null and public.is_school_contact_for_school(school_id))
  or assigned_ambassador_id = public.current_ambassador_profile_id()
);

create policy "public and staff create booking sessions"
on public.booking_sessions for insert
to anon, authenticated
with check (true);

create policy "staff manage booking sessions"
on public.booking_sessions for update
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "staff and ambassadors read applications"
on public.booking_session_applications for select
to authenticated
using (
  public.is_staff_like()
  or ambassador_profile_id = public.current_ambassador_profile_id()
);

create policy "ambassadors apply to booking sessions"
on public.booking_session_applications for insert
to authenticated
with check (ambassador_profile_id = public.current_ambassador_profile_id());

create policy "staff review applications"
on public.booking_session_applications for update
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "staff and ambassadors read ambassador profiles"
on public.ambassador_profiles for select
to authenticated
using (
  public.is_staff_like()
  or user_id = auth.uid()
);

create policy "ambassadors create own profile"
on public.ambassador_profiles for insert
to authenticated
with check (user_id = auth.uid() or public.is_staff_like());

create policy "ambassadors update own profile"
on public.ambassador_profiles for update
to authenticated
using (user_id = auth.uid() or public.is_staff_like())
with check (user_id = auth.uid() or public.is_staff_like());

create policy "ambassadors manage own travel regions"
on public.ambassador_travel_regions for all
to authenticated
using (
  public.is_staff_like()
  or ambassador_profile_id = public.current_ambassador_profile_id()
)
with check (
  public.is_staff_like()
  or ambassador_profile_id = public.current_ambassador_profile_id()
);

create policy "ambassadors manage own availability"
on public.ambassador_availability for all
to authenticated
using (
  public.is_staff_like()
  or ambassador_profile_id = public.current_ambassador_profile_id()
)
with check (
  public.is_staff_like()
  or ambassador_profile_id = public.current_ambassador_profile_id()
);

create policy "staff manage availability rules"
on public.availability_rules for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "staff manage availability overrides"
on public.availability_overrides for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "staff and related users read booking history"
on public.booking_status_history for select
to authenticated
using (public.is_staff_like());

create policy "staff write booking history"
on public.booking_status_history for insert
to authenticated
with check (public.is_staff_like());

create policy "staff and related users read booking activity"
on public.booking_activity_logs for select
to authenticated
using (public.is_staff_like());

create policy "staff write booking activity"
on public.booking_activity_logs for insert
to authenticated
with check (public.is_staff_like());

create policy "staff and authors read reports"
on public.ambassador_reports for select
to authenticated
using (
  public.is_staff_like()
  or ambassador_profile_id = public.current_ambassador_profile_id()
);

create policy "ambassadors create own reports"
on public.ambassador_reports for insert
to authenticated
with check (ambassador_profile_id = public.current_ambassador_profile_id());

create policy "staff review reports"
on public.ambassador_reports for update
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "staff and authors read media"
on public.media_library for select
to authenticated
using (
  public.is_staff_like()
  or uploaded_by = auth.uid()
);

create policy "authenticated users insert media"
on public.media_library for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  or public.is_staff_like()
);

create policy "staff approve media"
on public.media_library for update
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "staff and ambassadors read payments"
on public.payments for select
to authenticated
using (
  public.is_staff_like()
  or ambassador_profile_id = public.current_ambassador_profile_id()
);

create policy "staff manage payments"
on public.payments for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "relevant users read resources"
on public.presentation_resources for select
to authenticated
using (
  public.is_staff_like()
  or audience = 'ambassador'
  or audience = 'school'
);

create policy "staff manage resources"
on public.presentation_resources for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "authenticated read training"
on public.training_modules for select
to authenticated
using (is_active);

create policy "staff manage training modules"
on public.training_modules for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "authenticated read training lessons"
on public.training_lessons for select
to authenticated
using (true);

create policy "staff manage training lessons"
on public.training_lessons for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "ambassadors manage own progress"
on public.training_progress for all
to authenticated
using (
  public.is_staff_like()
  or ambassador_profile_id = public.current_ambassador_profile_id()
)
with check (
  public.is_staff_like()
  or ambassador_profile_id = public.current_ambassador_profile_id()
);

create policy "staff manage email templates"
on public.email_templates for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "staff read email logs"
on public.email_logs for select
to authenticated
using (public.is_staff_like());

create policy "staff write email logs"
on public.email_logs for insert
to authenticated
with check (public.is_staff_like());

create policy "users read own notifications"
on public.notifications for select
to authenticated
using (user_id = auth.uid() or public.is_staff_like());

create policy "users update own notifications"
on public.notifications for update
to authenticated
using (user_id = auth.uid() or public.is_staff_like())
with check (user_id = auth.uid() or public.is_staff_like());

create policy "staff write notifications"
on public.notifications for insert
to authenticated
with check (public.is_staff_like());

create policy "staff manage settings"
on public.settings for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

create policy "staff read audit logs"
on public.audit_logs for select
to authenticated
using (public.is_staff_like());

create policy "staff write audit logs"
on public.audit_logs for insert
to authenticated
with check (public.is_staff_like());

create policy "staff read calendar events"
on public.calendar_events for select
to authenticated
using (public.is_staff_like());

create policy "staff manage calendar events"
on public.calendar_events for all
to authenticated
using (public.is_staff_like())
with check (public.is_staff_like());

insert into storage.buckets (id, name, public)
values
  ('report-media', 'report-media', false),
  ('resources', 'resources', false),
  ('public-assets', 'public-assets', true),
  ('avatars', 'avatars', false)
on conflict (id) do nothing;
