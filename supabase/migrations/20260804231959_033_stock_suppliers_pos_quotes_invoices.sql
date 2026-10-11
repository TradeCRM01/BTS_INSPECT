/*
  # Stock, Suppliers, Purchase Orders, Quotes & Invoices

  ## Summary
  Adds the core field-service-management tables: stock/inventory,
  suppliers, purchase orders, quotes, invoices, and stock movements.
  Also adds a default_tax_rate column to companies and a job_costs
  table for tracking materials, labor, and other costs per job.

  ## New Tables

  ### stock_items
  - `id` (uuid, PK)
  - `company_id` (uuid, FK → companies) — owning company
  - `name` (text) — part name
  - `sku` (text, nullable) — stock keeping unit / part number
  - `description` (text, nullable)
  - `category` (text, nullable) — e.g. "Electrical", "Plumbing"
  - `unit_of_measure` (text) — e.g. "each", "m", "box"
  - `quantity_on_hand` (numeric, default 0) — current stock level
  - `reorder_level` (numeric, default 0) — threshold for low-stock alert
  - `reorder_quantity` (numeric, default 0) — suggested reorder amount
  - `storage_location` (text, nullable) — e.g. "Warehouse A, Shelf 3"
  - `unit_cost` (numeric, default 0) — cost per unit
  - `supplier_id` (uuid, FK → suppliers, nullable) — preferred supplier
  - `archived` (boolean, default false)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

  ### stock_movements
  - `id` (uuid, PK)
  - `company_id` (uuid, FK → companies)
  - `stock_item_id` (uuid, FK → stock_items, ON DELETE CASCADE)
  - `movement_type` (text) — 'received', 'allocated_to_job', 'returned', 'adjusted'
  - `quantity` (numeric) — positive = in, negative = out
  - `job_id` (uuid, FK → jobs, nullable) — linked job if allocation
  - `purchase_order_id` (uuid, FK → purchase_orders, nullable) — linked PO if received
  - `reason` (text, nullable) — free-form note
  - `created_by` (uuid, FK → profiles, nullable)
  - `created_at` (timestamptz, default now())

  ### suppliers
  - `id` (uuid, PK)
  - `company_id` (uuid, FK → companies)
  - `name` (text) — supplier / vendor name
  - `contact_person` (text, nullable)
  - `phone` (text, nullable)
  - `email` (text, nullable)
  - `address` (text, nullable)
  - `default_currency` (text, default 'AUD')
  - `notes` (text, nullable)
  - `archived` (boolean, default false)
  - `created_at` (timestamptz, default now())

  ### purchase_orders
  - `id` (uuid, PK)
  - `company_id` (uuid, FK → companies)
  - `po_number` (int) — company-scoped sequential PO number (trigger)
  - `supplier_id` (uuid, FK → suppliers, nullable, ON DELETE SET NULL)
  - `job_id` (uuid, FK → jobs, nullable, ON DELETE SET NULL)
  - `status` (text) — 'draft', 'sent', 'partially_received', 'received', 'cancelled'
  - `line_items` (jsonb) — array of {description, quantity, unit_cost, received_quantity}
  - `subtotal` (numeric, default 0)
  - `tax_rate` (numeric, default 0) — flat percentage
  - `tax_amount` (numeric, default 0)
  - `total` (numeric, default 0)
  - `expected_delivery_date` (date, nullable)
  - `notes` (text, nullable)
  - `created_by` (uuid, FK → profiles, nullable)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

  ### quotes
  - `id` (uuid, PK)
  - `company_id` (uuid, FK → companies)
  - `quote_number` (int) — company-scoped sequential quote number (trigger)
  - `client_id` (uuid, FK → clients, nullable, ON DELETE SET NULL)
  - `job_id` (uuid, FK → jobs, nullable, ON DELETE SET NULL)
  - `status` (text) — 'draft', 'sent', 'accepted', 'declined', 'expired'
  - `line_items` (jsonb) — array of {description, quantity, unit_price}
  - `subtotal` (numeric, default 0)
  - `tax_rate` (numeric, default 0) — flat percentage
  - `tax_amount` (numeric, default 0)
  - `total` (numeric, default 0)
  - `validity_date` (date, nullable) — quote expiry date
  - `notes` (text, nullable)
  - `created_by` (uuid, FK → profiles, nullable)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

  ### invoices
  - `id` (uuid, PK)
  - `company_id` (uuid, FK → companies)
  - `invoice_number` (int) — company-scoped sequential invoice number (trigger)
  - `client_id` (uuid, FK → clients, nullable, ON DELETE SET NULL)
  - `job_id` (uuid, FK → jobs, nullable, ON DELETE SET NULL)
  - `quote_id` (uuid, FK → quotes, nullable, ON DELETE SET NULL)
  - `status` (text) — 'draft', 'sent', 'paid', 'overdue'
  - `line_items` (jsonb) — array of {description, quantity, unit_price}
  - `subtotal` (numeric, default 0)
  - `tax_rate` (numeric, default 0) — flat percentage
  - `tax_amount` (numeric, default 0)
  - `total` (numeric, default 0)
  - `payment_terms` (text, nullable) — e.g. "Net 30"
  - `due_date` (date, nullable)
  - `notes` (text, nullable)
  - `created_by` (uuid, FK → profiles, nullable)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

  ### job_costs
  - `id` (uuid, PK)
  - `company_id` (uuid, FK → companies)
  - `job_id` (uuid, FK → jobs, ON DELETE CASCADE)
  - `cost_type` (text) — 'materials', 'labor', 'other'
  - `description` (text) — what the cost is for
  - `quantity` (numeric, default 1)
  - `unit_cost` (numeric, default 0)
  - `total_cost` (numeric, default 0) — quantity * unit_cost
  - `stock_item_id` (uuid, FK → stock_items, nullable) — if allocated from stock
  - `purchase_order_id` (uuid, FK → purchase_orders, nullable) — if from a PO
  - `created_by` (uuid, FK → profiles, nullable)
  - `created_at` (timestamptz, default now())

  ## Modified Tables
  ### companies
  - `default_tax_rate` (numeric, default 10) — default flat tax percentage

  ## Triggers
  - `set_po_number()` BEFORE INSERT on purchase_orders — auto-assign sequential po_number per company
  - `set_quote_number()` BEFORE INSERT on quotes — auto-assign sequential quote_number per company
  - `set_invoice_number()` BEFORE INSERT on invoices — auto-assign sequential invoice_number per company

  ## Security
  - RLS enabled on all 7 new tables.
  - Company-scoped policies (4 per table: select/insert/update/delete), matching
    the existing clients/jobs pattern: company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  - All policies TO authenticated only (this app has sign-in).

  ## Important Notes
  1. stock_items.supplier_id references suppliers — both tables are created in this
     migration, with suppliers created first so the FK is valid.
  2. All sequential numbers (po_number, quote_number, invoice_number) use the same
     trigger pattern as job_number — COALESCE(MAX(n), 0) + 1 per company.
  3. line_items on POs track received_quantity alongside ordered quantity so the
     "Receive Goods" flow can mark partial receipts.
  4. job_costs can link to a stock_item (for parts allocation) and/or a purchase_order
     (for materials ordered via PO), giving full cost traceability.
*/

