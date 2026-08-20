-- Slice 2: one invoice per quote (quote_id) and a real origin for job-bill invoices.
-- Prefer quote_id over matching notes. source is nullable so manual invoices stay unchanged.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS source text;

COMMENT ON COLUMN invoices.source IS 'Origin of the invoice: quote | job_bill | null (manual)';

UPDATE invoices
SET source = 'job_bill'
WHERE source IS NULL
  AND notes ILIKE 'From job bill%';

UPDATE invoices
SET source = 'quote'
WHERE source IS NULL
  AND quote_id IS NOT NULL
  AND notes ILIKE 'From quote #%';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM invoices
    WHERE quote_id IS NOT NULL
    GROUP BY quote_id
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_per_quote
      ON invoices (quote_id)
      WHERE quote_id IS NOT NULL;
  END IF;
END $$;

-- Only add the job-bill unique index when existing rows are already unique.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM invoices
    WHERE source = 'job_bill' AND job_id IS NOT NULL
    GROUP BY job_id
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_job_bill_per_job
      ON invoices (job_id)
      WHERE source = 'job_bill' AND job_id IS NOT NULL;
  END IF;
END $$;
