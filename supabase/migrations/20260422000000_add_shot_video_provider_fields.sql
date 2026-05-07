ALTER TABLE shots
ADD COLUMN IF NOT EXISTS video_provider_status text,
ADD COLUMN IF NOT EXISTS video_last_frame_url text,
ADD COLUMN IF NOT EXISTS video_error_code text,
ADD COLUMN IF NOT EXISTS video_error_message text,
ADD COLUMN IF NOT EXISTS video_usage_summary jsonb;
