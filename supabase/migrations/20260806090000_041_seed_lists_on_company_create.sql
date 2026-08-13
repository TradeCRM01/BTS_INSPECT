/*
  # Seed managed lists for new companies

  When a company is created after migration 037, list_definitions were only
  seeded for companies that already existed. This trigger keeps new companies
  in sync with the standard list keys.
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
    ('price_book_categories', 'Price Book Categories')
  ) AS k(key, label)
  WHERE NOT EXISTS (
    SELECT 1 FROM list_definitions ld
    WHERE ld.company_id = NEW.id AND ld.key = k.key
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_company_list_definitions ON companies;
CREATE TRIGGER trg_seed_company_list_definitions
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION seed_company_list_definitions();

-- Backfill any companies still missing definitions
INSERT INTO list_definitions (company_id, key, label)
SELECT c.id, k.key, k.label
FROM companies c
CROSS JOIN (VALUES
  ('storage_locations', 'Storage Locations'),
  ('work_types', 'Work Types'),
  ('stock_categories', 'Stock Categories'),
  ('asset_categories', 'Asset Categories'),
  ('units_of_measure', 'Units of Measure'),
  ('price_book_categories', 'Price Book Categories')
) AS k(key, label)
WHERE NOT EXISTS (
  SELECT 1 FROM list_definitions ld WHERE ld.company_id = c.id AND ld.key = k.key
);
