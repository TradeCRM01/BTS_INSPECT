/*
# Create pdf_annotations table

1. New Tables
- `pdf_annotations`
  - `id` (uuid, primary key)
  - `report_id` (uuid, FK to reports, ON DELETE CASCADE)
  - `annotation_data` (jsonb, stores the full array of annotation objects)
  - `updated_by` (uuid, FK to profiles, ON DELETE SET NULL)
  - `updated_at` (timestamptz, auto-updated)

2. Purpose
- Stores user-created annotations (text, highlights, rectangles, circles, lines)
  for PDF reports so they persist across sessions and can be re-edited later.

3. Security
- Enable RLS on `pdf_annotations`.
- Company-scoped CRUD: only members of the same company as the report's
  inspection can read, insert, update, or delete annotations.
- Ownership is verified through: pdf_annotations → reports → inspections → profiles → company_id.
*/

CREATE TABLE IF NOT EXISTS pdf_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  annotation_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_pdf_annotations_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pdf_annotations_updated_at ON pdf_annotations;
CREATE TRIGGER pdf_annotations_updated_at
  BEFORE UPDATE ON pdf_annotations
  FOR EACH ROW
  EXECUTE FUNCTION update_pdf_annotations_updated_at();

ALTER TABLE pdf_annotations ENABLE ROW LEVEL SECURITY;

-- Helper: company membership check for a given report
-- A user can access annotations if they belong to the same company as the
-- inspector who created the underlying inspection for the report.

DROP POLICY IF EXISTS "Company members can view pdf annotations" ON pdf_annotations;
CREATE POLICY "Company members can view pdf annotations"
ON pdf_annotations FOR SELECT
TO authenticated
USING (
  report_id IN (
    SELECT r.id FROM reports r
    JOIN inspections i ON i.id = r.inspection_id
    JOIN profiles p ON p.id = i.inspector_id
    WHERE p.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Company members can insert pdf annotations" ON pdf_annotations;
CREATE POLICY "Company members can insert pdf annotations"
ON pdf_annotations FOR INSERT
TO authenticated
WITH CHECK (
  report_id IN (
    SELECT r.id FROM reports r
    JOIN inspections i ON i.id = r.inspection_id
    JOIN profiles p ON p.id = i.inspector_id
    WHERE p.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Company members can update pdf annotations" ON pdf_annotations;
CREATE POLICY "Company members can update pdf annotations"
ON pdf_annotations FOR UPDATE
TO authenticated
USING (
  report_id IN (
    SELECT r.id FROM reports r
    JOIN inspections i ON i.id = r.inspection_id
    JOIN profiles p ON p.id = i.inspector_id
    WHERE p.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
)
WITH CHECK (
  report_id IN (
    SELECT r.id FROM reports r
    JOIN inspections i ON i.id = r.inspection_id
    JOIN profiles p ON p.id = i.inspector_id
    WHERE p.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Company members can delete pdf annotations" ON pdf_annotations;
CREATE POLICY "Company members can delete pdf annotations"
ON pdf_annotations FOR DELETE
TO authenticated
USING (
  report_id IN (
    SELECT r.id FROM reports r
    JOIN inspections i ON i.id = r.inspection_id
    JOIN profiles p ON p.id = i.inspector_id
    WHERE p.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
);
