-- Read-only evidence; run before migration and again before resuming.
-- Does not prove absence of future writers; must be paired with ingress controls.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '15s';
select current_timestamp as observed_at, current_database() as database_name;
select count(*) as payment_count,
       coalesce(sum(amount_cents),0) as total_cents,
       md5(coalesce(string_agg(jsonb_build_array(id,status,amount_cents,base_amount_cents,
         sourcing_bonus_cents,extra_amount_cents)::text, E'\n' order by id),''))
         as legacy_payment_amount_state_fingerprint,
       count(*) filter (where to_jsonb(payments)->>'finance_email_status' = 'pending') as pending_count,
       count(*) filter (where to_jsonb(payments)->>'finance_email_claim_id' is not null) as claim_count
from public.payments;
select 'booking_requests' as table_name,count(*) as row_count from public.booking_requests
union all select 'booking_sessions',count(*) from public.booking_sessions
union all select 'ambassador_reports',count(*) from public.ambassador_reports
union all select 'email_logs',count(*) from public.email_logs;
select coalesce(application_name,'') as application_name, coalesce(state,'') as state,
       count(*) as connection_count, max(current_timestamp-xact_start) as oldest_transaction_age
from pg_stat_activity
where datname=current_database() and pid<>pg_backend_pid() and backend_type='client backend'
group by application_name,state order by application_name,state;
rollback;
