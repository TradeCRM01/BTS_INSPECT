-- Prod-faithful template + field tables (columns/policies read from prod pg_policies / information_schema, 2026-10-19 ~11:45 AEST)
CREATE TABLE public.templates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id), created_by uuid NOT NULL,
  name text NOT NULL, description text, report_renderer text NOT NULL DEFAULT 'generic_inspection', schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  version int NOT NULL DEFAULT 1, archived boolean NOT NULL DEFAULT false, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.jha_templates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id), created_by uuid NOT NULL,
  name text NOT NULL, description text, schema jsonb NOT NULL DEFAULT '{}'::jsonb, version int NOT NULL DEFAULT 1, archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.inspection_renderers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id), key text NOT NULL,
  label text NOT NULL, built_in boolean, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id), title text, client_id uuid, inspection_id uuid, assigned_team uuid[]);
CREATE TABLE public.inspections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), template_id uuid NOT NULL REFERENCES public.templates(id), template_snapshot jsonb NOT NULL,
  inspector_id uuid NOT NULL, status text NOT NULL DEFAULT 'draft', responses jsonb NOT NULL DEFAULT '{}'::jsonb, meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz DEFAULT now(), completed_at timestamptz, archived boolean NOT NULL DEFAULT false, client_id uuid, crm_job_id uuid, parent_inspection_id uuid);
CREATE TABLE public.jha_documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), template_id uuid NOT NULL REFERENCES public.jha_templates(id), template_snapshot jsonb NOT NULL,
  company_id uuid NOT NULL, created_by uuid NOT NULL, status text NOT NULL DEFAULT 'draft', meta jsonb NOT NULL DEFAULT '{}'::jsonb, steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ppe jsonb NOT NULL DEFAULT '[]'::jsonb, sign_offs jsonb NOT NULL DEFAULT '[]'::jsonb, report_number text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, client_id uuid, job_id uuid);
DO $$DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['templates','jha_templates','inspection_renderers','jobs','inspections','jha_documents'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('GRANT ALL ON public.%I TO anon, authenticated, service_role', t); END LOOP; END$$;
CREATE POLICY "Company members can view templates" ON public.templates FOR SELECT TO authenticated USING (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "Company members can insert templates" ON public.templates FOR INSERT TO authenticated WITH CHECK (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "Company members can update templates" ON public.templates FOR UPDATE TO authenticated USING (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid())) WITH CHECK (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "Company members can delete templates" ON public.templates FOR DELETE TO authenticated USING (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY select_jha_templates ON public.jha_templates FOR SELECT TO authenticated USING (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY insert_jha_templates ON public.jha_templates FOR INSERT TO authenticated WITH CHECK (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY update_jha_templates ON public.jha_templates FOR UPDATE TO authenticated USING (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid())) WITH CHECK (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY delete_jha_templates ON public.jha_templates FOR DELETE TO authenticated USING (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "Company members can view renderers" ON public.inspection_renderers FOR SELECT TO authenticated USING (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "Company admins can insert renderers" ON public.inspection_renderers FOR INSERT TO authenticated WITH CHECK (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY "Company admins can update renderers" ON public.inspection_renderers FOR UPDATE TO authenticated USING (built_in = false AND company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')) WITH CHECK (built_in = false AND company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY "Company admins can delete renderers" ON public.inspection_renderers FOR DELETE TO authenticated USING (built_in = false AND company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY "Company members can view jobs" ON public.jobs FOR SELECT TO authenticated USING (company_id = (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "Company members can update jobs" ON public.jobs FOR UPDATE TO authenticated USING (company_id = (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid())) WITH CHECK (company_id = (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "Users can view company inspections" ON public.inspections FOR SELECT TO authenticated USING ((SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()) = (SELECT profiles.company_id FROM profiles WHERE profiles.id = inspections.inspector_id));
CREATE POLICY "Users can create inspections" ON public.inspections FOR INSERT TO authenticated WITH CHECK (inspector_id = auth.uid());
CREATE POLICY "Users can update company inspections" ON public.inspections FOR UPDATE TO authenticated USING ((SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()) = (SELECT profiles.company_id FROM profiles WHERE profiles.id = inspections.inspector_id)) WITH CHECK ((SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()) = (SELECT profiles.company_id FROM profiles WHERE profiles.id = inspections.inspector_id));
CREATE POLICY select_jha_documents ON public.jha_documents FOR SELECT TO authenticated USING (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY insert_jha_documents ON public.jha_documents FOR INSERT TO authenticated WITH CHECK (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY update_jha_documents ON public.jha_documents FOR UPDATE TO authenticated USING (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid())) WITH CHECK (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()));
