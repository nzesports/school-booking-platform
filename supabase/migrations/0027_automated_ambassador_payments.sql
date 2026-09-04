-- Automate ambassador payments when a submitted report is approved.
-- Finance confirms payment through an expiring bearer link; only its SHA-256
-- hash is persisted. PDF invoice generation and ambassador invoice submission
-- are retired, while invoice numbers remain as bank references.

alter table public.payments
  rename column invoice_submitted_at to invoice_generated_at;

alter table public.payments
  add column if not exists bank_account_name text,
  add column if not exists finance_email_status text,
  add column if not exists finance_email_attempts integer not null default 0,
  add column if not exists finance_email_last_attempt_at timestamptz,
  add column if not exists finance_email_error text,
  add column if not exists finance_confirmation_token_hash text,
  add column if not exists finance_confirmation_expires_at timestamptz,
  add column if not exists finance_confirmed_at timestamptz,
  add column if not exists finance_confirmed_email text;

update public.payments
set
  status = 'approved',
  finance_email_status = case
    when status = 'submitted_for_payment' then 'sent'
    else 'pending'
  end
where status in ('invoiced', 'submitted_for_payment');

update public.payments
set status = 'pending'
where status = 'eligible';

update public.payments
set finance_email_status = 'sent'
where status = 'paid'
  and sent_to_finance_at is not null
  and finance_email_status is null;

update public.payments payment
set bank_account_name = profile.bank_account_name
from public.ambassador_profiles profile
where payment.ambassador_profile_id = profile.id
  and payment.invoice_number is not null
  and payment.bank_account_name is null;

alter table public.payments
  drop constraint if exists payments_finance_email_status_check,
  add constraint payments_finance_email_status_check
    check (finance_email_status is null or finance_email_status in ('pending', 'sent', 'failed'));

create unique index if not exists payments_finance_confirmation_token_hash_key
  on public.payments (finance_confirmation_token_hash)
  where finance_confirmation_token_hash is not null;

create or replace function public.approve_ambassador_report_payment(
  p_report_id uuid,
  p_actor_id uuid,
  p_invoice_number text default null,
  p_bank_account_name text default null,
  p_bank_account_number text default null,
  p_gst_number text default null,
  p_token_hash text default null,
  p_token_expires_at timestamptz default null,
  p_finance_email text default null
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

  update public.ambassador_reports
  set
    reviewed_for_payment_at = now(),
    reviewed_for_payment_by = p_actor_id
  where id = v_report.id;

  if v_payment.id is null then
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
  uuid, uuid, text, text, text, text, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.approve_ambassador_report_payment(
  uuid, uuid, text, text, text, text, text, timestamptz, text
) to service_role;

update public.email_templates
set
  name = 'Ambassador payment approval to finance',
  subject = 'Payment {{invoiceNumber}} - {{ambassadorName}}',
  body_html = '<p>Kia ora,</p><p>The ambassador payment below has been approved.</p><p><strong>Invoice reference:</strong> {{invoiceNumber}}<br><strong>Ambassador:</strong> {{ambassadorName}}<br><strong>Session:</strong> {{sessionDescription}}<br><strong>Amount:</strong> {{amountLabel}}<br><strong>Account name:</strong> {{bankAccountName}}<br><strong>Bank account:</strong> {{bankAccountNumber}}{{gstLine}}</p><p>Use <strong>{{invoiceNumber}}</strong> as the bank payment reference.</p>{{confirmationButton}}<p>This confirmation link expires after 30 days.</p>',
  body_text = 'Approved payment {{invoiceNumber}} for {{ambassadorName}}. Amount: {{amountLabel}}. Account name: {{bankAccountName}}. Bank account: {{bankAccountNumber}}. Use {{invoiceNumber}} as the bank reference.',
  updated_at = now()
where template_key = 'invoice_to_finance';
