-- Reminders deepen agent_reminders (040): free-text details, a private/company
-- visibility switch, tagged teammates as a uuid[] like jobs.assigned_team, and
-- updated_at. Job links keep riding related_type = 'job' + related_id. Not a
-- second reminders table, no join table, no bot, no cron. The owner edits; tagged
-- teammates tick done; company viewers read.

ALTER TABLE public.agent_reminders
  ADD COLUMN IF NOT EXISTS details text,
  ADD COLUMN IF NOT EXISTS tagged_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Rows written before this migration were visible to the whole company under the
-- 040 policy. Adding the column with DEFAULT 'company' backfills them that way in
-- one step; new rows then default to private.
ALTER TABLE public.agent_reminders
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'company';
ALTER TABLE public.agent_reminders
  ALTER COLUMN visibility SET DEFAULT 'private';

ALTER TABLE public.agent_reminders DROP CONSTRAINT IF EXISTS agent_reminders_visibility_check;
ALTER TABLE public.agent_reminders
  ADD CONSTRAINT agent_reminders_visibility_check CHECK (visibility IN ('private', 'company'));

CREATE INDEX IF NOT EXISTS idx_agent_reminders_tagged_user_ids
  ON public.agent_reminders USING gin (tagged_user_ids);

DROP POLICY IF EXISTS "Company members can view agent_reminders" ON public.agent_reminders;
DROP POLICY IF EXISTS "Company members can insert agent_reminders" ON public.agent_reminders;
DROP POLICY IF EXISTS "Company members can update agent_reminders" ON public.agent_reminders;
DROP POLICY IF EXISTS "Company members can delete agent_reminders" ON public.agent_reminders;

DROP POLICY IF EXISTS "Reminder is visible to owner, tagged members, or the company when public" ON public.agent_reminders;
CREATE POLICY "Reminder is visible to owner, tagged members, or the company when public"
  ON public.agent_reminders FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (
      visibility = 'company'
      OR user_id = auth.uid()
      OR auth.uid() = ANY (tagged_user_ids)
    )
  );

DROP POLICY IF EXISTS "Members add their own reminders" ON public.agent_reminders;
CREATE POLICY "Members add their own reminders"
  ON public.agent_reminders FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Anyone who can see a reminder can update it" ON public.agent_reminders;
DROP POLICY IF EXISTS "Owner edits, tagged members tick" ON public.agent_reminders;
CREATE POLICY "Owner edits, tagged members tick"
  ON public.agent_reminders FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (user_id = auth.uid() OR auth.uid() = ANY (tagged_user_ids))
  )
  WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- The policy above decides which rows a tagged member may update. This trigger decides
-- which columns: completed, completed_at and updated_at only. Everything else is the
-- owner's. A service-role write (no auth.uid()) is the assistant acting for the owner.
CREATE OR REPLACE FUNCTION public.agent_reminders_tagged_tick_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL OR OLD.user_id = auth.uid() THEN
    RETURN NEW;
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title
    OR NEW.details IS DISTINCT FROM OLD.details
    OR NEW.due_date IS DISTINCT FROM OLD.due_date
    OR NEW.related_type IS DISTINCT FROM OLD.related_type
    OR NEW.related_id IS DISTINCT FROM OLD.related_id
    OR NEW.visibility IS DISTINCT FROM OLD.visibility
    OR NEW.tagged_user_ids IS DISTINCT FROM OLD.tagged_user_ids
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.company_id IS DISTINCT FROM OLD.company_id
  THEN
    RAISE EXCEPTION 'Only the owner can edit this reminder. Tagged teammates can mark it done.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_reminders_tagged_tick_only ON public.agent_reminders;
CREATE TRIGGER agent_reminders_tagged_tick_only
  BEFORE UPDATE ON public.agent_reminders
  FOR EACH ROW EXECUTE FUNCTION public.agent_reminders_tagged_tick_only();

DROP POLICY IF EXISTS "Only the owner deletes a reminder" ON public.agent_reminders;
CREATE POLICY "Only the owner deletes a reminder"
  ON public.agent_reminders FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND user_id = auth.uid()
  );
