-- PENDING catalog capture (baseline r2 / #368).
-- Prod version 20260910203517 068_staff_hours stays APPLIED.
-- Recreate staff_hours plus its 4 policies exactly as prod,
-- using IF NOT EXISTS / CREATE OR REPLACE.
-- Do not invent DDL. Fill from docs/operations/baseline-catalog-queries.sql output.
SELECT 1;
