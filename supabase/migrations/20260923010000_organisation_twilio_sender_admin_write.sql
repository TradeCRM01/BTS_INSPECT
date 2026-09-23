-- Allow the existing company settings admin surface to manage only its own
-- organisation's Twilio sender mapping. Authenticated users still cannot delete.
--
-- Some disposable databases pre-date the live organisation-named sender table.
-- Keep their migration chain usable while applying the policies where it exists.
DO $migration$
BEGIN
  IF to_regclass('public.organisation_twilio_senders') IS NULL THEN
    RAISE NOTICE 'organisation_twilio_senders is not present; sender RLS migration skipped';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.organisation_twilio_senders ENABLE ROW LEVEL SECURITY';
  EXECUTE 'REVOKE ALL ON public.organisation_twilio_senders FROM anon, authenticated';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.organisation_twilio_senders TO authenticated';

  EXECUTE 'DROP POLICY IF EXISTS "Organisation members can view Twilio senders" ON public.organisation_twilio_senders';
  EXECUTE $policy$
    CREATE POLICY "Organisation members can view Twilio senders"
      ON public.organisation_twilio_senders
      FOR SELECT
      TO authenticated
      USING (organisation_id = public.current_organisation_id())
  $policy$;

  EXECUTE 'DROP POLICY IF EXISTS "Organisation admins can insert Twilio senders" ON public.organisation_twilio_senders';
  EXECUTE $policy$
    CREATE POLICY "Organisation admins can insert Twilio senders"
      ON public.organisation_twilio_senders
      FOR INSERT
      TO authenticated
      WITH CHECK (
        organisation_id = public.current_organisation_id()
        AND public.is_org_admin()
      )
  $policy$;

  EXECUTE 'DROP POLICY IF EXISTS "Organisation admins can update Twilio senders" ON public.organisation_twilio_senders';
  EXECUTE $policy$
    CREATE POLICY "Organisation admins can update Twilio senders"
      ON public.organisation_twilio_senders
      FOR UPDATE
      TO authenticated
      USING (
        organisation_id = public.current_organisation_id()
        AND public.is_org_admin()
      )
      WITH CHECK (
        organisation_id = public.current_organisation_id()
        AND public.is_org_admin()
      )
  $policy$;
END
$migration$;
