-- Companies-era forward port of missed-call SMS Phase 1.
-- The sender table may already exist on Grafter. The rest of the stack is new.
-- This migration is intentionally a no-op on the organisations reference project.

DO $companies_phase_1$
BEGIN
  IF to_regclass('public.companies') IS NULL
    OR to_regclass('public.organisations') IS NOT NULL
  THEN
    RAISE NOTICE 'Skipping companies missed-call Phase 1 on non-companies schema';
    RETURN;
  END IF;

CREATE TABLE IF NOT EXISTS public.organisation_twilio_senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  provider_account_sid text NOT NULL CHECK (length(btrim(provider_account_sid)) > 0),
  provider_sender_sid text NOT NULL CHECK (length(btrim(provider_sender_sid)) > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_sender_sid),
  UNIQUE (organisation_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS organisation_twilio_senders_active_phone_key
  ON public.organisation_twilio_senders (phone_e164)
  WHERE active;

CREATE UNIQUE INDEX IF NOT EXISTS organisation_twilio_senders_organisation_id_key
  ON public.organisation_twilio_senders (organisation_id, id);

CREATE OR REPLACE FUNCTION public.enforce_sms_sender_mapping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_conflict boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.organisation_id IS DISTINCT FROM OLD.organisation_id THEN
    RAISE EXCEPTION 'SMS sender organisation cannot be changed';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.organisation_twilio_senders AS sender
    WHERE sender.id IS DISTINCT FROM NEW.id
      AND sender.active
      AND NEW.active
      AND sender.phone_e164 = NEW.phone_e164
      AND sender.organisation_id IS DISTINCT FROM NEW.organisation_id
  )
  INTO v_conflict;

  IF v_conflict THEN
    RAISE EXCEPTION 'SMS sender E.164 is already mapped to another organisation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_sms_sender_mapping
  ON public.organisation_twilio_senders;
CREATE TRIGGER enforce_sms_sender_mapping
  BEFORE INSERT OR UPDATE OF organisation_id, phone_e164, active
  ON public.organisation_twilio_senders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_sms_sender_mapping();

CREATE INDEX IF NOT EXISTS organisation_twilio_senders_organisation_idx
  ON public.organisation_twilio_senders (organisation_id);

ALTER TABLE public.organisation_twilio_senders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organisation members can view Twilio senders"
  ON public.organisation_twilio_senders;
DROP POLICY IF EXISTS "Company members can view Twilio senders"
  ON public.organisation_twilio_senders;
