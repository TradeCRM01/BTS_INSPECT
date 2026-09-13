-- LOCAL SANDBOX ONLY (127.0.0.1:55322). Never run against ezszahv / production.
-- Seeds one recorded COGS-on-job expense and one dated staff_hours row so
-- the expenses banner and schedule hours path can be proven.

INSERT INTO expenses (
  company_id, cost_class, category, description, amount, tax_rate, tax_amount, total,
  expense_date, job_id, status, created_by
)
SELECT
  c.id,
  'cogs',
  'Materials (non-job)',
  'LOCAL FIXTURE — COGS on job (do not copy to production)',
  88.00,
  10,
  8.80,
  96.80,
  CURRENT_DATE,
  j.id,
  'recorded',
  p.id
FROM companies c
JOIN jobs j ON j.company_id = c.id
JOIN profiles p ON p.company_id = c.id
WHERE c.name ILIKE '%Building Technology%'
  AND j.title ILIKE '%Sandbox%'
  AND NOT EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.company_id = c.id
      AND e.description = 'LOCAL FIXTURE — COGS on job (do not copy to production)'
  )
ORDER BY j.created_at DESC NULLS LAST
LIMIT 1;

INSERT INTO staff_hours (company_id, member_id, date, working, start_time, end_time, reason)
SELECT
  p.company_id,
  p.id,
  CURRENT_DATE,
  true,
  '07:00',
  '16:00',
  'LOCAL FIXTURE — dated hours'
FROM profiles p
JOIN companies c ON c.id = p.company_id
WHERE c.name ILIKE '%Building Technology%'
  AND NOT EXISTS (
    SELECT 1 FROM staff_hours h
    WHERE h.member_id = p.id AND h.date = CURRENT_DATE
  )
LIMIT 1;
