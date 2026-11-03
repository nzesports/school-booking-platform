-- The less-than-2-hours tier (+$50 add-on) now covers gaps under 2 hours
-- (was up to 1 hour), and 2 to under 4 hours is the +$100 tier, so a 61 to
-- 119 minute gap no longer needs a staff custom review. The tier keeps its
-- stored name, pair_within_60, so existing payments and their check
-- constraints are unchanged. 4 hours or more still needs a custom review.

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
  elsif v_gap_seconds < 7200 then
    return query select 'pair_within_60', null::text, floor(v_gap_seconds / 60)::integer;
  elsif v_gap_seconds < 14400 then
    return query select 'pair_120_to_240', null::text, floor(v_gap_seconds / 60)::integer;
  else
    return query select 'custom_review', 'gap_240_or_more', floor(v_gap_seconds / 60)::integer;
  end if;
end;
$$;

revoke all on function public.report_payment_tier(timestamptz[], timestamptz[]) from public, anon, authenticated;
grant execute on function public.report_payment_tier(timestamptz[], timestamptz[]) to service_role;

-- Update descriptions for NEW reports only; never rewrite historical records.
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
        when 'pair_within_60' then format(' One report for 2 sessions, approximately %s minutes apart (first end to second start, under 2 hours): adds the second-session amount.', v_gap)
        when 'pair_120_to_240' then format(' One report for 2 sessions, approximately %s minutes apart (first end to second start, 2 to under 4 hours): adds the extended-gap amount.', v_gap)
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
