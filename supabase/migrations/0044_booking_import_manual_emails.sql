-- No notification side effects: imported bookings can only be emailed explicitly.
alter table public.booking_requests
  add column if not exists manual_email_only boolean not null default false,
  add column if not exists import_source_code text,
  add column if not exists import_batch_id text,
  add column if not exists import_source_status text,
  add column if not exists contact_position text;
create unique index if not exists booking_requests_import_source_code_key
  on public.booking_requests(import_source_code) where import_source_code is not null;

-- Frozen previews and atomic claims prevent duplicate sends across concurrent requests.
create table public.booking_email_sends (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  booking_session_id uuid not null references public.booking_sessions(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  payload jsonb not null,
  session_status text not null,
  status text not null default 'preview' check (status in ('preview','sending','sent','failed')),
  error_message text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  sent_at timestamptz
);
create index on public.booking_email_sends(booking_session_id, created_at desc);
alter table public.booking_email_sends enable row level security;
-- Service role only; server actions perform staff authorization.
revoke all on public.booking_email_sends from anon, authenticated;

create table public.booking_import_runs (
  batch_id text primary key,
  plan_sha256 text not null,
  imported_count int not null,
  created_at timestamptz not null default now()
);
alter table public.booking_import_runs enable row level security;
revoke all on public.booking_import_runs from anon, authenticated;

-- One transaction: all records and their manual-only policy appear together.
create or replace function public.apply_silent_booking_import(batch text, plan_sha256 text, operations jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  op jsonb;
  existing public.booking_requests%rowtype;
  previous public.booking_import_runs%rowtype;
  sid uuid;
  cid uuid;
  bid uuid;
  imported integer := 0;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if batch is null or length(batch) < 1 or plan_sha256 !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(operations) <> 'array' or jsonb_array_length(operations) > 1000 then
    raise exception 'Invalid import plan';
  end if;
  perform pg_advisory_xact_lock(hashtext('silent-booking-import'));
  select * into previous from public.booking_import_runs where batch_id = batch;
  if found then
    if previous.plan_sha256 <> apply_silent_booking_import.plan_sha256 then raise exception 'Batch already applied with a different plan'; end if;
    return previous.imported_count;
  end if;
  for op in select value from jsonb_array_elements(operations) loop
    bid := (op->>'bookingId')::uuid;
    if op->>'sourceStatus' is null or op->>'sourceStatus' not in ('active','pending','cancelled') or nullif(op->>'code','') is null then
      raise exception 'Missing source status/code';
    end if;
    if op->>'kind' = 'match' then
      select * into strict existing from public.booking_requests where id=bid for update;
      if existing.updated_at <> (op->>'expectedUpdatedAt')::timestamptz then
        raise exception 'Booking % changed since reconciliation', bid;
      end if;
      if existing.primary_contact_id is distinct from (op->>'contactId')::uuid then
        raise exception 'Booking contact changed';
      end if;
      update public.booking_requests set manual_email_only=true,
        import_source_code=op->>'code', import_batch_id=batch, import_source_status=op->>'sourceStatus',
        contact_position=coalesce(nullif(contact_position,''),nullif(op->>'position','')) where id=bid;
      update public.school_contacts set
        position=coalesce(nullif(position,''),nullif(op->>'position','')),
        phone=coalesce(nullif(phone,''),nullif(ltrim(op->'sourceRaw'->>'Client phone',chr(39)),'')),
        full_name=coalesce(nullif(full_name,''),op->'sourceRaw'->>'Client name')
        where id=existing.primary_contact_id
        and (coalesce(position,'')='' or coalesce(phone,'')='' or coalesce(full_name,'')='');
    elsif op->>'kind' = 'add' then
      if exists(select 1 from public.booking_requests where id=bid or import_source_code=op->>'code') then
        raise exception 'Booking % already exists; reconcile again', bid;
      end if;
      sid := (op->'school'->>'id')::uuid;
      cid := (op->'contact'->>'id')::uuid;
      insert into public.schools(id,name,region_id,status)
        values(sid,op->'school'->>'name',(op->'school'->>'region_id')::uuid,'active') on conflict(id) do nothing;
      insert into public.school_contacts(id,school_id,full_name,email,phone,position,marketing_consent,can_access_portal,is_primary)
        values(cid,sid,op->'contact'->>'full_name',op->'contact'->>'email',op->'contact'->>'phone',op->>'position',false,false,false)
        on conflict(id) do nothing;
      if not exists(select 1 from public.school_contacts where id=cid and school_id=sid
        and lower(email)=lower(op->'contact'->>'email')) then raise exception 'Contact mismatch'; end if;
      if exists(select 1 from public.booking_sessions bs
        join public.booking_requests br on br.id=bs.booking_request_id
        join public.school_contacts sc on sc.id=br.primary_contact_id
        where br.school_id=sid and lower(sc.email)=lower(op->'contact'->>'email')
        and bs.starts_at=(op->'session'->>'starts_at')::timestamptz) then
        raise exception 'A matching booking was created since export; reconcile again';
      end if;
      insert into public.booking_requests(id,school_id,primary_contact_id,region_id,status,source,manual_email_only,
        import_source_code,import_batch_id,import_source_status,contact_position,internal_notes,created_at,school_notes)
        values(bid,sid,cid,(op->'school'->>'region_id')::uuid,
          case op->>'sourceStatus' when 'active' then 'confirmed' when 'pending' then 'requested' else 'cancelled' end,
          'staff',true,op->>'code',batch,op->>'sourceStatus',op->>'position','Silent SimplyBook import',(op->>'sourceRecordedAt')::timestamptz,nullif(op->'sourceRaw'->>'Comment',''));
      insert into public.booking_sessions(id,booking_request_id,school_id,region_id,presentation_type_id,status,starts_at,ends_at)
        values((op->'session'->>'id')::uuid,bid,sid,(op->'school'->>'region_id')::uuid,(op->'session'->>'presentation_type_id')::uuid,
          case op->>'sourceStatus' when 'active' then 'confirmed' when 'pending' then 'requested' else 'cancelled' end,
          (op->'session'->>'starts_at')::timestamptz,(op->'session'->>'ends_at')::timestamptz);
      insert into public.booking_status_history(booking_request_id,booking_session_id,new_status,reason)
        values(bid,(op->'session'->>'id')::uuid,op->'session'->>'status','Silent SimplyBook import');
    else raise exception 'Invalid operation'; end if;
    insert into public.booking_activity_logs(booking_request_id,action,actor_type,details)
      values(bid,'booking.silent_import','system',jsonb_build_object('batch',batch,'code',op->>'code','source_status',op->>'sourceStatus','manual_email_only',true,'source_position',op->>'position','source_recorded_at',op->>'sourceRecordedAt','source_record',op->'sourceRaw'));
    imported := imported + 1;
  end loop;
  insert into public.booking_import_runs(batch_id,plan_sha256,imported_count) values(batch,plan_sha256,imported);
  return imported;
end;
$$;
revoke all on function public.apply_silent_booking_import(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.apply_silent_booking_import(text,text,jsonb) to service_role;
