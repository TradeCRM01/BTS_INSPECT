-- LOCAL SANDBOX ONLY
-- Not a production migration.
-- Negative tests for save_job_dispatch server-side validation + RLS.
-- Apply after local-m6-dispatch-resources.sql.
-- Does not log anyone in. Does not write passwords into docs.
-- Concurrent race: scripts/local-m6-dispatch-race.ps1 (two client sessions).

DO $$
DECLARE
  v_bts uuid;
  v_admin uuid := '30489446-fc8e-4950-9974-13a0711cbe97';
  v_member uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  v_other_user uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  v_other_co uuid := 'cccccccc-0000-4000-8000-000000000003';
  v_job uuid := 'dddddddd-0000-4000-8000-000000000004';
  v_other_job uuid := 'eeeeeeee-0000-4000-8000-000000000005';
  v_hold uuid := 'ffffffff-0000-4000-8000-000000000006';
  v_race uuid := '11111111-0000-4000-8000-000000000007';
  v_fluke uuid;
  v_other_res uuid;
  v_dead uuid;
  v_kit uuid;
  v_skill uuid;
  v_expected timestamptz;
  v_hold_at timestamptz;
  v_race_at timestamptz;
  v_first jsonb;
  v_retry jsonb;
  v_ok jsonb;
  v_err text;
  v_detail text;
  v_allocs integer;
  v_events integer;
  v_seen integer;
  v_before_allocs integer;
  v_before_events integer;
  v_before_at timestamptz;
