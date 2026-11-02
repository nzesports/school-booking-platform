-- Same-day payment tiers and explicit staff review.
--
-- One report still covers the ambassador's sessions of one booking on one NZ
-- day (0054's grouping, locking and idempotency are unchanged) and the payment
-- still carries one delivery fee and at most one sourcing bonus. What the
-- second session adds now depends on the gap between the sessions:
--
--   one session                                  +$0    ($250, sourced $300)
--   two sessions, gap 0 to 60 minutes inclusive  +$50   ($300, sourced $350)
--   two sessions, gap over 120 and under 240     +$100  ($350, sourced $400)
--
-- The gap is measured from the first session's END to the second session's
-- START (working interpretation, also stated in the UI and tests).
--
-- Everything else needs an explicit staff custom review and is never paid
-- automatically: a gap over 60 up to and including 120 minutes, a gap of 240
-- minutes or more, three or more sessions, overlapping sessions, or a missing
-- or invalid start/end time. Such a payment is created 'pending' with
-- review_required, the reason, no additional amount (nothing is guessed) and
-- only the recognised delivery fee and sourcing bonus. It can only be approved
-- with an explicit staff decision recorded by approve_ambassador_report_payment:
-- a custom amount (the existing whole-dollar staff extra, $0 to $250, so $0 is
-- an explicit choice) plus a note, or no payment with a note.
--
-- Nothing is repriced: existing rows (pending, approved, paid) keep their
-- amounts; their payment_tier stays null ("before 0056"). Approved and paid
-- payments are frozen from here on (see the trigger below).

alter table public.payments
  add column if not exists payment_tier text,
  add column if not exists covered_session_count integer,
  add column if not exists review_required boolean not null default false,
  add column if not exists review_reason text,
  add column if not exists review_gap_minutes integer,
  add column if not exists custom_reviewed_at timestamptz,
  add column if not exists custom_reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.payments
  drop constraint if exists payments_payment_tier_check,
  add constraint payments_payment_tier_check
    check (payment_tier is null or payment_tier in ('single', 'pair_within_60', 'pair_120_to_240', 'custom_review')),
  drop constraint if exists payments_review_reason_check,
  add constraint payments_review_reason_check
    check (review_reason is null or review_reason in (
      'gap_over_60_to_120', 'gap_240_or_more', 'three_or_more_sessions', 'overlapping_times', 'invalid_times'
    )),
  drop constraint if exists payments_covered_session_count_check,
  add constraint payments_covered_session_count_check
    check (covered_session_count is null or covered_session_count >= 1),
  -- A review payment always says why, and never carries an automatic
  -- additional amount: the staff decision goes in the (capped) extra.
  drop constraint if exists payments_review_consistency_check,
  add constraint payments_review_consistency_check
    check (
      case
        when payment_tier is null then not review_required
        else review_required = (payment_tier = 'custom_review')
      end
      and (not review_required or (review_reason is not null and additional_session_cents = 0))
      and (review_required or review_reason is null)
    ),
  -- An unreviewed review payment can't be approved or paid.
  drop constraint if exists payments_review_before_approval_check,
  add constraint payments_review_before_approval_check
    check (not (review_required and status in ('approved', 'paid') and custom_reviewed_at is null));

-- Approved and paid payments are history: their amounts, itemization, tier and
-- invoice number can't change. Finance-email and confirmation fields still can.
create or replace function public.freeze_settled_payment_amounts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('approved', 'paid') and (
    new.amount_cents is distinct from old.amount_cents
    or new.base_amount_cents is distinct from old.base_amount_cents
    or new.sourcing_bonus_cents is distinct from old.sourcing_bonus_cents
    or new.additional_session_cents is distinct from old.additional_session_cents
    or new.extra_amount_cents is distinct from old.extra_amount_cents
    or new.payment_tier is distinct from old.payment_tier
    or new.review_required is distinct from old.review_required
    or new.review_reason is distinct from old.review_reason
    or new.custom_reviewed_at is distinct from old.custom_reviewed_at
    or new.invoice_number is distinct from old.invoice_number
  ) then
    raise exception 'Approved and paid payments can''t be repriced (payment %).', old.id;
  end if;

  return new;
end;
$$;

drop trigger if exists freeze_settled_payment_amounts on public.payments;
create trigger freeze_settled_payment_amounts
  before update on public.payments
  for each row execute function public.freeze_settled_payment_amounts();

-- ---------------------------------------------------------------------------
-- Tier of one report group. Pure: the caller passes the group's sessions in
-- start order. Shared by the report RPC and the SQL tests.

create or replace function public.report_payment_tier(
  p_starts timestamptz[],
  p_ends timestamptz[]
)
returns table (tier text, review_reason text, gap_minutes integer)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_count integer := coalesce(array_length(p_starts, 1), 0);
  v_gap_seconds numeric;
  v_index integer;
begin
  if v_count = 0 or coalesce(array_length(p_ends, 1), 0) <> v_count then
    return query select 'custom_review', 'invalid_times', null::integer;
    return;
  end if;

  for v_index in 1..v_count loop
    if p_starts[v_index] is null or p_ends[v_index] is null
      or not isfinite(p_starts[v_index]) or not isfinite(p_ends[v_index])
      or p_ends[v_index] <= p_starts[v_index] then
      return query select 'custom_review', 'invalid_times', null::integer;
      return;
    end if;
  end loop;

  if v_count = 1 then
    return query select 'single', null::text, null::integer;
    return;
  end if;

  if v_count >= 3 then
    return query select 'custom_review', 'three_or_more_sessions', null::integer;
    return;
  end if;

  -- First session's end to second session's start.
  v_gap_seconds := extract(epoch from (p_starts[2] - p_ends[1]));

  if v_gap_seconds < 0 then
    return query select 'custom_review', 'overlapping_times', floor(v_gap_seconds / 60)::integer;
  elsif v_gap_seconds <= 3600 then
    return query select 'pair_within_60', null::text, floor(v_gap_seconds / 60)::integer;
  elsif v_gap_seconds <= 7200 then
    return query select 'custom_review', 'gap_over_60_to_120', floor(v_gap_seconds / 60)::integer;
  elsif v_gap_seconds < 14400 then
    return query select 'pair_120_to_240', null::text, floor(v_gap_seconds / 60)::integer;
  else
    return query select 'custom_review', 'gap_240_or_more', floor(v_gap_seconds / 60)::integer;
  end if;
end;
$$;

revoke all on function public.report_payment_tier(timestamptz[], timestamptz[]) from public, anon, authenticated;
grant execute on function public.report_payment_tier(timestamptz[], timestamptz[]) to service_role;

-- ---------------------------------------------------------------------------
-- Grouped report submission. 0054's function with the flat second-session
-- amount replaced by the tiers above; grouping, locks, refusals, coverage log
-- and roll-up are unchanged. The 0054 signature is dropped so nothing can
-- still create a flat-rate payment.

drop function if exists public.submit_ambassador_report_group(
  uuid, uuid, uuid, jsonb, integer, integer, integer, integer, boolean
);

create or replace function public.submit_ambassador_report_group(
  p_session_id uuid,
  p_ambassador_profile_id uuid,
  p_actor_id uuid,
  p_report jsonb,
  p_delivery_cents integer,
  p_sourcing_bonus_cents integer,
  p_short_pair_cents integer,
  p_extended_pair_cents integer,
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
  amount_cents integer,
  payment_tier text,
  review_required boolean,
  review_reason text
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
  v_starts timestamptz[];
  v_ends timestamptz[];
  v_covered uuid[];
  v_count integer;
  v_attendees integer := (p_report->>'attendee_count')::integer;
  v_eligible boolean;
  v_sourcing integer := case when coalesce(p_is_sourced, false) then coalesce(p_sourcing_bonus_cents, 0) else 0 end;
  v_additional integer := 0;
  v_amount integer := 0;
  v_reason text;
  v_tier text;
  v_review_reason text;
  v_gap integer;
  v_report_id uuid;
  v_payment_id uuid;
begin
  if p_delivery_cents is null or p_delivery_cents < 0
    or coalesce(p_sourcing_bonus_cents, 0) < 0
    or coalesce(p_short_pair_cents, 0) < 0
    or coalesce(p_extended_pair_cents, 0) < 0
    or p_eligible_threshold is null
    or v_attendees is null or v_attendees < 0 then
    raise exception 'Invalid report or payout inputs.';
  end if;

  -- Same lock order as 0054: table, then booking row, then sessions.
  lock table public.booking_sessions in row exclusive mode;

  select session.booking_request_id into v_request_id
  from public.booking_sessions session
  where session.id = p_session_id;

  if not found then
    return query select 'session-not-assigned', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  perform 1 from public.booking_requests booking where booking.id = v_request_id for update;

  select * into v_session
  from public.booking_sessions session
  where session.id = p_session_id
  for update;

  if v_session.assigned_ambassador_id is distinct from p_ambassador_profile_id then
    return query select 'session-not-assigned', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  if v_session.ends_at > now()
    or v_session.status not in ('confirmed', 'completed_pending_report')
    or v_session.report_status <> 'not_submitted' then
    return query select 'session-not-finished', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  if exists (
    select 1 from public.ambassador_reports report where report.booking_session_id = v_session.id
  ) then
    return query select 'report-already-submitted', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  v_day := (v_session.starts_at at time zone 'Pacific/Auckland')::date;

  if exists (
    select 1
    from public.ambassador_reports prior_report
    join public.booking_sessions prior_session on prior_session.id = prior_report.booking_session_id
    where prior_session.booking_request_id = v_request_id
      and prior_report.ambassador_profile_id = p_ambassador_profile_id
      and (prior_session.starts_at at time zone 'Pacific/Auckland')::date = v_day
  ) then
    return query select 'group-already-reported', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

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
    return query select 'report-day-not-finished', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  select
    array_agg(grouped.id order by grouped.starts_at, grouped.id),
    array_agg(grouped.starts_at order by grouped.starts_at, grouped.id),
    array_agg(grouped.ends_at order by grouped.starts_at, grouped.id)
  into v_group, v_starts, v_ends
  from (
    select other.id, other.starts_at, other.ends_at
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
    return query select 'session-not-finished', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  if exists (
    select 1
    from public.payments payment
    where payment.booking_session_id = any(v_group)
      and payment.ambassador_profile_id = p_ambassador_profile_id
      and payment.status in ('pending', 'eligible', 'approved', 'paid')
  ) then
    return query select 'payment-already-exists', null::uuid, null::uuid, null::uuid[], 0, null::text, 0, null::text, false, null::text;
    return;
  end if;

  v_covered := array_remove(v_group, v_session.id);
  v_eligible := v_attendees >= p_eligible_threshold;

  select tiered.tier, tiered.review_reason, tiered.gap_minutes
  into v_tier, v_review_reason, v_gap
  from public.report_payment_tier(v_starts, v_ends) tiered;

  insert into public.ambassador_reports (
    booking_session_id, ambassador_profile_id, presenter_name, school_roll_size,
    primary_contact_name, primary_contact_email, delivered_at, students_competed_in_esports,
    attendee_count, year_levels, age_groups, parents_present, attendee_quotes,
    attendance_rating, student_response_rating, teacher_response_rating,
    presentation_energy_rating, presentation_feedback, student_questions_themes,
    additional_notes, media_consent_confirmed, submitted_at
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
    v_additional := case v_tier
      when 'pair_within_60' then coalesce(p_short_pair_cents, 0)
      when 'pair_120_to_240' then coalesce(p_extended_pair_cents, 0)
      else 0
    end;
    v_amount := p_delivery_cents + v_sourcing + v_additional;
    v_reason := format('Attendee count %s meets threshold of %s.', v_attendees, p_eligible_threshold)
      || case when v_sourcing > 0 then ' Includes the sourcing bonus.' else '' end
      || case v_tier
        when 'pair_within_60' then format(' One report for 2 sessions, approximately %s minutes apart (first end to second start, up to 1 hour): adds the second-session amount.', v_gap)
        when 'pair_120_to_240' then format(' One report for 2 sessions, approximately %s minutes apart (first end to second start, over 2 and under 4 hours): adds the extended-gap amount.', v_gap)
        when 'custom_review' then ' Needs staff custom review before approval: ' || case v_review_reason
          when 'gap_over_60_to_120' then format('the sessions are approximately %s minutes apart (over 1 hour, up to 2 hours).', v_gap)
          when 'gap_240_or_more' then format('the sessions are approximately %s minutes apart (4 hours or more).', v_gap)
          when 'three_or_more_sessions' then format('the report covers %s sessions.', v_count)
          when 'overlapping_times' then 'the sessions overlap.'
          else 'a session has a missing or invalid time.'
        end || ' Only the delivery fee and any sourcing bonus are recognised so far.'
        else ''
      end;

    insert into public.payments (
      booking_session_id, ambassador_profile_id, status, eligibility_reason,
      amount_cents, base_amount_cents, sourcing_bonus_cents, additional_session_cents,
      payment_tier, covered_session_count, review_required, review_reason, review_gap_minutes
    )
    values (
      v_session.id, p_ambassador_profile_id, 'pending', v_reason,
      v_amount, p_delivery_cents, v_sourcing, v_additional,
      v_tier, v_count, v_tier = 'custom_review', v_review_reason, v_gap
    )
    returning id into v_payment_id;
  end if;

  -- Atomic coverage record read by the finance invoice (payment-automation.ts).
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
    v_amount,
    case when v_eligible then v_tier else null end,
    v_eligible and v_tier = 'custom_review',
    case when v_eligible then v_review_reason else null end;
end;
$$;

revoke all on function public.submit_ambassador_report_group(
  uuid, uuid, uuid, jsonb, integer, integer, integer, integer, integer, boolean
) from public, anon, authenticated;
grant execute on function public.submit_ambassador_report_group(
  uuid, uuid, uuid, jsonb, integer, integer, integer, integer, integer, boolean
) to service_role;

-- ---------------------------------------------------------------------------
-- Approval. 0054's function plus p_review_confirmed. A payment that needs a
-- custom review can only be approved with p_review_confirmed = true and a
-- note of 3 to 500 characters (even with a $0 extra), or with no payment and a
-- note; either records custom_reviewed_at/by. Other payments behave exactly as
-- in 0054. The 0054 signature is dropped so the review can't be bypassed.

drop function if exists public.approve_ambassador_report_payment(
  uuid, uuid, text, text, text, text, text, timestamptz, text, integer, boolean, text
);

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
  p_payment_note text default null,
  p_review_confirmed boolean default false
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
  v_needs_review boolean := false;
begin
  select * into v_report
  from public.ambassador_reports report
  where report.id = p_report_id
  for update;

  if not found then
    return;
  end if;

  -- Retries and double clicks change nothing.
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
    v_needs_review := v_payment.review_required and v_payment.custom_reviewed_at is null;

    if v_extra < 0 or v_extra > 25000 or v_extra % 100 <> 0 then
      raise exception 'Extra payment amounts must be whole dollars between $0 and $250.';
    end if;

    if v_skip and v_extra > 0 then
      raise exception 'A report approved with no payment cannot carry an extra amount.';
    end if;

    if (v_skip or v_extra > 0 or v_needs_review)
      and (v_note is null or char_length(v_note) < 3 or char_length(v_note) > 500) then
      raise exception 'Extra amounts, custom reviews and no-payment approvals require a note of 3 to 500 characters.';
    end if;

    if v_needs_review and not v_skip and not coalesce(p_review_confirmed, false) then
      raise exception 'This payment needs a staff custom review: confirm the custom amount (which may be $0) before approving.';
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
        'Approved with no payment (replaced %s cents: %s base, %s sourcing bonus, %s additional session): %s',
        payment.amount_cents,
        payment.base_amount_cents,
        payment.sourcing_bonus_cents,
        payment.additional_session_cents,
        v_note
      ),
      custom_reviewed_at = case when v_needs_review then now() else payment.custom_reviewed_at end,
      custom_reviewed_by = case when v_needs_review then p_actor_id else payment.custom_reviewed_by end,
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
    -- Recomputed from the parts; a review payment's additional amount is 0.
    amount_cents = payment.base_amount_cents + payment.sourcing_bonus_cents
      + payment.additional_session_cents + v_extra,
    payment_note = case when v_extra > 0 or v_needs_review then v_note else null end,
    custom_reviewed_at = case when v_needs_review then now() else payment.custom_reviewed_at end,
    custom_reviewed_by = case when v_needs_review then p_actor_id else payment.custom_reviewed_by end,
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
  uuid, uuid, text, text, text, text, text, timestamptz, text, integer, boolean, text, boolean
) from public, anon, authenticated;
grant execute on function public.approve_ambassador_report_payment(
  uuid, uuid, text, text, text, text, text, timestamptz, text, integer, boolean, text, boolean
) to service_role;
