-- Multi-doctor P3 (DB2): per-doctor revenue, computed server-side.
--
--  * invoices.practitioner_id is a SNAPSHOT of the doctor who saw the patient, taken when the invoice
--    is created (BEFORE INSERT trigger, from the appointment). ensure_invoice_for_appointment() is NOT
--    modified. Deleting or moving the appointment later never changes who earned the invoice.
--  * get_practitioner_revenue(from, to): the clinic report (owner, or staff with billing.view).
--  * get_my_practitioner_revenue(from, to): a doctor login's own aggregate row, only when the
--    owner switched website_settings.show_doctor_earnings on (default OFF, owner-only).
-- Dates are IST. Revenue is the ex-GST invoice amount (GST shown separately). Single-doctor
-- clinics get one row equal to the clinic totals.

-- 1. Invoice snapshot ------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS practitioner_id uuid REFERENCES public.practitioners(id) ON DELETE SET NULL;

-- Existing invoices: take the doctor from their appointment (no trigger exists on invoices yet).
UPDATE public.invoices i
   SET practitioner_id = a.practitioner_id
  FROM public.appointments a
 WHERE a.id = i.appointment_id AND a.doctor_id = i.doctor_id AND i.practitioner_id IS NULL;

-- (doctor_id, created_at) is already indexed by idx_invoices_doctor.
CREATE INDEX IF NOT EXISTS idx_invoices_doctor_practitioner
  ON public.invoices (doctor_id, practitioner_id, created_at);

CREATE OR REPLACE FUNCTION public.fill_invoice_practitioner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.practitioner_id IS NOT NULL THEN
    -- An explicit doctor is kept, but it must belong to this clinic.
    IF NOT EXISTS (SELECT 1 FROM public.practitioners WHERE id = NEW.practitioner_id AND doctor_id = NEW.doctor_id) THEN
      RAISE EXCEPTION 'PRACTITIONER_MISMATCH' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.appointment_id IS NOT NULL THEN
    SELECT practitioner_id INTO NEW.practitioner_id
      FROM public.appointments
     WHERE id = NEW.appointment_id AND doctor_id = NEW.doctor_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fill_invoice_practitioner() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_a0_invoice_practitioner ON public.invoices;
CREATE TRIGGER trg_a0_invoice_practitioner
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.fill_invoice_practitioner();

-- The snapshot is not editable from a client session. Setting it to NULL (the FK's ON DELETE SET NULL)
-- and writes without a JWT (service role, cron, migrations) stay possible.
CREATE OR REPLACE FUNCTION public.guard_invoice_practitioner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.practitioner_id IS NOT NULL
     AND NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id THEN
    RAISE EXCEPTION 'INVOICE_DOCTOR_LOCKED' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_invoice_practitioner() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_a0_invoice_practitioner_lock ON public.invoices;
CREATE TRIGGER trg_a0_invoice_practitioner_lock
  BEFORE UPDATE OF practitioner_id ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_practitioner();

-- 2. The opt-in earnings switch (owner-only, like clinical_visibility) -------------------------
ALTER TABLE public.website_settings
  ADD COLUMN IF NOT EXISTS show_doctor_earnings boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_show_doctor_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() = NEW.doctor_id THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.show_doctor_earnings IS DISTINCT FROM false)
     OR (TG_OP = 'UPDATE' AND NEW.show_doctor_earnings IS DISTINCT FROM OLD.show_doctor_earnings) THEN
    RAISE EXCEPTION 'OWNER_ONLY' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_show_doctor_earnings() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_show_doctor_earnings ON public.website_settings;
CREATE TRIGGER trg_guard_show_doctor_earnings
  BEFORE INSERT OR UPDATE ON public.website_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_show_doctor_earnings();

