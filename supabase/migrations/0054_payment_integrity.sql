-- Payment, report and reschedule integrity.
--
-- 1. Payment breakdown. 0051's approval RPC changed amount_cents (top-ups) and
--    zeroed it (no-payment approvals), but 0026's check still demanded
--    amount_cents = base + sourcing, so both paths failed. The breakdown is now
--    base + sourcing bonus + second-session amount + staff extra, every part a
--    non-negative integer, staff extras whole dollars up to $250. A no-payment
--    approval zeroes every part (so earnings and bonus totals stay right) and
--    records the amount it replaced in its eligibility reason.
-- 2. Finance emails. A send claims the payment with a single-writer claim id;
--    only the claim's completion may record the outcome, and it never touches
--    the payment status, so a stale send cannot overwrite a newer one or undo a
--    finance confirmation. A claim left pending (crashed request) can be taken
--    over once it is older than the stale window.
-- 3. Reports. One report covers the ambassador's back-to-back sessions of one
--    booking on one NZ day (the grouping the report form and open-bookings
--    cards already show). Report, covered sessions and the single payment are
--    written in one transaction, serialized per booking. A two-session group
--    pays the delivery fee plus a $50 second-session amount ($300); the
--    sourcing bonus stays separate. Sessions in a different booking are not
--    grouped: staff add any adjustment manually at approval.
-- 4. Reschedules. Staff approval checks the assigned ambassador's other
--    sessions for a real time overlap under the same table lock the guest
--    reschedule path uses.
--
-- Every function is service-role only, like the RPCs before it.

alter table public.payments
  add column if not exists additional_session_cents integer not null default 0,
  add column if not exists finance_email_claim_id uuid,
  add column if not exists finance_email_claimed_at timestamptz;

-- Refuse to apply over rows the new rules would reject, rather than silently
-- rewriting payment history.
do $$
declare
  v_invalid integer;
  v_duplicates integer;
begin
  select count(*) into v_invalid
  from public.payments payment
  where not (
    payment.amount_cents >= 0
    and payment.base_amount_cents >= 0
    and payment.sourcing_bonus_cents >= 0
    and payment.additional_session_cents >= 0
    and payment.extra_amount_cents between 0 and 25000
    and payment.extra_amount_cents % 100 = 0
    and payment.amount_cents = payment.base_amount_cents + payment.sourcing_bonus_cents
      + payment.additional_session_cents + payment.extra_amount_cents
  );

  if v_invalid > 0 then
    raise exception '0054: % payment row(s) have an amount that does not match their breakdown. Fix them before applying this migration.', v_invalid;
  end if;

  select count(*) into v_duplicates
  from (
    select 1
    from public.payments payment
    where payment.status in ('pending', 'eligible', 'approved', 'paid')
      and payment.ambassador_profile_id is not null
    group by payment.booking_session_id, payment.ambassador_profile_id
    having count(*) > 1
  ) duplicate;

  if v_duplicates > 0 then
    raise exception '0054: % session(s) have more than one live payment for the same ambassador. Resolve them before applying this migration.', v_duplicates;
  end if;
end;
$$;

alter table public.payments
  drop constraint if exists payments_amount_breakdown_check,
  drop constraint if exists payments_extra_amount_cents_check,
  add constraint payments_extra_amount_cents_check
    check (extra_amount_cents between 0 and 25000 and extra_amount_cents % 100 = 0),
  add constraint payments_amount_breakdown_check
    check (
      amount_cents >= 0
      and base_amount_cents >= 0
      and sourcing_bonus_cents >= 0
      and additional_session_cents >= 0
      and amount_cents = base_amount_cents + sourcing_bonus_cents + additional_session_cents + extra_amount_cents
    );

-- Backstop for the report RPC: one live payment per session and ambassador.
create unique index if not exists payments_live_session_ambassador_key
  on public.payments (booking_session_id, ambassador_profile_id)
  where status in ('pending', 'eligible', 'approved', 'paid');

-- ---------------------------------------------------------------------------
-- Approval. Same signature as 0051. The total is recomputed from the
-- breakdown (never accumulated), and approval leaves the payment "Ready for
-- finance" with no confirmation token: the token is created by the send
-- claim below, so p_token_hash / p_token_expires_at are accepted but unused.

