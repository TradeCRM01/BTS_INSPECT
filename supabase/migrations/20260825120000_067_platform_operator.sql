/*
  # Platform operator console (developer-only)

  Grafter is a multi-tenant product. Company `profiles.role = 'admin'` is a
  tenant admin — not a platform operator. Only rows in `platform_operators`
  can see every business, suspend access, or start a subscription.

  Do not store the operator flag on the auth user row or in client env vars.
  Those are spoofable from the browser.

  Apply in the SQL editor if this environment cannot `db push`:
  https://supabase.com/dashboard/project/ezszahvwwmbuekpedumf/sql/new

  Seed: jackpeterwieland@gmail.com if that auth user already exists.
  Add further operators with:

    insert into platform_operators (user_id, email)
    select id, email from auth.users where lower(email) = 'you@example.com';
*/

-- ── Operator allow-list ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_operators (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_operators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operators can read own row" ON platform_operators;
CREATE POLICY "operators can read own row"
  ON platform_operators FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON platform_operators FROM anon, authenticated;
GRANT SELECT ON platform_operators TO authenticated;

CREATE OR REPLACE FUNCTION public.is_platform_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform_operators
    WHERE user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_operator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_operator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_operator() TO service_role;

INSERT INTO platform_operators (user_id, email)
SELECT id, email
FROM auth.users
WHERE lower(email) = 'jackpeterwieland@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- ── Tenant billing / access columns ────────────────────────────────────────
-- access_status: whether the company may use Grafter
-- billing_status: subscription lifecycle (Stripe webhook writes this)
-- plan: starter | crew | shop (one Stripe Product per plan — never share a Product across tiers)

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS seat_limit integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_access_status_check'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_access_status_check
      CHECK (access_status IN ('active', 'suspended'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_billing_status_check'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_billing_status_check
      CHECK (billing_status IN ('none', 'trial', 'active', 'past_due', 'canceled'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_plan_check'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_plan_check
      CHECK (plan IN ('starter', 'crew', 'shop'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS companies_access_status_idx ON companies (access_status);
CREATE INDEX IF NOT EXISTS companies_billing_status_idx ON companies (billing_status);
CREATE INDEX IF NOT EXISTS companies_created_at_idx ON companies (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS companies_stripe_customer_id_uidx
  ON companies (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Existing tenants keep working. New signups set trial in signup-user.
UPDATE companies
SET billing_status = 'none'
WHERE billing_status IS NULL;

-- Tenant admins must not overwrite billing / access via select('*') updates.
CREATE OR REPLACE FUNCTION public.protect_company_platform_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  NEW.access_status := OLD.access_status;
  NEW.billing_status := OLD.billing_status;
  NEW.plan := OLD.plan;
  NEW.stripe_customer_id := OLD.stripe_customer_id;
  NEW.stripe_subscription_id := OLD.stripe_subscription_id;
  NEW.trial_ends_at := OLD.trial_ends_at;
  NEW.seat_limit := OLD.seat_limit;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_company_platform_columns ON companies;
CREATE TRIGGER trg_protect_company_platform_columns
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_company_platform_columns();

-- ── Operator-only notes + audit ────────────────────────────────────────────
-- Not on companies: tenant admins select('*') their company row.

CREATE TABLE IF NOT EXISTS platform_company_notes (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE platform_company_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_company_notes FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS platform_operator_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id),
  actor_email text,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS platform_operator_events_created_at_idx
  ON platform_operator_events (created_at DESC);
CREATE INDEX IF NOT EXISTS platform_operator_events_company_id_idx
  ON platform_operator_events (company_id);

ALTER TABLE platform_operator_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_operator_events FROM anon, authenticated;

-- Operators do not get PostgREST SELECT on every tenant table. Directory,
-- people, suspend, and Stripe go through the platform-operator edge function
-- (service role after verifying is_platform_operator()).