-- ── Add default_tax_rate to companies ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'default_tax_rate'
  ) THEN
    ALTER TABLE companies ADD COLUMN default_tax_rate numeric NOT NULL DEFAULT 10;
  END IF;
END $$;

-- ── suppliers table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  default_currency text NOT NULL DEFAULT 'AUD',
  notes text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view suppliers" ON suppliers;
CREATE POLICY "Company members can view suppliers"
  ON suppliers FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert suppliers" ON suppliers;
CREATE POLICY "Company members can insert suppliers"
  ON suppliers FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update suppliers" ON suppliers;
CREATE POLICY "Company members can update suppliers"
  ON suppliers FOR UPDATE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete suppliers" ON suppliers;
CREATE POLICY "Company members can delete suppliers"
  ON suppliers FOR DELETE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_suppliers_company_id ON suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_archived ON suppliers(archived);

-- ── stock_items table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  description text,
  category text,
  unit_of_measure text NOT NULL DEFAULT 'each',
  quantity_on_hand numeric NOT NULL DEFAULT 0,
  reorder_level numeric NOT NULL DEFAULT 0,
  reorder_quantity numeric NOT NULL DEFAULT 0,
  storage_location text,
  unit_cost numeric NOT NULL DEFAULT 0,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view stock_items" ON stock_items;
CREATE POLICY "Company members can view stock_items"
  ON stock_items FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert stock_items" ON stock_items;
CREATE POLICY "Company members can insert stock_items"
  ON stock_items FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update stock_items" ON stock_items;
CREATE POLICY "Company members can update stock_items"
  ON stock_items FOR UPDATE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete stock_items" ON stock_items;
CREATE POLICY "Company members can delete stock_items"
  ON stock_items FOR DELETE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_stock_items_company_id ON stock_items(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_archived ON stock_items(archived);
CREATE INDEX IF NOT EXISTS idx_stock_items_category ON stock_items(company_id, category);
CREATE INDEX IF NOT EXISTS idx_stock_items_sku ON stock_items(company_id, sku);

-- ── purchase_orders table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  po_number int,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partially_received', 'received', 'cancelled')),
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  expected_delivery_date date,
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view purchase_orders" ON purchase_orders;
CREATE POLICY "Company members can view purchase_orders"
  ON purchase_orders FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert purchase_orders" ON purchase_orders;
CREATE POLICY "Company members can insert purchase_orders"
  ON purchase_orders FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update purchase_orders" ON purchase_orders;
CREATE POLICY "Company members can update purchase_orders"
  ON purchase_orders FOR UPDATE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete purchase_orders" ON purchase_orders;
CREATE POLICY "Company members can delete purchase_orders"
  ON purchase_orders FOR DELETE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_purchase_orders_company_id ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON purchase_orders(company_id, po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_job_id ON purchase_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);

-- ── stock_movements table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  stock_item_id uuid NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('received', 'allocated_to_job', 'returned', 'adjusted')),
  quantity numeric NOT NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  reason text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view stock_movements" ON stock_movements;
