-- PENDING catalog capture (baseline r2 / #368).
-- Prod version 20260903103230 072_member_tickets_due_invoke stays APPLIED.
-- Recreate the invoke function and its cron.job entry exactly as prod,
-- using CREATE OR REPLACE / IF NOT EXISTS.
-- Do not invent DDL. Fill from docs/operations/baseline-catalog-queries.sql output.
SELECT 1;
