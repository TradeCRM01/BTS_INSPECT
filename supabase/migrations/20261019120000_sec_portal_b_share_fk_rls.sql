CREATE OR REPLACE FUNCTION public.inspection_inspector_company_id(p_inspection_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.company_id
  FROM public.inspections i
  JOIN public.profiles p ON p.id = i.inspector_id
  WHERE i.id = p_inspection_id
$$;

REVOKE ALL ON FUNCTION public.inspection_inspector_company_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inspection_inspector_company_id(uuid) TO authenticated;

DROP POLICY IF EXISTS "insert_company_portal_tokens" ON client_portal_tokens;
CREATE POLICY "insert_company_portal_tokens" ON client_portal_tokens FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
    AND EXISTS (select 1 from public.clients c where c.id = client_portal_tokens.client_id and c.company_id = client_portal_tokens.company_id)
  );

DROP POLICY IF EXISTS "update_company_portal_tokens" ON client_portal_tokens;
CREATE POLICY "update_company_portal_tokens" ON client_portal_tokens FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
    AND EXISTS (select 1 from public.clients c where c.id = client_portal_tokens.client_id and c.company_id = client_portal_tokens.company_id)
  );

DROP POLICY IF EXISTS "inspection_report_shares_insert" ON public.inspection_report_shares;
CREATE POLICY "inspection_report_shares_insert"
  ON public.inspection_report_shares FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (select company_id from public.profiles where id = auth.uid())
    AND public.inspection_inspector_company_id(inspection_id) = company_id
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
    AND public.inspection_inspector_company_id(inspection_id) = company_id
  );

REVOKE ALL ON public.client_portal_tokens FROM anon;
REVOKE ALL ON public.inspection_report_shares FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.client_portal_tokens FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.inspection_report_shares FROM authenticated;
