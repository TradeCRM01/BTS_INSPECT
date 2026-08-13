-- Link job bill lines to employee cost models (cost codes).
-- Quote/invoice line_items jsonb may include cost_model_id without a column change.

ALTER TABLE job_costs
  ADD COLUMN IF NOT EXISTS cost_model_id uuid REFERENCES expense_cost_models(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS job_costs_cost_model_id_idx ON job_costs(cost_model_id);
