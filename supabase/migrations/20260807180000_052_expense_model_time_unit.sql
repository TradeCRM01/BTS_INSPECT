-- Time unit for employee cost models (how package amounts are denominated).

ALTER TABLE expense_cost_models
  ADD COLUMN IF NOT EXISTS time_unit text NOT NULL DEFAULT 'monthly';

ALTER TABLE expense_cost_models DROP CONSTRAINT IF EXISTS expense_cost_models_time_unit_check;
ALTER TABLE expense_cost_models
  ADD CONSTRAINT expense_cost_models_time_unit_check
  CHECK (time_unit IN ('hourly', 'daily', 'weekly', 'monthly', 'annually'));

-- Backfill from billing_period where sensible
UPDATE expense_cost_models
SET time_unit = CASE billing_period
  WHEN 'weekly' THEN 'weekly'
  WHEN 'fortnightly' THEN 'weekly'
  WHEN 'monthly' THEN 'monthly'
  WHEN 'quarterly' THEN 'monthly'
  WHEN 'yearly' THEN 'annually'
  ELSE 'monthly'
END
WHERE time_unit = 'monthly' AND billing_period IS NOT NULL;
