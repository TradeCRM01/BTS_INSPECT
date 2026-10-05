-- Quote chase Step 4: one manual in-app chase. Never SMTP/SMS. Never auto-chase.
-- sent_at is the age clock (first time status became sent). Edits must not reset it.
-- chased_at is written only by in-app Mark chased. Null = never chased.
-- Status stays sent. A non-null chased_at permanently excludes the quote from Chase.
-- No new RLS: company members already update quotes.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS chased_at timestamptz;

COMMENT ON COLUMN quotes.sent_at IS
  'When the quote first became sent. Written on draft→sent (share mark-sent or email 2xx). Edits and Mark chased must not rewrite it. Chase age counts from this, never from updated_at.';

COMMENT ON COLUMN quotes.chased_at IS
  'When the office marked this sent quote chased in-app. Null means never chased. Does not change status. Never written by SMTP/SMS. Step 4 is once-only: any non-null value excludes the quote from Chase.';

-- Backfill existing sent quotes so the Chase clock has a start. updated_at is the
-- best surviving send-touch before sent_at existed.
UPDATE quotes
  SET sent_at = updated_at
  WHERE status = 'sent'
    AND sent_at IS NULL;