create or replace function public.approve_ambassador_report_payment(
  p_report_id uuid,
  p_actor_id uuid,
  p_invoice_number text default null,
  p_bank_account_name text default null,
  p_bank_account_number text default null,
  p_gst_number text default null,
  p_token_hash text default null,
  p_token_expires_at timestamptz default null,
  p_finance_email text default null,
  p_extra_amount_cents integer default 0,
  p_skip_payment boolean default false,
  p_payment_note text default null
)
returns table (
  did_approve boolean,
  payment_id uuid,
  booking_session_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_report public.ambassador_reports%rowtype;
  v_payment public.payments%rowtype;
  v_extra integer := coalesce(p_extra_amount_cents, 0);
  v_skip boolean := coalesce(p_skip_payment, false);
  v_note text := nullif(btrim(coalesce(p_payment_note, '')), '');
begin
  select * into v_report
  from public.ambassador_reports report
  where report.id = p_report_id
  for update;

  if not found then
    return;
  end if;

  if v_report.reviewed_for_payment_at is not null then
    return query select false, null::uuid, v_report.booking_session_id;
    return;
  end if;

  select * into v_payment
  from public.payments payment
  where payment.booking_session_id = v_report.booking_session_id
    and payment.ambassador_profile_id = v_report.ambassador_profile_id
    and payment.status in ('pending', 'eligible')
  order by payment.created_at desc
  limit 1
  for update;

  if v_payment.id is not null then
    if v_extra < 0 or v_extra > 25000 or v_extra % 100 <> 0 then
      raise exception 'Extra payment amounts must be whole dollars between $0 and $250.';
    end if;

    if v_skip and v_extra > 0 then
      raise exception 'A report approved with no payment cannot carry an extra amount.';
    end if;

    if (v_skip or v_extra > 0)
      and (v_note is null or char_length(v_note) < 3 or char_length(v_note) > 500) then
      raise exception 'Extra amounts and no-payment approvals require a note of 3 to 500 characters.';
    end if;
  end if;

  update public.ambassador_reports report
  set
    reviewed_for_payment_at = now(),
    reviewed_for_payment_by = p_actor_id
  where report.id = v_report.id;

  if v_payment.id is null then
    return query select true, null::uuid, v_report.booking_session_id;
    return;
  end if;

  if v_skip then
    update public.payments payment
    set
      status = 'not_eligible',
      amount_cents = 0,
      base_amount_cents = 0,
      sourcing_bonus_cents = 0,
      additional_session_cents = 0,
      extra_amount_cents = 0,
      staff_override = true,
      payment_note = v_note,
      eligibility_reason = format(
        'Approved with no payment (replaced %s cents: %s base, %s sourcing bonus, %s second session): %s',
        payment.amount_cents,
        payment.base_amount_cents,
        payment.sourcing_bonus_cents,
        payment.additional_session_cents,
        v_note
      ),
      finance_email_status = null,
      finance_email_claim_id = null,
      finance_email_claimed_at = null,
      finance_confirmation_token_hash = null,
      finance_confirmation_expires_at = null,
      updated_by = p_actor_id,
      updated_at = now()
    where payment.id = v_payment.id;

    update public.booking_sessions session
    set
      payment_status = 'not_eligible',
      updated_at = now()
    where session.id = v_report.booking_session_id;

    return query select true, null::uuid, v_report.booking_session_id;
    return;
  end if;

  if p_invoice_number is null
    or p_bank_account_name is null
    or p_bank_account_number is null
    or p_finance_email is null then
    raise exception 'Payable reports require complete finance payment data.';
  end if;

  update public.payments payment
  set
    status = 'approved',
    extra_amount_cents = v_extra,
    amount_cents = payment.base_amount_cents + payment.sourcing_bonus_cents
      + payment.additional_session_cents + v_extra,
    payment_note = case when v_extra > 0 then v_note else null end,
    invoice_number = coalesce(payment.invoice_number, p_invoice_number),
    invoice_generated_at = coalesce(payment.invoice_generated_at, now()),
    bank_account_name = p_bank_account_name,
    bank_account_number = p_bank_account_number,
    gst_number = nullif(p_gst_number, ''),
    sent_to_email = p_finance_email,
    finance_email_status = null,
    finance_email_error = null,
    finance_email_claim_id = null,
    finance_email_claimed_at = null,
    finance_confirmation_token_hash = null,
    finance_confirmation_expires_at = null,
    updated_by = p_actor_id,
    updated_at = now()
  where payment.id = v_payment.id;

  update public.booking_sessions session
  set
    status = 'payment_pending',
    payment_status = 'approved',
    updated_at = now()
  where session.id = v_report.booking_session_id;

  return query select true, v_payment.id, v_report.booking_session_id;
end;
$$;

revoke all on function public.approve_ambassador_report_payment(
  uuid, uuid, text, text, text, text, text, timestamptz, text, integer, boolean, text
) from public, anon, authenticated;
grant execute on function public.approve_ambassador_report_payment(
  uuid, uuid, text, text, text, text, text, timestamptz, text, integer, boolean, text
) to service_role;

-- ---------------------------------------------------------------------------
-- Finance email claim. Returns no row when the payment can't be sent now:
-- not approved (including paid), already with finance on a live link, or
-- another send is in flight and not yet stale. The new token replaces the old
-- one at claim time, so only the link in the newest email confirms payment.

create or replace function public.claim_finance_payment_email(
  p_payment_id uuid,
  p_actor_id uuid,
  p_token_hash text,
  p_token_expires_at timestamptz,
  p_finance_email text,
  p_stale_after_seconds integer default 600
)
returns table (
  claim_id uuid,
  first_send boolean,
  invoice_number text,
  booking_session_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_payment public.payments%rowtype;
  v_claim uuid := gen_random_uuid();
begin
  if p_token_hash is null
    or p_token_expires_at is null
    or p_token_expires_at <= now()
    or nullif(btrim(coalesce(p_finance_email, '')), '') is null then
    raise exception 'A finance email claim needs a fresh confirmation token and a finance address.';
  end if;

  select * into v_payment
  from public.payments payment
  where payment.id = p_payment_id
  for update;

  if not found or v_payment.status <> 'approved' or v_payment.invoice_number is null then
    return;
  end if;

  if not (
    v_payment.finance_email_status is null
    or v_payment.finance_email_status = 'failed'
    or (
      v_payment.finance_email_status = 'sent'
      and (
        v_payment.finance_confirmation_expires_at is null
        or v_payment.finance_confirmation_expires_at <= now()
      )
    )
    or (
      v_payment.finance_email_status = 'pending'
      and (
        v_payment.finance_email_claimed_at is null
        or v_payment.finance_email_claimed_at
          <= now() - make_interval(secs => greatest(coalesce(p_stale_after_seconds, 600), 60))
      )
    )
  ) then
    return;
  end if;

  update public.payments payment
  set
    finance_email_status = 'pending',
    finance_email_claim_id = v_claim,
    finance_email_claimed_at = now(),
    finance_email_error = null,
    finance_confirmation_token_hash = p_token_hash,
    finance_confirmation_expires_at = p_token_expires_at,
    sent_to_email = p_finance_email,
    updated_by = p_actor_id,
    updated_at = now()
  where payment.id = v_payment.id;

  return query select
    v_claim,
    v_payment.sent_to_finance_at is null,
    v_payment.invoice_number,
    v_payment.booking_session_id;
end;
$$;

-- Records the outcome of one claimed send. Matches the claim id, so a send
-- whose claim was taken over (or already completed) changes nothing. Only
-- email fields are written: a payment finance has already confirmed stays paid.
create or replace function public.complete_finance_payment_email(
  p_payment_id uuid,
  p_claim_id uuid,
  p_sent boolean,
  p_error text default null,
  p_actor_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_updated uuid;
begin
  update public.payments payment
  set
    finance_email_status = case when p_sent then 'sent' else 'failed' end,
    finance_email_attempts = payment.finance_email_attempts + 1,
    finance_email_last_attempt_at = v_now,
    finance_email_error = case
      when p_sent then null
      else left(coalesce(nullif(btrim(coalesce(p_error, '')), ''), 'The finance email could not be sent.'), 1000)
    end,
    sent_to_finance_at = case when p_sent then v_now else payment.sent_to_finance_at end,
    finance_email_claim_id = null,
    finance_email_claimed_at = null,
    updated_by = coalesce(p_actor_id, payment.updated_by),
    updated_at = v_now
  where payment.id = p_payment_id
    and payment.finance_email_claim_id = p_claim_id
    and payment.finance_email_status = 'pending'
  returning payment.id into v_updated;

  return v_updated is not null;
end;
$$;

revoke all on function public.claim_finance_payment_email(uuid, uuid, text, timestamptz, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_finance_payment_email(uuid, uuid, text, timestamptz, text, integer)
  to service_role;
revoke all on function public.complete_finance_payment_email(uuid, uuid, boolean, text, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_finance_payment_email(uuid, uuid, boolean, text, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Grouped report submission. outcome is 'submitted' or an error code the app
-- shows as-is. Nothing is written unless the whole group succeeds.

create or replace function public.submit_ambassador_report_group(
  p_session_id uuid,
  p_ambassador_profile_id uuid,
  p_actor_id uuid,
  p_report jsonb,
  p_delivery_cents integer,
  p_sourcing_bonus_cents integer,
  p_second_session_cents integer,
  p_eligible_threshold integer,
  p_is_sourced boolean
)
returns table (
  outcome text,
  report_id uuid,
  payment_id uuid,
  covered_session_ids uuid[],
  session_count integer,
  payment_status text,
  amount_cents integer
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_request_id uuid;
  v_session public.booking_sessions%rowtype;
  v_day date;
  v_group uuid[];
  v_covered uuid[];
  v_count integer;
  v_attendees integer := (p_report->>'attendee_count')::integer;
  v_eligible boolean;
  v_sourcing integer := case when coalesce(p_is_sourced, false) then coalesce(p_sourcing_bonus_cents, 0) else 0 end;
  v_second integer := 0;
  v_amount integer := 0;
  v_reason text;
  v_report_id uuid;
  v_payment_id uuid;
begin
  if p_delivery_cents is null or p_delivery_cents < 0
    or coalesce(p_sourcing_bonus_cents, 0) < 0
    or coalesce(p_second_session_cents, 0) < 0
    or p_eligible_threshold is null
    or v_attendees is null or v_attendees < 0 then
    raise exception 'Invalid report or payout inputs.';
  end if;

  -- Acquire the write lock before the booking row. Guest rescheduling takes
  -- its table lock before that row too; reversing the order can deadlock.
  -- ROW EXCLUSIVE is the mode these updates need and allows independent
  -- report submissions to proceed concurrently.
  lock table public.booking_sessions in row exclusive mode;

  select session.booking_request_id into v_request_id
  from public.booking_sessions session
  where session.id = p_session_id;

  if not found then
    return query select 'session-not-assigned', null::uuid, null::uuid, null::uuid[], 0, null::text, 0;
    return;
  end if;

  -- Serializes every report for this booking, so two submissions for sibling
  -- sessions can't both see the other unreported and both pay.
  perform 1 from public.booking_requests booking where booking.id = v_request_id for update;

  select * into v_session
  from public.booking_sessions session
  where session.id = p_session_id
  for update;

  if v_session.assigned_ambassador_id is distinct from p_ambassador_profile_id then
    return query select 'session-not-assigned', null::uuid, null::uuid, null::uuid[], 0, null::text, 0;
    return;
  end if;

  if v_session.ends_at > now()
    or v_session.status not in ('confirmed', 'completed_pending_report')
    or v_session.report_status <> 'not_submitted' then
    return query select 'session-not-finished', null::uuid, null::uuid, null::uuid[], 0, null::text, 0;
    return;
  end if;

  if exists (
    select 1 from public.ambassador_reports report where report.booking_session_id = v_session.id
  ) then
    return query select 'report-already-submitted', null::uuid, null::uuid, null::uuid[], 0, null::text, 0;
    return;
  end if;

  v_day := (v_session.starts_at at time zone 'Pacific/Auckland')::date;

  -- Older reports may predate sibling coverage. Never create a second full
  -- payment for an unmarked sibling of an already-reported booking/day.
  -- Preserve existing history and route the adjustment to staff review.
  if exists (
    select 1
    from public.ambassador_reports prior_report
    join public.booking_sessions prior_session on prior_session.id = prior_report.booking_session_id
    where prior_session.booking_request_id = v_request_id
      and prior_report.ambassador_profile_id = p_ambassador_profile_id
      and (prior_session.starts_at at time zone 'Pacific/Auckland')::date = v_day
  ) then
    return query select 'group-already-reported', null::uuid, null::uuid, null::uuid[], 0, null::text, 0;
    return;
  end if;

  -- The day's report covers every session of it, so it waits until the last
  -- one has finished instead of leaving a later session to be paid in full.
  if exists (
    select 1
    from public.booking_sessions other
    where other.booking_request_id = v_request_id
      and other.id <> v_session.id
      and other.assigned_ambassador_id = p_ambassador_profile_id
      and (other.starts_at at time zone 'Pacific/Auckland')::date = v_day
      and other.status not in ('cancelled', 'declined')
      and other.report_status = 'not_submitted'
      and other.ends_at > now()
  ) then
    return query select 'report-day-not-finished', null::uuid, null::uuid, null::uuid[], 0, null::text, 0;
    return;
  end if;

  select array_agg(grouped.id order by grouped.starts_at, grouped.id) into v_group
  from (
    select other.id, other.starts_at
    from public.booking_sessions other
    where other.booking_request_id = v_request_id
      and other.assigned_ambassador_id = p_ambassador_profile_id
      and (other.starts_at at time zone 'Pacific/Auckland')::date = v_day
      and other.status in ('confirmed', 'completed_pending_report')
      and other.report_status = 'not_submitted'
      and other.ends_at <= now()
      and not exists (
        select 1 from public.ambassador_reports report where report.booking_session_id = other.id
      )
    for update
  ) grouped;

  v_count := coalesce(array_length(v_group, 1), 0);

  if v_count = 0 or not (v_session.id = any(v_group)) then
    return query select 'session-not-finished', null::uuid, null::uuid, null::uuid[], 0, null::text, 0;
    return;
  end if;

  -- Never pay a session twice, e.g. one paid by a report from before 0054.
  if exists (
    select 1
    from public.payments payment
    where payment.booking_session_id = any(v_group)
      and payment.ambassador_profile_id = p_ambassador_profile_id
      and payment.status in ('pending', 'eligible', 'approved', 'paid')
  ) then
    return query select 'payment-already-exists', null::uuid, null::uuid, null::uuid[], 0, null::text, 0;
    return;
  end if;

  v_covered := array_remove(v_group, v_session.id);
  v_eligible := v_attendees >= p_eligible_threshold;

  insert into public.ambassador_reports (
    booking_session_id,
    ambassador_profile_id,
    presenter_name,
    school_roll_size,
    primary_contact_name,
    primary_contact_email,
    delivered_at,
    students_competed_in_esports,
    attendee_count,
    year_levels,
    age_groups,
    parents_present,
    attendee_quotes,
    attendance_rating,
    student_response_rating,
    teacher_response_rating,
    presentation_energy_rating,
    presentation_feedback,
    student_questions_themes,
    additional_notes,
    media_consent_confirmed,
    submitted_at
  )
  values (
    v_session.id,
    p_ambassador_profile_id,
    p_report->>'presenter_name',
    (p_report->>'school_roll_size')::integer,
    p_report->>'primary_contact_name',
    p_report->>'primary_contact_email',
    coalesce((p_report->>'delivered_at')::timestamptz, v_session.starts_at),
    (p_report->>'students_competed_in_esports')::boolean,
    v_attendees,
    p_report->>'year_levels',
    p_report->>'age_groups',
    (p_report->>'parents_present')::boolean,
    p_report->>'attendee_quotes',
    (p_report->>'attendance_rating')::integer,
    (p_report->>'student_response_rating')::integer,
    (p_report->>'teacher_response_rating')::integer,
    (p_report->>'presentation_energy_rating')::integer,
    p_report->>'presentation_feedback',
    p_report->>'student_questions_themes',
    p_report->>'additional_notes',
    coalesce((p_report->>'media_consent_confirmed')::boolean, false),
    now()
  )
  returning id into v_report_id;

  update public.booking_sessions session
  set
    report_status = 'submitted',
    status = 'report_submitted',
    payment_status = case
      when session.id = v_session.id and v_eligible then 'eligible'
      else 'not_eligible'
    end,
    actual_student_count = case
      when session.id = v_session.id then v_attendees
      else session.actual_student_count
    end,
    updated_at = now()
  where session.id = any(v_group);

  if v_eligible then
    -- Only the second session has a confirmed rate. A third or later session
    -- is covered by the report but not paid automatically.
    v_second := case when v_count >= 2 then coalesce(p_second_session_cents, 0) else 0 end;
    v_amount := p_delivery_cents + v_sourcing + v_second;
    v_reason := format('Attendee count %s meets threshold of %s.', v_attendees, p_eligible_threshold)
      || case when v_sourcing > 0 then ' Includes the sourcing bonus.' else '' end
      || case when v_count >= 2 then format(' One report for %s back-to-back sessions; the second session adds its fixed amount.', v_count) else '' end
      || case when v_count > 2 then ' Sessions after the second are not paid automatically: add any amount for them when approving.' else '' end;

    insert into public.payments (
      booking_session_id,
      ambassador_profile_id,
      status,
      eligibility_reason,
      amount_cents,
      base_amount_cents,
      sourcing_bonus_cents,
      additional_session_cents
    )
    values (
      v_session.id,
      p_ambassador_profile_id,
      'pending',
      v_reason,
      v_amount,
      p_delivery_cents,
      v_sourcing,
      v_second
    )
    returning id into v_payment_id;
  end if;

  insert into public.booking_activity_logs (
    booking_request_id, booking_session_id, action, actor_id, actor_type, details
  )
  select
    v_request_id,
    covered.id,
    'report.covered_by_same_day_report',
    p_actor_id,
    'ambassador',
    jsonb_build_object('report_id', v_report_id, 'reported_session_id', v_session.id)
  from unnest(v_covered) as covered(id);

  -- Roll the booking forward only once none of its sessions still need a report.
  if not exists (
    select 1
    from public.booking_sessions other
    where other.booking_request_id = v_request_id
      and other.status not in ('report_submitted', 'payment_pending', 'paid', 'closed', 'cancelled', 'declined')
  ) then
    update public.booking_requests booking
    set status = 'report_submitted'
    where booking.id = v_request_id;
  end if;

  return query select
    'submitted',
    v_report_id,
    v_payment_id,
    v_covered,
    v_count,
    case when v_eligible then 'eligible' else 'not_eligible' end,
    v_amount;
end;
$$;

revoke all on function public.submit_ambassador_report_group(
  uuid, uuid, uuid, jsonb, integer, integer, integer, integer, boolean
) from public, anon, authenticated;
grant execute on function public.submit_ambassador_report_group(
  uuid, uuid, uuid, jsonb, integer, integer, integer, integer, boolean
) to service_role;

-- ---------------------------------------------------------------------------
-- Staff reschedule decision. Overlap is strict (touching back-to-back
-- sessions are fine). Existing overlaps elsewhere are reported, never changed.

create or replace function public.resolve_session_reschedule(
  p_session_id uuid,
  p_decision text,
  p_new_start timestamptz default null,
  p_new_end timestamptz default null
)
returns table (
  outcome text,
  restored_status text,
  previous_starts_at timestamptz,
  previous_ends_at timestamptz,
  conflict_session_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_session public.booking_sessions%rowtype;
  v_status text;
  v_conflict uuid;
begin
  if p_decision is null or p_decision not in ('approve', 'decline') then
    raise exception 'Unknown reschedule decision.';
  end if;

  if p_decision = 'approve'
    and (p_new_start is null or p_new_end is null or p_new_end <= p_new_start) then
    raise exception 'An approved reschedule needs a valid new time.';
  end if;

  -- Same lock as the guest reschedule path (0052): also waits for, and
  -- blocks, concurrent assignments and session edits.
  lock table public.booking_sessions in share row exclusive mode;

  select * into v_session
  from public.booking_sessions session
  where session.id = p_session_id
  for update;

  if not found or v_session.status <> 'reschedule_requested' then
    return query select 'not-pending', null::text, null::timestamptz, null::timestamptz, null::uuid;
    return;
  end if;

  v_status := coalesce(
    nullif(v_session.reschedule_previous_status, ''),
    case when v_session.assigned_ambassador_id is not null then 'ambassador_assigned' else 'tentative' end
  );

  if p_decision = 'approve' and v_session.assigned_ambassador_id is not null then
    select other.id into v_conflict
    from public.booking_sessions other
    where other.id <> v_session.id
      and other.assigned_ambassador_id = v_session.assigned_ambassador_id
      and other.status not in ('cancelled', 'declined')
      and other.starts_at < p_new_end
      and other.ends_at > p_new_start
    order by other.starts_at
    limit 1;

    if v_conflict is not null then
      return query select 'ambassador-conflict', v_status, v_session.starts_at, v_session.ends_at, v_conflict;
      return;
    end if;
  end if;

  update public.booking_sessions session
  set
    status = v_status,
    starts_at = case when p_decision = 'approve' then p_new_start else session.starts_at end,
    ends_at = case when p_decision = 'approve' then p_new_end else session.ends_at end,
    reschedule_requested_date = null,
    reschedule_request_notes = null,
    reschedule_requested_at = null,
    reschedule_previous_status = null
  where session.id = v_session.id;

  return query select 'resolved', v_status, v_session.starts_at, v_session.ends_at, null::uuid;
end;
$$;

revoke all on function public.resolve_session_reschedule(uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.resolve_session_reschedule(uuid, text, timestamptz, timestamptz)
  to service_role;
