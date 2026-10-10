ALTER TABLE public.missed_call_sms_threads
  ALTER COLUMN qualification_required SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.prevent_missed_call_autobook()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'auto-book disabled';
END;
$$;

DROP TRIGGER IF EXISTS prevent_missed_call_autobook ON public.missed_call_booking_commands;
CREATE TRIGGER prevent_missed_call_autobook
BEFORE INSERT ON public.missed_call_booking_commands
FOR EACH ROW
EXECUTE FUNCTION public.prevent_missed_call_autobook();

REVOKE ALL ON FUNCTION public.prevent_missed_call_autobook()
  FROM PUBLIC, anon, authenticated;

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
  v_sender public.organisation_twilio_senders%ROWTYPE;
  v_call_id uuid;
  v_thread public.missed_call_sms_threads%ROWTYPE;
  v_preference public.communication_preferences%ROWTYPE;
  v_previous_status text;
  v_start_allowed boolean := false;
  v_command_id uuid;
  v_review_reason text;
  v_review_id uuid;
  v_reminder_id uuid;
  v_review_owner_id uuid;
  v_response text;
  v_trimmed_body text := btrim(coalesce(p_body, ''));
  v_separator integer;
BEGIN
  IF p_reply_kind NOT IN ('stop', 'start', 'help', 'confirmed_slot', 'ambiguous', 'noneligible') THEN
    RAISE EXCEPTION 'invalid missed-call reply kind';
  END IF;
  IF p_is_stop IS DISTINCT FROM (p_reply_kind = 'stop') THEN
    RAISE EXCEPTION 'STOP classification mismatch';
  END IF;
  IF (p_reply_kind = 'confirmed_slot') IS DISTINCT FROM
     (p_booking_date IS NOT NULL AND p_booking_time IS NOT NULL) THEN
    RAISE EXCEPTION 'confirmed booking requires one concrete date and time';
  END IF;

  SELECT sender.*
  INTO v_sender
  FROM public.organisation_twilio_senders AS sender
  WHERE sender.active
    AND sender.phone_e164 = p_to_phone_e164
    AND sender.provider_account_sid = p_provider_account_sid;

  IF FOUND THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_sender.organisation_id::text || '|' || p_from_phone_e164,
        0
      )
    );
  END IF;

  SELECT preference.sms_consent_status
  INTO v_previous_status
  FROM public.communication_preferences AS preference
  WHERE preference.organisation_id = v_sender.organisation_id
    AND preference.phone_e164 = p_from_phone_e164;

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

  SELECT sender.*
  INTO v_sender
  FROM public.organisation_twilio_senders AS sender
  WHERE sender.organisation_id = v_organisation_id
    AND sender.phone_e164 = p_to_phone_e164
    AND sender.provider_account_sid = p_provider_account_sid;

  SELECT missed.id
  INTO v_call_id
  FROM public.missed_calls AS missed
  WHERE missed.organisation_id = v_organisation_id
    AND missed.sender_id = v_sender.id
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
      latest_inbound_message_id,
      qualification_required
    )
    VALUES (
      v_organisation_id,
      v_sender.id,
      v_call_id,
      p_from_phone_e164,
      v_message_id,
      false
    )
    ON CONFLICT (missed_call_id) DO UPDATE
    SET latest_inbound_message_id = EXCLUDED.latest_inbound_message_id,
        updated_at = now()
    RETURNING * INTO v_thread;
  END IF;

  IF p_reply_kind = 'stop' THEN
    INSERT INTO public.communication_preference_events (
      organisation_id,
      phone_e164,
      inbound_message_id,
      event_kind,
      previous_status,
      resulting_status,
      consent_basis,
      consent_source,
      transition_source
    )
    SELECT
      v_organisation_id,
      p_from_phone_e164,
      v_message_id,
      'stop',
      v_previous_status,
      preference.sms_consent_status,
      preference.consent_basis,
      preference.consent_source,
      'twilio_inbound_stop'
    FROM public.communication_preferences AS preference
    WHERE preference.organisation_id = v_organisation_id
      AND preference.phone_e164 = p_from_phone_e164
    ON CONFLICT (inbound_message_id, event_kind) DO NOTHING;

    v_review_reason := 'stop';
    IF v_thread.id IS NOT NULL THEN
      UPDATE public.missed_call_sms_threads
      SET state = 'opted_out', updated_at = now()
      WHERE id = v_thread.id;
    END IF;
  ELSIF p_reply_kind = 'start' THEN
    SELECT preference.*
    INTO v_preference
    FROM public.communication_preferences AS preference
    WHERE preference.organisation_id = v_organisation_id
      AND preference.phone_e164 = p_from_phone_e164
    FOR UPDATE;

    v_previous_status := v_preference.sms_consent_status;
    v_start_allowed := v_preference.sms_consent_status = 'opted_out'
      AND v_preference.consent_basis IS NOT NULL
      AND v_preference.consent_source IS NOT NULL
      AND v_preference.consented_at IS NOT NULL;

    IF v_start_allowed THEN
      UPDATE public.communication_preferences
      SET sms_consent_status = 'consented',
          opted_out_at = NULL,
          opt_out_source = NULL,
          updated_at = now()
      WHERE organisation_id = v_organisation_id
        AND phone_e164 = p_from_phone_e164
      RETURNING * INTO v_preference;

      IF v_thread.id IS NOT NULL AND v_thread.state = 'opted_out' THEN
        UPDATE public.missed_call_sms_threads
        SET state = CASE
              WHEN booked_job_id IS NOT NULL THEN 'booked'
              WHEN qualification_step = 'complete' THEN 'qualified'
              ELSE 'awaiting_reply'
            END,
            updated_at = now()
        WHERE id = v_thread.id
        RETURNING * INTO v_thread;
      END IF;

      v_response := CASE
        WHEN v_thread.id IS NULL THEN
          'You are opted back in. Text HELP for the missed-call reply guide.'
        WHEN v_thread.booked_job_id IS NOT NULL THEN
          'You are opted back in. This missed-call request is already booked.'
        ELSE CASE coalesce(v_thread.qualification_step, 'job_service')
        WHEN 'urgency' THEN 'You are opted back in. Reply 1 emergency, 2 today, 3 this week, or 4 flexible.'
        WHEN 'contact_area' THEN 'You are opted back in. Text your name and suburb/area, separated by a comma.'
        WHEN 'time_window' THEN 'You are opted back in. What is the best time window for our team to contact you?'
        WHEN 'complete' THEN 'You are opted back in. The office has your request.'
        ELSE 'You are opted back in. What job or service do you need?'
        END
      END;
    END IF;

    INSERT INTO public.communication_preference_events (
      organisation_id,
      phone_e164,
      inbound_message_id,
      event_kind,
      previous_status,
      resulting_status,
      consent_basis,
      consent_source,
      transition_source
    )
    VALUES (
      v_organisation_id,
      p_from_phone_e164,
      v_message_id,
      'start',
      v_previous_status,
      coalesce(v_preference.sms_consent_status, 'unknown'),
      v_preference.consent_basis,
      v_preference.consent_source,
      CASE WHEN v_start_allowed THEN 'twilio_inbound_start' ELSE 'twilio_inbound_start_denied' END
    )
    ON CONFLICT (inbound_message_id, event_kind) DO NOTHING;
  ELSIF p_reply_kind = 'help' THEN
    v_response :=
      'Reply with the job and your suburb and the office will get back to you. Reply STOP to opt out, START to opt back in.';
  ELSIF EXISTS (
    SELECT 1
    FROM public.communication_preferences AS preference
    WHERE preference.organisation_id = v_organisation_id
      AND preference.phone_e164 = p_from_phone_e164
      AND preference.sms_consent_status = 'opted_out'
  ) THEN
    IF v_thread.id IS NOT NULL THEN
      UPDATE public.missed_call_sms_threads
      SET state = 'opted_out', updated_at = now()
      WHERE id = v_thread.id;
    END IF;
  ELSIF v_thread.id IS NULL THEN
    v_review_reason := 'noneligible';
  ELSIF v_thread.state = 'booked' THEN
    v_review_reason := 'conflict';
  ELSIF v_thread.qualification_required
    AND v_thread.qualification_step <> 'complete'
  THEN
    IF v_thread.qualification_step = 'job_service' THEN
      IF lower(v_trimmed_body) IN ('yes', 'yeah', 'yep', 'ok', 'okay', 'book', 'booking')
        OR length(v_trimmed_body) < 3
      THEN
        v_response := 'What job or service do you need? A few words is enough.';
      ELSE
        UPDATE public.missed_call_sms_threads
        SET job_service = left(v_trimmed_body, 500),
            qualification_step = 'urgency',
            state = 'awaiting_reply',
            updated_at = now()
        WHERE id = v_thread.id
        RETURNING * INTO v_thread;
        v_response := 'How urgent? Reply 1 emergency, 2 today, 3 this week, or 4 flexible.';
      END IF;
    ELSIF v_thread.qualification_step = 'urgency' THEN
      IF v_trimmed_body ~ '^[1-4]$' THEN
        UPDATE public.missed_call_sms_threads
        SET urgency = v_trimmed_body::smallint,
            qualification_step = 'contact_area',
            updated_at = now()
        WHERE id = v_thread.id
        RETURNING * INTO v_thread;
        v_response := 'Text your name and suburb/area, separated by a comma.';
      ELSE
        v_response := 'Reply with one number: 1 emergency, 2 today, 3 this week, or 4 flexible.';
      END IF;
    ELSIF v_thread.qualification_step = 'contact_area' THEN
      v_separator := position(',' IN v_trimmed_body);
      IF v_separator > 1
        AND length(btrim(substr(v_trimmed_body, 1, v_separator - 1))) >= 2
        AND length(btrim(substr(v_trimmed_body, v_separator + 1))) >= 2
      THEN
        UPDATE public.missed_call_sms_threads
        SET contact_name = left(btrim(substr(v_trimmed_body, 1, v_separator - 1)), 200),
            service_area = left(btrim(substr(v_trimmed_body, v_separator + 1)), 200),
            qualification_step = 'time_window',
            updated_at = now()
        WHERE id = v_thread.id
        RETURNING * INTO v_thread;
        v_response := 'What is the best time window for our team to contact you?';
      ELSE
        v_response := 'Please text your name and suburb/area, separated by a comma.';
      END IF;
    ELSE
      IF length(v_trimmed_body) < 3
        OR lower(v_trimmed_body) IN ('yes', 'yeah', 'yep', 'nah', 'no', 'idk', 'dunno', 'any')
        OR NOT (
          v_trimmed_body ~* '([0-9]{1,2})(:[0-9]{2})?[[:space:]]*(am|pm)'
          OR v_trimmed_body ~* '(morning|afternoon|evening|weekday|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|anytime|business hours|after work|before work)'
        )
      THEN
        v_response := 'Please give a clear time window, for example weekday morning or 2-4pm.';
      ELSE
        UPDATE public.missed_call_sms_threads
        SET best_time_window = left(v_trimmed_body, 300),
            qualification_step = 'complete',
            qualified_at = now(),
            state = 'qualified',
            updated_at = now()
        WHERE id = v_thread.id
        RETURNING * INTO v_thread;

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
          'Qualified missed-call enquiry',
          'Job: ' || v_thread.job_service
            || '. Urgency: ' || v_thread.urgency::text
            || '. Contact: ' || v_thread.contact_name
            || ', ' || v_thread.service_area
            || '. Best time: ' || v_thread.best_time_window || '.',
          now(),
          'missed_call_sms_thread',
          v_thread.id,
          'company'
        )
        RETURNING id INTO v_reminder_id;

        UPDATE public.missed_call_sms_threads
        SET qualification_reminder_id = v_reminder_id
        WHERE id = v_thread.id;

        v_response := 'Thanks, we have the details. The office will get back to you.';
      END IF;
    END IF;
  ELSIF p_reply_kind IN ('ambiguous', 'noneligible', 'confirmed_slot') THEN
    v_review_reason := CASE
      WHEN p_reply_kind = 'confirmed_slot' THEN 'ambiguous'
      ELSE p_reply_kind
    END;
  END IF;

  IF v_response IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.communication_preferences AS preference
      WHERE preference.organisation_id = v_organisation_id
        AND preference.phone_e164 = p_from_phone_e164
        AND preference.sms_consent_status = 'consented'
    )
  THEN
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
      v_organisation_id,
      v_sender.id,
      'outbound',
      'queued',
      p_to_phone_e164,
      p_from_phone_e164,
      v_response,
      p_provider_account_sid,
      'missed-call-reply:' || v_message_id::text,
      now()
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
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
    'qualification_step', v_thread.qualification_step,
    'qualified', v_thread.qualification_step = 'complete',
    'start_allowed', v_start_allowed,
    'command_id', v_command_id,
    'review_reason', v_review_reason
  );
END;
$$;

