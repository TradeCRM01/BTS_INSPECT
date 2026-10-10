DO $$
BEGIN
  IF to_regclass('public.companies') IS NULL THEN
    RAISE EXCEPTION 'missed-call bootstrap requires public.companies';
  END IF;

  IF to_regclass('public.organisations') IS NOT NULL THEN
    RAISE EXCEPTION 'missed-call bootstrap must not leave public.organisations';
  END IF;
END;
$$;
