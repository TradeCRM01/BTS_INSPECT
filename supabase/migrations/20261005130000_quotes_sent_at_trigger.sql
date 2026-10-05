-- Safety net: any insert/update that sets status sent with a null sent_at
-- stamps sent_at = now(). Never overwrites an existing sent_at.
-- App writers (share mark-sent, email Edge send) still set sent_at themselves.

CREATE OR REPLACE FUNCTION quotes_stamp_sent_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'sent' AND NEW.sent_at IS NULL THEN
    NEW.sent_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotes_stamp_sent_at ON quotes;
CREATE TRIGGER trg_quotes_stamp_sent_at
  BEFORE INSERT OR UPDATE ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION quotes_stamp_sent_at();
