-- Add cover_image_candidates field to projects table for multiple image generation
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS cover_image_candidates text[];
