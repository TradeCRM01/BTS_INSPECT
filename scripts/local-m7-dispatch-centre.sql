-- LOCAL SANDBOX ONLY
-- Not a production migration.
-- Dense fictional Schedule / Dispatch Centre fixtures for Milestone 7.
-- Apply to local Docker only. Idempotent (NOT EXISTS / fixed titles).

DO $$
DECLARE
  v_bts uuid;
  v_admin uuid := '30489446-fc8e-4950-9974-13a0711cbe97';
  v_member uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  v_client uuid;
  v_ewp uuid;
  v_today date := CURRENT_DATE;
BEGIN
  SELECT id INTO v_bts FROM companies WHERE name = 'Building Technology Solutions';
  IF v_bts IS NULL THEN
    RAISE EXCEPTION 'local BTS company missing';
  END IF;

  SELECT id INTO v_client FROM clients WHERE company_id = v_bts ORDER BY created_at LIMIT 1;
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'local client missing';
  END IF;

  SELECT id INTO v_ewp FROM dispatch_resources WHERE company_id = v_bts AND name = 'EWP-1';

  INSERT INTO jobs (
    id, company_id, created_by, client_id, title, status, scheduled_date, start_time, end_time,
    assigned_team, address
  )
  SELECT '22222222-0000-4000-8000-000000000010', v_bts, v_admin, v_client,
    'LOCAL M7 timed switchboard', 'scheduled', v_today, '08:00:00', '10:00:00',
    jsonb_build_array(v_admin), '12 Local Yard'
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = '22222222-0000-4000-8000-000000000010');

  INSERT INTO jobs (
    id, company_id, created_by, client_id, title, status, scheduled_date, start_time, end_time,
    assigned_team, address
  )
  SELECT '22222222-0000-4000-8000-000000000011', v_bts, v_admin, v_client,
    'LOCAL M7 overlap callout', 'in_progress', v_today, '09:00:00', '11:00:00',
    jsonb_build_array(v_admin), '14 Local Yard'
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = '22222222-0000-4000-8000-000000000011');

  INSERT INTO jobs (
    id, company_id, created_by, client_id, title, status, scheduled_date, start_time, end_time,
    assigned_team, address
  )
  SELECT '22222222-0000-4000-8000-000000000012', v_bts, v_admin, v_client,
    'LOCAL M7 late over hours', 'scheduled', v_today, '15:00:00', '18:00:00',
    jsonb_build_array(v_admin), '16 Local Yard'
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = '22222222-0000-4000-8000-000000000012');

  INSERT INTO jobs (
    id, company_id, created_by, client_id, title, status, scheduled_date, start_time, end_time,
    assigned_team, address
  )
  SELECT '22222222-0000-4000-8000-000000000013', v_bts, v_admin, v_client,
    'LOCAL M7 untimed day job', 'scheduled', v_today, NULL, NULL,
    jsonb_build_array(v_member), '18 Local Yard'
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = '22222222-0000-4000-8000-000000000013');

  INSERT INTO jobs (
    id, company_id, created_by, client_id, title, status, scheduled_date, start_time, end_time,
    assigned_team, address
  )
  SELECT '22222222-0000-4000-8000-000000000014', v_bts, v_admin, v_client,
    'LOCAL M7 unassigned slot', 'scheduled', v_today, '10:00:00', '12:00:00',
    '[]'::jsonb, '20 Local Yard'
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = '22222222-0000-4000-8000-000000000014');

  INSERT INTO jobs (
    id, company_id, created_by, client_id, title, status, scheduled_date, start_time, end_time,
    assigned_team, address
  )
  SELECT '22222222-0000-4000-8000-000000000015', v_bts, v_admin, v_client,
    'LOCAL M7 no date queue', 'scheduled', NULL, NULL, NULL,
    '[]'::jsonb, '22 Local Yard'
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = '22222222-0000-4000-8000-000000000015');

  INSERT INTO jobs (
    id, company_id, created_by, client_id, title, status, scheduled_date, start_time, end_time,
    assigned_team, address, dispatch_ready, required_crew_count
  )
  SELECT '22222222-0000-4000-8000-000000000016', v_bts, v_admin, v_client,
    'LOCAL M7 hard EWP ready', 'scheduled', v_today, '13:00:00', '14:00:00',
    jsonb_build_array(v_member), '24 Local Yard', true, 1
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = '22222222-0000-4000-8000-000000000016');

  INSERT INTO jobs (
    id, company_id, created_by, client_id, title, status, scheduled_date, start_time, end_time,
    assigned_team, address, last_dispatch_override_at, last_dispatch_override_reason
  )
  SELECT '22222222-0000-4000-8000-000000000017', v_bts, v_admin, v_client,
    'LOCAL M7 override recorded', 'scheduled', v_today, '07:30:00', '08:30:00',
    jsonb_build_array(v_member), '26 Local Yard', now(), 'LOCAL M7 paper ticket on site'
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = '22222222-0000-4000-8000-000000000017');

  IF v_ewp IS NOT NULL THEN
    INSERT INTO job_resource_requirements (company_id, job_id, resource_id, quantity)
    SELECT v_bts, '22222222-0000-4000-8000-000000000016', v_ewp, 1
    WHERE NOT EXISTS (
      SELECT 1 FROM job_resource_requirements r
      WHERE r.job_id = '22222222-0000-4000-8000-000000000016' AND r.resource_id = v_ewp
    );
    INSERT INTO job_resource_allocations (company_id, job_id, resource_id)
    SELECT v_bts, '22222222-0000-4000-8000-000000000016', v_ewp
    WHERE NOT EXISTS (
      SELECT 1 FROM job_resource_allocations a
      WHERE a.job_id = '22222222-0000-4000-8000-000000000016' AND a.resource_id = v_ewp
    );
  END IF;

  INSERT INTO jobs (
    id, company_id, created_by, client_id, title, status, scheduled_date, start_time, end_time,
    assigned_team, address
  )
  SELECT '22222222-0000-4000-8000-000000000018', v_bts, v_admin, v_client,
    'LOCAL M7 ends exactly 5pm', 'scheduled', v_today, '16:00:00', '17:00:00',
    jsonb_build_array(v_admin), '28 Local Yard'
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = '22222222-0000-4000-8000-000000000018');

  INSERT INTO jobs (
    id, company_id, created_by, client_id, title, status, scheduled_date, start_time, end_time,
    assigned_team, address
  )
  SELECT '22222222-0000-4000-8000-000000000019', v_bts, v_admin, v_client,
    'LOCAL M7 spans 5pm isolated', 'scheduled', v_today, '15:00:00', '18:00:00',
    jsonb_build_array(v_member), '30 Local Yard'
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = '22222222-0000-4000-8000-000000000019');

  INSERT INTO jobs (
    id, company_id, created_by, client_id, title, status, scheduled_date, start_time, end_time,
    assigned_team, address
  )
  SELECT '22222222-0000-4000-8000-000000000020', v_bts, v_admin, v_client,
    'LOCAL M7 starts before 7am', 'scheduled', v_today, '05:30:00', '07:30:00',
    jsonb_build_array(v_admin), '32 Local Yard'
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = '22222222-0000-4000-8000-000000000020');

  INSERT INTO jobs (
    id, company_id, created_by, client_id, title, status, scheduled_date, start_time, end_time,
    assigned_team, address
  )
  SELECT '22222222-0000-4000-8000-000000000021', v_bts, v_admin, v_client,
    'LOCAL M7 starts after 8pm', 'scheduled', v_today, '21:00:00', '22:00:00',
    jsonb_build_array(v_member), '34 Local Yard'
  WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = '22222222-0000-4000-8000-000000000021');

  INSERT INTO staff_hours (company_id, member_id, date, working, start_time, end_time, reason)
  SELECT v_bts, v_admin, v_today, true, '07:00', '16:00', 'LOCAL M7 usual day'
  WHERE NOT EXISTS (
    SELECT 1 FROM staff_hours h WHERE h.member_id = v_admin AND h.date = v_today
  );
END $$;