BEGIN
  SELECT id INTO v_bts FROM companies WHERE name = 'Building Technology Solutions';
  IF v_bts IS NULL THEN
    RAISE EXCEPTION 'local BTS company missing';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change, email_change_token_new
  )
  SELECT
    '00000000-0000-0000-0000-000000000000',
    u.id,
    'authenticated',
    'authenticated',
    u.email,
    'local-m6-not-a-login',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  FROM (VALUES
    (v_member, 'm6.member@local.test'),
    (v_other_user, 'm6.other@local.test')
  ) AS u(id, email)
  WHERE NOT EXISTS (SELECT 1 FROM auth.users x WHERE x.id = u.id);

  INSERT INTO companies (id, name)
  SELECT v_other_co, 'LOCAL M6 Other Co'
  WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = v_other_co);

  INSERT INTO profiles (id, email, name, company_id, role)
  SELECT v_member, 'm6.member@local.test', 'M6 Member', v_bts, 'member'
  WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = v_member);

  INSERT INTO profiles (id, email, name, company_id, role)
  SELECT v_other_user, 'm6.other@local.test', 'M6 Other', v_other_co, 'admin'
  WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = v_other_user);

  SELECT id INTO v_fluke
  FROM dispatch_resources
  WHERE company_id = v_bts AND name = 'Fluke tester';
  IF v_fluke IS NULL THEN
    RAISE EXCEPTION 'local Fluke tester missing — apply local-m6-dispatch-resources.sql first';
  END IF;

  INSERT INTO dispatch_resources (company_id, name, category, status)
  SELECT v_other_co, 'Other van', 'van', 'available'
  WHERE NOT EXISTS (
    SELECT 1 FROM dispatch_resources r WHERE r.company_id = v_other_co AND r.name = 'Other van'
  );
  SELECT id INTO v_other_res FROM dispatch_resources WHERE company_id = v_other_co AND name = 'Other van';

  INSERT INTO dispatch_resources (company_id, name, category, status)
  SELECT v_bts, 'M6 Dead Kit', 'tester', 'out_of_service'
  WHERE NOT EXISTS (
    SELECT 1 FROM dispatch_resources r WHERE r.company_id = v_bts AND r.name = 'M6 Dead Kit'
  );
  SELECT id INTO v_dead FROM dispatch_resources WHERE company_id = v_bts AND name = 'M6 Dead Kit';

  INSERT INTO dispatch_resources (company_id, name, category, status)
  SELECT v_bts, 'M6 Race Kit', 'tester', 'available'
  WHERE NOT EXISTS (
    SELECT 1 FROM dispatch_resources r WHERE r.company_id = v_bts AND r.name = 'M6 Race Kit'
  );
  SELECT id INTO v_kit FROM dispatch_resources WHERE company_id = v_bts AND name = 'M6 Race Kit';

  INSERT INTO dispatch_skills (company_id, name, requires_expiry)
  SELECT v_bts, 'M6 Hard Ticket', true
  WHERE NOT EXISTS (
    SELECT 1 FROM dispatch_skills s WHERE s.company_id = v_bts AND s.name = 'M6 Hard Ticket'
  );
  SELECT id INTO v_skill FROM dispatch_skills WHERE company_id = v_bts AND name = 'M6 Hard Ticket';

  INSERT INTO jobs (id, company_id, created_by, title, status, scheduled_date, start_time, end_time, assigned_team)
  SELECT v_job, v_bts, v_admin, 'LOCAL M6 security job', 'scheduled', CURRENT_DATE, '09:00:00', '11:00:00', '[]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = v_job);

  INSERT INTO jobs (id, company_id, created_by, title, status, scheduled_date, assigned_team)
  SELECT v_other_job, v_other_co, v_other_user, 'LOCAL M6 other job', 'scheduled', CURRENT_DATE, '[]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = v_other_job);

  INSERT INTO jobs (id, company_id, created_by, title, status, scheduled_date, start_time, end_time, assigned_team)
  SELECT v_hold, v_bts, v_admin, 'LOCAL M6 hold job', 'scheduled', CURRENT_DATE, '09:00:00', '11:00:00', jsonb_build_array(v_member)
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = v_hold);

  INSERT INTO jobs (id, company_id, created_by, title, status, scheduled_date, start_time, end_time, assigned_team)
  SELECT v_race, v_bts, v_admin, 'LOCAL M6 race job', 'scheduled', CURRENT_DATE, '09:00:00', '11:00:00', '[]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = v_race);

  DELETE FROM dispatch_events WHERE job_id IN (v_job, v_hold, v_race);
  DELETE FROM job_resource_allocations WHERE job_id IN (v_job, v_hold, v_race);
  DELETE FROM job_resource_requirements WHERE job_id IN (v_job, v_hold, v_race);
  DELETE FROM job_skill_requirements WHERE job_id IN (v_job, v_hold, v_race);
  DELETE FROM dispatch_member_qualifications WHERE company_id = v_bts AND skill_id = v_skill;
  DELETE FROM staff_hours WHERE company_id = v_bts AND member_id = v_member AND date = CURRENT_DATE;

  UPDATE jobs
  SET assigned_team = '[]'::jsonb,
      dispatch_ready = false,
      required_crew_count = 0,
      scheduled_date = CURRENT_DATE,
      start_time = '09:00:00',
      end_time = '11:00:00',
      dispatch_version = 1,
      updated_at = clock_timestamp(),
      last_dispatch_override_at = NULL,
      last_dispatch_override_reason = NULL
  WHERE id = v_job
  RETURNING updated_at INTO v_expected;

  UPDATE jobs
  SET assigned_team = '[]'::jsonb,
      dispatch_ready = false,
      required_crew_count = 0,
      scheduled_date = CURRENT_DATE,
      start_time = '09:00:00',
      end_time = '11:00:00',
      dispatch_version = 1,
      updated_at = clock_timestamp()
  WHERE id = v_hold
  RETURNING updated_at INTO v_hold_at;

  UPDATE jobs
  SET assigned_team = '[]'::jsonb,
      dispatch_ready = false,
      required_crew_count = 0,
      scheduled_date = CURRENT_DATE,
      start_time = '09:00:00',
      end_time = '11:00:00',
      dispatch_version = 1,
      updated_at = clock_timestamp()
  WHERE id = v_race
  RETURNING updated_at INTO v_race_at;

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  SELECT updated_at INTO v_before_at FROM jobs WHERE id = v_job;
  SELECT count(*) INTO v_before_allocs FROM job_resource_allocations WHERE job_id = v_job;
  SELECT count(*) INTO v_before_events FROM dispatch_events WHERE job_id = v_job;

  BEGIN
    PERFORM save_job_dispatch(jsonb_build_object(
      'job_id', v_job,
      'expected_updated_at', v_expected,
      'assigned_team', jsonb_build_array(v_member),
      'resource_ids', '[]'::jsonb,
      'skill_requirements', jsonb_build_array(jsonb_build_object('skill_id', v_skill, 'min_holders', 1)),
      'resource_requirements', '[]'::jsonb,
      'required_crew_count', 0,
      'dispatch_ready', false,
      'overridden', false,
      'event_kind', 'assign',
      'idempotency_key', 'm6-sec-missing-qual-01'
    ));
    RAISE EXCEPTION 'missing qualification should have been rejected';
  EXCEPTION
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
      IF v_err ILIKE '%should have been rejected%' THEN RAISE; END IF;
      IF v_err NOT ILIKE '%dispatch_blocked%' THEN
        RAISE EXCEPTION 'missing qualification expected dispatch_blocked, got %', v_err;
      END IF;
      IF v_detail NOT ILIKE '%missing_qualification%' THEN
        RAISE EXCEPTION 'missing qualification DETAIL missing code, got %', v_detail;
      END IF;
  END;

  INSERT INTO dispatch_member_qualifications (company_id, member_id, skill_id, issued_on, expires_on, reference)
  VALUES (v_bts, v_member, v_skill, CURRENT_DATE - 400, CURRENT_DATE - 1, 'M6-EXPIRED');

  BEGIN
    PERFORM save_job_dispatch(jsonb_build_object(
      'job_id', v_job,
      'expected_updated_at', v_expected,
      'assigned_team', jsonb_build_array(v_member),
      'resource_ids', '[]'::jsonb,
      'skill_requirements', jsonb_build_array(jsonb_build_object('skill_id', v_skill, 'min_holders', 1)),
      'resource_requirements', '[]'::jsonb,
      'required_crew_count', 0,
      'dispatch_ready', false,
      'overridden', false,
      'override_reason', 'admin cannot override this',
      'event_kind', 'override',
      'idempotency_key', 'm6-sec-expired-qual-01'
    ));
    RAISE EXCEPTION 'expired qualification should have been rejected';
  EXCEPTION
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
      IF v_err ILIKE '%should have been rejected%' THEN RAISE; END IF;
      IF v_err NOT ILIKE '%dispatch_blocked%' OR v_detail NOT ILIKE '%expired_qualification%' THEN
        RAISE EXCEPTION 'expired qualification expected dispatch_blocked/expired, got % / %', v_err, v_detail;
      END IF;
  END;

  BEGIN
    PERFORM save_job_dispatch(jsonb_build_object(
      'job_id', v_job,
      'expected_updated_at', v_expected,
      'assigned_team', '[]'::jsonb,
      'resource_ids', jsonb_build_array(v_dead),
      'skill_requirements', '[]'::jsonb,
      'resource_requirements', '[]'::jsonb,
      'required_crew_count', 0,
      'dispatch_ready', false,
      'overridden', false,
      'event_kind', 'assign',
      'idempotency_key', 'm6-sec-oos-01'
    ));
    RAISE EXCEPTION 'out-of-service resource should have been rejected';
  EXCEPTION
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
      IF v_err ILIKE '%should have been rejected%' THEN RAISE; END IF;
      IF v_err NOT ILIKE '%dispatch_blocked%' OR v_detail NOT ILIKE '%resource_out_of_service%' THEN
        RAISE EXCEPTION 'OOS expected dispatch_blocked/out_of_service, got % / %', v_err, v_detail;
      END IF;
  END;

  INSERT INTO job_resource_allocations (company_id, job_id, resource_id)
  VALUES (v_bts, v_hold, v_kit);

  UPDATE jobs
  SET assigned_team = jsonb_build_array(v_member),
      updated_at = clock_timestamp()
  WHERE id = v_hold
  RETURNING updated_at INTO v_hold_at;

  BEGIN
    PERFORM save_job_dispatch(jsonb_build_object(
      'job_id', v_job,
      'expected_updated_at', v_expected,
      'assigned_team', '[]'::jsonb,
      'resource_ids', jsonb_build_array(v_kit),
      'skill_requirements', '[]'::jsonb,
      'resource_requirements', '[]'::jsonb,
      'required_crew_count', 0,
      'dispatch_ready', false,
      'scheduled_date', CURRENT_DATE,
      'start_time', '09:00:00',
      'end_time', '11:00:00',
      'overridden', false,
      'event_kind', 'assign',
      'idempotency_key', 'm6-sec-res-overlap-01'
    ));
    RAISE EXCEPTION 'resource overlap should have been rejected';
  EXCEPTION
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
      IF v_err ILIKE '%should have been rejected%' THEN RAISE; END IF;
      IF v_err NOT ILIKE '%dispatch_blocked%' OR v_detail NOT ILIKE '%resource_overlap%' THEN
        RAISE EXCEPTION 'resource overlap expected dispatch_blocked, got % / %', v_err, v_detail;
      END IF;
  END;

  BEGIN
    PERFORM save_job_dispatch(jsonb_build_object(
      'job_id', v_job,
      'expected_updated_at', v_expected,
      'assigned_team', jsonb_build_array(v_member),
      'resource_ids', '[]'::jsonb,
      'skill_requirements', '[]'::jsonb,
      'resource_requirements', '[]'::jsonb,
      'required_crew_count', 0,
      'dispatch_ready', false,
      'scheduled_date', CURRENT_DATE,
      'start_time', '10:00:00',
      'end_time', '12:00:00',
      'overridden', false,
      'event_kind', 'assign',
      'idempotency_key', 'm6-sec-crew-overlap-01'
    ));
    RAISE EXCEPTION 'timed crew overlap should have been rejected';
  EXCEPTION
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
      IF v_err ILIKE '%should have been rejected%' THEN RAISE; END IF;
      IF v_err NOT ILIKE '%dispatch_blocked%' OR v_detail NOT ILIKE '%crew_timed_overlap%' THEN
        RAISE EXCEPTION 'crew overlap expected dispatch_blocked, got % / %', v_err, v_detail;
      END IF;
  END;

  BEGIN
    PERFORM save_job_dispatch(jsonb_build_object(
      'job_id', v_job,
      'expected_updated_at', v_expected,
      'assigned_team', '[]'::jsonb,
      'resource_ids', '[]'::jsonb,
      'skill_requirements', '[]'::jsonb,
      'resource_requirements', jsonb_build_array(jsonb_build_object('resource_id', v_kit, 'quantity', 1)),
      'required_crew_count', 0,
      'dispatch_ready', true,
      'overridden', false,
      'event_kind', 'assign',
      'idempotency_key', 'm6-sec-ready-omit-01'
    ));
    RAISE EXCEPTION 'ready missing resource should have been rejected';
  EXCEPTION
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
      IF v_err ILIKE '%should have been rejected%' THEN RAISE; END IF;
      IF v_err NOT ILIKE '%dispatch_blocked%' OR v_detail NOT ILIKE '%required_resource_missing%' THEN
        RAISE EXCEPTION 'ready omit expected dispatch_blocked, got % / %', v_err, v_detail;
      END IF;
  END;

  SELECT count(*) INTO v_allocs FROM job_resource_allocations WHERE job_id = v_job;
  SELECT count(*) INTO v_events FROM dispatch_events WHERE job_id = v_job;
  SELECT updated_at INTO v_expected FROM jobs WHERE id = v_job;
  IF v_allocs <> v_before_allocs OR v_events <> v_before_events OR v_expected IS DISTINCT FROM v_before_at THEN
    RAISE EXCEPTION 'failed validation wrote rows: allocs %→% events %→%', v_before_allocs, v_allocs, v_before_events, v_events;
  END IF;

  -- Invoking a SECURITY DEFINER as SET ROLE anon segfaults this local image.
  -- Privilege catalog is the safe proof that anon cannot execute the RPC.
  IF has_function_privilege('anon', 'public.save_job_dispatch(jsonb)', 'execute') THEN
    RAISE EXCEPTION 'anon still has execute on save_job_dispatch';
  END IF;
  IF has_function_privilege('public', 'public.save_job_dispatch(jsonb)', 'execute') THEN
    RAISE EXCEPTION 'PUBLIC still has execute on save_job_dispatch';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_member::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM save_job_dispatch(jsonb_build_object(
      'job_id', v_job,
      'expected_updated_at', v_expected,
      'assigned_team', jsonb_build_array(v_member),
      'resource_ids', '[]'::jsonb,
      'skill_requirements', '[]'::jsonb,
      'resource_requirements', '[]'::jsonb,
      'required_crew_count', 0,
      'dispatch_ready', false,
      'scheduled_date', CURRENT_DATE,
      'start_time', '13:00:00',
      'end_time', '14:00:00',
      'override_reason', 'please',
      'overridden', true,
      'event_kind', 'override',
      'idempotency_key', 'm6-sec-member-override-01'
    ));
    RAISE EXCEPTION 'member override should have been rejected';
  EXCEPTION
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      IF v_err ILIKE '%should have been rejected%' THEN RAISE; END IF;
      IF v_err NOT ILIKE '%override_forbidden%' THEN
        RAISE EXCEPTION 'member override expected override_forbidden, got %', v_err;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM save_job_dispatch(jsonb_build_object(
      'job_id', v_job,
      'expected_updated_at', v_expected,
      'assigned_team', jsonb_build_array(v_member),
      'resource_ids', '[]'::jsonb,
      'skill_requirements', '[]'::jsonb,
      'resource_requirements', '[]'::jsonb,
      'required_crew_count', 0,
      'dispatch_ready', false,
      'scheduled_date', CURRENT_DATE,
      'start_time', '13:00:00',
      'end_time', '14:00:00',
      'overridden', false,
      'event_kind', 'assign',
      'idempotency_key', 'm6-sec-admin-soft-noreason'
    ));
    RAISE EXCEPTION 'admin soft without reason should have been rejected';
  EXCEPTION
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      IF v_err ILIKE '%should have been rejected%' THEN RAISE; END IF;
      IF v_err NOT ILIKE '%override_reason_required%' THEN
        RAISE EXCEPTION 'admin soft expected override_reason_required, got %', v_err;
      END IF;
  END;

  SELECT count(*) INTO v_allocs FROM job_resource_allocations WHERE job_id = v_job;
  SELECT count(*) INTO v_events FROM dispatch_events WHERE job_id = v_job;
  IF v_allocs <> v_before_allocs OR v_events <> v_before_events THEN
    RAISE EXCEPTION 'soft rejects wrote rows';
  END IF;

  v_ok := save_job_dispatch(jsonb_build_object(
    'job_id', v_job,
    'expected_updated_at', v_expected,
    'assigned_team', jsonb_build_array(v_member),
    'resource_ids', '[]'::jsonb,
    'skill_requirements', '[]'::jsonb,
    'resource_requirements', '[]'::jsonb,
    'required_crew_count', 0,
    'dispatch_ready', false,
    'scheduled_date', CURRENT_DATE,
    'start_time', '13:00:00',
    'end_time', '14:00:00',
    'override_reason', 'second tech arriving later',
    'overridden', false,
    'event_kind', 'assign',
    'idempotency_key', 'm6-sec-admin-soft-reason'
  ));
  IF (v_ok->>'ok')::boolean IS DISTINCT FROM true OR (v_ok->>'overridden')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'admin soft with reason should succeed, got %', v_ok;
  END IF;

  SELECT updated_at INTO v_expected FROM jobs WHERE id = v_job;
  DELETE FROM dispatch_events WHERE job_id = v_job;
  DELETE FROM job_resource_allocations WHERE job_id = v_job;
  UPDATE jobs
  SET assigned_team = '[]'::jsonb,
      dispatch_ready = false,
      required_crew_count = 0,
      last_dispatch_override_at = NULL,
      last_dispatch_override_reason = NULL,
      updated_at = clock_timestamp()
  WHERE id = v_job
  RETURNING updated_at INTO v_expected;

  PERFORM set_config('request.jwt.claim.sub', v_other_user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_user, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM save_job_dispatch(jsonb_build_object(
      'job_id', v_job,
      'expected_updated_at', v_expected,
      'assigned_team', '[]'::jsonb,
      'resource_ids', '[]'::jsonb,
      'skill_requirements', '[]'::jsonb,
      'resource_requirements', '[]'::jsonb,
      'required_crew_count', 0,
      'dispatch_ready', false,
      'overridden', false,
      'event_kind', 'assign',
      'idempotency_key', 'm6-sec-cross-company-01'
    ));
    RAISE EXCEPTION 'cross-company write should have been rejected';
  EXCEPTION
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      IF v_err ILIKE '%should have been rejected%' THEN RAISE; END IF;
      IF v_err NOT ILIKE '%tenant_mismatch%' THEN
        RAISE EXCEPTION 'cross-company expected tenant_mismatch, got %', v_err;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM save_job_dispatch(jsonb_build_object(
      'job_id', v_job,
      'expected_updated_at', v_expected,
      'assigned_team', '[]'::jsonb,
      'resource_ids', jsonb_build_array(v_other_res),
      'skill_requirements', '[]'::jsonb,
      'resource_requirements', '[]'::jsonb,
      'required_crew_count', 0,
      'dispatch_ready', false,
      'overridden', false,
      'event_kind', 'assign',
      'idempotency_key', 'm6-sec-foreign-resource-01'
    ));
    RAISE EXCEPTION 'foreign resource should have been rejected';
  EXCEPTION
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      IF v_err ILIKE '%should have been rejected%' THEN RAISE; END IF;
      IF v_err NOT ILIKE '%tenant_mismatch%' THEN
        RAISE EXCEPTION 'foreign resource expected tenant_mismatch, got %', v_err;
      END IF;
  END;

  v_first := save_job_dispatch(jsonb_build_object(
    'job_id', v_job,
    'expected_updated_at', v_expected,
    'assigned_team', '[]'::jsonb,
    'resource_ids', jsonb_build_array(v_fluke),
    'skill_requirements', '[]'::jsonb,
    'resource_requirements', jsonb_build_array(jsonb_build_object('resource_id', v_fluke, 'quantity', 1)),
    'required_crew_count', 0,
    'dispatch_ready', false,
    'overridden', false,
    'event_kind', 'assign',
    'idempotency_key', 'm6-sec-retry-key-0001'
  ));
  IF coalesce((v_first->>'replayed')::boolean, false) THEN
    RAISE EXCEPTION 'first save should not replay';
  END IF;

  v_retry := save_job_dispatch(jsonb_build_object(
    'job_id', v_job,
    'expected_updated_at', v_expected,
    'assigned_team', '[]'::jsonb,
    'resource_ids', jsonb_build_array(v_fluke),
    'skill_requirements', '[]'::jsonb,
    'resource_requirements', jsonb_build_array(jsonb_build_object('resource_id', v_fluke, 'quantity', 1)),
    'required_crew_count', 0,
    'dispatch_ready', false,
    'overridden', false,
    'event_kind', 'assign',
    'idempotency_key', 'm6-sec-retry-key-0001'
  ));
  IF (v_retry->>'replayed')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'retry should replay';
  END IF;
  IF (v_retry->>'event_id') IS DISTINCT FROM (v_first->>'event_id') THEN
    RAISE EXCEPTION 'retry minted a second event';
  END IF;

  SELECT count(*) INTO v_allocs FROM job_resource_allocations WHERE job_id = v_job;
  SELECT count(*) INTO v_events FROM dispatch_events WHERE job_id = v_job AND idempotency_key = 'm6-sec-retry-key-0001';
  IF v_allocs <> 1 OR v_events <> 1 THEN
    RAISE EXCEPTION 'retry left % allocations and % events', v_allocs, v_events;
  END IF;

  BEGIN
    PERFORM save_job_dispatch(jsonb_build_object(
      'job_id', v_job,
      'expected_updated_at', v_expected,
      'assigned_team', '[]'::jsonb,
      'resource_ids', jsonb_build_array(v_fluke),
      'skill_requirements', '[]'::jsonb,
      'resource_requirements', '[]'::jsonb,
      'required_crew_count', 0,
      'dispatch_ready', false,
      'overridden', false,
      'event_kind', 'assign',
      'idempotency_key', 'm6-sec-stale-key-0001'
    ));
    RAISE EXCEPTION 'stale write should have been rejected';
  EXCEPTION
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      IF v_err ILIKE '%should have been rejected%' THEN RAISE; END IF;
      IF v_err NOT ILIKE '%stale_dispatch%' THEN
        RAISE EXCEPTION 'stale write expected stale_dispatch, got %', v_err;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_other_user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_seen FROM dispatch_resources WHERE company_id = v_bts;
  IF v_seen <> 0 THEN
    RAISE EXCEPTION 'other company should not see BTS resources via RLS, saw %', v_seen;
  END IF;

  BEGIN
    INSERT INTO dispatch_events (company_id, job_id, kind, payload, idempotency_key)
    VALUES (v_bts, v_job, 'assign', '{}'::jsonb, 'm6-sec-direct-event');
    RAISE EXCEPTION 'authenticated must not insert dispatch_events';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      IF v_err ILIKE '%must not insert%' THEN RAISE; END IF;
      IF v_err ILIKE '%permission denied%' OR v_err ILIKE '%row-level security%' THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'direct event insert expected privilege/RLS deny, got %', v_err;
      END IF;
  END;

  BEGIN
    INSERT INTO job_resource_allocations (company_id, job_id, resource_id)
    VALUES (v_bts, v_job, v_fluke);
    RAISE EXCEPTION 'authenticated must not insert allocations';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN others THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      IF v_err ILIKE '%must not insert%' THEN RAISE; END IF;
      IF v_err ILIKE '%permission denied%' OR v_err ILIKE '%row-level security%' THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'direct allocation insert expected privilege/RLS deny, got %', v_err;
      END IF;
  END;

  RESET ROLE;
  RAISE NOTICE 'local-m6-dispatch-security: server validation, override policy, tenant, stale, retry, and RLS checks passed';
END $$;

-- Separate transaction so the next two client sessions do not wait on this script.
DO $$
DECLARE
  v_admin uuid := '30489446-fc8e-4950-9974-13a0711cbe97';
  v_hold uuid := 'ffffffff-0000-4000-8000-000000000006';
  v_race uuid := '11111111-0000-4000-8000-000000000007';
  v_kit uuid;
  v_hold_at timestamptz;
  v_race_at timestamptz;
BEGIN
  SELECT id INTO v_kit FROM dispatch_resources WHERE name = 'M6 Race Kit' LIMIT 1;
  DELETE FROM job_resource_allocations WHERE job_id IN (v_hold, v_race) AND resource_id = v_kit;
  DELETE FROM dispatch_events WHERE job_id IN (v_hold, v_race);
  UPDATE jobs
  SET assigned_team = '[]'::jsonb,
      scheduled_date = CURRENT_DATE,
      start_time = '09:00:00',
      end_time = '11:00:00',
      updated_at = clock_timestamp()
  WHERE id = v_hold
  RETURNING updated_at INTO v_hold_at;
  UPDATE jobs
  SET assigned_team = '[]'::jsonb,
      scheduled_date = CURRENT_DATE,
      start_time = '09:00:00',
      end_time = '11:00:00',
      updated_at = clock_timestamp()
  WHERE id = v_race
  RETURNING updated_at INTO v_race_at;
END $$;

-- Concurrent clients: scripts/local-m6-dispatch-race.ps1
-- (m6-sec-race-hold-01 / m6-sec-race-job-01). Two docker psql sessions.
