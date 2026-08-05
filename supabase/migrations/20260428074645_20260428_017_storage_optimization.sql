/*
  # Storage Optimization & Image Compression

  1. New Tables
    - `photo_metadata`: Track original vs compressed sizes
    - `storage_cleanup_queue`: Track files scheduled for deletion

  2. Columns added to `photos` table
    - `original_size` (bytes for tracking)
    - `compressed_size` (bytes for analytics)
    - `storage_tier` (active or archive)

  3. New View
    - `storage_analytics`: Dashboard for storage usage by company

  STRATEGY:
  - Compress images on mobile before upload (JPEG 70%, max 1200x1600px)
  - CDN caches served images automatically
  - Archive photos >2 years old
  - Run cleanup cron quarterly
*/

-- Add optimization columns to photos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'photos' AND column_name = 'original_size') THEN
    ALTER TABLE photos ADD COLUMN original_size bigint;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'photos' AND column_name = 'compressed_size') THEN
    ALTER TABLE photos ADD COLUMN compressed_size bigint;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'photos' AND column_name = 'storage_tier') THEN
    ALTER TABLE photos ADD COLUMN storage_tier text DEFAULT 'active';
  END IF;
END $$;

-- Photo metadata tracking
CREATE TABLE IF NOT EXISTS photo_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id),
  original_dimensions text,
  compressed_dimensions text,
  format text DEFAULT 'jpeg',
  compression_ratio numeric(5,2),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE photo_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members view photo metadata"
  ON photo_metadata FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Storage cleanup queue for archival
CREATE TABLE IF NOT EXISTS storage_cleanup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  storage_path text NOT NULL,
  bucket_id text NOT NULL,
  reason text,
  scheduled_at timestamptz DEFAULT now() + interval '30 days',
  completed_at timestamptz
);

ALTER TABLE storage_cleanup_queue ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_photos_storage_tier ON photos(storage_tier, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_inspection ON photos(inspection_id);
CREATE INDEX IF NOT EXISTS idx_cleanup_queue_scheduled ON storage_cleanup_queue(scheduled_at) WHERE completed_at IS NULL;

-- Storage analytics view
CREATE OR REPLACE VIEW storage_analytics AS
SELECT 
  c.id as company_id,
  c.name as company_name,
  COUNT(DISTINCT p.id) as total_photos,
  SUM(COALESCE(p.original_size, 0))::bigint as total_original_bytes,
  SUM(COALESCE(p.compressed_size, 0))::bigint as total_compressed_bytes,
  ROUND(
    (1 - SUM(COALESCE(p.compressed_size, 0))::numeric / 
     NULLIF(SUM(COALESCE(p.original_size, 0))::numeric, 0)) * 100, 
    2
  ) as compression_percentage,
  COUNT(CASE WHEN p.storage_tier = 'archive' THEN 1 END) as archived_photos,
  MAX(p.uploaded_at) as most_recent_photo
FROM companies c
LEFT JOIN profiles prof ON prof.company_id = c.id
LEFT JOIN inspections i ON i.inspector_id = prof.id
LEFT JOIN photos p ON p.inspection_id = i.id
GROUP BY c.id, c.name;