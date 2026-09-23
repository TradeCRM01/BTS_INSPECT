-- Align a fresh local history with the tenant names already used by TradeCRM.
-- Every rename is guarded so this migration is a no-op where the remap exists.

DO $$
BEGIN
  IF to_regclass('public.organisations') IS NULL
    AND to_regclass('public.companies') IS NOT NULL
  THEN
    ALTER TABLE public.companies RENAME TO organisations;
  END IF;

  IF to_regclass('public.organisations') IS NULL THEN
    RAISE EXCEPTION 'tenant remap requires public.organisations';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.organisation_twilio_senders') IS NULL
    AND to_regclass('public.company_twilio_senders') IS NOT NULL
  THEN
    ALTER TABLE public.company_twilio_senders RENAME TO organisation_twilio_senders;
  END IF;
END;
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'profiles',
    'clients',
    'jobs',
    'job_visits',
    'agent_reminders',
    'organisation_twilio_senders',
    'communication_preferences',
    'communication_preference_events',
    'sms_messages',
    'missed_calls',
    'missed_call_sms_threads',
    'missed_call_booking_commands',
    'missed_call_office_reviews'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = 'company_id'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = 'organisation_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I RENAME COLUMN company_id TO organisation_id',
        v_table
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.organisation_twilio_senders') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'organisation_twilio_senders'
        AND policyname = 'Company members can view Twilio senders'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'organisation_twilio_senders'
        AND policyname = 'Organisation members can view Twilio senders'
    )
  THEN
    ALTER POLICY "Company members can view Twilio senders"
      ON public.organisation_twilio_senders
      RENAME TO "Organisation members can view Twilio senders";
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.job_visits') IS NULL THEN
    CREATE TABLE public.job_visits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
      job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
      visit_index integer NOT NULL DEFAULT 1 CHECK (visit_index >= 1),
      is_primary boolean NOT NULL DEFAULT false,
      scheduled_date date,
      scheduled_start timestamptz,
      scheduled_end timestamptz,
      status text NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'in_progress', 'complete', 'cancelled')),
      notes text,
      created_by uuid REFERENCES public.profiles(id),
      updated_by uuid REFERENCES public.profiles(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (job_id, visit_index),
      CHECK (scheduled_end IS NULL OR scheduled_start IS NULL OR scheduled_end >= scheduled_start)
    );

    CREATE INDEX job_visits_job_id_idx ON public.job_visits (job_id);
    CREATE INDEX job_visits_org_date_idx
      ON public.job_visits (organisation_id, scheduled_date);
    CREATE UNIQUE INDEX job_visits_one_primary_idx
      ON public.job_visits (job_id)
      WHERE is_primary;

    ALTER TABLE public.job_visits ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Organisation members can view job visits"
      ON public.job_visits
      FOR SELECT
      TO authenticated
      USING (
        organisation_id = (
          SELECT profiles.organisation_id
          FROM public.profiles
          WHERE profiles.id = (SELECT auth.uid())
        )
      );

    REVOKE ALL ON public.job_visits FROM anon, authenticated;
    GRANT SELECT ON public.job_visits TO authenticated;
    GRANT ALL ON public.job_visits TO service_role;
  END IF;
END;
$$;
