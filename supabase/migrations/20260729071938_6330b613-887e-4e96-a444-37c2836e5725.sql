ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_plan_price numeric;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_custom_plan_price_nonneg') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_custom_plan_price_nonneg CHECK (custom_plan_price IS NULL OR custom_plan_price >= 0);
  END IF;
END $$;