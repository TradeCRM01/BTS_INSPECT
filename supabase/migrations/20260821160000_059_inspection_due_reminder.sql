-- Due-testing / inspection reminders on existing inspection records.
-- due_on is a projection of dates already on the inspection (next-test /
-- due fields) or, for open records, the linked job scheduled_date.
-- Sent markers are written only after a successful send.

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS due_on date;

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS due_reminder_sent_at timestamptz;

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS due_reminder_sent_for_date date;

COMMENT ON COLUMN inspections.due_on IS
  'Projected due date from existing next-test / due fields, else open-job scheduled_date. Not a new due-date product.';

COMMENT ON COLUMN inspections.due_reminder_sent_at IS
  'When the inspection due reminder last sent successfully. Null means it was never sent or a send failed.';

COMMENT ON COLUMN inspections.due_reminder_sent_for_date IS
  'due_on the last successful due reminder was sent for. A later date change may send again.';

CREATE INDEX IF NOT EXISTS idx_inspections_due_on
  ON inspections (due_on)
  WHERE due_on IS NOT NULL AND coalesce(archived, false) = false;

CREATE OR REPLACE FUNCTION public.inspection_due_label_matches(label text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(label, '') ~* '(next[[:space:]]*test|re-?test|next[[:space:]]*due|due[[:space:]]*date|next[[:space:]]*inspection|next[[:space:]]*service|test[[:space:]]*due|next[[:space:]]*check)';
$$;

CREATE OR REPLACE FUNCTION public.inspection_ymd(value text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  day text;
BEGIN
  day := substr(btrim(coalesce(value, '')), 1, 10);
  IF day ~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN day::date;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.inspection_schema(snapshot jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN snapshot ? 'schema' AND jsonb_typeof(snapshot->'schema') = 'object'
      THEN snapshot->'schema'
    WHEN snapshot ? 'sections'
      THEN snapshot
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.inspection_resolve_due_on(
  snapshot jsonb,
  meta jsonb,
  responses jsonb,
  status text,
  job_scheduled date
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  schema jsonb;
  field jsonb;
  section jsonb;
  question jsonb;
  kv record;
  qid text;
  due_ids text[] := ARRAY[]::text[];
  found date;
  earliest date;
  meta_keys text[] := ARRAY[
    'nextTestDate', 'next_test_date', 'nextTest', 'next_test',
    'dueDate', 'due_date', 'retestDate', 'retest_date',
    'nextDue', 'next_due'
  ];
  key text;
BEGIN
  schema := public.inspection_schema(snapshot);

  FOREACH key IN ARRAY meta_keys LOOP
    found := public.inspection_ymd(meta ->> key);
    IF found IS NOT NULL AND (earliest IS NULL OR found < earliest) THEN
      earliest := found;
    END IF;
  END LOOP;

  IF schema IS NOT NULL THEN
    FOR field IN
      SELECT value FROM jsonb_array_elements(coalesce(schema->'meta'->'customFields', '[]'::jsonb))
    LOOP
      IF field->>'type' = 'date'
         AND (
           public.inspection_due_label_matches(field->>'label')
           OR public.inspection_due_label_matches(field->>'name')
         )
      THEN
        found := public.inspection_ymd(meta ->> ('custom_' || coalesce(field->>'id', '')));
        IF found IS NOT NULL AND (earliest IS NULL OR found < earliest) THEN
          earliest := found;
        END IF;
      END IF;
    END LOOP;

    FOR section IN
      SELECT value FROM jsonb_array_elements(coalesce(schema->'sections', '[]'::jsonb))
    LOOP
      FOR question IN
        SELECT value FROM jsonb_array_elements(coalesce(section->'questions', '[]'::jsonb))
      LOOP
        IF question->>'type' = 'date'
           AND public.inspection_due_label_matches(question->>'label')
           AND coalesce(question->>'id', '') <> ''
        THEN
          due_ids := array_append(due_ids, question->>'id');
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  IF array_length(due_ids, 1) IS NOT NULL AND responses IS NOT NULL THEN
    FOR kv IN SELECT key, value FROM jsonb_each_text(responses) LOOP
      qid := split_part(kv.key, '__', 1);
      IF qid = ANY (due_ids) THEN
        found := public.inspection_ymd(kv.value);
        IF found IS NOT NULL AND (earliest IS NULL OR found < earliest) THEN
          earliest := found;
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF earliest IS NOT NULL THEN
    RETURN earliest;
  END IF;

  IF coalesce(status, '') NOT IN ('completed', 'issued') THEN
    RETURN job_scheduled;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.inspections_refresh_due_on()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  job_day date;
BEGIN
  IF NEW.crm_job_id IS NOT NULL THEN
    SELECT j.scheduled_date INTO job_day
    FROM jobs j
    WHERE j.id = NEW.crm_job_id;
  END IF;
  NEW.due_on := public.inspection_resolve_due_on(
    NEW.template_snapshot,
    NEW.meta,
    NEW.responses,
    NEW.status,
    job_day
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inspections_due_on_before ON inspections;
CREATE TRIGGER inspections_due_on_before
  BEFORE INSERT OR UPDATE OF meta, responses, template_snapshot, crm_job_id, status, archived
  ON inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.inspections_refresh_due_on();

CREATE OR REPLACE FUNCTION public.jobs_refresh_inspection_due_on()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
    UPDATE inspections
    SET due_on = public.inspection_resolve_due_on(
      template_snapshot, meta, responses, status, NEW.scheduled_date
    )
    WHERE crm_job_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_inspection_due_on_after ON jobs;
CREATE TRIGGER jobs_inspection_due_on_after
  AFTER UPDATE OF scheduled_date
  ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.jobs_refresh_inspection_due_on();

UPDATE inspections i
SET due_on = public.inspection_resolve_due_on(
  i.template_snapshot,
  i.meta,
  i.responses,
  i.status,
  (SELECT j.scheduled_date FROM jobs j WHERE j.id = i.crm_job_id)
);
