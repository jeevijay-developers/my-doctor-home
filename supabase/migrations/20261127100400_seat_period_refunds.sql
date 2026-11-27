-- Multi-doctor P3 DB1 follow-up: a refunded plan payment withdraws the seat periods it created.
-- cancel-scheduled-plan and refund-payment set plan_upgrade_payments.status = 'refunded', but
-- clinic_seat_periods.payment_id only goes to NULL on delete, so a refunded renewal-with-seats
-- (or seat order) would keep seats the clinic no longer paid for. Doing it in the database covers
-- every refund path. Doctors beyond the new seat limit simply fall outside seats under the
-- existing rules.

CREATE OR REPLACE FUNCTION public.remove_seat_periods_on_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_removed integer;
  v_qty     integer;
BEGIN
  IF NEW.status = 'refunded' AND OLD.status IS DISTINCT FROM 'refunded' THEN
    WITH gone AS (
      DELETE FROM public.clinic_seat_periods WHERE payment_id = NEW.id RETURNING quantity
    )
    SELECT count(*)::integer, COALESCE(sum(quantity), 0)::integer INTO v_removed, v_qty FROM gone;
    IF v_removed > 0 THEN
      INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
      VALUES (NULL, 'seat_periods_removed_on_refund', 'clinic_seat_periods', NEW.doctor_id,
        jsonb_build_object('payment_id', NEW.id, 'removed', v_removed, 'quantity', v_qty));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_seat_periods_on_refund() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_remove_seat_periods_on_refund ON public.plan_upgrade_payments;
CREATE TRIGGER trg_remove_seat_periods_on_refund
  AFTER UPDATE OF status ON public.plan_upgrade_payments
  FOR EACH ROW
  WHEN (NEW.status = 'refunded' AND OLD.status IS DISTINCT FROM 'refunded')
  EXECUTE FUNCTION public.remove_seat_periods_on_refund();

NOTIFY pgrst, 'reload schema';
