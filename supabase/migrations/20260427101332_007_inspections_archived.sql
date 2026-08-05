/*
  # Add archived flag to inspections

  1. Changes
    - `inspections` table: new `archived` boolean column, default false
  2. Notes
    - Existing rows are left as archived = false (not archived)
    - Admins can set this flag; RLS policy for update already covers admins via company_id check
*/

ALTER TABLE inspections ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
