-- Crop + letterhead size for the existing company logo. Not a Logos module.
-- Null crop / size keep today's full-image, 96px letterhead for every tenant.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS logo_crop jsonb,
  ADD COLUMN IF NOT EXISTS logo_letterhead_size integer;

COMMENT ON COLUMN public.companies.logo_crop IS
  'Focus box on companies.logo_url: {x,y,w,h} as 0-1 of the stored mark, optional aspect (natural w/h). Null = full image.';

COMMENT ON COLUMN public.companies.logo_letterhead_size IS
  'Height in px of the cropped mark on quote/invoice letterhead. Null = current 96px default.';

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_logo_letterhead_size_ok;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_logo_letterhead_size_ok
  CHECK (
    logo_letterhead_size IS NULL
    OR (logo_letterhead_size >= 32 AND logo_letterhead_size <= 120)
  );
