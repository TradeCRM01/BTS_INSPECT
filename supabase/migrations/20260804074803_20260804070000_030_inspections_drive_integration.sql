/*
# Link inspections to shared drive folders

## What this does
Adds three columns to the `inspections` table so inspections can appear as items
in the Shared Drive, just like uploaded PDFs and generated reports already do.

## Changes
1. New columns on `inspections`:
   - `folder_id` (uuid, nullable) — FK to `folders(id)` with ON DELETE SET NULL.
     When a folder is deleted, inspections inside it move back to the drive root
     (same behavior as uploaded_pdfs and reports).
   - `position_x` (integer, default 0) — canvas X position in the drive UI
   - `position_y` (integer, default 0) — canvas Y position in the drive UI
2. Index on `folder_id` for efficient drive-folder filtering.
3. No RLS policy changes needed — existing company-scoped SELECT/UPDATE policies
   already cover these new columns (they are company-scoped via inspector_id).

## Notes
- All three columns are nullable / have defaults so existing inspections are
  unaffected — they simply won't appear in the drive until a user sends them there.
- The existing UPDATE policy allows authenticated users in the same company to
  update any column, so setting folder_id / positions from the frontend works.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspections' AND column_name = 'folder_id'
  ) THEN
    ALTER TABLE inspections ADD COLUMN folder_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inspections_folder_id_fkey'
  ) THEN
    ALTER TABLE inspections
      ADD CONSTRAINT inspections_folder_id_fkey
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspections' AND column_name = 'position_x'
  ) THEN
    ALTER TABLE inspections ADD COLUMN position_x integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inspections' AND column_name = 'position_y'
  ) THEN
    ALTER TABLE inspections ADD COLUMN position_y integer NOT NULL DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inspections_folder ON inspections(folder_id);
