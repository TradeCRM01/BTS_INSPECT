-- Grafter security / privacy floor (existing surfaces only).
-- 1) Stop a signed-in user hopping company_id or creating a tenant/profile from the client.
-- 2) Scope storage objects to the caller's company using the paths the app already writes.
-- 3) Stop authenticated clients calling cross-tenant photo cleanup / stats.

-- ── Tenant lock on profiles / companies ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_profile_tenant_hop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'company_id cannot be changed from the client';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_tenant_hop ON public.profiles;
CREATE TRIGGER trg_prevent_profile_tenant_hop
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_tenant_hop();

-- Signup and invites create company + profile with the service role.
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow company insert during signup" ON public.companies;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.my_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_company_id() TO service_role;

-- reports bucket: inspectionId/..., jhaDocumentId/..., invoices/{companyId}/...
CREATE OR REPLACE FUNCTION public.storage_reports_in_my_company(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (storage.foldername(object_name))[1] IN (
      SELECT i.id::text
      FROM public.inspections i
      JOIN public.profiles p ON p.id = i.inspector_id
      WHERE p.company_id = public.my_company_id()
    )
    OR (storage.foldername(object_name))[1] IN (
      SELECT d.id::text
      FROM public.jha_documents d
      WHERE d.company_id = public.my_company_id()
    )
    OR (
      (storage.foldername(object_name))[1] = 'invoices'
      AND (storage.foldername(object_name))[2] = public.my_company_id()::text
    )
    OR (storage.foldername(object_name))[1] = public.my_company_id()::text
$$;

REVOKE ALL ON FUNCTION public.storage_reports_in_my_company(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_reports_in_my_company(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_reports_in_my_company(text) TO service_role;

-- ── Storage: company-scoped using existing path conventions ─────────────────
-- photos: {inspectionId}/... or jha/{jhaDocumentId}/...
-- reports: {inspectionId}/... or {jhaDocumentId}/...
-- uploaded-pdfs: {companyId}/... or jha-swms/{companyId}/...
-- logos: {companyId}/logo.png (public read stays)
-- signatures: unused by the client today; lock writes to {companyId}/...

DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete photos" ON storage.objects;

CREATE POLICY "Company members can upload photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'photos'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT i.id::text
        FROM public.inspections i
        JOIN public.profiles p ON p.id = i.inspector_id
        WHERE p.company_id = public.my_company_id()
      )
      OR (
        (storage.foldername(name))[1] = 'jha'
        AND (storage.foldername(name))[2] IN (
          SELECT d.id::text
          FROM public.jha_documents d
          WHERE d.company_id = public.my_company_id()
        )
      )
    )
  );

CREATE POLICY "Company members can view photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'photos'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT i.id::text
        FROM public.inspections i
        JOIN public.profiles p ON p.id = i.inspector_id
        WHERE p.company_id = public.my_company_id()
      )
      OR (
        (storage.foldername(name))[1] = 'jha'
        AND (storage.foldername(name))[2] IN (
          SELECT d.id::text
          FROM public.jha_documents d
          WHERE d.company_id = public.my_company_id()
        )
      )
    )
  );

CREATE POLICY "Company members can delete photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'photos'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT i.id::text
        FROM public.inspections i
        JOIN public.profiles p ON p.id = i.inspector_id
        WHERE p.company_id = public.my_company_id()
      )
      OR (
        (storage.foldername(name))[1] = 'jha'
        AND (storage.foldername(name))[2] IN (
          SELECT d.id::text
          FROM public.jha_documents d
          WHERE d.company_id = public.my_company_id()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can upload reports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view reports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update reports" ON storage.objects;

CREATE POLICY "Company members can upload reports"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'reports'
    AND public.storage_reports_in_my_company(name)
  );

CREATE POLICY "Company members can view reports"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'reports'
    AND public.storage_reports_in_my_company(name)
  );

CREATE POLICY "Company members can update reports"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'reports'
    AND public.storage_reports_in_my_company(name)
  )
  WITH CHECK (
    bucket_id = 'reports'
    AND public.storage_reports_in_my_company(name)
  );

DROP POLICY IF EXISTS "Authenticated users can upload uploaded pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view uploaded pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update uploaded pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete uploaded pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Company members can upload uploaded pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Company members can read uploaded pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Company members can update uploaded pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Company members can delete uploaded pdfs" ON storage.objects;

CREATE POLICY "Company members can upload uploaded pdfs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'uploaded-pdfs'
    AND (
      (storage.foldername(name))[1] = public.my_company_id()::text
      OR (
        (storage.foldername(name))[1] = 'jha-swms'
        AND (storage.foldername(name))[2] = public.my_company_id()::text
      )
    )
  );

CREATE POLICY "Company members can read uploaded pdfs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'uploaded-pdfs'
    AND (
      (storage.foldername(name))[1] = public.my_company_id()::text
      OR (
        (storage.foldername(name))[1] = 'jha-swms'
        AND (storage.foldername(name))[2] = public.my_company_id()::text
      )
    )
  );

CREATE POLICY "Company members can update uploaded pdfs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'uploaded-pdfs'
    AND (
      (storage.foldername(name))[1] = public.my_company_id()::text
      OR (
        (storage.foldername(name))[1] = 'jha-swms'
        AND (storage.foldername(name))[2] = public.my_company_id()::text
      )
    )
  )
  WITH CHECK (
    bucket_id = 'uploaded-pdfs'
    AND (
      (storage.foldername(name))[1] = public.my_company_id()::text
      OR (
        (storage.foldername(name))[1] = 'jha-swms'
        AND (storage.foldername(name))[2] = public.my_company_id()::text
      )
    )
  );

CREATE POLICY "Company members can delete uploaded pdfs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'uploaded-pdfs'
    AND (
      (storage.foldername(name))[1] = public.my_company_id()::text
      OR (
        (storage.foldername(name))[1] = 'jha-swms'
        AND (storage.foldername(name))[2] = public.my_company_id()::text
      )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete logos" ON storage.objects;

CREATE POLICY "Company members can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = public.my_company_id()::text
  );

CREATE POLICY "Company members can update logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = public.my_company_id()::text
  )
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = public.my_company_id()::text
  );

CREATE POLICY "Company members can delete logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = public.my_company_id()::text
  );

DROP POLICY IF EXISTS "Authenticated users can upload signatures" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view signatures" ON storage.objects;

CREATE POLICY "Company members can upload signatures"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] = public.my_company_id()::text
  );

CREATE POLICY "Company members can view signatures"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] = public.my_company_id()::text
  );

-- ── Cleanup / analytics must not leak every tenant ─────────────────────────

REVOKE EXECUTE ON FUNCTION public.cleanup_old_photos(int) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cleanup_stats() FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_photos(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_cleanup_stats() TO service_role;

ALTER VIEW public.storage_analytics SET (security_invoker = true);
