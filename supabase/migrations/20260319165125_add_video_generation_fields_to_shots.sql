-- Migration: Add video generation fields to shots table

ALTER TABLE shots
ADD COLUMN IF NOT EXISTS video_url text,
ADD COLUMN IF NOT EXISTS video_generation_id text,
ADD COLUMN IF NOT EXISTS video_status text;
