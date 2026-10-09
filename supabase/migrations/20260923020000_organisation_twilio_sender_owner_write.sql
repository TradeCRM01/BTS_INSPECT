DROP POLICY IF EXISTS "Organisation admins can insert Twilio senders"
  ON public.organisation_twilio_senders;

DROP POLICY IF EXISTS "Organisation admins can update Twilio senders"
  ON public.organisation_twilio_senders;

DROP POLICY IF EXISTS "Organisation admins and owners can insert Twilio senders"
  ON public.organisation_twilio_senders;

DROP POLICY IF EXISTS "Organisation admins and owners can update Twilio senders"
  ON public.organisation_twilio_senders;

GRANT INSERT, UPDATE ON public.organisation_twilio_senders TO authenticated;

CREATE POLICY "Organisation admins and owners can insert Twilio senders"
  ON public.organisation_twilio_senders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.organisation_id = organisation_twilio_senders.organisation_id
        AND profiles.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Organisation admins and owners can update Twilio senders"
  ON public.organisation_twilio_senders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.organisation_id = organisation_twilio_senders.organisation_id
        AND profiles.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.organisation_id = organisation_twilio_senders.organisation_id
        AND profiles.role IN ('admin', 'owner')
    )
  );
