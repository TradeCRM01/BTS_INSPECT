/*
# Shared Drive — Local backup settings

Stores per-company preferences for local hard-drive backup via the
File System Access API. The browser can't persist the directory handle
across sessions without re-granting permission, so we store metadata
(folder name, enabled flag, sync mode) and re-attach the handle at runtime.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'backup_enabled') THEN
    ALTER TABLE companies ADD COLUMN backup_enabled boolean DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'backup_folder_name') THEN
    ALTER TABLE companies ADD COLUMN backup_folder_name text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'backup_sync_mode') THEN
    ALTER TABLE companies ADD COLUMN backup_sync_mode text DEFAULT 'manual';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'backup_last_synced_at') THEN
    ALTER TABLE companies ADD COLUMN backup_last_synced_at timestamptz;
  END IF;
END $$;
