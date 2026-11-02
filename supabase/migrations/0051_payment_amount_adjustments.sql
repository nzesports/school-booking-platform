-- Staff top-ups and no-payment approvals for ambassador payments.
--
-- Back-to-back sessions at one school on the same day are paid once: staff
-- approve one report at the standard rate plus an extra amount (e.g. $50 for
-- the second session), and approve the other reports with no payment. The
-- fail-safe lives here, inside the approval transaction: the extra can never
-- exceed $250, it cannot be combined with a no-payment approval, and both
-- need a note explaining why.

alter table public.payments
  add column if not exists extra_amount_cents integer not null default 0,
  add column if not exists payment_note text;

alter table public.payments
  drop constraint if exists payments_extra_amount_cents_check,
  add constraint payments_extra_amount_cents_check
    check (extra_amount_cents between 0 and 25000);

drop function if exists public.approve_ambassador_report_payment(
  uuid, uuid, text, text, text, text, text, timestamptz, text
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
declare
  v_report public.ambassador_reports%rowtype;
  v_payment public.payments%rowtype;
  v_extra integer := coalesce(p_extra_amount_cents, 0);
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
    if v_extra < 0 or v_extra > 25000 then
      raise exception 'Extra payment amounts must be between $0 and $250.';
    end if;

    if coalesce(p_skip_payment, false) and v_extra > 0 then
      raise exception 'A report approved with no payment cannot carry an extra amount.';
    end if;

    if (coalesce(p_skip_payment, false) or v_extra > 0) and v_note is null then
      raise exception 'Extra amounts and no-payment approvals require a note.';
    end if;
  end if;

  update public.ambassador_reports
  set
    reviewed_for_payment_at = now(),
    reviewed_for_payment_by = p_actor_id
  where id = v_report.id;

  if v_payment.id is null then
    return query select true, null::uuid, v_report.booking_session_id;
    return;
  end if;

  if coalesce(p_skip_payment, false) then
    update public.payments
    set
      status = 'not_eligible',
      amount_cents = 0,
      staff_override = true,
      payment_note = v_note,
      eligibility_reason = 'Approved with no payment: ' || v_note,
      updated_by = p_actor_id,
      updated_at = now()
    where id = v_payment.id;

    update public.booking_sessions
    set
      payment_status = 'not_eligible',
      updated_at = now()
    where id = v_report.booking_session_id;

    return query select true, null::uuid, v_report.booking_session_id;
    return;
  end if;

  if p_invoice_number is null
    or p_bank_account_name is null
    or p_bank_account_number is null
    or p_token_hash is null
    or p_token_expires_at is null
    or p_finance_email is null then
    raise exception 'Payable reports require complete finance payment data.';
  end if;

  update public.payments
  set
    status = 'approved',
    amount_cents = amount_cents + v_extra,
    extra_amount_cents = v_extra,
    payment_note = case when v_extra > 0 then v_note else null end,
    invoice_number = coalesce(invoice_number, p_invoice_number),
    invoice_generated_at = coalesce(invoice_generated_at, now()),
    bank_account_name = p_bank_account_name,
    bank_account_number = p_bank_account_number,
    gst_number = nullif(p_gst_number, ''),
    sent_to_email = p_finance_email,
    finance_email_status = 'pending',
    finance_email_error = null,
    finance_confirmation_token_hash = p_token_hash,
    finance_confirmation_expires_at = p_token_expires_at,
    updated_by = p_actor_id,
    updated_at = now()
  where id = v_payment.id;

  update public.booking_sessions
  set
    status = 'payment_pending',
    payment_status = 'approved',
    updated_at = now()
  where id = v_report.booking_session_id;

  return query select true, v_payment.id, v_report.booking_session_id;
end;
$$;

revoke all on function public.approve_ambassador_report_payment(
  uuid, uuid, text, text, text, text, text, timestamptz, text, integer, boolean, text
) from public, anon, authenticated;
grant execute on function public.approve_ambassador_report_payment(
  uuid, uuid, text, text, text, text, text, timestamptz, text, integer, boolean, text
) to service_role;
