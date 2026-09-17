-- LOCAL SANDBOX ONLY
-- GoTrue v2 cannot scan NULL into email_change / email_change_token_new.
-- Fixture inserts left those NULL. Empty string matches a normal Auth user.
-- Does not set or invent password hashes.

UPDATE auth.users
SET
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, '')
WHERE email IN ('m6.member@local.test', 'm6.other@local.test')
  AND (email_change IS NULL OR email_change_token_new IS NULL);
