-- PR-I2: per-company ack / thanks / HELP templates.
-- Exactly three fields. Send-time fallback to Jack's approved wording.
-- Admin writes via SECURITY DEFINER RPC. Table writes stay operator-owned.

ALTER TABLE public.sms_automation_settings
  ADD COLUMN IF NOT EXISTS ack_template text,
  ADD COLUMN IF NOT EXISTS thanks_template text,
  ADD COLUMN IF NOT EXISTS help_template text;

CREATE OR REPLACE FUNCTION public.sms_reply_has_forbidden_word(p_body text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    p_body ~* '\m(booked|quote|plumber|electrician|carpenter|tomorrow|today|price|hourly)\M'
    OR position('$' IN p_body) > 0
$$;

REVOKE ALL ON FUNCTION public.sms_reply_has_forbidden_word(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sms_reply_has_forbidden_word(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sms_reply_has_link_or_phone(p_body text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    p_body ~* 'https?://'
    OR p_body ~* '\mwww\.'
    OR p_body ~* '[a-z0-9][a-z0-9-]*\.[a-z]{2,}'
    OR p_body ~ '[0-9]{6,}'
$$;

REVOKE ALL ON FUNCTION public.sms_reply_has_link_or_phone(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sms_reply_has_link_or_phone(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sms_reply_ends_with_stop(p_template text, p_kind text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_kind = 'help' THEN
      rtrim(coalesce(p_template, '')) ~ 'Reply STOP to opt out, START to opt back in\.\s*$'
    ELSE
      rtrim(coalesce(p_template, '')) ~ 'Reply STOP to opt out\.?\s*$'
  END
$$;

REVOKE ALL ON FUNCTION public.sms_reply_ends_with_stop(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sms_reply_ends_with_stop(text, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sms_reply_default_template(p_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE p_kind
    WHEN 'ack' THEN
      'Hi, this is {Business}. Sorry we missed your call. Reply with what you need done and your suburb and we will get back to you. Reply STOP to opt out.'
    WHEN 'thanks' THEN
      'Thanks, got it. We have passed this to the office and someone from {Business} will be in touch. Reply STOP to opt out.'
    WHEN 'help' THEN
      '{Business}: reply with the job and your suburb and the office will get back to you. Reply STOP to opt out, START to opt back in.'
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION public.sms_reply_default_template(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sms_reply_default_template(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sms_reply_render_template(p_template text, p_business_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT replace(coalesce(p_template, ''), '{Business}', coalesce(p_business_name, ''))
$$;

REVOKE ALL ON FUNCTION public.sms_reply_render_template(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sms_reply_render_template(text, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sms_reply_probe_name(p_business_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN char_length(btrim(coalesce(p_business_name, ''))) >= 20
      THEN left(btrim(p_business_name), 20)
    WHEN char_length(btrim(coalesce(p_business_name, ''))) >= 2
      THEN rpad(btrim(p_business_name), 20, 'X')
    ELSE 'XXXXXXXXXXXXXXXXXXXX'
  END
$$;

REVOKE ALL ON FUNCTION public.sms_reply_probe_name(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sms_reply_probe_name(text)
  TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.sms_reply_template_valid(text, text);

CREATE OR REPLACE FUNCTION public.sms_reply_template_valid(
  p_template text,
  p_business_name text,
  p_kind text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_name text := nullif(btrim(coalesce(p_business_name, '')), '');
  v_probe text := public.sms_reply_probe_name(coalesce(v_name, ''));
  v_rendered text := public.sms_reply_render_template(p_template, v_probe);
BEGIN
  IF p_template IS NULL OR btrim(p_template) = '' THEN
    RETURN true;
  END IF;
  IF position('{Business}' IN p_template) = 0
    AND (v_name IS NULL OR position(v_name IN v_rendered) = 0)
  THEN
    RETURN false;
  END IF;
  IF NOT public.sms_reply_ends_with_stop(p_template, p_kind) THEN
    RETURN false;
  END IF;
  IF NOT public.sms_is_gsm7(v_rendered) THEN
    RETURN false;
  END IF;
  IF public.sms_gsm7_length(v_rendered) > 160 THEN
    RETURN false;
  END IF;
  IF public.sms_reply_has_forbidden_word(v_rendered) THEN
    RETURN false;
  END IF;
  IF public.sms_reply_has_link_or_phone(p_template)
    OR public.sms_reply_has_link_or_phone(v_rendered)
  THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_reply_template_valid(text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sms_reply_template_valid(text, text, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sms_reply_approved_body(p_kind text, p_business_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE p_kind
    WHEN 'thanks' THEN public.enquiry_thanks_body(p_business_name)
    WHEN 'help' THEN public.missed_call_help_body(p_business_name)
    ELSE public.missed_call_ack_body(p_business_name)
  END
$$;

REVOKE ALL ON FUNCTION public.sms_reply_approved_body(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_reply_approved_body(text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.sms_company_reply_body(
  p_organisation_id uuid,
  p_kind text,
  p_business_name text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_template text;
  v_rendered text;
BEGIN
  IF p_kind = 'ack' THEN
    SELECT settings.ack_template INTO v_template
    FROM public.sms_automation_settings AS settings
    WHERE settings.organisation_id = p_organisation_id;
  ELSIF p_kind = 'thanks' THEN
    SELECT settings.thanks_template INTO v_template
    FROM public.sms_automation_settings AS settings
    WHERE settings.organisation_id = p_organisation_id;
  ELSIF p_kind = 'help' THEN
    SELECT settings.help_template INTO v_template
    FROM public.sms_automation_settings AS settings
    WHERE settings.organisation_id = p_organisation_id;
  ELSE
    RETURN public.sms_reply_approved_body('ack', p_business_name);
  END IF;

  IF v_template IS NULL OR btrim(v_template) = '' THEN
    RETURN public.sms_reply_approved_body(p_kind, p_business_name);
  END IF;

  v_rendered := public.sms_reply_render_template(v_template, p_business_name);
  IF public.sms_reply_template_valid(v_template, p_business_name, p_kind) THEN
    RETURN v_rendered;
  END IF;
  RETURN public.sms_reply_approved_body(p_kind, p_business_name);
END;
$$;

REVOKE ALL ON FUNCTION public.sms_company_reply_body(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_company_reply_body(uuid, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.save_sms_reply_templates(
  p_ack_template text,
  p_thanks_template text,
  p_help_template text
)
RETURNS public.sms_automation_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_role text;
  v_name text;
  v_ack text;
  v_thanks text;
  v_help text;
  v_row public.sms_automation_settings%ROWTYPE;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT profiles.company_id, profiles.role
  INTO v_org, v_role
  FROM public.profiles
  WHERE profiles.id = v_uid;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_role IS DISTINCT FROM 'admin'
    AND NOT public.is_platform_operator()
  THEN
    RAISE EXCEPTION 'only an admin can change text replies'
      USING ERRCODE = '42501';
  END IF;

  SELECT nullif(btrim(coalesce(settings.business_name, '')), '')
  INTO v_name
  FROM public.sms_automation_settings AS settings
  WHERE settings.organisation_id = v_org;

  v_ack := nullif(btrim(coalesce(p_ack_template, '')), '');
  v_thanks := nullif(btrim(coalesce(p_thanks_template, '')), '');
  v_help := nullif(btrim(coalesce(p_help_template, '')), '');

  IF v_ack = public.sms_reply_default_template('ack') THEN
    v_ack := NULL;
  END IF;
  IF v_thanks = public.sms_reply_default_template('thanks') THEN
    v_thanks := NULL;
  END IF;
  IF v_help = public.sms_reply_default_template('help') THEN
    v_help := NULL;
  END IF;

  IF v_ack IS NOT NULL AND NOT public.sms_reply_template_valid(v_ack, v_name, 'ack') THEN
    RAISE EXCEPTION 'ack template invalid' USING ERRCODE = '23514';
  END IF;
  IF v_thanks IS NOT NULL AND NOT public.sms_reply_template_valid(v_thanks, v_name, 'thanks') THEN
    RAISE EXCEPTION 'thanks template invalid' USING ERRCODE = '23514';
  END IF;
  IF v_help IS NOT NULL AND NOT public.sms_reply_template_valid(v_help, v_name, 'help') THEN
    RAISE EXCEPTION 'help template invalid' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.sms_automation_settings (
    organisation_id,
    ack_template,
    thanks_template,
    help_template
  )
  VALUES (
    v_org,
    v_ack,
    v_thanks,
    v_help
  )
  ON CONFLICT (organisation_id) DO UPDATE
  SET
    ack_template = EXCLUDED.ack_template,
    thanks_template = EXCLUDED.thanks_template,
    help_template = EXCLUDED.help_template,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_sms_reply_templates(text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_sms_reply_templates(text, text, text)
  TO authenticated, service_role;

-- Send path uses company templates, then falls back to the approved default.

CREATE OR REPLACE FUNCTION public.ingest_twilio_voice_status(
  p_provider_account_sid text,
  p_provider_call_sid text,
  p_from_phone_e164 text,
  p_to_phone_e164 text,
  p_call_status text,
  p_direction text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_sender public.organisation_twilio_senders%ROWTYPE;
  v_call public.missed_calls%ROWTYPE;
  v_message_id uuid;
  v_replay boolean := false;
  v_business text;
  v_body text;
  v_hash text;
  v_existing public.sms_messages%ROWTYPE;
  v_ack_key text := 'missed-call-ack:' || p_provider_call_sid;
BEGIN
  IF p_direction <> 'inbound' THEN
    RETURN jsonb_build_object('stored', false, 'reason', 'ineligible_direction');
  END IF;

  SELECT missed.*
  INTO v_call
  FROM public.missed_calls AS missed
  WHERE missed.provider_call_sid = p_provider_call_sid
  FOR UPDATE;

  IF FOUND THEN
    v_replay := true;
    IF v_call.provider_account_sid IS DISTINCT FROM p_provider_account_sid
      OR v_call.from_phone_e164 IS DISTINCT FROM p_from_phone_e164
      OR v_call.to_phone_e164 IS DISTINCT FROM p_to_phone_e164
      OR v_call.direction IS DISTINCT FROM p_direction
    THEN
      RAISE EXCEPTION 'provider call SID conflicts with a different voice call';
    END IF;

    UPDATE public.missed_calls
    SET call_status = p_call_status,
        updated_at = now()
    WHERE id = v_call.id
    RETURNING * INTO v_call;

    SELECT sender.*
    INTO v_sender
    FROM public.organisation_twilio_senders AS sender
    WHERE sender.id = v_call.sender_id
      AND sender.organisation_id = v_call.organisation_id;
  ELSE
    SELECT sender.*
    INTO v_sender
    FROM public.organisation_twilio_senders AS sender
    WHERE sender.active
      AND sender.phone_e164 = p_to_phone_e164
      AND sender.provider_account_sid = p_provider_account_sid;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('stored', false, 'reason', 'unknown_destination');
    END IF;

    INSERT INTO public.missed_calls (
      organisation_id,
      sender_id,
      provider_account_sid,
      provider_call_sid,
      call_status,
      from_phone_e164,
      to_phone_e164,
      direction
    )
    VALUES (
      v_sender.organisation_id,
      v_sender.id,
      p_provider_account_sid,
      p_provider_call_sid,
      p_call_status,
      p_from_phone_e164,
      p_to_phone_e164,
      p_direction
    )
    ON CONFLICT (provider_call_sid) DO NOTHING
    RETURNING * INTO v_call;

    IF v_call.id IS NULL THEN
      v_replay := true;
      SELECT missed.*
      INTO v_call
      FROM public.missed_calls AS missed
      WHERE missed.provider_call_sid = p_provider_call_sid
      FOR UPDATE;

      IF v_call.provider_account_sid IS DISTINCT FROM p_provider_account_sid
        OR v_call.from_phone_e164 IS DISTINCT FROM p_from_phone_e164
        OR v_call.to_phone_e164 IS DISTINCT FROM p_to_phone_e164
        OR v_call.direction IS DISTINCT FROM p_direction
      THEN
        RAISE EXCEPTION 'provider call SID conflicts with a different voice call';
      END IF;

      UPDATE public.missed_calls
      SET call_status = p_call_status,
          updated_at = now()
      WHERE id = v_call.id
      RETURNING * INTO v_call;
    END IF;
  END IF;

  v_message_id := v_call.outbound_message_id;

  IF p_call_status IN ('busy', 'canceled', 'failed', 'no-answer')
    AND v_sender.active
    AND p_from_phone_e164 ~ '^\+614\d{8}$'
    AND NOT EXISTS (
      SELECT 1
      FROM public.communication_preferences AS preference
      WHERE preference.organisation_id = v_call.organisation_id
        AND preference.phone_e164 = p_from_phone_e164
        AND preference.sms_consent_status = 'opted_out'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.sms_messages AS message
      WHERE message.organisation_id = v_call.organisation_id
        AND message.to_phone_e164 = p_from_phone_e164
        AND message.purpose = 'missed_call_ack'
        AND message.state IN ('queued', 'claimed', 'sent')
        AND message.created_at > now() - interval '24 hours'
        AND message.idempotency_key IS DISTINCT FROM v_ack_key
    )
  THEN
    v_business := public.sms_business_name(v_call.organisation_id);
    v_body := public.sms_company_reply_body(v_call.organisation_id, 'ack', v_business);
    v_hash := public.sms_payload_hash(
      v_call.organisation_id::text
      || '|' || p_from_phone_e164
      || '|' || p_to_phone_e164
      || '|ack-v1'
      || '|' || coalesce((
        SELECT settings.ack_template
        FROM public.sms_automation_settings AS settings
        WHERE settings.organisation_id = v_call.organisation_id
      ), '')
    );

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
      next_attempt,
      purpose,
      segments,
      payload_hash
    )
    VALUES (
      v_call.organisation_id,
      v_call.sender_id,
      'outbound',
      'queued',
      p_to_phone_e164,
      p_from_phone_e164,
      v_body,
      p_provider_account_sid,
      v_ack_key,
      now(),
      'missed_call_ack',
      public.sms_gsm7_segments(v_body),
      v_hash
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_message_id;

    IF v_message_id IS NULL THEN
      SELECT message.*
      INTO v_existing
      FROM public.sms_messages AS message
      WHERE message.idempotency_key = v_ack_key;

      IF v_existing.payload_hash IS DISTINCT FROM v_hash THEN
        RAISE EXCEPTION 'missed-call ack payload hash conflict';
      END IF;

      v_message_id := v_existing.id;
    END IF;

    UPDATE public.missed_calls
    SET outbound_message_id = v_message_id,
        updated_at = now()
    WHERE id = v_call.id
      AND outbound_message_id IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'stored', true,
    'replay', v_replay,
    'organisation_id', v_call.organisation_id,
    'call_id', v_call.id,
    'message_id', v_message_id,
    'queued', v_message_id IS NOT NULL
  );
END;
$$;

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
  v_business text;
  v_send_thanks boolean := false;
  v_opted_out boolean := false;
  v_consented boolean := false;
  v_thanks_body text;
  v_thanks_hash text;
  v_thanks_key text;
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
  v_business := public.sms_business_name(v_organisation_id);
  v_opted_out := EXISTS (
    SELECT 1
    FROM public.communication_preferences AS preference
    WHERE preference.organisation_id = v_organisation_id
      AND preference.phone_e164 = p_from_phone_e164
      AND preference.sms_consent_status = 'opted_out'
  );

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
    v_response := public.sms_company_reply_body(v_organisation_id, 'help', v_business);
  ELSIF v_opted_out THEN
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
    IF v_thread.id IS NOT NULL THEN
      v_send_thanks := true;
    END IF;
  END IF;

  v_opted_out := EXISTS (
    SELECT 1
    FROM public.communication_preferences AS preference
    WHERE preference.organisation_id = v_organisation_id
      AND preference.phone_e164 = p_from_phone_e164
      AND preference.sms_consent_status = 'opted_out'
  );
  v_consented := EXISTS (
    SELECT 1
    FROM public.communication_preferences AS preference
    WHERE preference.organisation_id = v_organisation_id
      AND preference.phone_e164 = p_from_phone_e164
      AND preference.sms_consent_status = 'consented'
  );

  IF p_reply_kind = 'help'
    AND NOT v_opted_out
    AND NOT v_consented
    AND v_thread.id IS NOT NULL
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.sms_messages AS message
      WHERE message.organisation_id = v_organisation_id
        AND message.to_phone_e164 = p_from_phone_e164
        AND message.purpose = 'enquiry_help'
        AND message.state IN ('queued', 'claimed', 'sent')
        AND message.created_at > now() - interval '24 hours'
        AND message.idempotency_key IS DISTINCT FROM ('missed-call-reply:' || v_message_id::text)
    ) THEN
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
        next_attempt,
        purpose,
        segments,
        payload_hash
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
        now(),
        'enquiry_help',
        public.sms_gsm7_segments(v_response),
        public.sms_payload_hash(
          'help-v1|' || v_business || '|' || coalesce((
            SELECT settings.help_template
            FROM public.sms_automation_settings AS settings
            WHERE settings.organisation_id = v_organisation_id
          ), '')
        )
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
  ELSIF v_response IS NOT NULL AND v_consented THEN
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
      next_attempt,
      purpose,
      segments,
      payload_hash
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
      now(),
      'legacy',
      public.sms_gsm7_segments(v_response),
      public.sms_payload_hash('legacy|' || v_response)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  IF v_send_thanks AND v_thread.id IS NOT NULL AND NOT v_opted_out THEN
    v_thanks_body := public.sms_company_reply_body(v_organisation_id, 'thanks', v_business);
    v_thanks_key := 'enquiry-thanks:' || v_thread.id::text;
    v_thanks_hash := public.sms_payload_hash(
      'thanks-v1|' || v_business || '|' || coalesce((
        SELECT settings.thanks_template
        FROM public.sms_automation_settings AS settings
        WHERE settings.organisation_id = v_organisation_id
      ), '')
    );

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
      next_attempt,
      purpose,
      segments,
      payload_hash
    )
    VALUES (
      v_organisation_id,
      v_sender.id,
      'outbound',
      'queued',
      p_to_phone_e164,
      p_from_phone_e164,
      v_thanks_body,
      p_provider_account_sid,
      v_thanks_key,
      now(),
      'enquiry_thanks',
      public.sms_gsm7_segments(v_thanks_body),
      v_thanks_hash
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
