/*

  # Job costing charge-out fields



  Support do-and-charge and quoted jobs with cost + markup + sell on each job_cost row.

*/



ALTER TABLE job_costs

  ADD COLUMN IF NOT EXISTS markup_percent numeric NOT NULL DEFAULT 0,

  ADD COLUMN IF NOT EXISTS unit_price numeric NOT NULL DEFAULT 0,

  ADD COLUMN IF NOT EXISTS charge_type text,

  ADD COLUMN IF NOT EXISTS total_price numeric NOT NULL DEFAULT 0;



-- Backfill sell = cost for existing rows (historical convert stored sell as unit_cost)

UPDATE job_costs

SET

  unit_price = COALESCE(NULLIF(unit_price, 0), unit_cost),

  total_price = COALESCE(NULLIF(total_price, 0), total_cost),

  markup_percent = COALESCE(markup_percent, 0)

WHERE unit_price = 0 OR total_price = 0;

