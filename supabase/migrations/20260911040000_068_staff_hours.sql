-- Dated hours and days off per crew member. One row per person per date.
-- Weekly patterns are not stored here; an absent row means no exception.

CREATE TABLE IF NOT EXISTS staff_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  working boolean NOT NULL DEFAULT true,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_hours_reason_len CHECK (reason IS NULL OR char_length(reason) <= 200),
  CONSTRAINT staff_hours_hours_shape CHECK (
    (working = false AND start_time IS NULL AND end_time IS NULL)
    OR (working = true AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  ),
  CONSTRAINT staff_hours_member_date UNIQUE (company_id, member_id, date)
);

CREATE INDEX IF NOT EXISTS idx_staff_hours_company_date ON staff_hours (company_id, date);
CREATE INDEX IF NOT EXISTS idx_staff_hours_member ON staff_hours (member_id, date);

ALTER TABLE staff_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view staff hours" ON staff_hours;
CREATE POLICY "Company members can view staff hours"
  ON staff_hours FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert staff hours" ON staff_hours;
CREATE POLICY "Company members can insert staff hours"
  ON staff_hours FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update staff hours" ON staff_hours;
CREATE POLICY "Company members can update staff hours"
  ON staff_hours FOR UPDATE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete staff hours" ON staff_hours;
CREATE POLICY "Company members can delete staff hours"
  ON staff_hours FOR DELETE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
