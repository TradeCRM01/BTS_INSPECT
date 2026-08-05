/*
  # Dashboard Widgets — Customizable per-user dashboard

  1. New Table
    - `dashboard_widgets`: Stores widget instances placed on a user's dashboard.
      Each row is a widget placed by a specific user, with a type (e.g. "weather",
      "bitcoin", "recent_inspections"), a grid position (x, y), a size (w, h in
      grid columns/rows), and an optional JSON config (e.g. city name, crypto
      symbol).

  2. Columns
    - `id` (uuid PK)
    - `user_id` (uuid, FK to profiles.id, NOT NULL, DEFAULT auth.uid()) — the
      dashboard owner
    - `widget_type` (text, NOT NULL) — widget kind from the registry
    - `grid_x` (int, NOT NULL DEFAULT 0) — column position in the grid
    - `grid_y` (int, NOT NULL DEFAULT 0) — row position in the grid
    - `grid_w` (int, NOT NULL DEFAULT 2) — width in grid columns
    - `grid_h` (int, NOT NULL DEFAULT 2) — height in grid rows
    - `config` (jsonb, DEFAULT '{}') — widget-specific settings
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  3. Security
    - RLS enabled
    - Owner-scoped CRUD: each authenticated user can only access their own widgets
    - user_id defaults to auth.uid() so inserts without explicit user_id succeed
*/

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  widget_type text NOT NULL,
  grid_x int NOT NULL DEFAULT 0,
  grid_y int NOT NULL DEFAULT 0,
  grid_w int NOT NULL DEFAULT 2,
  grid_h int NOT NULL DEFAULT 2,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_widgets" ON dashboard_widgets;
CREATE POLICY "select_own_widgets"
  ON dashboard_widgets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_widgets" ON dashboard_widgets;
CREATE POLICY "insert_own_widgets"
  ON dashboard_widgets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_widgets" ON dashboard_widgets;
CREATE POLICY "update_own_widgets"
  ON dashboard_widgets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_widgets" ON dashboard_widgets;
CREATE POLICY "delete_own_widgets"
  ON dashboard_widgets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
