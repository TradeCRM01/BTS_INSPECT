-- Price book CSV import. Adds GST on each item and a one-shot save.
-- Do not apply this file to live from this draft PR. Ship the file only.

ALTER TABLE public.price_book_items
  ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2) NOT NULL DEFAULT 10;

ALTER TABLE public.price_book_items
  DROP CONSTRAINT IF EXISTS price_book_items_gst_rate_check;

ALTER TABLE public.price_book_items
  ADD CONSTRAINT price_book_items_gst_rate_check
  CHECK (gst_rate >= 0 AND gst_rate <= 100);

COMMENT ON COLUMN public.price_book_items.gst_rate IS
  'GST percent for this rate. Sell is exclusive. Quote pick uses unit_price plus this rate.';

CREATE UNIQUE INDEX IF NOT EXISTS price_book_items_book_code_uidx
  ON public.price_book_items (price_book_id, lower(btrim(code)))
  WHERE code IS NOT NULL AND btrim(code) <> '';

CREATE OR REPLACE FUNCTION public.import_price_book_items(
  p_price_book_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_inserted int := 0;
  v_updated int := 0;
  v_item jsonb;
  v_code text;
  v_name text;
  v_unit text;
  v_cost numeric;
  v_sell numeric;
  v_gst numeric;
  v_existing_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No items to import';
  END IF;

  SELECT pb.company_id
  INTO v_company_id
  FROM public.price_books pb
  WHERE pb.id = p_price_book_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Price book not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Price book not found';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_code := nullif(btrim(v_item->>'code'), '');
    v_name := nullif(btrim(v_item->>'name'), '');
    v_unit := coalesce(nullif(btrim(v_item->>'unit'), ''), 'each');

    IF v_code IS NULL THEN
      RAISE EXCEPTION 'missing code';
    END IF;
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'missing name';
    END IF;

    BEGIN
      v_sell := (v_item->>'sell')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'non-numeric sell';
    END;

    IF v_sell IS NULL OR v_sell < 0 THEN
      RAISE EXCEPTION 'non-numeric sell';
    END IF;

    IF v_item->>'cost' IS NULL OR btrim(v_item->>'cost') = '' THEN
      v_cost := NULL;
    ELSE
      BEGIN
        v_cost := (v_item->>'cost')::numeric;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'non-numeric cost';
      END;
    END IF;

    BEGIN
      v_gst := coalesce((v_item->>'gst')::numeric, 10);
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'bad GST';
    END;

    IF v_gst < 0 OR v_gst > 100 THEN
      RAISE EXCEPTION 'bad GST';
    END IF;

    SELECT i.id
    INTO v_existing_id
    FROM public.price_book_items i
    WHERE i.price_book_id = p_price_book_id
      AND i.code IS NOT NULL
      AND lower(btrim(i.code)) = lower(v_code)
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.price_book_items
      SET
        description = v_name,
        unit = v_unit,
        cost_price = v_cost,
        unit_price = v_sell,
        gst_rate = v_gst,
        is_active = true
      WHERE id = v_existing_id
        AND company_id = v_company_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Price book item update failed';
      END IF;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO public.price_book_items (
        price_book_id,
        company_id,
        code,
        description,
        unit,
        unit_price,
        cost_price,
        gst_rate,
        is_active
      ) VALUES (
        p_price_book_id,
        v_company_id,
        v_code,
        v_name,
        v_unit,
        v_sell,
        v_cost,
        v_gst,
        true
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.import_price_book_items(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_price_book_items(uuid, jsonb) TO authenticated;
