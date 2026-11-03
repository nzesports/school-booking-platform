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
