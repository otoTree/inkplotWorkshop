-- Migration: Add Industrial-grade storyboard fields to shots table

ALTER TABLE shots
ADD COLUMN IF NOT EXISTS scene_label text,
ADD COLUMN IF NOT EXISTS character_action text,
ADD COLUMN IF NOT EXISTS emotion text,
ADD COLUMN IF NOT EXISTS lighting_atmosphere text,
ADD COLUMN IF NOT EXISTS sound_effect text,
ADD COLUMN IF NOT EXISTS reference_image text,
ADD COLUMN IF NOT EXISTS video_prompt text,
ADD COLUMN IF NOT EXISTS characters jsonb;
