begin;

alter table public.booking_sessions
  alter column status set default 'tentative';

update public.booking_sessions
set status = case
  when status = 'ambassador_needed' then 'tentative'
  when status = 'ambassador_applied' then 'applied'
  else status
end
where status in ('ambassador_needed', 'ambassador_applied');

update public.booking_sessions
set reschedule_previous_status = case
  when reschedule_previous_status = 'ambassador_needed' then 'tentative'
  when reschedule_previous_status = 'ambassador_applied' then 'applied'
  else reschedule_previous_status
end
where reschedule_previous_status in ('ambassador_needed', 'ambassador_applied');

update public.booking_sessions
set status = 'cancelled',
    share_contact_with_ambassador = false
where booking_request_id in (
  select id
  from public.booking_requests
  where status = 'cancel_requested'
)
and status not in (
  'cancelled',
  'declined',
  'completed_pending_report',
  'report_submitted',
  'payment_pending',
  'paid',
  'closed'
);

update public.booking_requests
set status = case
  when status = 'ambassador_needed' then 'tentative'
  when status = 'ambassador_applied' then 'applied'
  when status = 'cancel_requested' then 'cancelled'
  else status
end
where status in ('ambassador_needed', 'ambassador_applied', 'cancel_requested');

create or replace view public.ambassador_open_bookings as
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
where bs.status in ('tentative', 'applied')
  and bs.assigned_ambassador_id is null;

commit;
