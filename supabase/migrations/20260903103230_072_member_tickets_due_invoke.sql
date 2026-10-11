-- Catalog fill (baseline r3 / #368). Prod version 20260903103230 072_member_tickets_due_invoke stays APPLIED.
-- Catalog capture 5a / 5b / 5c are empty: prod has no ticket/due-invoke function
-- and no cron.job row (cron.job is empty overall). Nothing to recreate.
-- Keep this version as a no-op so local reset matches the applied prod version.
SELECT 1;
