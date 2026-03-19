-- Add is_main field to assets table for identifying protagonists
ALTER TABLE assets 
ADD COLUMN IF NOT EXISTS is_main boolean DEFAULT false;
