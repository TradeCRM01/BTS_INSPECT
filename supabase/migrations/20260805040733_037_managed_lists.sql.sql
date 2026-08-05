/*
# Managed Lists — user-defined dropdown options

1. Purpose
   Instead of free-text fields for storage locations, work types, categories,
   units of measure, etc., users now define managed lists. Each list belongs
   to a company and contains ordered, optionally archived items. Other tables
   (stock_items.storage_location, timesheet_entries.work_type, etc.) store the
   item name as a string, keeping existing data intact while new entries are
   constrained to values the user has defined.

2. New Tables
   - `list_definitions`
     - `id` (uuid PK)
     - `company_id` (uuid FK -> companies, CASCADE)
     - `key` (text) — machine key like 'storage_locations', 'work_types', etc.
     - `label` (text) — human label like "Storage Locations"
     - `allow_custom` (boolean default true) — when false, only predefined items
     - `created_at` (timestamp with time zone)
   - `list_items`
     - `id` (uuid PK)
     - `company_id` (uuid FK -> companies, CASCADE)
     - `list_definition_id` (uuid FK -> list_definitions, CASCADE)
     - `value` (text) — the stored value, e.g. "Jacks Van"
     - `label` (text) — display label, defaults to value
     - `sort_order` (int default 0)
     - `archived` (boolean default false)
     - `created_at` (timestamp with time zone)

   Unique constraint on (company_id, list_definition_id, value) prevents duplicates.

3. Seed data
   For each company that already exists, seed list_definitions for the standard
   keys: storage_locations, work_types, stock_categories, asset_categories,
   units_of_measure, price_book_categories. Each gets allow_custom = true so
   users can add more items from the UI.

4. Security
   - RLS enabled on both tables.
   - Owner-scoped via company_id membership check (same pattern as other tables
     in this app — authenticated users can only see their company's lists).
*/

CREATE TABLE IF NOT EXISTS list_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  allow_custom boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS list_definitions_company_key_uq
  ON list_definitions (company_id, key);

CREATE TABLE IF NOT EXISTS list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  list_definition_id uuid NOT NULL REFERENCES list_definitions(id) ON DELETE CASCADE,
  value text NOT NULL,
  label text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS list_items_company_list_value_uq
  ON list_items (company_id, list_definition_id, value);

CREATE INDEX IF NOT EXISTS list_items_definition_idx ON list_items (list_definition_id);

ALTER TABLE list_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_list_definitions" ON list_definitions;
CREATE POLICY "select_own_list_definitions" ON list_definitions FOR SELECT
  TO authenticated USING (auth.uid() IN (SELECT id FROM profiles WHERE company_id = list_definitions.company_id));

DROP POLICY IF EXISTS "insert_own_list_definitions" ON list_definitions;
CREATE POLICY "insert_own_list_definitions" ON list_definitions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE company_id = list_definitions.company_id));

DROP POLICY IF EXISTS "update_own_list_definitions" ON list_definitions;
CREATE POLICY "update_own_list_definitions" ON list_definitions FOR UPDATE
  TO authenticated USING (auth.uid() IN (SELECT id FROM profiles WHERE company_id = list_definitions.company_id))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE company_id = list_definitions.company_id));

DROP POLICY IF EXISTS "delete_own_list_definitions" ON list_definitions;
CREATE POLICY "delete_own_list_definitions" ON list_definitions FOR DELETE
  TO authenticated USING (auth.uid() IN (SELECT id FROM profiles WHERE company_id = list_definitions.company_id));

DROP POLICY IF EXISTS "select_own_list_items" ON list_items;
CREATE POLICY "select_own_list_items" ON list_items FOR SELECT
  TO authenticated USING (auth.uid() IN (SELECT id FROM profiles WHERE company_id = list_items.company_id));

DROP POLICY IF EXISTS "insert_own_list_items" ON list_items;
CREATE POLICY "insert_own_list_items" ON list_items FOR INSERT
  TO authenticated WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE company_id = list_items.company_id));

DROP POLICY IF EXISTS "update_own_list_items" ON list_items;
CREATE POLICY "update_own_list_items" ON list_items FOR UPDATE
  TO authenticated USING (auth.uid() IN (SELECT id FROM profiles WHERE company_id = list_items.company_id))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE company_id = list_items.company_id));

DROP POLICY IF EXISTS "delete_own_list_items" ON list_items;
CREATE POLICY "delete_own_list_items" ON list_items FOR DELETE
  TO authenticated USING (auth.uid() IN (SELECT id FROM profiles WHERE company_id = list_items.company_id));

-- Seed standard list definitions for every existing company
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
