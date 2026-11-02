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
