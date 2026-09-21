-- Missed-call SMS Phase 1: tenant routing, consent, durable ledger, STOP and claims.
-- This migration deliberately does not send SMS or create jobs.

CREATE TABLE public.company_twilio_senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  provider_account_sid text NOT NULL CHECK (length(btrim(provider_account_sid)) > 0),
  provider_sender_sid text NOT NULL CHECK (length(btrim(provider_sender_sid)) > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_sender_sid),
  UNIQUE (company_id, id)
);

CREATE UNIQUE INDEX company_twilio_senders_active_phone_key
  ON public.company_twilio_senders (phone_e164)
  WHERE active;

CREATE INDEX company_twilio_senders_company_idx
  ON public.company_twilio_senders (company_id);

ALTER TABLE public.company_twilio_senders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view Twilio senders"
  ON public.company_twilio_senders
  FOR SELECT
  TO authenticated
  USING (
    company_id = (
      SELECT profiles.company_id
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON public.company_twilio_senders FROM anon, authenticated;
GRANT SELECT ON public.company_twilio_senders TO authenticated;
GRANT ALL ON public.company_twilio_senders TO service_role;

CREATE TABLE public.communication_preferences (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  sms_consent_status text NOT NULL DEFAULT 'unknown'
    CHECK (sms_consent_status IN ('unknown', 'consented', 'opted_out')),
  consent_basis text
    CHECK (consent_basis IS NULL OR consent_basis IN ('express', 'implied', 'legal')),
  consent_source text,
  consented_at timestamptz,
  opted_out_at timestamptz,
  opt_out_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, phone_e164),
  CHECK (
    (sms_consent_status = 'unknown'
      AND consent_basis IS NULL
      AND consented_at IS NULL
      AND opted_out_at IS NULL)
    OR
    (sms_consent_status = 'consented'
      AND consent_basis IS NOT NULL
      AND consent_source IS NOT NULL
      AND consented_at IS NOT NULL
      AND opted_out_at IS NULL)
    OR
    (sms_consent_status = 'opted_out'
      AND opted_out_at IS NOT NULL
      AND opt_out_source IS NOT NULL)
  )
);

ALTER TABLE public.communication_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view communication preferences"
  ON public.communication_preferences
  FOR SELECT
  TO authenticated
  USING (
    company_id = (
      SELECT profiles.company_id
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON public.communication_preferences FROM anon, authenticated;
GRANT SELECT ON public.communication_preferences TO authenticated;
GRANT ALL ON public.communication_preferences TO service_role;

CREATE TABLE public.sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_id uuid,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  state text NOT NULL CHECK (state IN ('received', 'queued', 'claimed', 'sent', 'failed', 'cancelled')),
  from_phone_e164 text NOT NULL CHECK (from_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  to_phone_e164 text NOT NULL CHECK (to_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  body text NOT NULL DEFAULT '',
  provider_account_sid text,
  provider_message_sid text,
  idempotency_key text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt timestamptz,
  last_error text,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  claim_token uuid,
  claimed_by text,
  received_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key),
  UNIQUE (provider_message_sid),
  UNIQUE (company_id, id),
  CONSTRAINT sms_messages_company_sender_fkey
    FOREIGN KEY (company_id, sender_id)
    REFERENCES public.company_twilio_senders(company_id, id),
  CHECK (
    (direction = 'inbound'
      AND state = 'received'
      AND provider_message_sid IS NOT NULL
      AND received_at IS NOT NULL
      AND next_attempt IS NULL
      AND claim_token IS NULL)
    OR
    (direction = 'outbound'
      AND state IN ('queued', 'claimed', 'sent', 'failed', 'cancelled'))
  ),
  CHECK (
    (state = 'claimed'
      AND claimed_at IS NOT NULL
      AND claim_expires_at IS NOT NULL
      AND claim_token IS NOT NULL
      AND claimed_by IS NOT NULL)
    OR state <> 'claimed'
  )
);

CREATE INDEX sms_messages_company_created_idx
  ON public.sms_messages (company_id, created_at DESC);

CREATE INDEX sms_messages_claim_idx
  ON public.sms_messages (next_attempt, created_at)
  WHERE direction = 'outbound' AND state IN ('queued', 'claimed');

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view SMS messages"
  ON public.sms_messages
  FOR SELECT
  TO authenticated
  USING (
    company_id = (
      SELECT profiles.company_id
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON public.sms_messages FROM anon, authenticated;
GRANT SELECT ON public.sms_messages TO authenticated;
GRANT ALL ON public.sms_messages TO service_role;

-- One transaction maps the validated Twilio destination, stores once, and applies
-- STOP before any future sender can claim work for this company + phone.
CREATE OR REPLACE FUNCTION public.ingest_twilio_inbound_sms(
  p_provider_account_sid text,
  p_provider_message_sid text,
  p_from_phone_e164 text,
  p_to_phone_e164 text,
  p_body text,
  p_is_stop boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_sender public.company_twilio_senders%ROWTYPE;
  v_message_id uuid;
BEGIN
  SELECT sender.*
  INTO v_sender
  FROM public.company_twilio_senders AS sender
  WHERE sender.active
    AND sender.phone_e164 = p_to_phone_e164
    AND sender.provider_account_sid = p_provider_account_sid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('stored', false, 'reason', 'unknown_destination');
  END IF;

  INSERT INTO public.sms_messages (
    company_id,
    sender_id,
    direction,
    state,
    from_phone_e164,
    to_phone_e164,
    body,
    provider_account_sid,
    provider_message_sid,
    idempotency_key,
    received_at
  )
  VALUES (
    v_sender.company_id,
    v_sender.id,
    'inbound',
    'received',
    p_from_phone_e164,
    p_to_phone_e164,
    coalesce(p_body, ''),
    p_provider_account_sid,
    p_provider_message_sid,
    'twilio:' || p_provider_message_sid,
    now()
  )
  ON CONFLICT (provider_message_sid) DO NOTHING
  RETURNING id INTO v_message_id;

  IF v_message_id IS NULL THEN
    RETURN jsonb_build_object(
      'stored', true,
      'replay', true,
      'company_id', v_sender.company_id
    );
  END IF;

  IF p_is_stop THEN
    INSERT INTO public.communication_preferences (
      company_id,
      phone_e164,
      sms_consent_status,
      consent_basis,
      consent_source,
      consented_at,
      opted_out_at,
      opt_out_source,
      updated_at
    )
    VALUES (
      v_sender.company_id,
      p_from_phone_e164,
      'opted_out',
      NULL,
      NULL,
      NULL,
      now(),
      'twilio_inbound_stop',
      now()
    )
    ON CONFLICT (company_id, phone_e164) DO UPDATE
    SET sms_consent_status = 'opted_out',
        opted_out_at = EXCLUDED.opted_out_at,
        opt_out_source = EXCLUDED.opt_out_source,
        updated_at = now();

    UPDATE public.sms_messages
    SET state = 'cancelled',
        last_error = 'recipient_opted_out',
        next_attempt = NULL,
        claim_token = NULL,
        claimed_at = NULL,
        claim_expires_at = NULL,
        claimed_by = NULL,
        updated_at = now()
    WHERE company_id = v_sender.company_id
      AND direction = 'outbound'
      AND to_phone_e164 = p_from_phone_e164
      AND state IN ('queued', 'claimed');
  END IF;

  RETURN jsonb_build_object(
    'stored', true,
    'replay', false,
    'company_id', v_sender.company_id,
    'message_id', v_message_id,
    'opted_out', p_is_stop
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_twilio_inbound_sms(text, text, text, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_twilio_inbound_sms(text, text, text, text, text, boolean)
  TO service_role;

-- A leased, SKIP LOCKED claim is ready for a later sender. Phase 1 has no sender.
CREATE OR REPLACE FUNCTION public.claim_next_sms_message(
  p_worker_id text,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF public.sms_messages
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF length(btrim(coalesce(p_worker_id, ''))) = 0 THEN
    RAISE EXCEPTION 'worker id is required';
  END IF;
  IF p_lease_seconds < 10 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'lease seconds must be between 10 and 900';
  END IF;

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
      AND NOT EXISTS (
        SELECT 1
        FROM public.communication_preferences AS preference
        WHERE preference.company_id = message.company_id
          AND preference.phone_e164 = message.to_phone_e164
          AND preference.sms_consent_status = 'opted_out'
      )
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

-- Future booking provenance. Human clients cannot manufacture an automation actor.
ALTER TABLE public.jobs
  ALTER COLUMN created_by DROP NOT NULL,
  ADD COLUMN created_via text NOT NULL DEFAULT 'human'
    CHECK (created_via IN ('human', 'missed_call_sms')),
  ADD COLUMN automation_ref uuid,
  ADD CONSTRAINT jobs_company_automation_ref_fkey
    FOREIGN KEY (company_id, automation_ref)
    REFERENCES public.sms_messages(company_id, id),
  ADD CONSTRAINT jobs_creation_provenance_check
    CHECK (
      (created_via = 'human' AND created_by IS NOT NULL AND automation_ref IS NULL)
      OR
      (created_via = 'missed_call_sms' AND created_by IS NULL AND automation_ref IS NOT NULL)
    );

CREATE OR REPLACE FUNCTION public.enforce_job_creation_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_direction text;
BEGIN
  IF (SELECT auth.role()) = 'authenticated' THEN
    IF TG_OP = 'INSERT' AND (
      NEW.created_by IS DISTINCT FROM (SELECT auth.uid())
      OR NEW.created_via <> 'human'
      OR NEW.automation_ref IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'authenticated job inserts must use the signed-in user';
    END IF;

    IF TG_OP = 'UPDATE' AND (
      NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_via IS DISTINCT FROM OLD.created_via
      OR NEW.automation_ref IS DISTINCT FROM OLD.automation_ref
    ) THEN
      RAISE EXCEPTION 'job creation provenance is immutable';
    END IF;
  END IF;

  IF NEW.created_via = 'missed_call_sms' THEN
    SELECT message.direction
    INTO v_direction
    FROM public.sms_messages AS message
    WHERE message.company_id = NEW.company_id
      AND message.id = NEW.automation_ref;

    IF v_direction IS DISTINCT FROM 'inbound' THEN
      RAISE EXCEPTION 'missed-call automation must reference an inbound company SMS';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_job_creation_provenance
  BEFORE INSERT OR UPDATE OF company_id, created_by, created_via, automation_ref
  ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_job_creation_provenance();

DROP POLICY IF EXISTS "Company members can insert jobs" ON public.jobs;
CREATE POLICY "Company members can insert jobs"
  ON public.jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (
      SELECT profiles.company_id
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
    AND created_by = (SELECT auth.uid())
    AND created_via = 'human'
    AND automation_ref IS NULL
  );

COMMENT ON TABLE public.company_twilio_senders IS
  'Company-scoped Twilio inbound/from number mappings; auth tokens stay in Edge Function secrets.';
COMMENT ON TABLE public.communication_preferences IS
  'Company and recipient phone scoped SMS consent and explicit opt-out state.';
COMMENT ON TABLE public.sms_messages IS
  'Durable inbound ledger and dormant outbound outbox. Phase 1 does not send messages.';
COMMENT ON COLUMN public.jobs.automation_ref IS
  'Inbound SMS provenance for a future service-created booking; never a manufactured user identity.';
