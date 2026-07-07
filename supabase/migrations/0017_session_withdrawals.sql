-- Ambassador withdrawal requests. The reason lives on the session so staff can
-- review pending requests without loading booking_status_history.
alter table public.booking_sessions
  add column if not exists withdrawal_reason text,
  add column if not exists withdrawal_requested_at timestamptz;
