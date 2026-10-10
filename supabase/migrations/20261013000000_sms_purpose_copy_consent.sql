-- PR-E: ack/thanks/HELP copy, purpose/segments/payload_hash, scoped consent.
-- Cap windows use companies.time_zone (Brisbane fallback). Job-reminder stays on Perth.

ALTER TABLE public.sms_messages
  ADD COLUMN purpose text NOT NULL DEFAULT 'legacy',
  ADD COLUMN segments smallint,
  ADD COLUMN payload_hash text;

ALTER TABLE public.sms_messages
  ADD CONSTRAINT sms_messages_purpose_check
    CHECK (purpose IN ('missed_call_ack', 'enquiry_thanks', 'legacy')),
  ADD CONSTRAINT sms_messages_segments_check
    CHECK (segments IS NULL OR segments BETWEEN 1 AND 10);

CREATE OR REPLACE FUNCTION public.sms_tenant_time_zone(p_organisation_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce(
    (
      SELECT companies.time_zone
      FROM public.companies
      WHERE companies.id = p_organisation_id
        AND public.is_iana_time_zone(companies.time_zone)
    ),
    'Australia/Brisbane'
  )
$$;

REVOKE ALL ON FUNCTION public.sms_tenant_time_zone(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_tenant_time_zone(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.sms_payload_hash(p_payload text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = extensions, pg_catalog
AS $$
  SELECT encode(digest(convert_to(p_payload, 'UTF8'), 'sha256'), 'hex')
$$;

REVOKE ALL ON FUNCTION public.sms_payload_hash(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_payload_hash(text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.sms_gsm7_segments(p_body text)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN char_length(coalesce(p_body, '')) <= 160 THEN 1::smallint
    ELSE ceil(char_length(p_body) / 153.0)::smallint
  END
$$;

REVOKE ALL ON FUNCTION public.sms_gsm7_segments(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_gsm7_segments(text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.missed_call_ack_body(p_business_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT 'Hi, this is ' || p_business_name
    || '. Sorry we missed your call. Reply with what you need done and your suburb and we will get back to you. Reply STOP to opt out.'
$$;

CREATE OR REPLACE FUNCTION public.enquiry_thanks_body(p_business_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT 'Thanks, got it. We have passed this to the office and someone from '
    || p_business_name
    || ' will be in touch. Reply STOP to opt out.'
$$;

CREATE OR REPLACE FUNCTION public.missed_call_help_body(p_business_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT p_business_name
    || ': reply with the job and your suburb and the office will get back to you. Reply STOP to opt out, START to opt back in.'
$$;

REVOKE ALL ON FUNCTION public.missed_call_ack_body(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enquiry_thanks_body(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.missed_call_help_body(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.missed_call_ack_body(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.enquiry_thanks_body(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.missed_call_help_body(text) TO service_role;

CREATE OR REPLACE FUNCTION public.sms_business_name(p_organisation_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce(
    nullif(btrim(settings.business_name), ''),
    left(nullif(btrim(companies.name), ''), 20),
    'the business'
  )
  FROM public.companies
  LEFT JOIN public.sms_automation_settings AS settings
    ON settings.organisation_id = companies.id
  WHERE companies.id = p_organisation_id
$$;

REVOKE ALL ON FUNCTION public.sms_business_name(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_business_name(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.sms_purpose_allowed(p_message public.sms_messages)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN coalesce(p_message.purpose, 'legacy') IN ('missed_call_ack', 'enquiry_thanks') THEN
      NOT EXISTS (
        SELECT 1
        FROM public.communication_preferences AS preference
        WHERE preference.organisation_id = p_message.organisation_id
          AND preference.phone_e164 = p_message.to_phone_e164
          AND preference.sms_consent_status = 'opted_out'
      )
    ELSE
      EXISTS (
        SELECT 1
        FROM public.communication_preferences AS preference
        WHERE preference.organisation_id = p_message.organisation_id
          AND preference.phone_e164 = p_message.to_phone_e164
          AND preference.sms_consent_status = 'consented'
      )
  END
$$;

REVOKE ALL ON FUNCTION public.sms_purpose_allowed(public.sms_messages)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_purpose_allowed(public.sms_messages)
  TO service_role;

DROP FUNCTION IF EXISTS public.sms_outbound_cap_used(public.sms_messages, interval);

CREATE OR REPLACE FUNCTION public.sms_outbound_cap_used(
  p_message public.sms_messages,
  p_window text
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz text := public.sms_tenant_time_zone(p_message.organisation_id);
BEGIN
  IF p_window = 'month' THEN
    RETURN (
      SELECT coalesce(sum(coalesce(other.segments, 1)), 0)::integer
      FROM public.sms_messages AS other
      WHERE other.organisation_id = p_message.organisation_id
        AND other.direction = 'outbound'
        AND other.id IS DISTINCT FROM p_message.id
        AND date_trunc('month', other.created_at AT TIME ZONE v_tz)
          = date_trunc('month', now() AT TIME ZONE v_tz)
        AND (
          other.state IN ('claimed', 'sent')
          OR (
            other.state = 'queued'
            AND (coalesce(other.next_attempt, other.created_at), other.created_at, other.id)
              < (coalesce(p_message.next_attempt, p_message.created_at), p_message.created_at, p_message.id)
          )
        )
    );
  END IF;

  RETURN (
    SELECT count(*)::integer
    FROM public.sms_messages AS other
    WHERE other.organisation_id = p_message.organisation_id
      AND other.direction = 'outbound'
      AND other.id IS DISTINCT FROM p_message.id
      AND date_trunc(p_window, other.created_at AT TIME ZONE v_tz)
        = date_trunc(p_window, now() AT TIME ZONE v_tz)
      AND (
        other.state IN ('claimed', 'sent')
        OR (
          other.state = 'queued'
          AND (coalesce(other.next_attempt, other.created_at), other.created_at, other.id)
            < (coalesce(p_message.next_attempt, p_message.created_at), p_message.created_at, p_message.id)
        )
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sms_outbound_cap_used(public.sms_messages, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_outbound_cap_used(public.sms_messages, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.sms_dispatch_block_reason(p_message public.sms_messages)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_settings public.sms_automation_settings%ROWTYPE;
  v_company_phone text;
BEGIN
  SELECT settings.*
  INTO v_settings
  FROM public.sms_automation_settings AS settings
  WHERE settings.organisation_id = p_message.organisation_id;

  IF NOT FOUND OR v_settings.enabled IS NOT TRUE THEN
    RETURN 'disabled';
  END IF;

  SELECT btrim(companies.phone)
  INTO v_company_phone
  FROM public.companies
  WHERE companies.id = p_message.organisation_id;

  IF p_message.to_phone_e164 = p_message.from_phone_e164
    OR (
      v_company_phone IS NOT NULL
      AND v_company_phone <> ''
      AND p_message.to_phone_e164 = v_company_phone
    )
    OR (
      v_settings.forward_from_e164 IS NOT NULL
      AND p_message.to_phone_e164 = v_settings.forward_from_e164
    )
  THEN
    RETURN 'self_loop';
  END IF;

  IF p_message.to_phone_e164 !~ '^\+614\d{8}$' THEN
    RETURN 'not_au_mobile';
  END IF;

  IF v_settings.test_mode
    AND (
      p_message.to_phone_e164 <> '+61418893602'
      OR NOT (p_message.to_phone_e164 = ANY (v_settings.test_allowlist))
    )
  THEN
    RETURN 'test_mode_blocked';
  END IF;

  IF p_message.created_at < (now() - make_interval(mins => v_settings.ack_ttl_minutes)) THEN
    RETURN 'stale';
  END IF;

  IF public.sms_outbound_cap_used(p_message, 'hour') >= v_settings.hourly_message_cap THEN
    RETURN 'cap_reached:hourly';
  END IF;

  IF public.sms_outbound_cap_used(p_message, 'day') >= v_settings.daily_message_cap THEN
    RETURN 'cap_reached:daily';
  END IF;

  IF public.sms_outbound_cap_used(p_message, 'month') >= v_settings.monthly_message_cap THEN
    RETURN 'cap_reached:monthly';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.maybe_sms_cap_reminder(p_organisation_id uuid, p_window text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid;
  v_tz text := public.sms_tenant_time_zone(p_organisation_id);
  v_day_start timestamptz;
BEGIN
  IF p_window IS NULL OR p_window NOT IN ('hourly', 'daily', 'monthly') THEN
    RETURN;
  END IF;

  v_day_start := date_trunc('day', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz;

  IF EXISTS (
    SELECT 1
    FROM public.agent_reminders AS reminder
    WHERE reminder.company_id = p_organisation_id
      AND reminder.related_type = 'missed_call_sms_cap'
      AND reminder.created_at >= v_day_start
  ) THEN
    RETURN;
  END IF;

  SELECT profile.id
  INTO v_owner
  FROM public.profiles AS profile
  WHERE profile.company_id = p_organisation_id
  ORDER BY (profile.role = 'admin') DESC, profile.created_at, profile.id
  LIMIT 1;

  INSERT INTO public.agent_reminders (
    company_id,
    user_id,
    title,
    details,
    due_date,
    related_type,
    visibility
  )
  VALUES (
    p_organisation_id,
    v_owner,
    'Missed-call texts paused: ' || p_window || ' limit reached',
    'Automated missed-call texts are paused because a send cap was reached.',
    now(),
    'missed_call_sms_cap',
    'company'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_next_sms_message(
  p_worker_id text,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF public.sms_messages
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_row public.sms_messages;
  v_reason text;
  v_error text;
  v_window text;
BEGIN
  IF length(btrim(coalesce(p_worker_id, ''))) = 0 THEN
    RAISE EXCEPTION 'worker id is required';
  END IF;
  IF p_lease_seconds < 10 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'lease seconds must be between 10 and 900';
  END IF;

  FOR v_row IN
    SELECT message.*
    FROM public.sms_messages AS message
    WHERE message.direction = 'outbound'
      AND (
        (message.state = 'queued' AND coalesce(message.next_attempt, now()) <= now())
        OR
        (message.state = 'claimed' AND message.claim_expires_at <= now())
      )
    ORDER BY coalesce(message.next_attempt, message.created_at), message.created_at, message.id
    FOR UPDATE SKIP LOCKED
  LOOP
    v_reason := public.sms_dispatch_block_reason(v_row);
    IF v_reason IS NULL THEN
      CONTINUE;
    END IF;

    v_error := public.sms_dispatch_last_error(v_reason);
    UPDATE public.sms_messages
    SET state = 'cancelled',
        last_error = v_error,
        next_attempt = NULL,
        claim_token = NULL,
        claimed_at = NULL,
        claim_expires_at = NULL,
        claimed_by = NULL,
        updated_at = now()
    WHERE id = v_row.id
      AND state IN ('queued', 'claimed');

    IF v_reason LIKE 'cap_reached:%' THEN
      v_window := split_part(v_reason, ':', 2);
      PERFORM public.maybe_sms_cap_reminder(v_row.organisation_id, v_window);
    END IF;
  END LOOP;

  RETURN QUERY
  WITH candidate AS (
    SELECT message.id
    FROM public.sms_messages AS message
    WHERE message.direction = 'outbound'
      AND (
        (message.state = 'queued' AND coalesce(message.next_attempt, now()) <= now())
        OR
        (message.state = 'claimed' AND message.claim_expires_at <= now())
      )
      AND public.sms_purpose_allowed(message)
      AND EXISTS (
        SELECT 1
        FROM public.organisation_twilio_senders AS sender
        WHERE sender.organisation_id = message.organisation_id
          AND sender.id = message.sender_id
          AND sender.active
          AND sender.phone_e164 = message.from_phone_e164
      )
      AND public.sms_dispatch_block_reason(message) IS NULL
    ORDER BY coalesce(message.next_attempt, message.created_at), message.created_at, message.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.sms_messages AS message
  SET state = 'claimed',
      attempts = message.attempts + 1,
      claimed_at = now(),
      claim_expires_at = now() + make_interval(secs => p_lease_seconds),
      claim_token = gen_random_uuid(),
      claimed_by = p_worker_id,
      updated_at = now()
  FROM candidate
  WHERE message.id = candidate.id
  RETURNING message.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_sms_dispatch(
  p_message_id uuid,
  p_claim_token uuid
)
RETURNS SETOF public.sms_messages
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_row public.sms_messages;
  v_reason text;
  v_error text;
  v_window text;
BEGIN
  SELECT message.*
  INTO v_row
  FROM public.sms_messages AS message
  JOIN public.organisation_twilio_senders AS sender
    ON sender.organisation_id = message.organisation_id
   AND sender.id = message.sender_id
  WHERE message.id = p_message_id
    AND message.direction = 'outbound'
    AND message.state = 'claimed'
    AND message.claim_token = p_claim_token
    AND message.claim_expires_at > now()
    AND sender.active
    AND sender.phone_e164 = message.from_phone_e164
    AND public.sms_purpose_allowed(message);

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_reason := public.sms_dispatch_block_reason(v_row);
  IF v_reason IS NOT NULL THEN
    v_error := public.sms_dispatch_last_error(v_reason);
    UPDATE public.sms_messages
    SET state = 'cancelled',
        last_error = v_error,
        next_attempt = NULL,
        claim_token = NULL,
        claimed_at = NULL,
        claim_expires_at = NULL,
        claimed_by = NULL,
        updated_at = now()
    WHERE id = v_row.id
      AND state = 'claimed'
      AND claim_token = p_claim_token;

    IF v_reason LIKE 'cap_reached:%' THEN
      v_window := split_part(v_reason, ':', 2);
      PERFORM public.maybe_sms_cap_reminder(v_row.organisation_id, v_window);
    END IF;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT message.*
  FROM public.sms_messages AS message
  WHERE message.id = v_row.id
    AND message.state = 'claimed'
    AND message.claim_token = p_claim_token;
END;
$$;

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
    v_body := public.missed_call_ack_body(v_business);
    v_hash := public.sms_payload_hash(
      v_call.organisation_id::text
      || '|' || p_from_phone_e164
      || '|' || p_to_phone_e164
      || '|ack-v1'
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

      IF v_existing.payload_hash IS DISTINCT FROM v_hash
        OR v_existing.body IS DISTINCT FROM v_body
      THEN
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
    v_response := public.missed_call_help_body(v_business);
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

  IF v_response IS NOT NULL AND NOT v_opted_out THEN
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
    v_thanks_body := public.enquiry_thanks_body(v_business);
    v_thanks_key := 'enquiry-thanks:' || v_thread.id::text;
    v_thanks_hash := public.sms_payload_hash('thanks-v1|' || v_business);

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

