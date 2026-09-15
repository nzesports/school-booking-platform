-- Retain communication and media history when a staff member deletes bookings.
-- Sessions and their dependent reports/payments already cascade in the schema.
alter table public.email_logs
  drop constraint email_logs_related_booking_request_id_fkey,
  add constraint email_logs_related_booking_request_id_fkey
    foreign key (related_booking_request_id) references public.booking_requests(id) on delete set null,
  drop constraint email_logs_related_booking_session_id_fkey,
  add constraint email_logs_related_booking_session_id_fkey
    foreign key (related_booking_session_id) references public.booking_sessions(id) on delete set null;

alter table public.media_library
  drop constraint media_library_booking_session_id_fkey,
  add constraint media_library_booking_session_id_fkey
    foreign key (booking_session_id) references public.booking_sessions(id) on delete set null,
  drop constraint media_library_report_id_fkey,
  add constraint media_library_report_id_fkey
    foreign key (report_id) references public.ambassador_reports(id) on delete set null;
