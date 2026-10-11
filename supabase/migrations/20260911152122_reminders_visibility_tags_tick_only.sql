-- Catalog fill (baseline r3 / #368). Prod version 20260911152122 reminders_visibility_tags_tick_only stays APPLIED.
-- Recreated from pg_get_functiondef / pg_get_triggerdef verbatim. Guarded.

CREATE OR REPLACE FUNCTION public.agent_reminders_tagged_tick_only()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$

DROP TRIGGER IF EXISTS agent_reminders_tagged_tick_only ON public.agent_reminders;
CREATE TRIGGER agent_reminders_tagged_tick_only BEFORE UPDATE ON public.agent_reminders FOR EACH ROW EXECUTE FUNCTION agent_reminders_tagged_tick_only();