CREATE POLICY "Organisation members can view Twilio senders"
  ON public.organisation_twilio_senders
  FOR SELECT
  TO authenticated
  USING (
    organisation_id = (
      SELECT profiles.company_id
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON public.organisation_twilio_senders FROM anon, authenticated;
GRANT SELECT ON public.organisation_twilio_senders TO authenticated;
GRANT ALL ON public.organisation_twilio_senders TO service_role;

CREATE TABLE public.communication_preferences (
  organisation_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
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
  PRIMARY KEY (organisation_id, phone_e164),
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

CREATE POLICY "Organisation members can view communication preferences"
  ON public.communication_preferences
  FOR SELECT
  TO authenticated
  USING (
    organisation_id = (
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
  organisation_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
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
  UNIQUE (organisation_id, id),
  CONSTRAINT sms_messages_organisation_sender_fkey
    FOREIGN KEY (organisation_id, sender_id)
    REFERENCES public.organisation_twilio_senders(organisation_id, id),
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

CREATE INDEX sms_messages_organisation_created_idx
  ON public.sms_messages (organisation_id, created_at DESC);

CREATE INDEX sms_messages_claim_idx
  ON public.sms_messages (next_attempt, created_at)
  WHERE direction = 'outbound' AND state IN ('queued', 'claimed');

CREATE OR REPLACE FUNCTION public.enforce_sms_message_sender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_sender public.organisation_twilio_senders%ROWTYPE;
BEGIN
  SELECT sender.*
  INTO v_sender
  FROM public.organisation_twilio_senders AS sender
  WHERE sender.organisation_id = NEW.organisation_id
    AND sender.id = NEW.sender_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SMS sender does not belong to the message organisation';
  END IF;
  IF NOT v_sender.active THEN
    RAISE EXCEPTION 'SMS must use an active organisation sender';
  END IF;
  IF NEW.direction = 'inbound' AND NEW.to_phone_e164 IS DISTINCT FROM v_sender.phone_e164 THEN
    RAISE EXCEPTION 'inbound SMS destination does not match its organisation sender';
  END IF;
  IF NEW.direction = 'outbound' AND NEW.from_phone_e164 IS DISTINCT FROM v_sender.phone_e164 THEN
    RAISE EXCEPTION 'outbound SMS source does not match its organisation sender';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_sms_message_sender
  BEFORE INSERT OR UPDATE OF organisation_id, sender_id, direction, from_phone_e164, to_phone_e164
  ON public.sms_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_sms_message_sender();

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organisation members can view SMS messages"
  ON public.sms_messages
  FOR SELECT
  TO authenticated
  USING (
    organisation_id = (
      SELECT profiles.company_id
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON public.sms_messages FROM anon, authenticated;
GRANT SELECT ON public.sms_messages TO authenticated;
GRANT ALL ON public.sms_messages TO service_role;

-- One transaction maps the validated Twilio destination, stores once, and applies
-- STOP before any future sender can claim work for this organisation + phone.
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
  v_sender public.organisation_twilio_senders%ROWTYPE;
  v_existing public.sms_messages%ROWTYPE;
  v_message_id uuid;
BEGIN
  SELECT sender.*
  INTO v_sender
  FROM public.organisation_twilio_senders AS sender
  WHERE sender.active
    AND sender.phone_e164 = p_to_phone_e164
    AND sender.provider_account_sid = p_provider_account_sid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('stored', false, 'reason', 'unknown_destination');
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
    provider_message_sid,
    idempotency_key,
    received_at
  )
  VALUES (
    v_sender.organisation_id,
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
    SELECT message.*
    INTO v_existing
    FROM public.sms_messages AS message
    WHERE message.provider_message_sid = p_provider_message_sid;

    IF v_existing.provider_account_sid IS DISTINCT FROM p_provider_account_sid
      OR v_existing.from_phone_e164 IS DISTINCT FROM p_from_phone_e164
      OR v_existing.to_phone_e164 IS DISTINCT FROM p_to_phone_e164
      OR v_existing.body IS DISTINCT FROM coalesce(p_body, '')
    THEN
      RAISE EXCEPTION 'provider message SID conflicts with a different inbound message';
    END IF;

    RETURN jsonb_build_object(
      'stored', true,
      'replay', true,
      'organisation_id', v_existing.organisation_id,
      'message_id', v_existing.id
    );
  END IF;

  IF p_is_stop THEN
    INSERT INTO public.communication_preferences (
      organisation_id,
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
      v_sender.organisation_id,
      p_from_phone_e164,
      'opted_out',
      NULL,
      NULL,
      NULL,
      now(),
      'twilio_inbound_stop',
      now()
    )
    ON CONFLICT (organisation_id, phone_e164) DO UPDATE
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
    WHERE organisation_id = v_sender.organisation_id
      AND direction = 'outbound'
      AND to_phone_e164 = p_from_phone_e164
      AND state IN ('queued', 'claimed');
  END IF;

  RETURN jsonb_build_object(
    'stored', true,
    'replay', false,
    'organisation_id', v_sender.organisation_id,
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

-- A future sender must call this with its lease token immediately before making
-- the provider request. STOP or lease expiry makes the claim unreadable.
CREATE OR REPLACE FUNCTION public.authorize_sms_dispatch(
  p_message_id uuid,
  p_claim_token uuid
)
RETURNS SETOF public.sms_messages
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT message.*
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
    AND preference.sms_consent_status = 'consented'
$$;

REVOKE ALL ON FUNCTION public.authorize_sms_dispatch(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_sms_dispatch(uuid, uuid)
  TO service_role;

-- Future booking provenance. Human clients cannot manufacture an automation actor.
ALTER TABLE public.jobs
  ALTER COLUMN created_by DROP NOT NULL,
  ADD COLUMN created_via text NOT NULL DEFAULT 'human'
    CHECK (created_via IN ('human', 'missed_call_sms')),
  ADD COLUMN automation_ref uuid,
  ADD CONSTRAINT jobs_company_automation_ref_fkey
    FOREIGN KEY (company_id, automation_ref)
    REFERENCES public.sms_messages(organisation_id, id),
  ADD CONSTRAINT jobs_creation_provenance_check
    CHECK (
      (created_via = 'human' AND automation_ref IS NULL)
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
  IF current_user = 'authenticated' THEN
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
      -- Allow the existing ON DELETE SET NULL foreign-key action to preserve a
      -- historical human job after its creator profile has been removed.
      IF NOT (
        OLD.created_via = 'human'
        AND NEW.created_via = 'human'
        AND OLD.created_by IS NOT NULL
        AND NEW.created_by IS NULL
        AND NEW.automation_ref IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.profiles WHERE id = OLD.created_by
        )
      ) THEN
        RAISE EXCEPTION 'job creation provenance is immutable';
      END IF;
    END IF;
  END IF;

  IF NEW.created_via = 'missed_call_sms' THEN
    SELECT message.direction
    INTO v_direction
    FROM public.sms_messages AS message
    WHERE message.organisation_id = NEW.company_id
      AND message.id = NEW.automation_ref;

    IF v_direction IS DISTINCT FROM 'inbound' THEN
      RAISE EXCEPTION 'missed-call automation must reference an inbound organisation SMS';
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

DROP POLICY IF EXISTS "Organisation members can insert jobs" ON public.jobs;
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

COMMENT ON TABLE public.organisation_twilio_senders IS
  'Organisation-scoped Twilio inbound/from number mappings; auth tokens stay in Edge Function secrets.';
COMMENT ON TABLE public.communication_preferences IS
  'Organisation and recipient phone scoped SMS consent and explicit opt-out state.';
COMMENT ON TABLE public.sms_messages IS
  'Durable inbound ledger and dormant outbound outbox. Phase 1 does not send messages.';
COMMENT ON COLUMN public.jobs.automation_ref IS
  'Inbound SMS provenance for a future service-created booking; never a manufactured user identity.';

GRANT INSERT, UPDATE ON public.organisation_twilio_senders TO authenticated;

DROP POLICY IF EXISTS "Organisation admins can insert Twilio senders"
  ON public.organisation_twilio_senders;
CREATE POLICY "Organisation admins can insert Twilio senders"
  ON public.organisation_twilio_senders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.company_id = organisation_twilio_senders.organisation_id
        AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Organisation admins can update Twilio senders"
  ON public.organisation_twilio_senders;
CREATE POLICY "Organisation admins can update Twilio senders"
  ON public.organisation_twilio_senders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.company_id = organisation_twilio_senders.organisation_id
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.company_id = organisation_twilio_senders.organisation_id
        AND profiles.role = 'admin'
    )
  );
END;
$companies_phase_1$;
