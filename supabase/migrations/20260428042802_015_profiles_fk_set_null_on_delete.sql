/*
  # Fix profile deletion FK constraints

  ## Problem
  Deleting a profile fails when the member has created templates or inspections,
  because both tables have FK references to profiles.id with NO ACTION on delete.

  ## Changes
  - `templates.created_by` → SET NULL on delete
  - `inspections.inspector_id` → SET NULL on delete

  This allows admins to remove team members without losing their historical
  templates or inspection records. The records remain but are no longer
  associated with a specific profile.
*/

ALTER TABLE templates
  DROP CONSTRAINT IF EXISTS templates_created_by_fkey,
  ADD CONSTRAINT templates_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE inspections
  DROP CONSTRAINT IF EXISTS inspections_inspector_id_fkey,
  ADD CONSTRAINT inspections_inspector_id_fkey
    FOREIGN KEY (inspector_id) REFERENCES profiles(id) ON DELETE SET NULL;
