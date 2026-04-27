ALTER TABLE assets
ADD COLUMN IF NOT EXISTS volcengine_asset_id text,
ADD COLUMN IF NOT EXISTS volcengine_asset_status text,
ADD COLUMN IF NOT EXISTS volcengine_asset_group_id text,
ADD COLUMN IF NOT EXISTS volcengine_asset_project_name text,
ADD COLUMN IF NOT EXISTS volcengine_asset_type text,
ADD COLUMN IF NOT EXISTS volcengine_asset_error jsonb,
ADD COLUMN IF NOT EXISTS volcengine_asset_synced_at timestamp with time zone;

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS volcengine_video_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE shots
ADD COLUMN IF NOT EXISTS video_generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
