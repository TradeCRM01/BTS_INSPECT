-- PR-F: enquiry draft columns plus approve and dismiss RPCs.
-- Approve creates one unscheduled human job. No SMS. Job-reminder stays on Perth.

ALTER TABLE public.missed_call_sms_threads
  ADD COLUMN enquiry_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN decided_at timestamptz,
  ADD COLUMN dismiss_reason text,
  ADD COLUMN approved_job_id uuid,
  ADD COLUMN decision_idempotency_key text;

ALTER TABLE public.missed_call_sms_threads
  ADD CONSTRAINT missed_call_sms_threads_enquiry_status_check
    CHECK (enquiry_status IN ('draft', 'approved', 'dismissed')),
  ADD CONSTRAINT missed_call_sms_threads_approved_job_fkey
    FOREIGN KEY (organisation_id, approved_job_id)
    REFERENCES public.jobs(company_id, id),
  ADD CONSTRAINT missed_call_sms_threads_approved_job_id_key
    UNIQUE (approved_job_id),
  ADD CONSTRAINT missed_call_sms_threads_decision_idempotency_key_key
    UNIQUE (decision_idempotency_key);

CREATE OR REPLACE FUNCTION public.approve_missed_call_enquiry(
  p_thread_id uuid,
  p_job jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_company uuid;
  v_thread public.missed_call_sms_threads%ROWTYPE;
  v_title text;
  v_client_id uuid;
  v_job_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF p_thread_id IS NULL OR length(btrim(coalesce(p_idempotency_key, ''))) = 0 THEN
    RAISE EXCEPTION 'thread and idempotency key are required';
  END IF;

  SELECT profile.company_id
  INTO v_company
  FROM public.profiles AS profile
  WHERE profile.id = v_actor;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'not a member of this organisation' USING ERRCODE = '42501';
  END IF;

  SELECT thread.*
  INTO v_thread
  FROM public.missed_call_sms_threads AS thread
  WHERE thread.id = p_thread_id
    AND thread.organisation_id = v_company
  FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public.missed_call_sms_threads AS thread
      WHERE thread.id = p_thread_id
    ) THEN
      RAISE EXCEPTION 'not a member of this organisation' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'enquiry thread not found';
  END IF;

  IF v_thread.enquiry_status <> 'draft' THEN
    IF v_thread.decision_idempotency_key = btrim(p_idempotency_key)
      AND v_thread.enquiry_status = 'approved'
    THEN
      RETURN jsonb_build_object(
        'job_id', v_thread.approved_job_id,
        'replay', true
      );
    END IF;
    RETURN jsonb_build_object(
      'already_decided', true,
      'job_id', v_thread.approved_job_id
    );
  END IF;

  v_client_id := nullif(p_job->>'client_id', '')::uuid;
  IF v_client_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.clients AS client
      WHERE client.id = v_client_id
        AND client.company_id = v_thread.organisation_id
    )
  THEN
    RAISE EXCEPTION 'client does not belong to this organisation' USING ERRCODE = '42501';
  END IF;

  v_title := nullif(btrim(coalesce(p_job->>'title', '')), '');
  IF v_title IS NULL THEN
    v_title := nullif(btrim(coalesce(v_thread.job_service, '')), '');
  END IF;
  IF v_title IS NULL THEN
    v_title := 'Missed-call enquiry';
  END IF;

  INSERT INTO public.jobs (
    company_id,
    client_id,
    title,
    description,
    status,
    scheduled_date,
    start_time,
    assigned_team,
    address,
    created_by,
    created_via
  )
  VALUES (
    v_thread.organisation_id,
    v_client_id,
    v_title,
    nullif(p_job->>'description', ''),
    'scheduled',
    NULL,
    NULL,
    '[]'::jsonb,
    nullif(p_job->>'address', ''),
    v_actor,
    'human'
  )
  RETURNING id INTO v_job_id;

  UPDATE public.missed_call_sms_threads
  SET enquiry_status = 'approved',
      decided_by = v_actor,
      decided_at = now(),
      approved_job_id = v_job_id,
      decision_idempotency_key = btrim(p_idempotency_key),
      updated_at = now()
  WHERE id = v_thread.id
    AND enquiry_status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enquiry was decided by another request';
  END IF;

  RETURN jsonb_build_object(
    'job_id', v_job_id,
    'replay', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_missed_call_enquiry(
  p_thread_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_company uuid;
  v_thread public.missed_call_sms_threads%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF p_thread_id IS NULL OR length(btrim(coalesce(p_idempotency_key, ''))) = 0 THEN
    RAISE EXCEPTION 'thread and idempotency key are required';
  END IF;

  SELECT profile.company_id
  INTO v_company
  FROM public.profiles AS profile
  WHERE profile.id = v_actor;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'not a member of this organisation' USING ERRCODE = '42501';
  END IF;

  SELECT thread.*
  INTO v_thread
  FROM public.missed_call_sms_threads AS thread
  WHERE thread.id = p_thread_id
    AND thread.organisation_id = v_company
  FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM public.missed_call_sms_threads AS thread
      WHERE thread.id = p_thread_id
    ) THEN
      RAISE EXCEPTION 'not a member of this organisation' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'enquiry thread not found';
  END IF;

  IF v_thread.enquiry_status <> 'draft' THEN
    IF v_thread.decision_idempotency_key = btrim(p_idempotency_key)
      AND v_thread.enquiry_status = 'dismissed'
    THEN
      RETURN jsonb_build_object('dismissed', true, 'replay', true);
    END IF;
    RETURN jsonb_build_object(
      'already_decided', true,
      'job_id', v_thread.approved_job_id
    );
  END IF;

  UPDATE public.missed_call_sms_threads
  SET enquiry_status = 'dismissed',
      decided_by = v_actor,
      decided_at = now(),
      dismiss_reason = nullif(btrim(coalesce(p_reason, '')), ''),
      decision_idempotency_key = btrim(p_idempotency_key),
      updated_at = now()
  WHERE id = v_thread.id
    AND enquiry_status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enquiry was decided by another request';
  END IF;

  RETURN jsonb_build_object('dismissed', true, 'replay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_missed_call_enquiry(uuid, jsonb, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.dismiss_missed_call_enquiry(uuid, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.approve_missed_call_enquiry(uuid, jsonb, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_missed_call_enquiry(uuid, text, text)
  TO authenticated;
