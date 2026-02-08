-- Fix missing columns in projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS genre text[];
ALTER TABLE projects ADD COLUMN IF NOT EXISTS series_plan jsonb;

-- Fix missing columns in episodes table
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS structure jsonb;

-- Fix missing columns in assets table
ALTER TABLE assets ADD COLUMN IF NOT EXISTS visual_prompt text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Fix missing columns in shots table
ALTER TABLE shots ADD COLUMN IF NOT EXISTS narrative_goal text;
ALTER TABLE shots ADD COLUMN IF NOT EXISTS visual_evidence text;
ALTER TABLE shots ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE shots ADD COLUMN IF NOT EXISTS dialogue text;
ALTER TABLE shots ADD COLUMN IF NOT EXISTS camera text;
ALTER TABLE shots ADD COLUMN IF NOT EXISTS size text;
ALTER TABLE shots ADD COLUMN IF NOT EXISTS duration integer;
ALTER TABLE shots ADD COLUMN IF NOT EXISTS related_asset_ids uuid[];
