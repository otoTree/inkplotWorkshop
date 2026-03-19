-- Add cover generation fields to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS cover_image_url text,
ADD COLUMN IF NOT EXISTS cover_title text,
ADD COLUMN IF NOT EXISTS cover_slogan text,
ADD COLUMN IF NOT EXISTS cover_prompt text;
