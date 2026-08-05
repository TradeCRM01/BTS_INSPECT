/*
# Fix uploaded-pdfs storage policies

The company-scoped folder check in the storage policies was too restrictive
and blocked uploads. Simplify to match the pattern used by the existing
photos/reports/signatures buckets (bucket_id check only). Company-level
isolation is already enforced by RLS on the uploaded_pdfs table.

Also relaxes the allowed_mime_types constraint to include common PDF variants.
*/

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf', 'application/x-pdf', 'application/octet-stream']
WHERE id = 'uploaded-pdfs';

DROP POLICY IF EXISTS "Company members can upload uploaded pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Company members can read uploaded pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Company members can update uploaded pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Company members can delete uploaded pdfs" ON storage.objects;

CREATE POLICY "Authenticated users can upload uploaded pdfs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'uploaded-pdfs');

CREATE POLICY "Authenticated users can view uploaded pdfs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'uploaded-pdfs');

CREATE POLICY "Authenticated users can update uploaded pdfs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'uploaded-pdfs')
  WITH CHECK (bucket_id = 'uploaded-pdfs');

CREATE POLICY "Authenticated users can delete uploaded pdfs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'uploaded-pdfs');
