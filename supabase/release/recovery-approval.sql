-- Only BEFORE new-version writes; all writers/cron must remain stopped.
-- Set release.expected_data_fingerprint and release.expected_approval_hash in this
-- SAME connection from the successful forward transaction output, never recapture
-- them after admitting writes. Missing/mismatched values fail closed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
-- Session-local helpers; no persistent objects, permissions, or row changes.
-- Fingerprint includes every public table's row contents AND xmin. An update
-- then reversal still changes xmin; insert/delete and membership changes alter
-- the aggregate. Capture ONLY in the forward transaction before admitting writes.
CREATE OR REPLACE FUNCTION pg_temp.release_data_fingerprint() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE t record; h text; parts text := '';
BEGIN
  FOR t IN SELECT c.oid, n.nspname, c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname
  LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(row_hash, '''' ORDER BY row_hash), '''')) FROM (SELECT md5(to_jsonb(r)::text || r.xmin::text) row_hash FROM %I.%I r) s', t.nspname,t.relname) INTO h;
    parts := parts || t.relname || ':' || h || ';';
  END LOOP;
  RETURN md5(parts);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.lock_release_tables() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname
  LOOP
    EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',t.relname);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assert_recovery_safe() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE expected_data text := current_setting('release.expected_data_fingerprint',true);
  expected_function text := current_setting('release.expected_approval_hash',true);
  actual_function text;
BEGIN
  IF expected_data IS NULL OR expected_data !~ '^[0-9a-f]{32}$'
    OR expected_function IS NULL OR expected_function !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'Recovery blocked: supply the two fingerprints captured by the successful forward transaction';
  END IF;
  PERFORM pg_temp.lock_release_tables();
  SELECT md5(p.prosrc) INTO actual_function FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='approve_ambassador_report_payment' AND p.pronargs=13;
  IF actual_function IS DISTINCT FROM expected_function THEN
    RAISE EXCEPTION 'Recovery blocked: approval function changed';
  END IF;
  IF pg_temp.release_data_fingerprint() IS DISTINCT FROM expected_data THEN
    RAISE EXCEPTION 'Recovery blocked: public data changed after cutover; use reviewed forward recovery';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payments WHERE finance_email_status='pending' OR finance_email_claim_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Recovery blocked: finance delivery has not drained';
  END IF;
END $$;

SELECT pg_temp.assert_recovery_safe();
drop function public.approve_ambassador_report_payment(uuid,uuid,text,text,text,text,text,timestamptz,text,integer,boolean,text,boolean);
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
    if v_extra < 0 or v_extra > 25000 or v_extra % 100 <> 0 then
      raise exception 'Extra payment amounts must be whole dollars between $0 and $250.';
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
      base_amount_cents = 0,
      sourcing_bonus_cents = 0,
      additional_session_cents = 0,
      extra_amount_cents = 0,
      finance_email_status = null,
      finance_email_claim_id = null,
      finance_email_claimed_at = null,
      finance_confirmation_token_hash = null,
      finance_confirmation_expires_at = null,
      staff_override = true,
      payment_note = v_note,
      eligibility_reason = format('Approved with no payment (replaced %s cents): %s', amount_cents, v_note),
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
    amount_cents = base_amount_cents + sourcing_bonus_cents + additional_session_cents + v_extra,
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


DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='approve_ambassador_report_payment' AND p.pronargs=12 AND md5(p.prosrc)='1cb7b5289af08312ca62ab059f40934f') THEN RAISE EXCEPTION 'Recovery function verification failed'; END IF; IF pg_temp.release_data_fingerprint() IS DISTINCT FROM current_setting('release.expected_data_fingerprint') THEN RAISE EXCEPTION 'Recovery altered existing data'; END IF; END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
