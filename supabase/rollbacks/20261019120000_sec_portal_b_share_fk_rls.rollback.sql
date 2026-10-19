DROP POLICY IF EXISTS "insert_company_portal_tokens" ON client_portal_tokens;
CREATE POLICY "insert_company_portal_tokens" ON client_portal_tokens FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  );

DROP POLICY IF EXISTS "update_company_portal_tokens" ON client_portal_tokens;
CREATE POLICY "update_company_portal_tokens" ON client_portal_tokens FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  );

DROP POLICY IF EXISTS "inspection_report_shares_insert" ON public.inspection_report_shares;
CREATE POLICY "inspection_report_shares_insert"
  ON public.inspection_report_shares FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

DROP POLICY IF EXISTS "inspection_report_shares_update" ON public.inspection_report_shares;
CREATE POLICY "inspection_report_shares_update"
  ON public.inspection_report_shares FOR UPDATE
  TO authenticated
  USING (
    company_id = (select company_id from public.profiles where id = auth.uid())
  )
  WITH CHECK (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

GRANT ALL ON public.client_portal_tokens TO anon;
GRANT ALL ON public.inspection_report_shares TO anon;
GRANT TRUNCATE, TRIGGER, REFERENCES ON public.client_portal_tokens TO authenticated;
GRANT TRUNCATE, TRIGGER, REFERENCES ON public.inspection_report_shares TO authenticated;
