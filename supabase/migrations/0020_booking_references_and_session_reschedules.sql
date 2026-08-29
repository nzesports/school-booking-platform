-- Customer-friendly booking references and session-scoped reschedule requests.

create sequence if not exists public.booking_reference_code_seq
  as bigint
  start with 100000
  increment by 1
  minvalue 100000
  maxvalue 999999
  no cycle;

alter table public.booking_requests
  add column if not exists reference_code text;

alter table public.booking_requests
  alter column reference_code set default
    lpad(nextval('public.booking_reference_code_seq')::text, 6, '0');

update public.booking_requests
set reference_code = lpad(nextval('public.booking_reference_code_seq')::text, 6, '0')
where reference_code is null;

alter table public.booking_requests
  alter column reference_code set not null;

alter table public.booking_requests
  drop constraint if exists booking_requests_reference_code_format;

alter table public.booking_requests
  add constraint booking_requests_reference_code_format
  check (reference_code ~ '^[0-9]{6}$');

create unique index if not exists booking_requests_reference_code_key
  on public.booking_requests (reference_code);

alter table public.booking_sessions
  add column if not exists reschedule_requested_date date,
  add column if not exists reschedule_request_notes text,
  add column if not exists reschedule_requested_at timestamptz,
  add column if not exists reschedule_previous_status text;

