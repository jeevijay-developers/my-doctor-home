-- Create pending_plans table to track plan renewals/upgrades scheduled to activate after current plan expires.
-- This allows doctors to renew/upgrade while their current plan is still active.
CREATE TABLE IF NOT EXISTS public.pending_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- What tier/status this plan will have when it activates
  target_tier text NOT NULL CHECK (target_tier IN ('pro', 'premium')),
  activation_date timestamp with time zone NOT NULL,
  
  -- Payment tracking
  payment_id uuid NOT NULL REFERENCES public.plan_upgrade_payments(id) ON DELETE CASCADE,
  
  -- When this pending plan was created
  created_at timestamp with time zone DEFAULT now(),
  
  UNIQUE(doctor_id, payment_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_plans_activation ON public.pending_plans(activation_date) 
WHERE activation_date IS NOT NULL;

-- Function to activate scheduled plans that have reached their activation date.
-- Called daily by cron job.
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

    -- Log the activation (optional, for debugging)
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

-- Schedule the cron job to run daily at 4 AM UTC (after plan expiry notifications)
SELECT cron.schedule(
  'activate-scheduled-plans',
  '0 4 * * *',
  $$SELECT public.activate_scheduled_plans();$$
);
