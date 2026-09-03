/*
  Public plan catalog: Crew / Company / Plant.

  Replaces starter | crew | shop. Marketing names win.
  Seats: 5 / 15 / 40. Signup default stays Crew on a 90-day trial (signup-user).

  Remap order matters because `crew` is in both the old and new sets.
*/

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_plan_check;

UPDATE companies SET plan = 'plant', seat_limit = 40 WHERE plan = 'shop';
UPDATE companies SET plan = 'company', seat_limit = 15 WHERE plan = 'crew';
UPDATE companies SET plan = 'crew', seat_limit = 5 WHERE plan = 'starter';

ALTER TABLE companies
  ALTER COLUMN plan SET DEFAULT 'crew';

ALTER TABLE companies
  ADD CONSTRAINT companies_plan_check
  CHECK (plan IN ('crew', 'company', 'plant'));
