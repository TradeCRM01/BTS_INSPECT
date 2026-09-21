CREATE TABLE public.missed_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  provider_account_sid text NOT NULL,
  provider_call_sid text NOT NULL UNIQUE,
  call_status text NOT NULL
    CHECK (call_status IN ('busy', 'canceled', 'completed', 'failed', 'no-answer')),
  from_phone_e164 text NOT NULL CHECK (from_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  to_phone_e164 text NOT NULL CHECK (to_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  direction text NOT NULL CHECK (direction = 'inbound'),
  outbound_message_id uuid,
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  CONSTRAINT missed_calls_company_sender_fkey
    FOREIGN KEY (company_id, sender_id)
    REFERENCES public.company_twilio_senders(company_id, id),
  CONSTRAINT missed_calls_company_outbound_message_fkey
    FOREIGN KEY (company_id, outbound_message_id)
    REFERENCES public.sms_messages(company_id, id)
);

CREATE INDEX missed_calls_company_received_idx
  ON public.missed_calls (company_id, received_at DESC);

ALTER TABLE public.missed_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view missed calls"
  ON public.missed_calls
  FOR SELECT
  TO authenticated
  USING (
    company_id = (
      SELECT profiles.company_id
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON public.missed_calls FROM anon, authenticated;
GRANT SELECT ON public.missed_calls TO authenticated;
GRANT ALL ON public.missed_calls TO service_role;

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
  v_sender public.company_twilio_senders%ROWTYPE;
  v_call public.missed_calls%ROWTYPE;
  v_message_id uuid;
  v_replay boolean := false;
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
    FROM public.company_twilio_senders AS sender
    WHERE sender.id = v_call.sender_id
      AND sender.company_id = v_call.company_id;
  ELSE
    SELECT sender.*
    INTO v_sender
    FROM public.company_twilio_senders AS sender
    WHERE sender.active
      AND sender.phone_e164 = p_to_phone_e164
      AND sender.provider_account_sid = p_provider_account_sid;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('stored', false, 'reason', 'unknown_destination');
    END IF;

    INSERT INTO public.missed_calls (
      company_id,
      sender_id,
      provider_account_sid,
      provider_call_sid,
      call_status,
      from_phone_e164,
      to_phone_e164,
      direction
    )
    VALUES (
      v_sender.company_id,
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
    AND EXISTS (
      SELECT 1
      FROM public.communication_preferences AS preference
      WHERE preference.company_id = v_call.company_id
        AND preference.phone_e164 = p_from_phone_e164
        AND preference.sms_consent_status = 'consented'
    )
  THEN
    INSERT INTO public.sms_messages (
      company_id,
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
      v_call.company_id,
      v_call.sender_id,
      'outbound',
      'queued',
      p_to_phone_e164,
      p_from_phone_e164,
      'Sorry we missed your call. Reply here and our team will get back to you.',
      p_provider_account_sid,
      'missed-call:' || p_provider_call_sid,
      now()
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_message_id;

    IF v_message_id IS NULL THEN
      SELECT message.id
      INTO v_message_id
      FROM public.sms_messages AS message
      WHERE message.idempotency_key = 'missed-call:' || p_provider_call_sid;
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
    'company_id', v_call.company_id,
    'call_id', v_call.id,
    'message_id', v_message_id,
    'queued', v_message_id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_twilio_voice_status(text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_twilio_voice_status(text, text, text, text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_sms_dispatch(
  p_message_id uuid,
  p_claim_token uuid,
  p_provider_message_sid text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF length(btrim(coalesce(p_provider_message_sid, ''))) = 0 THEN
    RAISE EXCEPTION 'provider message SID is required';
  END IF;

  UPDATE public.sms_messages
  SET state = 'sent',
      provider_message_sid = p_provider_message_sid,
      sent_at = now(),
      next_attempt = NULL,
      last_error = NULL,
      claimed_at = NULL,
      claim_expires_at = NULL,
      claim_token = NULL,
      claimed_by = NULL,
      updated_at = now()
  WHERE id = p_message_id
    AND direction = 'outbound'
    AND state = 'claimed'
    AND claim_token = p_claim_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_sms_dispatch(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sms_dispatch(uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.fail_sms_dispatch(
  p_message_id uuid,
  p_claim_token uuid,
  p_error text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.sms_messages
  SET state = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'queued' END,
      next_attempt = CASE
        WHEN attempts >= 5 THEN NULL
        ELSE now() + make_interval(secs => least(300, 15 * power(2, greatest(0, attempts - 1)))::integer)
      END,
      last_error = left(coalesce(nullif(btrim(p_error), ''), 'provider_send_failed'), 500),
      claimed_at = NULL,
      claim_expires_at = NULL,
      claim_token = NULL,
      claimed_by = NULL,
      updated_at = now()
  WHERE id = p_message_id
    AND direction = 'outbound'
    AND state = 'claimed'
    AND claim_token = p_claim_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_sms_dispatch(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_sms_dispatch(uuid, uuid, text)
  TO service_role;

COMMENT ON TABLE public.missed_calls IS
  'Company-scoped Twilio voice status ledger deduplicated by provider CallSid.';
