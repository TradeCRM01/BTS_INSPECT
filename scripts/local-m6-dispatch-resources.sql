-- LOCAL SANDBOX ONLY
-- Not a production migration.
-- Milestone 6 dispatch resources. Apply to local Supabase only.
-- Idempotent. Do not copy into supabase/migrations.

-- ── Job concurrency + readiness ────────────────────────────────────────────

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dispatch_ready boolean NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dispatch_version integer NOT NULL DEFAULT 1;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS required_crew_count integer NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_dispatch_override_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_dispatch_override_reason text;

COMMENT ON COLUMN jobs.dispatch_ready IS 'LOCAL: planning vs ready-to-dispatch. Soft vs hard requirement gaps.';
COMMENT ON COLUMN jobs.dispatch_version IS 'LOCAL: incremented by save_job_dispatch. Not last-write-wins.';

-- ── Catalogue ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dispatch_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  requires_expiry boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatch_skills_name_len CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT dispatch_skills_company_name UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS dispatch_member_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES dispatch_skills(id) ON DELETE CASCADE,
  issued_on date,
  expires_on date,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatch_qual_company_member_skill UNIQUE (company_id, member_id, skill_id)
);

CREATE TABLE IF NOT EXISTS dispatch_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'out_of_service')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatch_resources_name_len CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT dispatch_resources_company_name UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS job_skill_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES dispatch_skills(id) ON DELETE CASCADE,
  min_holders integer NOT NULL DEFAULT 1 CHECK (min_holders >= 1),
  CONSTRAINT job_skill_requirements_unique UNIQUE (job_id, skill_id)
);

