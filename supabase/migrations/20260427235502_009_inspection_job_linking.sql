/*
  # Inspection Job Linking

  Allows multiple inspections to be grouped under the same job.

  ## Changes
  - `inspections` gains a nullable `parent_inspection_id` column (self-referencing FK)
  - An index is added for fast lookup of all inspections in a job group

  ## Notes
  - The "root" inspection of a job has `parent_inspection_id = NULL`
  - All linked inspections point to the root (flat grouping, not nested)
  - Deleting a parent does not cascade — linked inspections become independent
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspections' AND column_name = 'parent_inspection_id'
  ) THEN
    ALTER TABLE inspections
      ADD COLUMN parent_inspection_id uuid REFERENCES inspections(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS inspections_parent_id_idx ON inspections(parent_inspection_id);
