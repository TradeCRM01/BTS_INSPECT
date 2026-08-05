/*
  # BTS Inspect — Companies and Profiles

  1. New Tables
    - `companies`: Organisation with branding fields
    - `profiles`: User linked to auth.users and a company

  2. Security
    - RLS enabled on both tables
    - Company insert allowed during signup (profile doesn't exist yet)
    - Profile policies: own row + company members can read
*/

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  abn text,
  licence_number text,
  phone text,
  email text,
  website text,
  logo_url text,
  brand_primary text DEFAULT '#0A2540',
  brand_accent text DEFAULT '#2E75B6',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  licence_number text,
  company_id uuid NOT NULL REFERENCES companies(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Companies policies (reference profiles, so defined after profiles table creation)
CREATE POLICY "Company members can view their company"
  ON companies FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Company members can update their company"
  ON companies FOR UPDATE
  TO authenticated
  USING (id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Allow company insert during signup"
  ON companies FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Company members can view team profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
