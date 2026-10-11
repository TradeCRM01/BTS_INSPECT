-- READ-ONLY catalog capture for baseline r2 / #368.
-- Run on ezszahvwwmbuekpedumf only. No INSERT / UPDATE / DELETE / DDL.
-- Do not guess object bodies from this file. Paste the result rows back.

-- =============================================================================
-- 0. cron.job (was out of scope in the first proof pass)
-- =============================================================================

SELECT
  jobid,
  jobname,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job
ORDER BY jobid;

-- =============================================================================
-- 1. 068_staff_hours — table + 4 policies
-- =============================================================================

SELECT
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale,
  c.is_nullable,
  c.column_default,
  c.is_identity,
  c.identity_generation
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name = 'staff_hours'
ORDER BY c.ordinal_position;

SELECT
  con.conname,
  con.contype,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint AS con
JOIN pg_class AS rel ON rel.oid = con.conrelid
JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'staff_hours'
ORDER BY con.contype, con.conname;

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'staff_hours'
ORDER BY policyname;

SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'staff_hours'
ORDER BY indexname;

-- =============================================================================
-- 2. save_job_dispatch_tables — dispatch_* tables + jobs.dispatch_* columns
-- =============================================================================

SELECT
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale,
  c.is_nullable,
  c.column_default,
  c.is_identity,
  c.identity_generation
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'dispatch_resources',
    'dispatch_events',
    'dispatch_skills',
    'dispatch_member_qualifications'
  )
ORDER BY c.table_name, c.ordinal_position;

SELECT
  rel.relname AS table_name,
  con.conname,
  con.contype,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint AS con
JOIN pg_class AS rel ON rel.oid = con.conrelid
JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname IN (
    'dispatch_resources',
    'dispatch_events',
    'dispatch_skills',
    'dispatch_member_qualifications'
  )
ORDER BY rel.relname, con.contype, con.conname;

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'dispatch_resources',
    'dispatch_events',
    'dispatch_skills',
    'dispatch_member_qualifications'
  )
ORDER BY tablename, policyname;

SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'dispatch_resources',
    'dispatch_events',
    'dispatch_skills',
    'dispatch_member_qualifications'
  )
ORDER BY tablename, indexname;

SELECT
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale,
  c.is_nullable,
  c.column_default
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name = 'jobs'
  AND c.column_name LIKE 'dispatch_%'
ORDER BY c.ordinal_position;

SELECT
  rel.relname AS table_name,
  con.conname,
  con.contype,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint AS con
JOIN pg_class AS rel ON rel.oid = con.conrelid
JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'jobs'
  AND (
    con.conname ILIKE '%dispatch%'
    OR pg_get_constraintdef(con.oid) ILIKE '%dispatch_%'
  )
ORDER BY con.conname;

SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'jobs'
  AND (indexname ILIKE '%dispatch%' OR indexdef ILIKE '%dispatch_%')
ORDER BY indexname;

-- =============================================================================
-- 3. save_job_dispatch / clear_times / clock_semantics — function bodies
-- =============================================================================

SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'save_job_dispatch',
    'dispatch_json_clock',
    'dispatch_time_to_minutes'
  )
ORDER BY p.proname, 3;

-- =============================================================================
-- 4. reminders_visibility_tags_tick_only — function + trigger
-- =============================================================================

SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'agent_reminders_tagged_tick_only'
ORDER BY 3;

SELECT
  tg.tgname AS trigger_name,
  rel.relname AS table_name,
  pg_get_triggerdef(tg.oid) AS definition
FROM pg_trigger AS tg
JOIN pg_class AS rel ON rel.oid = tg.tgrelid
JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND rel.relname = 'agent_reminders'
  AND NOT tg.tgisinternal
  AND tg.tgname ILIKE '%tick%'
ORDER BY tg.tgname;

-- =============================================================================
-- 5. 072_member_tickets_due_invoke — function name is unknown; list then dump
-- =============================================================================

SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (
    p.proname ILIKE '%ticket%'
    OR p.proname ILIKE '%due_invoke%'
    OR p.proname ILIKE '%member_ticket%'
  )
ORDER BY p.proname, 3;

SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (
    p.proname ILIKE '%ticket%'
    OR p.proname ILIKE '%due_invoke%'
    OR p.proname ILIKE '%member_ticket%'
  )
ORDER BY p.proname, 3;

SELECT
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job
WHERE command ILIKE '%ticket%'
   OR jobname ILIKE '%ticket%'
ORDER BY jobid;
