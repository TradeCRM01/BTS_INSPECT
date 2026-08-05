/*
# Shared Drive — Folders for Reports & Uploaded PDFs

1. New Tables
- `folders`
  - `id` (uuid, primary key)
  - `company_id` (uuid, FK to companies, ON DELETE CASCADE)
  - `parent_id` (uuid, FK to folders, nullable for root-level folders, ON DELETE CASCADE)
  - `name` (text, folder display name)
  - `created_by` (uuid, FK to profiles, ON DELETE SET NULL)
  - `created_at` (timestamptz)

2. Modified Tables
- `uploaded_pdfs`: add `folder_id` (uuid, nullable, FK to folders, ON DELETE SET NULL)
  so uploaded PDFs can be organized into folders.
- `reports`: add `folder_id` (uuid, nullable, FK to folders, ON DELETE SET NULL)
  so generated reports can also be organized into folders.

3. Security
- RLS enabled on `folders`.
- Company-scoped CRUD: only members of the same company can access folders.
- All policies verify company membership via profiles table.

4. Notes
- Folders support nesting via parent_id (null = root level).
- Both uploaded PDFs and generated reports can be placed into folders.
- Deleting a folder cascades to child folders but sets folder_id to NULL on
  files (uploaded_pdfs and reports) so no data is lost — files just move to root.
- This turns the Reports tab into a shared drive / file explorer experience.
*/

CREATE TABLE IF NOT EXISTS folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view folders" ON folders;
CREATE POLICY "Company members can view folders"
ON folders FOR SELECT
TO authenticated
USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert folders" ON folders;
CREATE POLICY "Company members can insert folders"
ON folders FOR INSERT
TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update folders" ON folders;
CREATE POLICY "Company members can update folders"
ON folders FOR UPDATE
TO authenticated
USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete folders" ON folders;
CREATE POLICY "Company members can delete folders"
ON folders FOR DELETE
TO authenticated
USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Add folder_id to uploaded_pdfs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uploaded_pdfs' AND column_name = 'folder_id') THEN
    ALTER TABLE uploaded_pdfs ADD COLUMN folder_id uuid REFERENCES folders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add folder_id to reports
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'folder_id') THEN
    ALTER TABLE reports ADD COLUMN folder_id uuid REFERENCES folders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for quick folder-content lookups
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_pdfs_folder ON uploaded_pdfs(folder_id);
CREATE INDEX IF NOT EXISTS idx_reports_folder ON reports(folder_id);
