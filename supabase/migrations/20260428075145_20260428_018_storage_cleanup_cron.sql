/*
  # Automated Storage Cleanup Function

  Creates a cleanup function that can be triggered via:
  1. Edge Function (cleanup-old-photos) - recommended for Supabase
  2. Manual SQL calls
  3. External cron service (GitHub Actions, etc)

  This provides automatic cleanup of photos older than 90 days,
  reducing storage costs without manual intervention.
*/

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Cleanup function for old photos
CREATE OR REPLACE FUNCTION cleanup_old_photos(days_old int DEFAULT 90)
RETURNS TABLE(deleted_count int, freed_bytes bigint) AS $$
DECLARE
  v_cutoff_date timestamptz;
  v_deleted int := 0;
  v_freed bigint := 0;
BEGIN
  v_cutoff_date := now() - (days_old || ' days')::interval;

  SELECT COUNT(*), COALESCE(SUM(compressed_size), 0)
  INTO v_deleted, v_freed
  FROM photos
  WHERE storage_tier = 'active'
    AND uploaded_at < v_cutoff_date;

  -- Delete old photos
  DELETE FROM photos
  WHERE storage_tier = 'active'
    AND uploaded_at < v_cutoff_date;

  RETURN QUERY SELECT v_deleted, v_freed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get cleanup stats
CREATE OR REPLACE FUNCTION get_cleanup_stats()
RETURNS TABLE(
  company_id uuid,
  company_name text,
  photos_to_delete int,
  bytes_to_free bigint
) AS $$
SELECT
  c.id,
  c.name,
  COUNT(p.id),
  COALESCE(SUM(p.compressed_size), 0)
FROM companies c
LEFT JOIN profiles prof ON prof.company_id = c.id
LEFT JOIN inspections i ON i.inspector_id = prof.id
LEFT JOIN photos p ON p.inspection_id = i.id
  AND p.storage_tier = 'active'
  AND p.uploaded_at < now() - interval '90 days'
GROUP BY c.id, c.name;
$$ LANGUAGE sql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION cleanup_old_photos(int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cleanup_stats() TO authenticated;