-- Seed default plan prices into platform_settings.
-- These replace the hardcoded DEFAULT_PLAN_PRICES constant in the frontend
-- and the duplicate TIER_PRICES constant in the create-plan-upgrade-order
-- edge function. Superadmin can update them via Feature Flags → Plan Pricing.
-- Custom per-doctor overrides (custom_plan_price on profiles) still take
-- precedence over these globals, exactly as before.

INSERT INTO public.platform_settings (key, value, updated_at)
VALUES
  ('pro_default_price',     to_jsonb(1499),  now()),
  ('premium_default_price', to_jsonb(3999),  now())
ON CONFLICT (key) DO NOTHING;
