/*
  # BTS Inspect — Storage Buckets

  Creates three storage buckets:
  - `photos`: private, for inspection photos
  - `logos`: public, for company logos on PDFs
  - `reports`: private, for generated PDFs
  - `signatures`: private, for signature PNGs
*/

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('photos', 'photos', false),
  ('logos', 'logos', true),
  ('reports', 'reports', false),
  ('signatures', 'signatures', false)
ON CONFLICT (id) DO NOTHING;

-- Photos bucket policies
CREATE POLICY "Authenticated users can upload photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'photos');

CREATE POLICY "Authenticated users can view photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'photos');

CREATE POLICY "Authenticated users can delete photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'photos');

-- Logos bucket policies (public read)
CREATE POLICY "Anyone can view logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'logos');

CREATE POLICY "Authenticated users can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'logos');

CREATE POLICY "Authenticated users can update logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'logos')
  WITH CHECK (bucket_id = 'logos');

-- Reports bucket policies
CREATE POLICY "Authenticated users can upload reports"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'reports');

CREATE POLICY "Authenticated users can view reports"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'reports');

-- Signatures bucket policies
CREATE POLICY "Authenticated users can upload signatures"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'signatures');

CREATE POLICY "Authenticated users can view signatures"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'signatures');
