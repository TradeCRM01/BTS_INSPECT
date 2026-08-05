/*
# Simpro Feature Parity: Assets, Service Contracts, Price Books, Timesheets
Re-applied with typo fix in timesheet_entries UPDATE policy.
*/

-- ============================================================
-- 1. ASSET MANAGEMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  name text NOT NULL,
  asset_tag text,
  serial_number text,
  manufacturer text,
  model text,
  category text,
  location_description text,
  install_date date,
  warranty_expiry date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_assets" ON assets;
CREATE POLICY "select_company_assets" ON assets FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = assets.company_id)
  );

DROP POLICY IF EXISTS "insert_company_assets" ON assets;
CREATE POLICY "insert_company_assets" ON assets FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = assets.company_id)
  );

DROP POLICY IF EXISTS "update_company_assets" ON assets;
CREATE POLICY "update_company_assets" ON assets FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = assets.company_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = assets.company_id)
  );

DROP POLICY IF EXISTS "delete_company_assets" ON assets;
CREATE POLICY "delete_company_assets" ON assets FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = assets.company_id)
  );

CREATE INDEX IF NOT EXISTS idx_assets_company_id ON assets(company_id);
CREATE INDEX IF NOT EXISTS idx_assets_client_id ON assets(client_id);

-- Asset maintenance/test records
CREATE TABLE IF NOT EXISTS asset_maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  inspection_id uuid REFERENCES inspections(id) ON DELETE SET NULL,
  technician_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  test_date date NOT NULL DEFAULT CURRENT_DATE,
  test_type text,
  readings jsonb,
  result text NOT NULL DEFAULT 'pass',
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE asset_maintenance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_asset_maintenance" ON asset_maintenance_records;
CREATE POLICY "select_company_asset_maintenance" ON asset_maintenance_records FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = asset_maintenance_records.company_id)
  );

DROP POLICY IF EXISTS "insert_company_asset_maintenance" ON asset_maintenance_records;
CREATE POLICY "insert_company_asset_maintenance" ON asset_maintenance_records FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = asset_maintenance_records.company_id)
  );

DROP POLICY IF EXISTS "update_company_asset_maintenance" ON asset_maintenance_records;
CREATE POLICY "update_company_asset_maintenance" ON asset_maintenance_records FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = asset_maintenance_records.company_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = asset_maintenance_records.company_id)
  );

DROP POLICY IF EXISTS "delete_company_asset_maintenance" ON asset_maintenance_records;
CREATE POLICY "delete_company_asset_maintenance" ON asset_maintenance_records FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = asset_maintenance_records.company_id)
  );

CREATE INDEX IF NOT EXISTS idx_asset_maintenance_asset_id ON asset_maintenance_records(asset_id);

-- ============================================================
-- 2. SERVICE CONTRACTS / RECURRING JOBS
-- ============================================================

CREATE TABLE IF NOT EXISTS service_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  contract_number text,
  status text NOT NULL DEFAULT 'active',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  billing_cycle text NOT NULL DEFAULT 'monthly',
  contract_value numeric(12,2) NOT NULL DEFAULT 0,
  service_frequency text NOT NULL DEFAULT 'monthly',
  next_service_date date,
  last_service_date date,
  auto_generate_jobs boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE service_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_contracts" ON service_contracts;
CREATE POLICY "select_company_contracts" ON service_contracts FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = service_contracts.company_id)
  );

DROP POLICY IF EXISTS "insert_company_contracts" ON service_contracts;
CREATE POLICY "insert_company_contracts" ON service_contracts FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = service_contracts.company_id)
  );

DROP POLICY IF EXISTS "update_company_contracts" ON service_contracts;
CREATE POLICY "update_company_contracts" ON service_contracts FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = service_contracts.company_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = service_contracts.company_id)
  );

DROP POLICY IF EXISTS "delete_company_contracts" ON service_contracts;
CREATE POLICY "delete_company_contracts" ON service_contracts FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = service_contracts.company_id)
  );

CREATE INDEX IF NOT EXISTS idx_contracts_company_id ON service_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON service_contracts(client_id);

-- Contract-Asset link
CREATE TABLE IF NOT EXISTS service_contract_assets (
  contract_id uuid NOT NULL REFERENCES service_contracts(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  PRIMARY KEY (contract_id, asset_id)
);

ALTER TABLE service_contract_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_contract_assets" ON service_contract_assets;
CREATE POLICY "select_company_contract_assets" ON service_contract_assets FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM service_contracts sc WHERE sc.id = service_contract_assets.contract_id
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = sc.company_id))
  );

DROP POLICY IF EXISTS "insert_company_contract_assets" ON service_contract_assets;
CREATE POLICY "insert_company_contract_assets" ON service_contract_assets FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM service_contracts sc WHERE sc.id = service_contract_assets.contract_id
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = sc.company_id))
  );

