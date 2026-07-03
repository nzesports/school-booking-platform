-- Ambassador invoice submission and finance payment workflow.
-- Payments gain per-invoice fields (one invoice per session payment);
-- ambassadors store default payment details on their profile.

alter table public.payments
  add column if not exists invoice_number text,
  add column if not exists bank_account_number text,
  add column if not exists gst_number text,
  add column if not exists invoice_notes text,
  add column if not exists invoice_submitted_at timestamptz,
  add column if not exists sent_to_email text,
  add column if not exists sent_cc_email text;

-- Partial unique index so the many pre-invoice rows (null) are allowed.
create unique index if not exists payments_invoice_number_key
  on public.payments (invoice_number)
  where invoice_number is not null;

alter table public.ambassador_profiles
  add column if not exists bank_account_number text,
  add column if not exists gst_number text;

-- Default finance inbox for the staff "send to finance" form.
update public.settings
set setting_value = jsonb_set(setting_value, '{financeEmail}', '"info@esf.nz"', true)
where setting_key = 'payments'
  and not (setting_value ? 'financeEmail');

insert into public.email_templates (template_key, name, subject, body_html, body_text)
values
  (
    'invoice_to_finance',
    'Ambassador invoice to finance',
    'Ambassador invoice {{invoiceNumber}} - {{ambassadorName}}',
    '<p>Kia ora,</p><p>Invoice <strong>{{invoiceNumber}}</strong> from <strong>{{ambassadorName}}</strong> for <strong>{{sessionDescription}}</strong> is attached.</p><p>Amount payable: <strong>{{amountLabel}}</strong></p><p>Please process this payment and reply to confirm once complete.</p>',
    'Invoice {{invoiceNumber}} from {{ambassadorName}} for {{sessionDescription}} is attached. Amount payable: {{amountLabel}}.'
  )
on conflict (template_key) do nothing;
