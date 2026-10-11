/*
  # Add budget column to jobs

  ## Summary
  Adds an optional `budget` numeric column to the jobs table so that
  job costing can display a budget vs actual comparison.

  ## Changes
  ### jobs table
  - `budget` (numeric, nullable) — the total budget for the job.
    Nullable so existing jobs are unaffected. The job costing panel
    shows a budget vs actual bar when this is set.

  ## Security
  No security changes — the existing company-scoped RLS policies on
  jobs already cover the new column.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'budget'
  ) THEN
    ALTER TABLE jobs ADD COLUMN budget numeric;
  END IF;
END $$;