CREATE POLICY "Company members can view stock_movements"
  ON stock_movements FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert stock_movements" ON stock_movements;
CREATE POLICY "Company members can insert stock_movements"
  ON stock_movements FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update stock_movements" ON stock_movements;
CREATE POLICY "Company members can update stock_movements"
  ON stock_movements FOR UPDATE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete stock_movements" ON stock_movements;
CREATE POLICY "Company members can delete stock_movements"
  ON stock_movements FOR DELETE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_stock_movements_company_id ON stock_movements(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_stock_item_id ON stock_movements(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_job_id ON stock_movements(job_id);

-- ── quotes table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_number int,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired')),
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  validity_date date,
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view quotes" ON quotes;
CREATE POLICY "Company members can view quotes"
  ON quotes FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert quotes" ON quotes;
CREATE POLICY "Company members can insert quotes"
  ON quotes FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update quotes" ON quotes;
CREATE POLICY "Company members can update quotes"
  ON quotes FOR UPDATE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete quotes" ON quotes;
CREATE POLICY "Company members can delete quotes"
  ON quotes FOR DELETE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_quotes_company_id ON quotes(company_id);
CREATE INDEX IF NOT EXISTS idx_quotes_quote_number ON quotes(company_id, quote_number);
CREATE INDEX IF NOT EXISTS idx_quotes_client_id ON quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_job_id ON quotes(job_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);

-- ── invoices table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number int,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_terms text,
  due_date date,
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view invoices" ON invoices;
CREATE POLICY "Company members can view invoices"
  ON invoices FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert invoices" ON invoices;
CREATE POLICY "Company members can insert invoices"
  ON invoices FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update invoices" ON invoices;
CREATE POLICY "Company members can update invoices"
  ON invoices FOR UPDATE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete invoices" ON invoices;
CREATE POLICY "Company members can delete invoices"
  ON invoices FOR DELETE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(company_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_job_id ON invoices(job_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- ── job_costs table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  cost_type text NOT NULL CHECK (cost_type IN ('materials', 'labor', 'other')),
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  stock_item_id uuid REFERENCES stock_items(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE job_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view job_costs" ON job_costs;
CREATE POLICY "Company members can view job_costs"
  ON job_costs FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert job_costs" ON job_costs;
CREATE POLICY "Company members can insert job_costs"
  ON job_costs FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update job_costs" ON job_costs;
CREATE POLICY "Company members can update job_costs"
  ON job_costs FOR UPDATE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete job_costs" ON job_costs;
CREATE POLICY "Company members can delete job_costs"
  ON job_costs FOR DELETE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_job_costs_company_id ON job_costs(company_id);
CREATE INDEX IF NOT EXISTS idx_job_costs_job_id ON job_costs(job_id);

-- ── Trigger: auto-assign sequential po_number per company ───────
CREATE OR REPLACE FUNCTION set_po_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.po_number IS NULL THEN
    SELECT COALESCE(MAX(po_number), 0) + 1
    INTO NEW.po_number
    FROM purchase_orders
    WHERE company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_po_number ON purchase_orders;
CREATE TRIGGER trg_set_po_number
  BEFORE INSERT ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_po_number();

-- ── Trigger: auto-assign sequential quote_number per company ────
CREATE OR REPLACE FUNCTION set_quote_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.quote_number IS NULL THEN
    SELECT COALESCE(MAX(quote_number), 0) + 1
    INTO NEW.quote_number
    FROM quotes
    WHERE company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_quote_number ON quotes;
CREATE TRIGGER trg_set_quote_number
  BEFORE INSERT ON quotes
  FOR EACH ROW EXECUTE FUNCTION set_quote_number();

-- ── Trigger: auto-assign sequential invoice_number per company ──
CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    SELECT COALESCE(MAX(invoice_number), 0) + 1
    INTO NEW.invoice_number
    FROM invoices
    WHERE company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_invoice_number ON invoices;
CREATE TRIGGER trg_set_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_invoice_number();

-- ── Backfill sequential numbers for any existing rows ───────────
UPDATE purchase_orders p SET po_number = sub.rn
FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at) AS rn FROM purchase_orders) sub
WHERE p.id = sub.id AND p.po_number IS NULL;

UPDATE quotes q SET quote_number = sub.rn
FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at) AS rn FROM quotes) sub
WHERE q.id = sub.id AND q.quote_number IS NULL;

UPDATE invoices i SET invoice_number = sub.rn
FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at) AS rn FROM invoices) sub
WHERE i.id = sub.id AND i.invoice_number IS NULL;
