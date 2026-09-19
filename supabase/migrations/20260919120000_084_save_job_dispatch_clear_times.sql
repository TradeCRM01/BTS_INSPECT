-- Explicit null clocks and interval rejection for save_job_dispatch.
-- CREATE OR REPLACE only. Safe on a fresh database and on a database that
-- already received save_job_dispatch_clear_times / save_job_dispatch_clock_semantics.
-- A present JSON null clears a clock. An omitted key keeps the stored clock.
-- End equal to or before start raises invalid_interval. Hours stay on 068_staff_hours.

CREATE OR REPLACE FUNCTION public.dispatch_json_clock(p jsonb, key text, fallback text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p IS NULL OR key IS NULL OR NOT (p ? key) THEN fallback
    ELSE nullif(btrim(p ->> key), '')
  END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_json_clock(jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_json_clock(jsonb, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_job_dispatch(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_job_company uuid;
  v_role text;
  v_job_id uuid := (p->>'job_id')::uuid;
  v_expected timestamptz := (p->>'expected_updated_at')::timestamptz;
  v_new_updated timestamptz;
  v_locked_updated timestamptz;
  v_version integer;
  v_event_id uuid;
  v_kind text;
  v_key text := p->>'idempotency_key';
  v_reason text := nullif(btrim(coalesce(p->>'override_reason', '')), '');
  v_team jsonb := coalesce(p->'assigned_team', '[]'::jsonb);
  v_ready boolean := coalesce((p->>'dispatch_ready')::boolean, false);
  v_crew integer := coalesce((p->>'required_crew_count')::integer, 0);
  v_reschedule boolean := coalesce((p->>'reschedule')::boolean, false);
  v_overridden boolean := false;
  v_job_status text;
  v_job_date date;
  v_job_start text;
  v_job_end text;
  v_date date;
  v_start text;
  v_end text;
  v_start_m integer;
  v_end_m integer;
  v_res_start integer;
  v_res_end integer;
  v_today date := (timezone('Australia/Perth', clock_timestamp()))::date;
  v_conflicts jsonb := '[]'::jsonb;
  v_hard jsonb;
  v_soft jsonb;
  v_skill record;
  v_req record;
  v_alloc uuid;
  v_res record;
  v_ok integer;
  v_expired integer;
  v_match integer;
  v_need integer;
  v_label text;
  v_who text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_job_id IS NULL OR v_expected IS NULL OR v_key IS NULL OR length(v_key) < 8 THEN
    RAISE EXCEPTION 'invalid_dispatch_payload' USING ERRCODE = '22023';
  END IF;

  SELECT p.company_id, p.role INTO v_company, v_role
  FROM public.profiles p
  WHERE p.id = v_uid;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(v_team) AS x
    WHERE NOT EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = x::uuid AND pr.company_id = v_company
    )
  ) THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(p->'skill_requirements', '[]'::jsonb)) AS x
    WHERE nullif(x->>'skill_id', '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.dispatch_skills s
        WHERE s.id = (x->>'skill_id')::uuid AND s.company_id = v_company
      )
  ) THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(p->'resource_requirements', '[]'::jsonb)) AS x
    WHERE nullif(x->>'resource_id', '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.dispatch_resources r
        WHERE r.id = (x->>'resource_id')::uuid AND r.company_id = v_company
      )
  ) THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(coalesce(p->'resource_ids', '[]'::jsonb)) AS x
    WHERE nullif(x, '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.dispatch_resources r
        WHERE r.id = x::uuid AND r.company_id = v_company
      )
  ) THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT j.company_id, j.status, j.scheduled_date, j.start_time, j.end_time, j.updated_at, j.dispatch_version
  INTO v_job_company, v_job_status, v_job_date, v_job_start, v_job_end, v_locked_updated, v_version
  FROM public.jobs j
  WHERE j.id = v_job_id
  FOR UPDATE;

  IF NOT FOUND OR v_job_company IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT e.id, j.updated_at, j.dispatch_version
  INTO v_event_id, v_new_updated, v_version
  FROM public.dispatch_events e
  JOIN public.jobs j ON j.id = e.job_id
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

  IF v_locked_updated IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'stale_dispatch' USING ERRCODE = '40001';
  END IF;

  v_date := coalesce(nullif(p->>'scheduled_date', '')::date, v_job_date);
  v_start := public.dispatch_json_clock(p, 'start_time', v_job_start);
  v_end := public.dispatch_json_clock(p, 'end_time', v_job_end);
  v_start_m := public.dispatch_time_to_minutes(v_start);
  v_end_m := public.dispatch_time_to_minutes(v_end);
  IF v_start_m IS NOT NULL AND v_end_m IS NOT NULL AND v_end_m <= v_start_m THEN
    RAISE EXCEPTION 'invalid_interval' USING ERRCODE = '22007';
  END IF;
  IF v_start_m IS NOT NULL THEN
    v_res_start := v_start_m;
    v_res_end := CASE WHEN v_end_m IS NOT NULL THEN v_end_m ELSE v_start_m + 60 END;
    v_end_m := v_res_end;
  ELSIF v_date IS NOT NULL THEN
    v_res_start := 0;
    v_res_end := 24 * 60;
  END IF;

  IF jsonb_array_length(v_team) > 0 THEN
    PERFORM pr.id
    FROM public.profiles pr
    WHERE pr.company_id = v_company
      AND pr.id IN (SELECT x::uuid FROM jsonb_array_elements_text(v_team) AS x)
    ORDER BY pr.id
    FOR UPDATE;
  END IF;

  IF jsonb_array_length(coalesce(p->'resource_ids', '[]'::jsonb)) > 0 THEN
    PERFORM r.id
    FROM public.dispatch_resources r
    WHERE r.company_id = v_company
      AND r.id IN (
        SELECT x::uuid
        FROM jsonb_array_elements_text(p->'resource_ids') AS x
        WHERE nullif(x, '') IS NOT NULL
      )
    ORDER BY r.id
    FOR UPDATE;
  END IF;

  IF v_crew > 0 AND jsonb_array_length(v_team) < v_crew THEN
    v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
      'kind', 'crew_count_short',
      'severity', CASE WHEN v_ready THEN 'hard' ELSE 'soft' END,
      'message', format('Needs %s crew; %s assigned.', v_crew, jsonb_array_length(v_team)),
      'overridable', NOT v_ready
    ));
  END IF;

  FOR v_skill IN
    SELECT (x->>'skill_id')::uuid AS skill_id, coalesce((x->>'min_holders')::integer, 1) AS min_holders
    FROM jsonb_array_elements(coalesce(p->'skill_requirements', '[]'::jsonb)) AS x
    WHERE nullif(x->>'skill_id', '') IS NOT NULL
  LOOP
    SELECT s.name INTO v_label FROM public.dispatch_skills s WHERE s.id = v_skill.skill_id;
    v_ok := 0;
    v_expired := 0;
    SELECT
      count(*) FILTER (
        WHERE q.expires_on IS NULL OR q.expires_on >= v_today
      ),
      count(*) FILTER (
        WHERE q.expires_on IS NOT NULL AND q.expires_on < v_today
      )
    INTO v_ok, v_expired
    FROM jsonb_array_elements_text(v_team) AS mem
    JOIN public.dispatch_member_qualifications q
      ON q.company_id = v_company
     AND q.member_id = mem::uuid
     AND q.skill_id = v_skill.skill_id;
    IF v_ok >= v_skill.min_holders THEN
      CONTINUE;
    END IF;
    IF v_expired > 0 AND v_ok + v_expired >= v_skill.min_holders THEN
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'kind', 'expired_qualification',
        'severity', 'hard',
        'message', format('%s has expired.', coalesce(v_label, 'required ticket')),
        'overridable', false
      ));
    ELSE
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'kind', 'missing_qualification',
        'severity', 'hard',
        'message', format('Needs qualified crew for %s.', coalesce(v_label, 'required ticket')),
        'overridable', false
      ));
    END IF;
  END LOOP;

  FOR v_req IN
    SELECT
      nullif(x->>'resource_id', '')::uuid AS resource_id,
      nullif(x->>'category', '') AS category,
      coalesce((x->>'quantity')::integer, 1) AS quantity
    FROM jsonb_array_elements(coalesce(p->'resource_requirements', '[]'::jsonb)) AS x
  LOOP
    v_need := v_req.quantity;
    SELECT count(*) INTO v_match
    FROM jsonb_array_elements_text(coalesce(p->'resource_ids', '[]'::jsonb)) AS x
    JOIN public.dispatch_resources r
      ON r.id = x::uuid AND r.company_id = v_company
    WHERE (v_req.resource_id IS NOT NULL AND r.id = v_req.resource_id)
       OR (v_req.resource_id IS NULL AND v_req.category IS NOT NULL AND r.category = v_req.category);
    IF v_match < v_need THEN
      IF v_req.resource_id IS NOT NULL THEN
        SELECT r.name INTO v_label FROM public.dispatch_resources r WHERE r.id = v_req.resource_id;
      ELSE
        v_label := v_req.category;
      END IF;
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'kind', 'required_resource_missing',
        'severity', CASE WHEN v_ready THEN 'hard' ELSE 'soft' END,
        'message', format('%s is not allocated.', coalesce(v_label, 'required resource')),
        'overridable', NOT v_ready
      ));
    END IF;
  END LOOP;

  FOR v_alloc IN
    SELECT DISTINCT x::uuid
    FROM jsonb_array_elements_text(coalesce(p->'resource_ids', '[]'::jsonb)) AS x
    WHERE nullif(x, '') IS NOT NULL
  LOOP
    SELECT r.name, r.status INTO v_res
    FROM public.dispatch_resources r
    WHERE r.id = v_alloc AND r.company_id = v_company;
    IF v_res.status = 'out_of_service' THEN
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'kind', 'resource_out_of_service',
        'severity', 'hard',
        'message', format('%s is out of service.', v_res.name),
        'overridable', false
      ));
    END IF;
    IF v_date IS NOT NULL AND v_res_start IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.job_resource_allocations a
      JOIN public.jobs oj ON oj.id = a.job_id
      WHERE a.resource_id = v_alloc
        AND a.job_id <> v_job_id
        AND a.company_id = v_company
        AND oj.status IS DISTINCT FROM 'cancelled'
        AND oj.scheduled_date = v_date
        AND (
          CASE
            WHEN public.dispatch_time_to_minutes(oj.start_time::text) IS NULL THEN 0
            ELSE public.dispatch_time_to_minutes(oj.start_time::text)
          END
        ) < v_res_end
        AND (
          CASE
            WHEN public.dispatch_time_to_minutes(oj.start_time::text) IS NULL THEN 24 * 60
            WHEN public.dispatch_time_to_minutes(oj.end_time::text) IS NOT NULL
              AND public.dispatch_time_to_minutes(oj.end_time::text) > public.dispatch_time_to_minutes(oj.start_time::text)
            THEN public.dispatch_time_to_minutes(oj.end_time::text)
            ELSE public.dispatch_time_to_minutes(oj.start_time::text) + 60
          END
        ) > v_res_start
    ) THEN
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'kind', 'resource_overlap',
        'severity', 'hard',
        'message', format('%s is already booked on that slot.', v_res.name),
        'overridable', false
      ));
    END IF;
  END LOOP;

  IF v_date IS NOT NULL AND v_start_m IS NOT NULL AND jsonb_array_length(v_team) > 0 THEN
    SELECT string_agg(DISTINCT coalesce(pr.name, 'Someone'), ', ')
    INTO v_who
    FROM public.jobs oj
    JOIN jsonb_array_elements_text(oj.assigned_team) AS them ON true
    JOIN jsonb_array_elements_text(v_team) AS mine ON mine = them
    LEFT JOIN public.profiles pr ON pr.id = mine::uuid
    WHERE oj.company_id = v_company
      AND oj.id <> v_job_id
      AND oj.status IS DISTINCT FROM 'cancelled'
      AND oj.scheduled_date = v_date
      AND public.dispatch_time_to_minutes(oj.start_time::text) IS NOT NULL
      AND public.dispatch_time_to_minutes(oj.start_time::text) < v_end_m
      AND v_start_m < CASE
        WHEN public.dispatch_time_to_minutes(oj.end_time::text) IS NOT NULL
          AND public.dispatch_time_to_minutes(oj.end_time::text) > public.dispatch_time_to_minutes(oj.start_time::text)
        THEN public.dispatch_time_to_minutes(oj.end_time::text)
        ELSE public.dispatch_time_to_minutes(oj.start_time::text) + 60
      END;
    IF v_who IS NOT NULL THEN
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'kind', 'crew_timed_overlap',
        'severity', 'hard',
        'message', format('%s already has a timed booking on that slot.', v_who),
        'overridable', false
      ));
    END IF;
  END IF;

  IF v_date IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(v_team) AS mem
      WHERE NOT EXISTS (
        SELECT 1 FROM public.staff_hours h
        WHERE h.company_id = v_company AND h.member_id = mem::uuid AND h.date = v_date
      )
    ) THEN
      SELECT string_agg(coalesce(pr.name, 'Someone'), ', ')
      INTO v_label
      FROM jsonb_array_elements_text(v_team) AS mem
      LEFT JOIN public.profiles pr ON pr.id = mem::uuid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.staff_hours h
        WHERE h.company_id = v_company AND h.member_id = mem::uuid AND h.date = v_date
      );
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'kind', 'hours_unknown',
        'severity', 'soft',
        'message', format('%s has no recorded hours that day — unknown, not blocked.', v_label),
        'overridable', true
      ));
    END IF;
    IF v_start_m IS NOT NULL THEN
      SELECT string_agg(coalesce(pr.name, 'Someone'), ', ')
      INTO v_label
      FROM jsonb_array_elements_text(v_team) AS mem
      JOIN public.staff_hours h
        ON h.company_id = v_company AND h.member_id = mem::uuid AND h.date = v_date
      LEFT JOIN public.profiles pr ON pr.id = mem::uuid
      WHERE h.working
        AND h.start_time IS NOT NULL
        AND h.end_time IS NOT NULL
        AND (
          v_start_m < public.dispatch_time_to_minutes(h.start_time::text)
          OR v_end_m > public.dispatch_time_to_minutes(h.end_time::text)
        );
      IF v_label IS NOT NULL THEN
        v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
          'kind', 'hours_over_window',
          'severity', 'soft',
          'message', format('%s is outside recorded hours.', v_label),
          'overridable', true
        ));
      END IF;
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(c), '[]'::jsonb)
  INTO v_hard
  FROM jsonb_array_elements(v_conflicts) AS c
  WHERE c->>'severity' = 'hard';
  SELECT coalesce(jsonb_agg(c), '[]'::jsonb)
  INTO v_soft
  FROM jsonb_array_elements(v_conflicts) AS c
  WHERE c->>'severity' = 'soft'
    AND c->>'kind' IN ('hours_unknown', 'hours_over_window', 'crew_count_short', 'required_resource_missing');

  IF jsonb_array_length(v_hard) > 0 THEN
    RAISE EXCEPTION 'dispatch_blocked'
      USING ERRCODE = 'P0001',
            DETAIL = jsonb_build_object(
              'code', v_hard->0->>'kind',
              'conflicts', v_conflicts
            )::text;
  END IF;

  IF jsonb_array_length(v_soft) > 0 THEN
    IF v_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'override_forbidden' USING ERRCODE = '42501';
    END IF;
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'override_reason_required' USING ERRCODE = '22023';
    END IF;
    v_overridden := true;
  END IF;

  v_kind := CASE
    WHEN v_overridden THEN 'override'
    WHEN v_reschedule THEN 'reschedule'
    ELSE 'assign'
  END;

  UPDATE public.jobs
  SET
    assigned_team = v_team,
    dispatch_ready = v_ready,
    required_crew_count = v_crew,
    scheduled_date = v_date,
    start_time = v_start::time,
    end_time = v_end::time,
    dispatch_version = dispatch_version + 1,
    updated_at = clock_timestamp(),
    last_dispatch_override_at = CASE WHEN v_overridden THEN clock_timestamp() ELSE last_dispatch_override_at END,
    last_dispatch_override_reason = CASE WHEN v_overridden THEN v_reason ELSE last_dispatch_override_reason END
  WHERE id = v_job_id
    AND company_id = v_company
    AND updated_at = v_expected
  RETURNING updated_at, dispatch_version INTO v_new_updated, v_version;

  IF v_new_updated IS NULL THEN
    RAISE EXCEPTION 'stale_dispatch' USING ERRCODE = '40001';
  END IF;

  DELETE FROM public.job_skill_requirements WHERE job_id = v_job_id AND company_id = v_company;
  INSERT INTO public.job_skill_requirements (company_id, job_id, skill_id, min_holders)
  SELECT v_company, v_job_id, (x->>'skill_id')::uuid, coalesce((x->>'min_holders')::integer, 1)
  FROM jsonb_array_elements(coalesce(p->'skill_requirements', '[]'::jsonb)) AS x
  WHERE x->>'skill_id' IS NOT NULL;

  DELETE FROM public.job_resource_requirements WHERE job_id = v_job_id AND company_id = v_company;
  INSERT INTO public.job_resource_requirements (company_id, job_id, resource_id, category, quantity)
  SELECT
    v_company,
    v_job_id,
    nullif(x->>'resource_id', '')::uuid,
    nullif(x->>'category', ''),
    coalesce((x->>'quantity')::integer, 1)
  FROM jsonb_array_elements(coalesce(p->'resource_requirements', '[]'::jsonb)) AS x;

  DELETE FROM public.job_resource_allocations WHERE job_id = v_job_id AND company_id = v_company;
  INSERT INTO public.job_resource_allocations (company_id, job_id, resource_id)
  SELECT DISTINCT v_company, v_job_id, x::uuid
  FROM jsonb_array_elements_text(coalesce(p->'resource_ids', '[]'::jsonb)) AS x
  WHERE nullif(x, '') IS NOT NULL
  ON CONFLICT (job_id, resource_id) DO NOTHING;

  INSERT INTO public.dispatch_events (company_id, job_id, actor_id, kind, payload, idempotency_key)
  VALUES (
    v_company,
    v_job_id,
    v_uid,
    v_kind,
    jsonb_build_object(
      'conflicts', v_conflicts,
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
    SELECT e.id INTO v_event_id
    FROM public.dispatch_events e
    WHERE e.company_id = v_company AND e.idempotency_key = v_key;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'updated_at', v_new_updated,
    'dispatch_version', v_version,
    'event_id', v_event_id,
    'overridden', v_overridden,
    'conflicts', v_conflicts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_job_dispatch(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_job_dispatch(jsonb) TO authenticated, service_role;

