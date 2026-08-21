-- Company logo remove on the existing public `logos` bucket.
-- Documents read companies.logo_url; clearing that column is enough for a blank
-- letterhead. This policy lets authenticated users delete the stored object too
-- so replace / remove does not leave a stale file. No new table.

CREATE POLICY "Authenticated users can delete logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'logos');
