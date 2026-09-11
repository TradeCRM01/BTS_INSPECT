-- When and where a job photo was taken, on the existing job_photos row (077).
-- taken_at prefers EXIF DateTimeOriginal, else the attach clock.
-- lat/lng prefer EXIF GPS, else the device fix at attach time (with permission).
-- Both sources are recorded so the Gallery can say which clock and which fix it shows.
-- No new table, no storage change, no UPDATE policy: a photo's provenance is written once.

ALTER TABLE public.job_photos
  ADD COLUMN IF NOT EXISTS taken_at timestamptz,
  ADD COLUMN IF NOT EXISTS taken_at_source text,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS location_source text,
  ADD COLUMN IF NOT EXISTS location_accuracy_m real;

UPDATE public.job_photos SET taken_at = created_at WHERE taken_at IS NULL;
UPDATE public.job_photos SET taken_at_source = 'upload' WHERE taken_at_source IS NULL;

ALTER TABLE public.job_photos
  ALTER COLUMN taken_at SET NOT NULL,
  ALTER COLUMN taken_at SET DEFAULT now(),
  ALTER COLUMN taken_at_source SET NOT NULL,
  ALTER COLUMN taken_at_source SET DEFAULT 'upload';

ALTER TABLE public.job_photos
  DROP CONSTRAINT IF EXISTS job_photos_taken_at_source_check,
  ADD CONSTRAINT job_photos_taken_at_source_check
    CHECK (taken_at_source IN ('exif', 'upload'));

ALTER TABLE public.job_photos
  DROP CONSTRAINT IF EXISTS job_photos_location_check,
  ADD CONSTRAINT job_photos_location_check
    CHECK (
      (lat IS NULL AND lng IS NULL AND location_source IS NULL AND location_accuracy_m IS NULL)
      OR (
        lat BETWEEN -90 AND 90
        AND lng BETWEEN -180 AND 180
        AND location_source IN ('exif', 'device')
      )
    );

CREATE INDEX IF NOT EXISTS idx_job_photos_job_taken
  ON public.job_photos (company_id, job_id, taken_at DESC);