CREATE TABLE IF NOT EXISTS job_resource_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES dispatch_resources(id) ON DELETE CASCADE,
  category text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  CONSTRAINT job_resource_req_target CHECK (resource_id IS NOT NULL OR category IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS job_resource_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES dispatch_resources(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_resource_allocations_unique UNIQUE (job_id, resource_id)
);

CREATE TABLE IF NOT EXISTS dispatch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('assign', 'remove', 'override', 'reschedule', 'requirements')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dispatch_events_idempotent UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_dispatch_skills_company ON dispatch_skills (company_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_qual_company ON dispatch_member_qualifications (company_id, member_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_resources_company ON dispatch_resources (company_id, status);
CREATE INDEX IF NOT EXISTS idx_job_skill_req_job ON job_skill_requirements (job_id);
CREATE INDEX IF NOT EXISTS idx_job_res_req_job ON job_resource_requirements (job_id);
CREATE INDEX IF NOT EXISTS idx_job_res_alloc_job ON job_resource_allocations (job_id);
CREATE INDEX IF NOT EXISTS idx_job_res_alloc_res ON job_resource_allocations (resource_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_events_job ON dispatch_events (job_id, created_at DESC);

-- ── RLS: tenant isolation, no anon ─────────────────────────────────────────

ALTER TABLE dispatch_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_member_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_skill_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_resource_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_resource_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dispatch_skills',
    'dispatch_member_qualifications',
    'dispatch_resources',
    'job_skill_requirements',
    'job_resource_requirements',
    'job_resource_allocations',
    'dispatch_events'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS company_select ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS company_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS company_update ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS company_delete ON %I', t);
    EXECUTE format(
      'CREATE POLICY company_select ON %I FOR SELECT TO authenticated USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))',
      t
    );
    EXECUTE format(
      'CREATE POLICY company_insert ON %I FOR INSERT TO authenticated WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))',
      t
    );
    EXECUTE format(
      'CREATE POLICY company_update ON %I FOR UPDATE TO authenticated USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())) WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))',
      t
    );
    EXECUTE format(
      'CREATE POLICY company_delete ON %I FOR DELETE TO authenticated USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))',
      t
    );
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO authenticated, service_role', t);
  END LOOP;
END $$;

-- ── Atomic write ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION save_job_dispatch(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_job_company uuid;
  v_job_id uuid := (p->>'job_id')::uuid;
  v_expected timestamptz := (p->>'expected_updated_at')::timestamptz;
  v_new_updated timestamptz;
  v_version integer;
  v_event_id uuid;
  v_kind text := coalesce(p->>'event_kind', 'assign');
  v_key text := p->>'idempotency_key';
  v_overridden boolean := coalesce((p->>'overridden')::boolean, false);
  v_reason text := nullif(btrim(coalesce(p->>'override_reason', '')), '');
  v_team jsonb := coalesce(p->'assigned_team', '[]'::jsonb);
  v_ready boolean := coalesce((p->>'dispatch_ready')::boolean, false);
  v_crew integer := coalesce((p->>'required_crew_count')::integer, 0);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_job_id IS NULL OR v_expected IS NULL OR v_key IS NULL OR length(v_key) < 8 THEN
    RAISE EXCEPTION 'invalid_dispatch_payload' USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO v_company FROM profiles WHERE id = v_uid;
  SELECT company_id INTO v_job_company FROM jobs WHERE id = v_job_id;
  IF v_company IS NULL OR v_job_company IS NULL OR v_company <> v_job_company THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_overridden THEN
    IF (SELECT role FROM profiles WHERE id = v_uid) IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'override_forbidden' USING ERRCODE = '42501';
    END IF;
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'override_reason_required' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT e.id, j.updated_at, j.dispatch_version
  INTO v_event_id, v_new_updated, v_version
  FROM dispatch_events e
  JOIN jobs j ON j.id = e.job_id
  WHERE e.company_id = v_company AND e.idempotency_key = v_key
  LIMIT 1;
  IF v_event_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'updated_at', v_new_updated,
      'dispatch_version', v_version,
      'event_id', v_event_id,
      'replayed', true
    );
  END IF;

  UPDATE jobs
  SET
    assigned_team = v_team,
    dispatch_ready = v_ready,
    required_crew_count = v_crew,
    dispatch_version = dispatch_version + 1,
    updated_at = now(),
    last_dispatch_override_at = CASE WHEN v_overridden THEN now() ELSE last_dispatch_override_at END,
    last_dispatch_override_reason = CASE WHEN v_overridden THEN v_reason ELSE last_dispatch_override_reason END
  WHERE id = v_job_id
    AND company_id = v_company
    AND updated_at = v_expected
  RETURNING updated_at, dispatch_version INTO v_new_updated, v_version;

  IF v_new_updated IS NULL THEN
    RAISE EXCEPTION 'stale_dispatch' USING ERRCODE = '40001';
  END IF;

  DELETE FROM job_skill_requirements WHERE job_id = v_job_id AND company_id = v_company;
  INSERT INTO job_skill_requirements (company_id, job_id, skill_id, min_holders)
  SELECT v_company, v_job_id, (x->>'skill_id')::uuid, coalesce((x->>'min_holders')::integer, 1)
  FROM jsonb_array_elements(coalesce(p->'skill_requirements', '[]'::jsonb)) AS x
  WHERE x->>'skill_id' IS NOT NULL;

  DELETE FROM job_resource_requirements WHERE job_id = v_job_id AND company_id = v_company;
  INSERT INTO job_resource_requirements (company_id, job_id, resource_id, category, quantity)
  SELECT
    v_company,
    v_job_id,
    nullif(x->>'resource_id', '')::uuid,
    nullif(x->>'category', ''),
    coalesce((x->>'quantity')::integer, 1)
  FROM jsonb_array_elements(coalesce(p->'resource_requirements', '[]'::jsonb)) AS x;

  DELETE FROM job_resource_allocations WHERE job_id = v_job_id AND company_id = v_company;
  INSERT INTO job_resource_allocations (company_id, job_id, resource_id)
  SELECT DISTINCT v_company, v_job_id, (x)::uuid
  FROM jsonb_array_elements_text(coalesce(p->'resource_ids', '[]'::jsonb)) AS x
  ON CONFLICT (job_id, resource_id) DO NOTHING;

  INSERT INTO dispatch_events (company_id, job_id, actor_id, kind, payload, idempotency_key)
  VALUES (
    v_company,
    v_job_id,
    v_uid,
    v_kind,
    jsonb_build_object(
      'conflicts', coalesce(p->'conflicts', '[]'::jsonb),
      'reason', v_reason,
      'overridden', v_overridden,
      'assigned_team', v_team,
      'resource_ids', coalesce(p->'resource_ids', '[]'::jsonb)
    ),
    v_key
  )
  ON CONFLICT (company_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id
    FROM dispatch_events
    WHERE company_id = v_company AND idempotency_key = v_key;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'updated_at', v_new_updated,
    'dispatch_version', v_version,
    'event_id', v_event_id
  );
END;
$$;

REVOKE ALL ON FUNCTION save_job_dispatch(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_job_dispatch(jsonb) TO authenticated, service_role;

-- ── Local demo catalogue (idempotent) ──────────────────────────────────────

INSERT INTO dispatch_skills (company_id, name, requires_expiry)
SELECT c.id, 'Tester ticket', true
FROM companies c
WHERE c.name = 'Building Technology Solutions'
  AND NOT EXISTS (
    SELECT 1 FROM dispatch_skills s WHERE s.company_id = c.id AND s.name = 'Tester ticket'
  );

INSERT INTO dispatch_resources (company_id, name, category, status)
SELECT c.id, 'Fluke tester', 'tester', 'available'
FROM companies c
WHERE c.name = 'Building Technology Solutions'
  AND NOT EXISTS (
    SELECT 1 FROM dispatch_resources r WHERE r.company_id = c.id AND r.name = 'Fluke tester'
  );

INSERT INTO dispatch_resources (company_id, name, category, status)
SELECT c.id, 'EWP-1', 'ewp', 'out_of_service'
FROM companies c
WHERE c.name = 'Building Technology Solutions'
  AND NOT EXISTS (
    SELECT 1 FROM dispatch_resources r WHERE r.company_id = c.id AND r.name = 'EWP-1'
  );

INSERT INTO dispatch_member_qualifications (company_id, member_id, skill_id, issued_on, expires_on, reference)
SELECT c.id, p.id, s.id, DATE '2025-01-01', DATE '2028-01-01', 'LOCAL-M6'
FROM companies c
JOIN profiles p ON p.company_id = c.id
JOIN dispatch_skills s ON s.company_id = c.id AND s.name = 'Tester ticket'
WHERE c.name = 'Building Technology Solutions'
  AND NOT EXISTS (
    SELECT 1 FROM dispatch_member_qualifications q
    WHERE q.company_id = c.id AND q.member_id = p.id AND q.skill_id = s.id
  );
