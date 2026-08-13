/*

  # Quote/invoice variations + commercial document lists



  - inclusions / exclusions JSONB arrays on quotes and invoices

  - Managed lists for reusable company templates (import into documents)

*/



ALTER TABLE quotes

  ADD COLUMN IF NOT EXISTS inclusions jsonb NOT NULL DEFAULT '[]'::jsonb,

  ADD COLUMN IF NOT EXISTS exclusions jsonb NOT NULL DEFAULT '[]'::jsonb;



ALTER TABLE invoices

  ADD COLUMN IF NOT EXISTS inclusions jsonb NOT NULL DEFAULT '[]'::jsonb,

  ADD COLUMN IF NOT EXISTS exclusions jsonb NOT NULL DEFAULT '[]'::jsonb;



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

    ('document_exclusions', 'Quote Exclusions')

  ) AS k(key, label)

  WHERE NOT EXISTS (

    SELECT 1 FROM list_definitions ld

    WHERE ld.company_id = NEW.id AND ld.key = k.key

  );

  RETURN NEW;

END;

$$;



INSERT INTO list_definitions (company_id, key, label)

SELECT c.id, k.key, k.label

FROM companies c

CROSS JOIN (VALUES

  ('document_inclusions', 'Quote Inclusions'),

  ('document_exclusions', 'Quote Exclusions')

) AS k(key, label)

WHERE NOT EXISTS (

  SELECT 1 FROM list_definitions ld WHERE ld.company_id = c.id AND ld.key = k.key

);



INSERT INTO list_items (company_id, list_definition_id, value, label, sort_order)

SELECT ld.company_id, ld.id, v.value, v.label, v.sort_order

FROM list_definitions ld

CROSS JOIN (VALUES

  ('All labour as specified', 'All labour as specified', 10),

  ('Materials as listed', 'Materials as listed', 20),

  ('Testing and commissioning', 'Testing and commissioning', 30),

  ('Site attendance during works', 'Site attendance during works', 40),

  ('Certificate of compliance (where applicable)', 'Certificate of compliance (where applicable)', 50)

) AS v(value, label, sort_order)

WHERE ld.key = 'document_inclusions'

  AND NOT EXISTS (SELECT 1 FROM list_items li WHERE li.list_definition_id = ld.id);



INSERT INTO list_items (company_id, list_definition_id, value, label, sort_order)

SELECT ld.company_id, ld.id, v.value, v.label, v.sort_order

FROM list_definitions ld

CROSS JOIN (VALUES

  ('Works outside the agreed scope', 'Works outside the agreed scope', 10),

  ('Building / structural works', 'Building / structural works', 20),

  ('Asbestos / hazardous material removal', 'Asbestos / hazardous material removal', 30),

  ('After-hours or weekend work unless stated', 'After-hours or weekend work unless stated', 40),

  ('Council / authority fees and permits', 'Council / authority fees and permits', 50)

) AS v(value, label, sort_order)

WHERE ld.key = 'document_exclusions'

  AND NOT EXISTS (SELECT 1 FROM list_items li WHERE li.list_definition_id = ld.id);

