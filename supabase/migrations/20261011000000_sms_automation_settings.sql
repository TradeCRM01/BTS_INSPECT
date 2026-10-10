-- PR-C: operator-owned automation settings and claim/authorize guards.
-- Test sends can only ever reach +61418893602.

CREATE TABLE public.sms_automation_settings (
  organisation_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  test_mode boolean NOT NULL DEFAULT true,
  test_allowlist text[] NOT NULL DEFAULT '{}'::text[],
  forward_from_e164 text,
  business_name text,
  daily_message_cap integer NOT NULL DEFAULT 20,
  hourly_message_cap integer NOT NULL DEFAULT 10,
  monthly_segment_cap integer NOT NULL DEFAULT 300,
  ack_ttl_minutes integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_automation_settings_test_allowlist_exact
    CHECK (test_allowlist <@ ARRAY['+61418893602']::text[]),
  CONSTRAINT sms_automation_settings_forward_from_e164_check
    CHECK (forward_from_e164 IS NULL OR forward_from_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT sms_automation_settings_business_name_check
    CHECK (
      business_name IS NULL
      OR char_length(btrim(business_name)) BETWEEN 2 AND 20
    ),
  CONSTRAINT sms_automation_settings_caps_positive
    CHECK (
      daily_message_cap >= 1
      AND hourly_message_cap >= 1
      AND monthly_segment_cap >= 1
      AND ack_ttl_minutes >= 1
    )
);

ALTER TABLE public.sms_automation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organisation members can view SMS automation settings"
  ON public.sms_automation_settings
  FOR SELECT
  TO authenticated
  USING (
    organisation_id = (
      SELECT profiles.company_id
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Platform operators can write SMS automation settings"
  ON public.sms_automation_settings
  FOR ALL
  TO authenticated
  USING (public.is_platform_operator())
  WITH CHECK (public.is_platform_operator());

REVOKE ALL ON public.sms_automation_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_automation_settings TO authenticated;
GRANT ALL ON public.sms_automation_settings TO service_role;

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
  v_others integer;
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

  SELECT count(*)
  INTO v_others
  FROM public.sms_messages AS other
  WHERE other.organisation_id = p_message.organisation_id
    AND other.direction = 'outbound'
    AND other.state IN ('queued', 'claimed', 'sent')
    AND other.id IS DISTINCT FROM p_message.id
    AND other.created_at > now() - interval '1 hour';
  IF v_others >= v_settings.hourly_message_cap THEN
    RETURN 'cap_reached';
  END IF;

  SELECT count(*)
  INTO v_others
  FROM public.sms_messages AS other
  WHERE other.organisation_id = p_message.organisation_id
    AND other.direction = 'outbound'
    AND other.state IN ('queued', 'claimed', 'sent')
    AND other.id IS DISTINCT FROM p_message.id
    AND other.created_at > now() - interval '24 hours';
  IF v_others >= v_settings.daily_message_cap THEN
    RETURN 'cap_reached';
  END IF;

  SELECT count(*)
  INTO v_others
  FROM public.sms_messages AS other
  WHERE other.organisation_id = p_message.organisation_id
    AND other.direction = 'outbound'
    AND other.state IN ('queued', 'claimed', 'sent')
    AND other.id IS DISTINCT FROM p_message.id
    AND other.created_at > now() - interval '30 days';
  IF v_others >= v_settings.monthly_segment_cap THEN
    RETURN 'cap_reached';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_dispatch_block_reason(public.sms_messages)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_dispatch_block_reason(public.sms_messages)
  TO service_role;

CREATE OR REPLACE FUNCTION public.maybe_sms_cap_reminder(p_organisation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.agent_reminders AS reminder
    WHERE reminder.company_id = p_organisation_id
      AND reminder.related_type = 'missed_call_sms_cap'
      AND reminder.created_at >= date_trunc('day', now())
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
    'Missed-call texts paused: monthly limit reached',
    'Automated missed-call texts are paused because a send cap was reached.',
    now(),
    'missed_call_sms_cap',
    'company'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.maybe_sms_cap_reminder(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maybe_sms_cap_reminder(uuid)
  TO service_role;

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
      AND public.sms_dispatch_block_reason(message) IS NOT NULL
    ORDER BY coalesce(message.next_attempt, message.created_at), message.created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.sms_messages
    SET state = 'cancelled',
        last_error = public.sms_dispatch_block_reason(v_row),
        next_attempt = NULL,
        claim_token = NULL,
        claimed_at = NULL,
        claim_expires_at = NULL,
        claimed_by = NULL,
        updated_at = now()
    WHERE id = v_row.id
      AND state IN ('queued', 'claimed')
    RETURNING last_error INTO v_reason;

    IF v_reason = 'cap_reached' THEN
      PERFORM public.maybe_sms_cap_reminder(v_row.organisation_id);
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
      AND EXISTS (
        SELECT 1
        FROM public.communication_preferences AS preference
        WHERE preference.organisation_id = message.organisation_id
          AND preference.phone_e164 = message.to_phone_e164
          AND preference.sms_consent_status = 'consented'
      )
      AND EXISTS (
        SELECT 1
        FROM public.organisation_twilio_senders AS sender
        WHERE sender.organisation_id = message.organisation_id
          AND sender.id = message.sender_id
          AND sender.active
          AND sender.phone_e164 = message.from_phone_e164
      )
      AND public.sms_dispatch_block_reason(message) IS NULL
    ORDER BY coalesce(message.next_attempt, message.created_at), message.created_at
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

REVOKE ALL ON FUNCTION public.claim_next_sms_message(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_sms_message(text, integer)
  TO service_role;

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
BEGIN
  SELECT message.*
  INTO v_row
  FROM public.sms_messages AS message
  JOIN public.organisation_twilio_senders AS sender
    ON sender.organisation_id = message.organisation_id
   AND sender.id = message.sender_id
  JOIN public.communication_preferences AS preference
    ON preference.organisation_id = message.organisation_id
   AND preference.phone_e164 = message.to_phone_e164
  WHERE message.id = p_message_id
    AND message.direction = 'outbound'
    AND message.state = 'claimed'
    AND message.claim_token = p_claim_token
    AND message.claim_expires_at > now()
    AND sender.active
    AND sender.phone_e164 = message.from_phone_e164
    AND preference.sms_consent_status = 'consented';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_reason := public.sms_dispatch_block_reason(v_row);
  IF v_reason IS NOT NULL THEN
    UPDATE public.sms_messages
    SET state = 'cancelled',
        last_error = v_reason,
        next_attempt = NULL,
        claim_token = NULL,
        claimed_at = NULL,
        claim_expires_at = NULL,
        claimed_by = NULL,
        updated_at = now()
    WHERE id = v_row.id
      AND state = 'claimed'
      AND claim_token = p_claim_token;

    IF v_reason = 'cap_reached' THEN
      PERFORM public.maybe_sms_cap_reminder(v_row.organisation_id);
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

REVOKE ALL ON FUNCTION public.authorize_sms_dispatch(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_sms_dispatch(uuid, uuid)
  TO service_role;
