-- Allow upsert (replace) of generated report PDFs in the reports bucket.
-- Upload with upsert:true requires UPDATE as well as INSERT.

drop policy if exists "Authenticated users can update reports" on storage.objects;
create policy "Authenticated users can update reports"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'reports')
  with check (bucket_id = 'reports');
