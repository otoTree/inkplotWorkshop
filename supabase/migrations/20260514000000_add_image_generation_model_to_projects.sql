ALTER TABLE projects
ADD COLUMN IF NOT EXISTS image_generation_model text;
