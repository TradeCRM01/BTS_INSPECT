-- Phase 1 already owns the table, member SELECT policy, RLS enablement, and
-- service-role grant. Add only the authenticated admin writes needed by the
-- existing company settings surface. Deactivation is an UPDATE to active=false;
-- authenticated users still cannot delete sender mappings.

DO $skip_admin_write$
BEGIN
  IF to_regclass('public.organisation_twilio_senders') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'organisation_id'
    )
  THEN
    RAISE NOTICE 'Skipping organisation Twilio admin-write on companies schema';
    RETURN;
  END IF;

GRANT INSERT, UPDATE ON public.organisation_twilio_senders TO authenticated;

CREATE POLICY "Organisation admins can insert Twilio senders"
  ON public.organisation_twilio_senders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.organisation_id = organisation_twilio_senders.organisation_id
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Organisation admins can update Twilio senders"
  ON public.organisation_twilio_senders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.organisation_id = organisation_twilio_senders.organisation_id
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.organisation_id = organisation_twilio_senders.organisation_id
        AND profiles.role = 'admin'
    )
  );
END;
$skip_admin_write$;
