-- This migration is intentionally a no-op on the organisations reference project.
DO $companies_phase_2b$
BEGIN
  IF to_regclass('public.companies') IS NULL
    OR to_regclass('public.organisations') IS NOT NULL
  THEN
    RAISE NOTICE 'Skipping companies missed-call Phase 2B on non-companies schema';
    RETURN;
  END IF;

CREATE UNIQUE INDEX jobs_company_id_key
  ON public.jobs (company_id, id);

CREATE UNIQUE INDEX agent_reminders_company_id_key
  ON public.agent_reminders (company_id, id);

CREATE TABLE public.missed_call_sms_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  missed_call_id uuid NOT NULL,
  caller_phone_e164 text NOT NULL CHECK (caller_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  state text NOT NULL DEFAULT 'awaiting_reply'
    CHECK (state IN ('awaiting_reply', 'booking_pending', 'booked', 'office_review', 'opted_out')),
  latest_inbound_message_id uuid,
  booked_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (missed_call_id),
  UNIQUE (organisation_id, id),
  CONSTRAINT missed_call_sms_threads_organisation_sender_fkey
    FOREIGN KEY (organisation_id, sender_id)
    REFERENCES public.organisation_twilio_senders(organisation_id, id),
  CONSTRAINT missed_call_sms_threads_organisation_call_fkey
    FOREIGN KEY (organisation_id, missed_call_id)
    REFERENCES public.missed_calls(organisation_id, id),
  CONSTRAINT missed_call_sms_threads_organisation_message_fkey
    FOREIGN KEY (organisation_id, latest_inbound_message_id)
    REFERENCES public.sms_messages(organisation_id, id),
  CONSTRAINT missed_call_sms_threads_organisation_job_fkey
    FOREIGN KEY (organisation_id, booked_job_id)
    REFERENCES public.jobs(company_id, id)
);

CREATE INDEX missed_call_sms_threads_organisation_updated_idx
  ON public.missed_call_sms_threads (organisation_id, updated_at DESC);

CREATE TABLE public.missed_call_booking_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL,
  inbound_message_id uuid NOT NULL,
  command_kind text NOT NULL CHECK (command_kind = 'book_confirmed_slot'),
  booking_date date NOT NULL,
  booking_time time NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{32}$'),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'booked', 'review')),
  job_id uuid,
  review_reason text CHECK (
    review_reason IS NULL OR review_reason IN ('noneligible', 'ambiguous', 'stop', 'conflict')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (inbound_message_id),
  UNIQUE (organisation_id, thread_id, command_kind, payload_hash),
  UNIQUE (organisation_id, id),
  CONSTRAINT missed_call_booking_commands_organisation_thread_fkey
    FOREIGN KEY (organisation_id, thread_id)
    REFERENCES public.missed_call_sms_threads(organisation_id, id),
  CONSTRAINT missed_call_booking_commands_organisation_message_fkey
    FOREIGN KEY (organisation_id, inbound_message_id)
    REFERENCES public.sms_messages(organisation_id, id),
  CONSTRAINT missed_call_booking_commands_organisation_job_fkey
    FOREIGN KEY (organisation_id, job_id)
    REFERENCES public.jobs(company_id, id)
);

CREATE INDEX missed_call_booking_commands_pending_idx
  ON public.missed_call_booking_commands (created_at)
  WHERE state = 'pending';

CREATE TABLE public.missed_call_office_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  thread_id uuid,
  inbound_message_id uuid NOT NULL,
  reminder_id uuid,
  reason text NOT NULL CHECK (reason IN ('noneligible', 'ambiguous', 'stop', 'conflict')),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inbound_message_id),
  CONSTRAINT missed_call_office_reviews_organisation_thread_fkey
    FOREIGN KEY (organisation_id, thread_id)
    REFERENCES public.missed_call_sms_threads(organisation_id, id),
  CONSTRAINT missed_call_office_reviews_organisation_message_fkey
    FOREIGN KEY (organisation_id, inbound_message_id)
    REFERENCES public.sms_messages(organisation_id, id),
  CONSTRAINT missed_call_office_reviews_organisation_reminder_fkey
    FOREIGN KEY (organisation_id, reminder_id)
    REFERENCES public.agent_reminders(company_id, id)
);

