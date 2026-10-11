-- Add default material markup percentage to companies.
-- Used as the default markup when adding stock items to quotes/invoices.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS default_material_markup numeric NOT NULL DEFAULT 0;