-- Link job bill labour lines back to timesheet entries (dedupe pulls).
ALTER TABLE job_costs
  ADD COLUMN IF NOT EXISTS timesheet_entry_id uuid REFERENCES timesheet_entries(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS job_costs_job_timesheet_entry_uidx
  ON job_costs (job_id, timesheet_entry_id)
  WHERE timesheet_entry_id IS NOT NULL;

COMMENT ON COLUMN job_costs.timesheet_entry_id IS
  'When set, this bill line came from a closed billable timesheet entry on the job.';