DROP POLICY IF EXISTS "delete_company_contract_assets" ON service_contract_assets;
CREATE POLICY "delete_company_contract_assets" ON service_contract_assets FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM service_contracts sc WHERE sc.id = service_contract_assets.contract_id
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = sc.company_id))
  );

-- ============================================================
-- 3. PRICE BOOKS
-- ============================================================

CREATE TABLE IF NOT EXISTS price_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE price_books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_price_books" ON price_books;
CREATE POLICY "select_company_price_books" ON price_books FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = price_books.company_id)
  );

DROP POLICY IF EXISTS "insert_company_price_books" ON price_books;
CREATE POLICY "insert_company_price_books" ON price_books FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = price_books.company_id)
  );

DROP POLICY IF EXISTS "update_company_price_books" ON price_books;
CREATE POLICY "update_company_price_books" ON price_books FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = price_books.company_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = price_books.company_id)
  );

DROP POLICY IF EXISTS "delete_company_price_books" ON price_books;
CREATE POLICY "delete_company_price_books" ON price_books FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = price_books.company_id)
  );

CREATE INDEX IF NOT EXISTS idx_price_books_company_id ON price_books(company_id);

CREATE TABLE IF NOT EXISTS price_book_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_book_id uuid NOT NULL REFERENCES price_books(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code text,
  description text NOT NULL,
  category text,
  unit text NOT NULL DEFAULT 'each',
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  cost_price numeric(12,2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE price_book_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_price_book_items" ON price_book_items;
CREATE POLICY "select_company_price_book_items" ON price_book_items FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = price_book_items.company_id)
  );

DROP POLICY IF EXISTS "insert_company_price_book_items" ON price_book_items;
CREATE POLICY "insert_company_price_book_items" ON price_book_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = price_book_items.company_id)
  );

DROP POLICY IF EXISTS "update_company_price_book_items" ON price_book_items;
CREATE POLICY "update_company_price_book_items" ON price_book_items FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = price_book_items.company_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = price_book_items.company_id)
  );

DROP POLICY IF EXISTS "delete_company_price_book_items" ON price_book_items;
CREATE POLICY "delete_company_price_book_items" ON price_book_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = price_book_items.company_id)
  );

CREATE INDEX IF NOT EXISTS idx_price_book_items_book_id ON price_book_items(price_book_id);
CREATE INDEX IF NOT EXISTS idx_price_book_items_company_id ON price_book_items(company_id);

-- ============================================================
-- 4. TIMESHEETS
-- ============================================================

CREATE TABLE IF NOT EXISTS timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  clock_in timestamptz,
  clock_out timestamptz,
  break_minutes integer NOT NULL DEFAULT 0,
  total_minutes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_timesheets" ON timesheets;
CREATE POLICY "select_company_timesheets" ON timesheets FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = timesheets.company_id)
  );

DROP POLICY IF EXISTS "insert_company_timesheets" ON timesheets;
CREATE POLICY "insert_company_timesheets" ON timesheets FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = timesheets.company_id)
  );

DROP POLICY IF EXISTS "update_company_timesheets" ON timesheets;
CREATE POLICY "update_company_timesheets" ON timesheets FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = timesheets.company_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = timesheets.company_id)
  );

DROP POLICY IF EXISTS "delete_company_timesheets" ON timesheets;
CREATE POLICY "delete_company_timesheets" ON timesheets FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = timesheets.company_id)
  );

CREATE INDEX IF NOT EXISTS idx_timesheets_company_id ON timesheets(company_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_employee_id ON timesheets(employee_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_date ON timesheets(date);

CREATE TABLE IF NOT EXISTS timesheet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id uuid NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  work_type text,
  billable boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE timesheet_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_timesheet_entries" ON timesheet_entries;
CREATE POLICY "select_company_timesheet_entries" ON timesheet_entries FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = timesheet_entries.company_id)
  );

DROP POLICY IF EXISTS "insert_company_timesheet_entries" ON timesheet_entries;
CREATE POLICY "insert_company_timesheet_entries" ON timesheet_entries FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = timesheet_entries.company_id)
  );

DROP POLICY IF EXISTS "update_company_timesheet_entries" ON timesheet_entries;
CREATE POLICY "update_company_timesheet_entries" ON timesheet_entries FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = timesheet_entries.company_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = timesheet_entries.company_id)
  );

DROP POLICY IF EXISTS "delete_company_timesheet_entries" ON timesheet_entries;
CREATE POLICY "delete_company_timesheet_entries" ON timesheet_entries FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = timesheet_entries.company_id)
  );

CREATE INDEX IF NOT EXISTS idx_timesheet_entries_timesheet_id ON timesheet_entries(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_job_id ON timesheet_entries(job_id);
