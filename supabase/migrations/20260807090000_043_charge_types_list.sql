/*

  # Charge types managed list



  Universal "nature of work" / charge-out categories for quote & invoice lines

  (Labour, Materials, Hire car, etc.). Seeded for existing and new companies.

*/



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

    ('charge_types', 'Charge Types')

  ) AS k(key, label)

  WHERE NOT EXISTS (

    SELECT 1 FROM list_definitions ld

    WHERE ld.company_id = NEW.id AND ld.key = k.key

  );

  RETURN NEW;

END;

$$;



-- Backfill definitions for existing companies

INSERT INTO list_definitions (company_id, key, label)

SELECT c.id, k.key, k.label

FROM companies c

CROSS JOIN (VALUES

  ('charge_types', 'Charge Types')

) AS k(key, label)

WHERE NOT EXISTS (

  SELECT 1 FROM list_definitions ld WHERE ld.company_id = c.id AND ld.key = k.key

);



-- Default charge type values (only where the list is empty)

INSERT INTO list_items (company_id, list_definition_id, value, label, sort_order)

SELECT

  ld.company_id,

  ld.id,

  v.value,

  v.label,

  v.sort_order

FROM list_definitions ld

CROSS JOIN (VALUES

  ('Labour', 'Labour', 10),

  ('Materials', 'Materials', 20),

  ('Hire car', 'Hire car', 30),

  ('Plant & equipment', 'Plant & equipment', 40),

  ('Subcontractor', 'Subcontractor', 50),

  ('Call-out', 'Call-out', 60),

  ('Other', 'Other', 70)

) AS v(value, label, sort_order)

WHERE ld.key = 'charge_types'

  AND NOT EXISTS (

    SELECT 1 FROM list_items li WHERE li.list_definition_id = ld.id

  );

