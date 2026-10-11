-- Catalog fill (baseline r3 / #368). Prod version 20260910203517 068_staff_hours stays APPLIED.
-- Recreated from read-only catalog capture (uploads/368-catalog-capture.md).
-- Idempotent. Do not invent columns, constraints, policies, or indexes.

CREATE TABLE IF NOT EXISTS public.staff_hours (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  member_id uuid NOT NULL,
  date date NOT NULL,
  working boolean NOT NULL DEFAULT true,
  start_time time without time zone NULL,
  end_time time without time zone NULL,
  reason text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'staff_hours'
      AND con.conname = 'staff_hours_hours_shape'
  ) THEN
    ALTER TABLE public.staff_hours
      ADD CONSTRAINT staff_hours_hours_shape CHECK ((((working = false) AND (start_time IS NULL) AND (end_time IS NULL)) OR ((working = true) AND (start_time IS NOT NULL) AND (end_time IS NOT NULL) AND (end_time > start_time))));
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'staff_hours'
      AND con.conname = 'staff_hours_reason_len'
  ) THEN
    ALTER TABLE public.staff_hours
      ADD CONSTRAINT staff_hours_reason_len CHECK (((reason IS NULL) OR (char_length(reason) <= 200)));
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'staff_hours'
      AND con.conname = 'staff_hours_company_id_fkey'
  ) THEN
    ALTER TABLE public.staff_hours
      ADD CONSTRAINT staff_hours_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'staff_hours'
      AND con.conname = 'staff_hours_member_id_fkey'
  ) THEN
    ALTER TABLE public.staff_hours
      ADD CONSTRAINT staff_hours_member_id_fkey FOREIGN KEY (member_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'staff_hours'
      AND con.conname = 'staff_hours_pkey'
  ) THEN
    ALTER TABLE public.staff_hours
      ADD CONSTRAINT staff_hours_pkey PRIMARY KEY (id);
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'staff_hours'
      AND con.conname = 'staff_hours_member_date'
  ) THEN
    ALTER TABLE public.staff_hours
      ADD CONSTRAINT staff_hours_member_date UNIQUE (company_id, member_id, date);
  END IF;
END
$guard$;

ALTER TABLE public.staff_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can delete staff hours" ON public.staff_hours;
CREATE POLICY "Company members can delete staff hours"
  ON public.staff_hours
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

DROP POLICY IF EXISTS "Company members can insert staff hours" ON public.staff_hours;
CREATE POLICY "Company members can insert staff hours"
  ON public.staff_hours
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

DROP POLICY IF EXISTS "Company members can update staff hours" ON public.staff_hours;
CREATE POLICY "Company members can update staff hours"
  ON public.staff_hours
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))))
  WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

DROP POLICY IF EXISTS "Company members can view staff hours" ON public.staff_hours;
CREATE POLICY "Company members can view staff hours"
  ON public.staff_hours
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE INDEX IF NOT EXISTS idx_staff_hours_company_date ON public.staff_hours USING btree (company_id, date);

CREATE INDEX IF NOT EXISTS idx_staff_hours_member ON public.staff_hours USING btree (member_id, date);

CREATE UNIQUE INDEX IF NOT EXISTS staff_hours_member_date ON public.staff_hours USING btree (company_id, member_id, date);

CREATE UNIQUE INDEX IF NOT EXISTS staff_hours_pkey ON public.staff_hours USING btree (id);

