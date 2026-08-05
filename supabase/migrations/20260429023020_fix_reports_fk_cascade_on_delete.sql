/*
  # Fix reports FK to cascade on inspection delete

  The reports table has a FK to inspections with ON DELETE NO ACTION,
  which blocks deleting inspections that have associated reports.
  Changed to CASCADE so deleting an inspection also deletes its reports.
*/

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_inspection_id_fkey;

ALTER TABLE reports
  ADD CONSTRAINT reports_inspection_id_fkey
  FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE;
