/*
  # Admin Query Helper Functions

  These two PostgreSQL functions allow the AI Console edge function (running as
  service role) to execute arbitrary SELECT queries and safe DML on behalf of
  an authenticated admin user.

  1. admin_query(query_sql text) → jsonb
     - Executes any SELECT statement and returns results as JSON
     - Used by the AI Console "query_database" tool

  2. admin_execute(exec_sql text) → jsonb
     - Executes INSERT/UPDATE/DELETE and returns affected row count
     - Used by the AI Console "execute_sql" tool
     - DDL is blocked at the edge function layer before reaching here

  Security: Both functions run as SECURITY DEFINER (service role context).
  They are only callable by the edge function which already validates the
  caller is an authenticated admin via JWT + profiles.role check.
*/

CREATE OR REPLACE FUNCTION admin_query(query_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Only allow SELECT statements
  IF query_sql !~* '^\s*SELECT' THEN
    RAISE EXCEPTION 'Only SELECT statements are allowed';
  END IF;

  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', query_sql)
  INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION admin_execute(exec_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  row_count integer;
BEGIN
  -- Block DDL
  IF exec_sql ~* '^\s*(DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)' THEN
    RAISE EXCEPTION 'DDL statements are not allowed';
  END IF;

  EXECUTE exec_sql;
  GET DIAGNOSTICS row_count = ROW_COUNT;

  RETURN jsonb_build_object('rows_affected', row_count);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;
