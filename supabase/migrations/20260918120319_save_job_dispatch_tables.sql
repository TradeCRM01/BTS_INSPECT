-- PENDING catalog capture (baseline r2 / #368).
-- Prod version 20260918120319 save_job_dispatch_tables stays APPLIED.
-- Recreate dispatch_resources / dispatch_events / dispatch_skills /
-- dispatch_member_qualifications and jobs.dispatch_* columns exactly as prod,
-- using IF NOT EXISTS.
-- Do not invent DDL. Fill from docs/operations/baseline-catalog-queries.sql output.
SELECT 1;
