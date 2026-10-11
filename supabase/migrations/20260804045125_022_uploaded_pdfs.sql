/*
# Uploaded PDFs — table and storage bucket

1. New Tables
- `uploaded_pdfs`
  - `id` (uuid, primary key)
  - `company_id` (uuid, FK to companies, ON DELETE CASCADE)
  - `uploaded_by` (uuid, FK to profiles, ON DELETE SET NULL)
  - `filename` (text, original file name from the user's computer)
  - `storage_path` (text, path within the `uploaded-pdfs` storage bucket)
  - `file_size` (bigint, size in bytes)
  - `title` (text, editable display name, defaults to filename)
  - `created_at` (timestamptz)

2. New Storage Bucket
- `uploaded-pdfs` — private bucket for user-uploaded PDF files.
  - 50 MB upload limit, PDF content type only.

3. Security
- RLS enabled on `uploaded_pdfs`.
- Company-scoped CRUD: only members of the same company can read, insert,
  update, or delete uploaded PDF rows.
- Storage policies on `uploaded-pdfs` bucket: company-scoped access via
  the same company membership check.

4. Notes
- Uploaded PDFs are separate from generated inspection reports. They live
  in their own table and storage bucket so users can import external PDFs
  (e.g. from other systems) and view/annotate them alongside their reports.
- Annotations for uploaded PDFs reuse the existing `pdf_annotations` table
  keyed to `report_id`. For uploaded PDFs we store annotations keyed by
  the `uploaded_pdfs.id` in a parallel column to avoid coupling.
*/

CREATE TABLE IF NOT EXISTS uploaded_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  filename text NOT NULL,
  storage_path text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  title text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE uploaded_pdfs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view uploaded pdfs" ON uploaded_pdfs;
CREATE POLICY "Company members can view uploaded pdfs"
ON uploaded_pdfs FOR SELECT
TO authenticated
USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert uploaded pdfs" ON uploaded_pdfs;
CREATE POLICY "Company members can insert uploaded pdfs"
ON uploaded_pdfs FOR INSERT
TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update uploaded pdfs" ON uploaded_pdfs;
CREATE POLICY "Company members can update uploaded pdfs"
ON uploaded_pdfs FOR UPDATE
TO authenticated
USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete uploaded pdfs" ON uploaded_pdfs;
CREATE POLICY "Company members can delete uploaded pdfs"
ON uploaded_pdfs FOR DELETE
TO authenticated
USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Annotations table for uploaded PDFs
CREATE TABLE IF NOT EXISTS uploaded_pdf_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_pdf_id uuid NOT NULL REFERENCES uploaded_pdfs(id) ON DELETE CASCADE,
  annotation_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_uploaded_pdf_annotations_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS uploaded_pdf_annotations_updated_at ON uploaded_pdf_annotations;
CREATE TRIGGER uploaded_pdf_annotations_updated_at
  BEFORE UPDATE ON uploaded_pdf_annotations
  FOR EACH ROW
  EXECUTE FUNCTION update_uploaded_pdf_annotations_updated_at();

ALTER TABLE uploaded_pdf_annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view uploaded pdf annotations" ON uploaded_pdf_annotations;
CREATE POLICY "Company members can view uploaded pdf annotations"
ON uploaded_pdf_annotations FOR SELECT
TO authenticated
USING (
  uploaded_pdf_id IN (
    SELECT up.id FROM uploaded_pdfs up
    WHERE up.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Company members can insert uploaded pdf annotations" ON uploaded_pdf_annotations;
CREATE POLICY "Company members can insert uploaded pdf annotations"
ON uploaded_pdf_annotations FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_pdf_id IN (
    SELECT up.id FROM uploaded_pdfs up
    WHERE up.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Company members can update uploaded pdf annotations" ON uploaded_pdf_annotations;
CREATE POLICY "Company members can update uploaded pdf annotations"
ON uploaded_pdf_annotations FOR UPDATE
TO authenticated
USING (
  uploaded_pdf_id IN (
    SELECT up.id FROM uploaded_pdfs up
    WHERE up.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
)
WITH CHECK (
  uploaded_pdf_id IN (
    SELECT up.id FROM uploaded_pdfs up
    WHERE up.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Company members can delete uploaded pdf annotations" ON uploaded_pdf_annotations;
CREATE POLICY "Company members can delete uploaded pdf annotations"
ON uploaded_pdf_annotations FOR DELETE
TO authenticated
USING (
  uploaded_pdf_id IN (
    SELECT up.id FROM uploaded_pdfs up
    WHERE up.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
);

-- Storage bucket for uploaded PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('uploaded-pdfs', 'uploaded-pdfs', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies: company-scoped access
DROP POLICY IF EXISTS "Company members can upload uploaded pdfs" ON storage.objects;
CREATE POLICY "Company members can upload uploaded pdfs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'uploaded-pdfs'
  AND (storage.foldername(name))[1] IN (
    SELECT company_id::text FROM profiles WHERE id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Company members can read uploaded pdfs" ON storage.objects;
CREATE POLICY "Company members can read uploaded pdfs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'uploaded-pdfs'
  AND (storage.foldername(name))[1] IN (
    SELECT company_id::text FROM profiles WHERE id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Company members can update uploaded pdfs" ON storage.objects;
CREATE POLICY "Company members can update uploaded pdfs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'uploaded-pdfs'
  AND (storage.foldername(name))[1] IN (
    SELECT company_id::text FROM profiles WHERE id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Company members can delete uploaded pdfs" ON storage.objects;
CREATE POLICY "Company members can delete uploaded pdfs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'uploaded-pdfs'
  AND (storage.foldername(name))[1] IN (
    SELECT company_id::text FROM profiles WHERE id = auth.uid()
  )
);
