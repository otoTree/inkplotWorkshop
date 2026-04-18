ALTER TABLE shots
ADD COLUMN IF NOT EXISTS subject_state_refs jsonb NOT NULL DEFAULT '[]'::jsonb;
