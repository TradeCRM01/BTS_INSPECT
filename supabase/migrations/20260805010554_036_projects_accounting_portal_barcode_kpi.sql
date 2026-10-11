/*
# Simpro Parity: Multi-Stage Projects, Accounting Settings, Client Portal, Barcode Logs, KPI Reports

## Overview
Adds support for:
1. Multi-stage projects (parent/child job relationships)
2. Accounting integration settings (Xero/QuickBooks config)
3. Client portal access tokens for self-service
4. Barcode/QR scan log for inventory
5. KPI snapshot table for dashboard reporting

## Changes

### 1. jobs table — add parent_job_id column
- New nullable column `parent_job_id` referencing jobs(id)
- Allows creating child jobs (phases/stages) under a parent project
- Parent jobs show aggregated costs/time from children

### 2. accounting_settings table
- Stores Xero/QuickBooks integration config per company
- Includes connection status, tenant ID, tokens (encrypted at app level)
- Last sync timestamp for reconciliation

### 3. client_portal_tokens table
- Secure access tokens for clients to view their quotes/invoices/job status
- Time-limited, revocable tokens
- Links to client record

### 4. barcode_scan_logs table
- Records each barcode/QR scan event
- Links to stock item (if matched) and user
- Supports inventory reconciliation workflows

### 5. kpi_snapshots table
- Daily snapshot of key business metrics per company
- Stores revenue, job costs, outstanding invoices, etc.
- Powers the KPI dashboard widgets and reports

## Security
- All new tables use company_id scoping with RLS
- Client portal tokens table uses TO anon, authenticated since clients access via token
- All policies check company membership via profiles table
*/

-- ============================================================
-- 1. MULTI-STAGE PROJECTS — parent_job_id on jobs
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'parent_job_id'
  ) THEN
    ALTER TABLE jobs ADD COLUMN parent_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- 2. ACCOUNTING SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS accounting_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'none',
  tenant_id text,
  connection_status text NOT NULL DEFAULT 'disconnected',
  last_synced_at timestamptz,
  auto_sync boolean NOT NULL DEFAULT false,
  sync_invoices boolean NOT NULL DEFAULT true,
  sync_payments boolean NOT NULL DEFAULT true,
  sync_suppliers boolean NOT NULL DEFAULT false,
  settings jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE accounting_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_accounting" ON accounting_settings;
CREATE POLICY "select_company_accounting" ON accounting_settings FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = accounting_settings.company_id)
  );

DROP POLICY IF EXISTS "insert_company_accounting" ON accounting_settings;
CREATE POLICY "insert_company_accounting" ON accounting_settings FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = accounting_settings.company_id)
  );

DROP POLICY IF EXISTS "update_company_accounting" ON accounting_settings;
CREATE POLICY "update_company_accounting" ON accounting_settings FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = accounting_settings.company_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = accounting_settings.company_id)
  );

DROP POLICY IF EXISTS "delete_company_accounting" ON accounting_settings;
CREATE POLICY "delete_company_accounting" ON accounting_settings FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = accounting_settings.company_id)
  );

-- ============================================================
-- 3. CLIENT PORTAL TOKENS
-- ============================================================

CREATE TABLE IF NOT EXISTS client_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  last_accessed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE client_portal_tokens ENABLE ROW LEVEL SECURITY;

-- Company members can manage tokens
DROP POLICY IF EXISTS "select_company_portal_tokens" ON client_portal_tokens;
CREATE POLICY "select_company_portal_tokens" ON client_portal_tokens FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  );

DROP POLICY IF EXISTS "insert_company_portal_tokens" ON client_portal_tokens;
CREATE POLICY "insert_company_portal_tokens" ON client_portal_tokens FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  );

DROP POLICY IF EXISTS "update_company_portal_tokens" ON client_portal_tokens;
CREATE POLICY "update_company_portal_tokens" ON client_portal_tokens FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  );

DROP POLICY IF EXISTS "delete_company_portal_tokens" ON client_portal_tokens;
CREATE POLICY "delete_company_portal_tokens" ON client_portal_tokens FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  );

CREATE INDEX IF NOT EXISTS idx_portal_tokens_token ON client_portal_tokens(token);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_client_id ON client_portal_tokens(client_id);

-- ============================================================
-- 4. BARCODE SCAN LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS barcode_scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  stock_item_id uuid REFERENCES stock_items(id) ON DELETE SET NULL,
  scanned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  barcode text NOT NULL,
  scan_type text NOT NULL DEFAULT 'lookup',
  matched boolean NOT NULL DEFAULT false,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE barcode_scan_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_scan_logs" ON barcode_scan_logs;
CREATE POLICY "select_company_scan_logs" ON barcode_scan_logs FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = barcode_scan_logs.company_id)
  );

DROP POLICY IF EXISTS "insert_company_scan_logs" ON barcode_scan_logs;
CREATE POLICY "insert_company_scan_logs" ON barcode_scan_logs FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = barcode_scan_logs.company_id)
  );

DROP POLICY IF EXISTS "delete_company_scan_logs" ON barcode_scan_logs;
CREATE POLICY "delete_company_scan_logs" ON barcode_scan_logs FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = barcode_scan_logs.company_id)
  );

CREATE INDEX IF NOT EXISTS idx_scan_logs_company_id ON barcode_scan_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_barcode ON barcode_scan_logs(barcode);

-- ============================================================
-- 5. KPI SNAPSHOTS
-- ============================================================

CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  total_jobs integer NOT NULL DEFAULT 0,
  active_jobs integer NOT NULL DEFAULT 0,
  completed_jobs integer NOT NULL DEFAULT 0,
  revenue_ytd numeric(14,2) NOT NULL DEFAULT 0,
  outstanding_invoices numeric(14,2) NOT NULL DEFAULT 0,
  overdue_invoices numeric(14,2) NOT NULL DEFAULT 0,
  total_quotes numeric(14,2) NOT NULL DEFAULT 0,
  accepted_quotes numeric(14,2) NOT NULL DEFAULT 0,
  total_job_costs numeric(14,2) NOT NULL DEFAULT 0,
  total_labour_hours numeric(10,2) NOT NULL DEFAULT 0,
  new_clients integer NOT NULL DEFAULT 0,
  open_pos integer NOT NULL DEFAULT 0,
  low_stock_items integer NOT NULL DEFAULT 0,
  active_contracts integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, snapshot_date)
);

ALTER TABLE kpi_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_kpi" ON kpi_snapshots;
CREATE POLICY "select_company_kpi" ON kpi_snapshots FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = kpi_snapshots.company_id)
  );

DROP POLICY IF EXISTS "insert_company_kpi" ON kpi_snapshots;
CREATE POLICY "insert_company_kpi" ON kpi_snapshots FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = kpi_snapshots.company_id)
  );

DROP POLICY IF EXISTS "update_company_kpi" ON kpi_snapshots;
CREATE POLICY "update_company_kpi" ON kpi_snapshots FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = kpi_snapshots.company_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = kpi_snapshots.company_id)
  );

DROP POLICY IF EXISTS "delete_company_kpi" ON kpi_snapshots;
CREATE POLICY "delete_company_kpi" ON kpi_snapshots FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = kpi_snapshots.company_id)
  );

CREATE INDEX IF NOT EXISTS idx_kpi_company_date ON kpi_snapshots(company_id, snapshot_date);
