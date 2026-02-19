-- 004_assets_vault.sql — Assets Vault: folders + enriched attachments

-- ============================================================
-- 1. vault_folders — hierarchical folder tree per user
-- ============================================================
CREATE TABLE IF NOT EXISTS vault_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES vault_folders(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vault_folders_user   ON vault_folders (user_id);
CREATE INDEX IF NOT EXISTS idx_vault_folders_parent ON vault_folders (parent_id);

ALTER TABLE vault_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY vault_folders_select ON vault_folders FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY vault_folders_insert ON vault_folders FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY vault_folders_update ON vault_folders FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY vault_folders_delete ON vault_folders FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 2. Enrich attachments table for vault use
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attachments' AND column_name = 'folder_id'
  ) THEN
    ALTER TABLE attachments ADD COLUMN folder_id uuid REFERENCES vault_folders(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attachments' AND column_name = 'source'
  ) THEN
    ALTER TABLE attachments ADD COLUMN source text NOT NULL DEFAULT 'upload';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attachments' AND column_name = 'display_name'
  ) THEN
    ALTER TABLE attachments ADD COLUMN display_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attachments' AND column_name = 'description'
  ) THEN
    ALTER TABLE attachments ADD COLUMN description text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attachments' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE attachments ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Source check constraint (idempotent via exception handler)
DO $$
BEGIN
  ALTER TABLE attachments ADD CONSTRAINT attachments_source_check
    CHECK (source IN ('upload', 'chat', 'ai_generated'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_attachments_folder ON attachments (folder_id);
CREATE INDEX IF NOT EXISTS idx_attachments_source ON attachments (source);

-- Update RLS policy for attachments (add update if missing)
DO $$
BEGIN
  CREATE POLICY attachments_update ON attachments FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ============================================================
-- 3. RPC: get_folder_breadcrumbs — recursive ancestor chain
-- ============================================================
CREATE OR REPLACE FUNCTION get_folder_breadcrumbs(folder_uuid uuid, user_uuid uuid)
RETURNS TABLE (id uuid, name text) AS $$
  WITH RECURSIVE chain AS (
    SELECT vf.id, vf.name, vf.parent_id
    FROM vault_folders vf
    WHERE vf.id = folder_uuid AND vf.user_id = user_uuid
    UNION ALL
    SELECT vf.id, vf.name, vf.parent_id
    FROM vault_folders vf
    INNER JOIN chain c ON c.parent_id = vf.id
  )
  SELECT chain.id, chain.name FROM chain
  ORDER BY
    -- Root-first: count depth by recursing again (simple approach: reverse the CTE order)
    (SELECT count(*) FROM (
      WITH RECURSIVE depth AS (
        SELECT vf2.id, vf2.parent_id, 0 AS lvl FROM vault_folders vf2 WHERE vf2.id = chain.id
        UNION ALL
        SELECT vf2.id, vf2.parent_id, d.lvl + 1 FROM vault_folders vf2 INNER JOIN depth d ON d.parent_id = vf2.id
      ) SELECT 1 FROM depth
    ) sub) DESC;
$$ LANGUAGE sql STABLE;
