/*
  Standard hours on employee cost models — used to derive $/hour
  (total package cost ÷ hours in the billing period)
*/

ALTER TABLE expense_cost_models
  ADD COLUMN IF NOT EXISTS standard_hours numeric(8,2) NOT NULL DEFAULT 152;

COMMENT ON COLUMN expense_cost_models.standard_hours IS
  'Billable/paid hours covered by this package (e.g. 38 weekly, 152 monthly) for hourly cost';