-- 3. The numbers -------------------------------------------------------------------------------
-- {cash, upi, card, online, other, unrecorded, ...} -> {..., by_mode: {cash, ...}}
CREATE OR REPLACE FUNCTION public.revenue_nest_modes(_j jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT (_j - 'cash' - 'upi' - 'card' - 'online' - 'other' - 'unrecorded')
         || jsonb_build_object('by_mode', jsonb_build_object(
              'cash', _j->'cash', 'upi', _j->'upi', 'card', _j->'card',
              'online', _j->'online', 'other', _j->'other', 'unrecorded', _j->'unrecorded'))
$$;
REVOKE ALL ON FUNCTION public.revenue_nest_modes(jsonb) FROM PUBLIC, anon, authenticated;

-- Internal: one clinic, an already-validated date range (IST). Callers check access first.
CREATE OR REPLACE FUNCTION public.practitioner_revenue_core(_clinic uuid, _from date, _to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from timestamptz := (_from::timestamp) AT TIME ZONE 'Asia/Kolkata';
  v_to   timestamptz := ((_to + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata';
  v_rows jsonb;
  v_un   jsonb;
  v_tot  jsonb;
BEGIN
  WITH inv AS (
    SELECT practitioner_id AS pid,
           (status <> 'refunded' AND created_at >= v_from AND created_at < v_to) AS is_paid,
           (status = 'refunded' AND COALESCE(refunded_at, created_at) >= v_from
                                AND COALESCE(refunded_at, created_at) < v_to) AS is_refund,
           lower(COALESCE(payment_method, '')) AS m,
           amount, gst_amount, commission_amount,
           COALESCE(net_amount, amount - commission_amount) AS net
      FROM public.invoices
     WHERE doctor_id = _clinic
  ),
  ia AS (
    SELECT pid,
           count(*) FILTER (WHERE is_paid) AS n_paid,
           COALESCE(sum(amount) FILTER (WHERE is_paid), 0) AS paid_amount,
           COALESCE(sum(gst_amount) FILTER (WHERE is_paid), 0) AS gst_amount,
           COALESCE(sum(amount) FILTER (WHERE is_paid AND m = 'cash'), 0) AS cash,
           COALESCE(sum(amount) FILTER (WHERE is_paid AND m = 'upi'), 0) AS upi,
           COALESCE(sum(amount) FILTER (WHERE is_paid AND m = 'card'), 0) AS card,
           COALESCE(sum(amount) FILTER (WHERE is_paid AND m = 'online'), 0) AS online,
           COALESCE(sum(amount) FILTER (WHERE is_paid AND m NOT IN ('cash', 'upi', 'card', 'online', '')), 0) AS other,
           COALESCE(sum(amount) FILTER (WHERE is_paid AND m = ''), 0) AS unrecorded,
           count(*) FILTER (WHERE is_refund) AS refunds_count,
           COALESCE(sum(amount) FILTER (WHERE is_refund), 0) AS refunds_amount,
           COALESCE(sum(commission_amount) FILTER (WHERE is_paid), 0) AS platform_charge,
           COALESCE(sum(net) FILTER (WHERE is_paid), 0) AS net
      FROM inv GROUP BY pid
  ),
  aa AS (
    SELECT practitioner_id AS pid,
           count(*) FILTER (WHERE status::text = 'completed') AS visits_completed,
           count(*) FILTER (WHERE status::text = 'no_show') AS no_shows,
           count(*) FILTER (WHERE status::text = 'no_show' AND payment_status::text = 'paid') AS paid_no_shows_count,
           COALESCE(sum(amount) FILTER (WHERE status::text = 'no_show' AND payment_status::text = 'paid'), 0) AS paid_no_shows_amount
      FROM public.appointments
     WHERE doctor_id = _clinic AND date >= _from AND date <= _to
     GROUP BY practitioner_id
  ),
  keys AS (
    SELECT id AS pid FROM public.practitioners WHERE doctor_id = _clinic
    UNION ALL
    SELECT NULL::uuid
  ),
  m AS (
    SELECT k.pid,
           COALESCE(aa.visits_completed, 0) AS visits_completed,
           COALESCE(ia.paid_amount, 0) AS paid_amount,
           COALESCE(ia.gst_amount, 0) AS gst_amount,
           COALESCE(ia.cash, 0) AS cash, COALESCE(ia.upi, 0) AS upi, COALESCE(ia.card, 0) AS card,
           COALESCE(ia.online, 0) AS online, COALESCE(ia.other, 0) AS other, COALESCE(ia.unrecorded, 0) AS unrecorded,
           COALESCE(ia.refunds_count, 0) AS refunds_count,
           COALESCE(ia.refunds_amount, 0) AS refunds_amount,
           COALESCE(aa.no_shows, 0) AS no_shows,
           COALESCE(aa.paid_no_shows_count, 0) AS paid_no_shows_count,
           COALESCE(aa.paid_no_shows_amount, 0) AS paid_no_shows_amount,
           COALESCE(ia.platform_charge, 0) AS platform_charge,
           COALESCE(ia.net, 0) AS net,
           COALESCE(ia.n_paid, 0) AS n_paid
      FROM keys k
      LEFT JOIN ia ON ia.pid IS NOT DISTINCT FROM k.pid
      LEFT JOIN aa ON aa.pid IS NOT DISTINCT FROM k.pid
  ),
  r AS (
    SELECT p.is_primary, p.sort_order, p.created_at,
           public.revenue_nest_modes(
             (to_jsonb(m) - 'pid' - 'n_paid')
             || jsonb_build_object('practitioner_id', p.id, 'display_name', p.display_name, 'is_active', p.is_active)) AS j
      FROM public.practitioners p
      JOIN m ON m.pid = p.id
     WHERE p.doctor_id = _clinic
       AND (p.is_active OR (m.visits_completed + m.no_shows + m.n_paid + m.refunds_count) > 0)
  ),
  u AS (
    SELECT public.revenue_nest_modes(to_jsonb(m) - 'pid' - 'n_paid') AS j FROM m WHERE pid IS NULL
  ),
  t AS (
    SELECT public.revenue_nest_modes(to_jsonb(s)) AS j
      FROM (SELECT sum(visits_completed)::bigint AS visits_completed, sum(paid_amount) AS paid_amount,
                   sum(gst_amount) AS gst_amount, sum(cash) AS cash, sum(upi) AS upi, sum(card) AS card,
                   sum(online) AS online, sum(other) AS other, sum(unrecorded) AS unrecorded,
                   sum(refunds_count)::bigint AS refunds_count, sum(refunds_amount) AS refunds_amount,
                   sum(no_shows)::bigint AS no_shows, sum(paid_no_shows_count)::bigint AS paid_no_shows_count,
                   sum(paid_no_shows_amount) AS paid_no_shows_amount,
                   sum(platform_charge) AS platform_charge, sum(net) AS net
              FROM m) s
  )
  SELECT (SELECT COALESCE(jsonb_agg(j ORDER BY is_primary DESC, sort_order, created_at), '[]'::jsonb) FROM r),
         (SELECT j FROM u),
         (SELECT j FROM t)
    INTO v_rows, v_un, v_tot;

  RETURN jsonb_build_object('rows', v_rows, 'unattributed', v_un, 'totals', v_tot);
END;
$$;
REVOKE ALL ON FUNCTION public.practitioner_revenue_core(uuid, date, date) FROM PUBLIC, anon, authenticated;

-- The clinic report: the owner, or staff with billing.view.
CREATE OR REPLACE FUNCTION public.get_practitioner_revenue(_from date, _to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_clinic uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  v_clinic := CASE
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN v_uid
    WHEN COALESCE(public.staff_has_permission(v_uid, 'billing.view'), false) THEN public.staff_doctor_id(v_uid)
  END;
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  IF _from IS NULL OR _to IS NULL OR _from > _to THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_RANGE');
  END IF;
  IF _to - _from > 365 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RANGE_TOO_LARGE');
  END IF;
  RETURN jsonb_build_object('ok', true, 'from', _from, 'to', _to)
         || public.practitioner_revenue_core(v_clinic, _from, _to);
END;
$$;
REVOKE ALL ON FUNCTION public.get_practitioner_revenue(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_practitioner_revenue(date, date) TO authenticated;

-- A doctor login's own numbers (or the owner's own, as a doctor): aggregate only, when switched on.
-- The doctor is read from the caller's own row, never from a parameter.
CREATE OR REPLACE FUNCTION public.get_my_practitioner_revenue(_from date, _to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_clinic uuid;
  v_pid    uuid;
  v_res    jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  SELECT doctor_id, practitioner_id INTO v_clinic, v_pid
    FROM public.staff_members
   WHERE id = v_uid AND status = 'active' AND role = 'doctor' AND practitioner_id IS NOT NULL;
  IF NOT FOUND THEN
    v_clinic := NULL;
    v_pid := NULL;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
      SELECT id INTO v_pid FROM public.practitioners
       WHERE doctor_id = v_uid AND user_id = v_uid AND is_active;
      IF v_pid IS NOT NULL THEN
        v_clinic := v_uid;
      END IF;
    END IF;
  END IF;
  IF v_clinic IS NULL OR v_pid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  IF NOT COALESCE((SELECT show_doctor_earnings FROM public.website_settings WHERE doctor_id = v_clinic), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_ENABLED');
  END IF;
  IF _from IS NULL OR _to IS NULL OR _from > _to THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_RANGE');
  END IF;
  IF _to - _from > 365 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RANGE_TOO_LARGE');
  END IF;
  v_res := public.practitioner_revenue_core(v_clinic, _from, _to);
  RETURN jsonb_build_object(
    'ok', true, 'from', _from, 'to', _to,
    'row', (SELECT e FROM jsonb_array_elements(v_res->'rows') e WHERE (e->>'practitioner_id')::uuid = v_pid)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_practitioner_revenue(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_practitioner_revenue(date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
