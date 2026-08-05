/*
  # Job Numbers + Employee Color Assignment

  ## Summary
  Adds an auto-incrementing job number to every job for human-readable
  reference (like SimPRO job numbers). Also adds a `color` column to
  jobs so each job can be assigned a distinct color for board views.

  ## Changes
  ### jobs table
  - `job_number` (int) — company-scoped sequential job number.
    Computed via a trigger: INSERT sets job_number to max(existing)+1
    within the same company.
  - `color` (text, nullable) — hex color string for board display.
    The app assigns colors from a palette; this column persists the
    choice so a job keeps its color across views.

  ## Trigger
  - `set_job_number()` BEFORE INSERT on jobs — if job_number is NULL,
    sets it to COALESCE(MAX(job_number), 0) + 1 for that company_id.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'job_number'
  ) THEN
    ALTER TABLE jobs ADD COLUMN job_number int;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'color'
  ) THEN
    ALTER TABLE jobs ADD COLUMN color text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jobs_job_number ON jobs(company_id, job_number);

-- ── Trigger: auto-assign sequential job_number per company ────────
CREATE OR REPLACE FUNCTION set_job_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.job_number IS NULL THEN
    SELECT COALESCE(MAX(job_number), 0) + 1
    INTO NEW.job_number
    FROM jobs
    WHERE company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_job_number ON jobs;
CREATE TRIGGER trg_set_job_number
  BEFORE INSERT ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION set_job_number();

-- ── Backfill existing rows ───────────────────────────────────────
UPDATE jobs j
SET job_number = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at) AS rn
  FROM jobs
) sub
WHERE j.id = sub.id AND j.job_number IS NULL;
