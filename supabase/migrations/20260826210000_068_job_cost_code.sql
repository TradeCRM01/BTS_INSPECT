/*
  Cost codes on jobs (Simpro-style sections).

  A stage of a parent job can carry a short code such as 01 or LAB.
  The schedule shows #0042.01 so parts of the same job stay distinct.
*/

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cost_code text;
