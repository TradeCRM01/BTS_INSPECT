/*
  Quote date + crew live on the quote row so portal Accept can copy them
  onto the job. Empty stays empty — Accept still inserts the job; Convert
  refuses a create when either field is blank.
*/

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS scheduled_date date;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS assigned_team jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN quotes.scheduled_date IS
  'Optional job board date. Accept copies this onto jobs.scheduled_date when set.';
COMMENT ON COLUMN quotes.assigned_team IS
  'Optional crew profile ids. Accept copies this onto jobs.assigned_team when set.';
