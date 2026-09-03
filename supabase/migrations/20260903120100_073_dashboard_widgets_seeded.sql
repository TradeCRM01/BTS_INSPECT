-- Once-only dashboard widget seed on the existing profiles row.
-- First empty visit writes the default set; later empty (delete-all) stays empty.
-- No new table. Later than tickets 072 (20260903120000_072_member_tickets.sql).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_widgets_seeded boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.dashboard_widgets_seeded IS
  'Once-only dashboard widget seed. First empty visit writes defaults; later empty (delete-all) stays empty.';

UPDATE public.profiles p
SET dashboard_widgets_seeded = true
WHERE p.dashboard_widgets_seeded = false
  AND EXISTS (
    SELECT 1 FROM public.dashboard_widgets w WHERE w.user_id = p.id
  );
