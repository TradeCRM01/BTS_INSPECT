-- Allow custom employee cost types (managed list) and drop fixed CHECK on expenses.

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_employee_cost_type_check;

CREATE OR REPLACE FUNCTION seed_company_list_definitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO list_definitions (company_id, key, label)
  SELECT NEW.id, k.key, k.label
  FROM (VALUES
    ('storage_locations', 'Storage Locations'),
    ('work_types', 'Work Types'),
    ('stock_categories', 'Stock Categories'),
    ('asset_categories', 'Asset Categories'),
    ('units_of_measure', 'Units of Measure'),
    ('price_book_categories', 'Price Book Categories'),
    ('charge_types', 'Charge Types'),
    ('document_inclusions', 'Quote Inclusions'),
    ('document_exclusions', 'Quote Exclusions'),
    ('expense_categories', 'Expense Categories'),
    ('employee_cost_types', 'Employee Cost Types')
  ) AS k(key, label)
  WHERE NOT EXISTS (
    SELECT 1 FROM list_definitions ld
    WHERE ld.company_id = NEW.id AND ld.key = k.key
  );
  RETURN NEW;
END;
$$;

INSERT INTO list_definitions (company_id, key, label)
SELECT c.id, 'employee_cost_types', 'Employee Cost Types'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM list_definitions ld
  WHERE ld.company_id = c.id AND ld.key = 'employee_cost_types'
);

INSERT INTO list_items (company_id, list_definition_id, value, label, sort_order)
SELECT ld.company_id, ld.id, v.value, v.label, v.sort_order
FROM list_definitions ld
CROSS JOIN (VALUES
  ('wages', 'Wages / salary', 10),
  ('super', 'Superannuation', 20),
  ('allowance', 'Allowance', 30),
  ('reimbursement', 'Reimbursement', 40),
  ('vehicle', 'Vehicle / travel', 50),
  ('tools', 'Tools / PPE', 60),
  ('training', 'Training / licences', 70),
  ('other', 'Other', 80)
) AS v(value, label, sort_order)
WHERE ld.key = 'employee_cost_types'
  AND NOT EXISTS (
    SELECT 1 FROM list_items li
    WHERE li.list_definition_id = ld.id AND li.value = v.value
  );
