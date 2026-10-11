/*
# Shared Drive — Make reports company-scoped

## Problem
The reports table has no `company_id` column. RLS policies and client queries
join through inspections → profiles to determine company membership. But the
profiles table RLS only lets users see their OWN profile (`auth.uid() = id`),
so a regular member querying profiles gets only their own row. The reports
query in the Shared Drive therefore only finds reports for the current user's
own inspections — not reports from other team members in the same company.

## Fix
1. Add `company_id` column to `reports` (nullable, backfilled from the
   inspection's inspector company).
2. Backfill existing rows: `UPDATE reports SET company_id = (SELECT p.company_id
   FROM inspections i JOIN profiles p ON p.id = i.inspector_id WHERE i.id =
   reports.inspection_id)`.
3. Make `company_id` NOT NULL after backfill (all reports have an inspection
   with an inspector, so every row gets a value).
4. Replace all 4 RLS policies (SELECT/INSERT/UPDATE/DELETE) with company_id-
   based checks identical to the pattern used on `folders` and `uploaded_pdfs`.
5. Add an index on `company_id` for fast company-scoped lookups.

## Security
- RLS stays enabled.
- All policies scope TO authenticated and check `company_id IN (SELECT
  company_id FROM profiles WHERE id = auth.uid())` — the same pattern used
  on folders, uploaded_pdfs, and other company-scoped tables.
- No data is lost; existing rows are backfilled in place.
*/

-- 1. Add company_id column
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'company_id') THEN
    ALTER TABLE reports ADD COLUMN company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. Backfill from inspections → profiles
UPDATE reports r
SET company_id = sub.company_id
FROM (
  SELECT i.id AS inspection_id, p.company_id
  FROM inspections i
  JOIN profiles p ON p.id = i.inspector_id
) sub
WHERE r.inspection_id = sub.inspection_id
  AND r.company_id IS NULL;

-- 3. Make NOT NULL (safe because every report has an inspection with an inspector)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'company_id'
    AND is_nullable = 'YES') THEN
    ALTER TABLE reports ALTER COLUMN company_id SET NOT NULL;
  END IF;
END $$;

-- 4. Index for company-scoped queries
CREATE INDEX IF NOT EXISTS idx_reports_company ON reports(company_id);

-- 5. Replace RLS policies with company_id-based checks
DROP POLICY IF EXISTS "Company members can view reports" ON reports;
CREATE POLICY "Company members can view reports"
ON reports FOR SELECT
TO authenticated
USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert reports" ON reports;
CREATE POLICY "Company members can insert reports"
ON reports FOR INSERT
TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update reports" ON reports;
CREATE POLICY "Company members can update reports"
ON reports FOR UPDATE
TO authenticated
USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete reports" ON reports;
CREATE POLICY "Company members can delete reports"
ON reports FOR DELETE
TO authenticated
USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
