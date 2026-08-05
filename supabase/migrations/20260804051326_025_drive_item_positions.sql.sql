/*
# Shared Drive — Free-form grid positions

Add position_x and position_y columns to folders, uploaded_pdfs, and reports
so items can be placed anywhere on the desktop canvas (locked to a grid).
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'folders' AND column_name = 'position_x') THEN
    ALTER TABLE folders ADD COLUMN position_x integer DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'folders' AND column_name = 'position_y') THEN
    ALTER TABLE folders ADD COLUMN position_y integer DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uploaded_pdfs' AND column_name = 'position_x') THEN
    ALTER TABLE uploaded_pdfs ADD COLUMN position_x integer DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uploaded_pdfs' AND column_name = 'position_y') THEN
    ALTER TABLE uploaded_pdfs ADD COLUMN position_y integer DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'position_x') THEN
    ALTER TABLE reports ADD COLUMN position_x integer DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'position_y') THEN
    ALTER TABLE reports ADD COLUMN position_y integer DEFAULT 0;
  END IF;
END $$;
