-- RLS policies and notification integration for pending_plans and subscription reactivation

ALTER TABLE public.pending_plans ENABLE ROW LEVEL SECURITY;

-- Doctors can view their own scheduled pending plans
CREATE POLICY "Doctors view own pending plans" ON public.pending_plans
  FOR SELECT USING (auth.uid() = doctor_id);

-- Doctors can cancel (delete) their own scheduled pending plans
CREATE POLICY "Doctors delete own pending plans" ON public.pending_plans
  FOR DELETE USING (auth.uid() = doctor_id);

-- Admins / Superadmins can view all pending plans
CREATE POLICY "Admins view all pending plans" ON public.pending_plans
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Update activate_scheduled_plans function to notify the doctor when their scheduled plan activates
CREATE OR REPLACE FUNCTION public.activate_scheduled_plans()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending_row RECORD;
BEGIN
  -- Find all pending plans that have reached their activation date
  FOR pending_row IN
    SELECT pp.id, pp.doctor_id, pp.target_tier, pp.payment_id
    FROM public.pending_plans pp
    WHERE pp.activation_date <= now()
    ORDER BY pp.activation_date ASC
  LOOP
    -- Activate the plan
    UPDATE public.profiles
    SET 
      plan_tier = pending_row.target_tier,
      plan_status = 'active',
      plan_end = now() + interval '30 days'
    WHERE id = pending_row.doctor_id;

    -- Remove the pending plan record
    DELETE FROM public.pending_plans WHERE id = pending_row.id;

    -- Send in-app notification to the doctor
    INSERT INTO public.notifications (doctor_id, source_type, title, message)
    VALUES (
      pending_row.doctor_id,
      'direct_message',
      'Scheduled Plan Activated!',
      'Your ' || INITCAP(pending_row.target_tier) || ' plan is now active. Enjoy your upgraded features!'
    );

    -- Log the activation
    INSERT INTO public.admin_audit_log (doctor_id, action, details, actor_id)
    VALUES (
      pending_row.doctor_id,
      'scheduled_plan_activated',
      jsonb_build_object(
        'tier', pending_row.target_tier,
        'payment_id', pending_row.payment_id,
        'activated_at', now()
      ),
      pending_row.doctor_id
    );
  END LOOP;
END;
$$;