ALTER TABLE public.missed_call_sms_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missed_call_booking_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missed_call_office_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organisation members can view missed-call SMS threads"
  ON public.missed_call_sms_threads FOR SELECT TO authenticated
  USING (
    organisation_id = (
      SELECT profiles.company_id FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Organisation members can view missed-call booking commands"
  ON public.missed_call_booking_commands FOR SELECT TO authenticated
  USING (
    organisation_id = (
      SELECT profiles.company_id FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Organisation members can view missed-call office reviews"
  ON public.missed_call_office_reviews FOR SELECT TO authenticated
  USING (
    organisation_id = (
      SELECT profiles.company_id FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON public.missed_call_sms_threads FROM anon, authenticated;
REVOKE ALL ON public.missed_call_booking_commands FROM anon, authenticated;
REVOKE ALL ON public.missed_call_office_reviews FROM anon, authenticated;
GRANT SELECT ON public.missed_call_sms_threads TO authenticated;
GRANT SELECT ON public.missed_call_booking_commands TO authenticated;
GRANT SELECT ON public.missed_call_office_reviews TO authenticated;
GRANT ALL ON public.missed_call_sms_threads TO service_role;
GRANT ALL ON public.missed_call_booking_commands TO service_role;
GRANT ALL ON public.missed_call_office_reviews TO service_role;

CREATE UNIQUE INDEX jobs_automation_ref_key
  ON public.jobs (automation_ref)
  WHERE automation_ref IS NOT NULL;

ALTER FUNCTION public.ingest_twilio_inbound_sms(text, text, text, text, text, boolean)
  RENAME TO ingest_twilio_inbound_sms_ledger;

CREATE OR REPLACE FUNCTION public.ingest_twilio_inbound_sms(
  p_provider_account_sid text,
  p_provider_message_sid text,
  p_from_phone_e164 text,
  p_to_phone_e164 text,
  p_body text,
  p_is_stop boolean,
  p_reply_kind text,
  p_booking_date date,
  p_booking_time time
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_organisation_id uuid;
  v_message_id uuid;
  v_sender_id uuid;
  v_call_id uuid;
  v_thread public.missed_call_sms_threads%ROWTYPE;
  v_command_id uuid;
  v_payload_hash text;
  v_review_reason text;
  v_review_id uuid;
  v_reminder_id uuid;
  v_review_owner_id uuid;
BEGIN
  IF p_reply_kind NOT IN ('stop', 'confirmed_slot', 'ambiguous', 'noneligible') THEN
    RAISE EXCEPTION 'invalid missed-call reply kind';
  END IF;
  IF p_is_stop IS DISTINCT FROM (p_reply_kind = 'stop') THEN
    RAISE EXCEPTION 'STOP classification mismatch';
  END IF;
  IF (p_reply_kind = 'confirmed_slot') IS DISTINCT FROM
     (p_booking_date IS NOT NULL AND p_booking_time IS NOT NULL) THEN
    RAISE EXCEPTION 'confirmed booking requires one concrete date and time';
  END IF;

  v_result := public.ingest_twilio_inbound_sms_ledger(
    p_provider_account_sid,
    p_provider_message_sid,
    p_from_phone_e164,
    p_to_phone_e164,
    p_body,
    p_is_stop
  );
  IF coalesce((v_result->>'stored')::boolean, false) = false
    OR coalesce((v_result->>'replay')::boolean, false)
  THEN
    RETURN v_result;
  END IF;

  v_organisation_id := (v_result->>'organisation_id')::uuid;
  v_message_id := (v_result->>'message_id')::uuid;

  SELECT sender.id
  INTO v_sender_id
  FROM public.organisation_twilio_senders AS sender
  WHERE sender.organisation_id = v_organisation_id
    AND sender.phone_e164 = p_to_phone_e164
    AND sender.provider_account_sid = p_provider_account_sid;

  SELECT missed.id
  INTO v_call_id
  FROM public.missed_calls AS missed
  WHERE missed.organisation_id = v_organisation_id
    AND missed.sender_id = v_sender_id
    AND missed.from_phone_e164 = p_from_phone_e164
    AND missed.to_phone_e164 = p_to_phone_e164
    AND missed.outbound_message_id IS NOT NULL
    AND missed.received_at >= now() - interval '7 days'
  ORDER BY missed.received_at DESC
  LIMIT 1;

  IF v_call_id IS NOT NULL THEN
    INSERT INTO public.missed_call_sms_threads (
      organisation_id,
      sender_id,
      missed_call_id,
      caller_phone_e164,
      latest_inbound_message_id
    )
    VALUES (
      v_organisation_id,
      v_sender_id,
      v_call_id,
      p_from_phone_e164,
      v_message_id
    )
    ON CONFLICT (missed_call_id) DO UPDATE
    SET latest_inbound_message_id = EXCLUDED.latest_inbound_message_id,
        updated_at = now()
    RETURNING * INTO v_thread;
  END IF;

  IF p_reply_kind = 'stop' THEN
    v_review_reason := 'stop';
    IF v_thread.id IS NOT NULL THEN
      UPDATE public.missed_call_sms_threads
      SET state = 'opted_out', updated_at = now()
      WHERE id = v_thread.id;
    END IF;
  ELSIF v_thread.id IS NULL THEN
    v_review_reason := 'noneligible';
  ELSIF v_thread.state = 'booked' THEN
    v_review_reason := 'conflict';
  ELSIF p_reply_kind = 'ambiguous' THEN
    v_review_reason := 'ambiguous';
  ELSIF p_reply_kind = 'noneligible' THEN
    v_review_reason := 'noneligible';
  ELSE
    v_payload_hash := md5(
      'book_confirmed_slot|' || p_booking_date::text || '|' || p_booking_time::text
    );
    INSERT INTO public.missed_call_booking_commands (
      organisation_id,
      thread_id,
      inbound_message_id,
      command_kind,
      booking_date,
      booking_time,
      payload_hash
    )
    VALUES (
      v_organisation_id,
      v_thread.id,
      v_message_id,
      'book_confirmed_slot',
      p_booking_date,
      p_booking_time,
      v_payload_hash
    )
    ON CONFLICT (organisation_id, thread_id, command_kind, payload_hash) DO UPDATE
    SET payload_hash = EXCLUDED.payload_hash
    RETURNING id INTO v_command_id;

    UPDATE public.missed_call_sms_threads
    SET state = 'booking_pending', updated_at = now()
    WHERE id = v_thread.id;
  END IF;

  IF v_review_reason IS NOT NULL THEN
    INSERT INTO public.missed_call_office_reviews (
      organisation_id,
      thread_id,
      inbound_message_id,
      reason
    )
    VALUES (
      v_organisation_id,
      v_thread.id,
      v_message_id,
      v_review_reason
    )
    ON CONFLICT (inbound_message_id) DO NOTHING;

    SELECT review.id, review.reminder_id
    INTO v_review_id, v_reminder_id
    FROM public.missed_call_office_reviews AS review
    WHERE review.inbound_message_id = v_message_id;

    IF v_reminder_id IS NULL THEN
      SELECT profile.id
      INTO v_review_owner_id
      FROM public.profiles AS profile
      WHERE profile.company_id = v_organisation_id
      ORDER BY (profile.role = 'admin') DESC, profile.created_at, profile.id
      LIMIT 1;

      INSERT INTO public.agent_reminders (
        company_id,
        user_id,
        title,
        details,
        due_date,
        related_type,
        related_id,
        visibility
      )
      VALUES (
        v_organisation_id,
        v_review_owner_id,
        'Review missed-call SMS reply',
        'Reason: ' || replace(v_review_reason, 'noneligible', 'non-eligible')
          || '. Reply from ' || p_from_phone_e164 || '.',
        now(),
        'missed_call_office_review',
        v_review_id,
        'company'
      )
      RETURNING id INTO v_reminder_id;

      UPDATE public.missed_call_office_reviews
      SET reminder_id = v_reminder_id
      WHERE id = v_review_id
        AND reminder_id IS NULL;
    END IF;

    IF v_thread.id IS NOT NULL
      AND v_review_reason <> 'stop'
      AND v_thread.state <> 'booked'
    THEN
      UPDATE public.missed_call_sms_threads
      SET state = 'office_review', updated_at = now()
      WHERE id = v_thread.id;
    END IF;
  END IF;

  RETURN v_result || jsonb_build_object(
    'reply_kind', p_reply_kind,
    'thread_id', v_thread.id,
    'command_id', v_command_id,
    'review_reason', v_review_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_twilio_inbound_sms(
  text, text, text, text, text, boolean, text, date, time
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_twilio_inbound_sms(
  text, text, text, text, text, boolean, text, date, time
) TO service_role;

REVOKE ALL ON FUNCTION public.ingest_twilio_inbound_sms_ledger(
  text, text, text, text, text, boolean
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.process_next_missed_call_booking(p_worker_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_command public.missed_call_booking_commands%ROWTYPE;
  v_thread public.missed_call_sms_threads%ROWTYPE;
  v_message public.sms_messages%ROWTYPE;
  v_sender public.organisation_twilio_senders%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_client_count integer;
  v_client_id uuid;
  v_job_id uuid;
  v_consent_status text;
  v_reason text;
  v_review_id uuid;
  v_reminder_id uuid;
  v_review_owner_id uuid;
BEGIN
  IF length(btrim(coalesce(p_worker_id, ''))) = 0 THEN
    RAISE EXCEPTION 'worker id is required';
  END IF;

  SELECT command.*
  INTO v_command
  FROM public.missed_call_booking_commands AS command
  WHERE command.state = 'pending'
  ORDER BY command.created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('processed', false, 'reason', 'empty');
  END IF;

  SELECT thread.* INTO v_thread
  FROM public.missed_call_sms_threads AS thread
  WHERE thread.organisation_id = v_command.organisation_id
    AND thread.id = v_command.thread_id
  FOR UPDATE;

  SELECT message.* INTO v_message
  FROM public.sms_messages AS message
  WHERE message.organisation_id = v_command.organisation_id
    AND message.id = v_command.inbound_message_id;

  SELECT sender.* INTO v_sender
  FROM public.organisation_twilio_senders AS sender
  WHERE sender.organisation_id = v_command.organisation_id
    AND sender.id = v_thread.sender_id;

  SELECT preference.sms_consent_status
  INTO v_consent_status
  FROM public.communication_preferences AS preference
  WHERE preference.organisation_id = v_command.organisation_id
    AND preference.phone_e164 = v_thread.caller_phone_e164
  FOR SHARE;

  IF v_consent_status = 'opted_out' THEN
    v_reason := 'stop';
  ELSIF v_consent_status IS DISTINCT FROM 'consented' OR NOT v_sender.active THEN
    v_reason := 'noneligible';
  ELSIF v_thread.state <> 'booking_pending'
    OR v_message.direction <> 'inbound'
    OR v_command.booking_date < current_date
  THEN
    v_reason := 'noneligible';
  ELSE
    SELECT count(*)
    INTO v_client_count
    FROM public.clients AS client
    WHERE client.company_id = v_command.organisation_id
      AND client.phone = v_thread.caller_phone_e164
      AND NOT client.archived;

    IF v_client_count <> 1 THEN
      v_reason := 'noneligible';
    ELSE
      SELECT client.id INTO v_client_id
      FROM public.clients AS client
      WHERE client.company_id = v_command.organisation_id
        AND client.phone = v_thread.caller_phone_e164
        AND NOT client.archived;

      SELECT client.* INTO v_client
      FROM public.clients AS client
      WHERE client.company_id = v_command.organisation_id
        AND client.id = v_client_id;

      -- Serialize competing commands for the same organisation slot. The command-row
      -- lock alone only protects retries of one command; this lock prevents two
      -- different missed-call threads from both passing the conflict check.
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          v_command.organisation_id::text || '|' ||
          v_command.booking_date::text || '|' ||
          v_command.booking_time::text,
          0
        )
      );

      IF EXISTS (
        SELECT 1
        FROM public.jobs AS job
        WHERE job.company_id = v_command.organisation_id
          AND job.scheduled_date = v_command.booking_date
          AND job.start_time = v_command.booking_time
          AND job.status <> 'cancelled'
      ) THEN
        v_reason := 'conflict';
      END IF;
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    UPDATE public.missed_call_booking_commands
    SET state = 'review',
        review_reason = v_reason,
        processed_at = now()
    WHERE id = v_command.id;

    UPDATE public.missed_call_sms_threads
    SET state = CASE WHEN v_reason = 'stop' THEN 'opted_out' ELSE 'office_review' END,
        updated_at = now()
    WHERE id = v_thread.id;

    INSERT INTO public.missed_call_office_reviews (
      organisation_id,
      thread_id,
      inbound_message_id,
      reason
    )
    VALUES (
      v_command.organisation_id,
      v_thread.id,
      v_command.inbound_message_id,
      v_reason
    )
    ON CONFLICT (inbound_message_id) DO UPDATE SET reason = EXCLUDED.reason
    RETURNING id, reminder_id INTO v_review_id, v_reminder_id;

    IF v_reminder_id IS NULL THEN
      SELECT profile.id
      INTO v_review_owner_id
      FROM public.profiles AS profile
      WHERE profile.company_id = v_command.organisation_id
      ORDER BY (profile.role = 'admin') DESC, profile.created_at, profile.id
      LIMIT 1;

      INSERT INTO public.agent_reminders (
        company_id,
        user_id,
        title,
        details,
        due_date,
        related_type,
        related_id,
        visibility
      )
      VALUES (
        v_command.organisation_id,
        v_review_owner_id,
        'Review missed-call SMS reply',
        'Reason: ' || replace(v_reason, 'noneligible', 'non-eligible')
          || '. Reply from ' || v_thread.caller_phone_e164 || '.',
        now(),
        'missed_call_office_review',
        v_review_id,
        'company'
      )
      RETURNING id INTO v_reminder_id;

      UPDATE public.missed_call_office_reviews
      SET reminder_id = v_reminder_id
      WHERE id = v_review_id
        AND reminder_id IS NULL;
    END IF;

    RETURN jsonb_build_object(
      'processed', true,
      'booked', false,
      'command_id', v_command.id,
      'review_reason', v_reason
    );
  END IF;

  INSERT INTO public.jobs (
    company_id,
    client_id,
    title,
    status,
    priority,
    scheduled_date,
    start_time,
    end_time,
    address,
    created_by,
    created_via,
    automation_ref
  )
  VALUES (
    v_command.organisation_id,
    v_client.id,
    'Missed-call booking',
    'scheduled',
    'medium',
    v_command.booking_date,
    v_command.booking_time,
    (v_command.booking_time + interval '1 hour')::time,
    v_client.address,
    NULL,
    'missed_call_sms',
    v_command.inbound_message_id
  )
  ON CONFLICT (automation_ref) WHERE automation_ref IS NOT NULL DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    SELECT job.id INTO v_job_id
    FROM public.jobs AS job
    WHERE job.company_id = v_command.organisation_id
      AND job.automation_ref = v_command.inbound_message_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.communication_preferences AS preference
    WHERE preference.organisation_id = v_command.organisation_id
      AND preference.phone_e164 = v_thread.caller_phone_e164
      AND preference.sms_consent_status = 'consented'
  ) THEN
    RAISE EXCEPTION 'SMS consent changed while booking';
  END IF;

  INSERT INTO public.sms_messages (
    organisation_id,
    sender_id,
    direction,
    state,
    from_phone_e164,
    to_phone_e164,
    body,
    provider_account_sid,
    idempotency_key,
    next_attempt
  )
  VALUES (
    v_command.organisation_id,
    v_thread.sender_id,
    'outbound',
    'queued',
    v_sender.phone_e164,
    v_thread.caller_phone_e164,
    'Booked for ' || v_command.booking_date::text || ' at '
      || to_char(v_command.booking_time, 'HH24:MI') || '. Our team will be in touch.',
    v_sender.provider_account_sid,
    'booking-confirmation:' || v_command.id::text || ':' || v_command.payload_hash,
    now()
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  UPDATE public.missed_call_booking_commands
  SET state = 'booked', job_id = v_job_id, processed_at = now()
  WHERE id = v_command.id;

  UPDATE public.missed_call_sms_threads
  SET state = 'booked', booked_job_id = v_job_id, updated_at = now()
  WHERE id = v_thread.id;

  RETURN jsonb_build_object(
    'processed', true,
    'booked', true,
    'command_id', v_command.id,
    'job_id', v_job_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_next_missed_call_booking(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_next_missed_call_booking(text)
  TO service_role;

COMMENT ON TABLE public.missed_call_sms_threads IS
  'State machine for replies associated with an organisation missed-call text-back.';
COMMENT ON TABLE public.missed_call_booking_commands IS
  'Idempotent confirmed-slot commands processed atomically into jobs and confirmation outbox rows.';
COMMENT ON TABLE public.missed_call_office_reviews IS
  'Replies that require office handling because they are ambiguous, noneligible, opted out, or conflicting.';
END;
$companies_phase_2b$;
