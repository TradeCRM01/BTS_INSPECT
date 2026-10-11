-- Catalog fill (baseline r3 / #368). Prod version 20260919114909 save_job_dispatch_clear_times stays APPLIED.
-- This version redefined save_job_dispatch in prod. The live body from
-- pg_get_functiondef is already applied at 20260918120411 (earliest version
-- that created the function). Later stub is a no-op.
SELECT 1;
