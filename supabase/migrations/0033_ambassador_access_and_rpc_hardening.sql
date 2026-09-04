-- Access hardening pass from the security audit.
--
-- 1. Deleted or unapproved ambassadors lose all ambassador-scoped access:
--    current_ambassador_profile_id() now only resolves for approved,
--    non-deleted profiles, so every RLS clause built on it goes dark the
--    moment staff archive or un-approve an ambassador.
-- 2. notify_staff_about_ambassador_application() becomes service-role-only.
--    It has been SECURITY DEFINER and executable by anon/authenticated since
--    0002, letting anyone spam staff notifications through PostgREST.
-- 3. notifications SELECT/UPDATE policies drop the is_staff_like() branch so
--    staff can no longer read or edit other users' notifications; the
--    staff-only INSERT policy from 0001 is untouched.

-- ---------------------------------------------------------------------------
-- 1. current_ambassador_profile_id() requires an active ambassador.
--
-- Product decision: a deleted (deleted_at set, 0026) or not-yet/no-longer
-- approved ambassador must lose ALL platform access until staff or an admin
-- restore them. ambassador_profiles.status is free text defaulting to
-- 'applied' (0001) with 'approved' as the active value (0026 sorts on
-- status = 'approved'). Every ambassador-facing policy keys off this helper,
-- so tightening it here revokes access everywhere at once. Signature and
-- SECURITY DEFINER treatment match 0032.

create or replace function public.current_ambassador_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.ambassador_profiles
  where user_id = auth.uid()
    and status = 'approved'
    and deleted_at is null
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- 2. Lock down the staff-notification RPC. Mirrors how 0027 restricted
-- approve_ambassador_report_payment: only the service role (used by the
-- signup trigger's definer context and the admin client) may call it.

revoke all on function public.notify_staff_about_ambassador_application(
  uuid, text
) from public, anon, authenticated;
grant execute on function public.notify_staff_about_ambassador_application(
  uuid, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Notifications become own-rows-only for reads and updates. The 0001
-- policies allowed any staff-like account to read and update every user's
-- notifications; notifications are personal, and staff tooling that needs a
-- cross-user view goes through the service role. Policy names match 0001 so
-- the drops target the live policies (no later migration replaced them).

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications"
on public.notifications for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications"
on public.notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
