-- 0014: store school review overall ratings with one-decimal precision so a
-- 5,4,5,4 spread saves as 4.5 instead of rounding up to 5.
alter table public.presentation_reviews
  alter column rating type numeric(3,1) using rating::numeric(3,1);

-- Recompute existing overall ratings from the per-category answers captured
-- by the feedback form. Rows without details keep their whole-number rating.
update public.presentation_reviews
set rating = round((
    (details->>'attendanceRating')::numeric +
    (details->>'studentResponseRating')::numeric +
    (details->>'contentRating')::numeric +
    (details->>'presenterEnergyRating')::numeric
  ) / 4, 1)
where details ? 'attendanceRating'
  and details ? 'studentResponseRating'
  and details ? 'contentRating'
  and details ? 'presenterEnergyRating';
