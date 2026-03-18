-- 扩展 projects 表
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS character_matrices JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS conflict_graph JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS cinematic_filter JSONB,
ADD COLUMN IF NOT EXISTS engagement_config JSONB;

-- 扩展 episodes 表
ALTER TABLE episodes
ADD COLUMN IF NOT EXISTS asset_budget JSONB DEFAULT '{"maxAssets": 3, "usedAssetIds": [], "primaryLocation": ""}',
ADD COLUMN IF NOT EXISTS event_states JSONB DEFAULT '{"inherited": [], "introduced": [], "resolved": []}',
ADD COLUMN IF NOT EXISTS engagement_state JSONB;

-- 扩展 shots 表
ALTER TABLE shots
ADD COLUMN IF NOT EXISTS director_intent JSONB,
ADD COLUMN IF NOT EXISTS technical_params JSONB,
ADD COLUMN IF NOT EXISTS is_transition BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS transition_type TEXT,
ADD COLUMN IF NOT EXISTS from_shot_id UUID REFERENCES shots(id),
ADD COLUMN IF NOT EXISTS to_shot_id UUID REFERENCES shots(id);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_episodes_asset_budget ON episodes USING GIN (asset_budget);
CREATE INDEX IF NOT EXISTS idx_episodes_event_states ON episodes USING GIN (event_states);
CREATE INDEX IF NOT EXISTS idx_shots_is_transition ON shots (is_transition);

-- 创建函数: 检查资产预算
CREATE OR REPLACE FUNCTION check_asset_budget()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.asset_budget IS NOT NULL AND
     jsonb_array_length(NEW.asset_budget->'usedAssetIds') > (NEW.asset_budget->>'maxAssets')::int THEN
    RAISE EXCEPTION '资产预算超限: 最多允许 % 个资产', (NEW.asset_budget->>'maxAssets')::int;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器
DROP TRIGGER IF EXISTS enforce_asset_budget ON episodes;
CREATE TRIGGER enforce_asset_budget
BEFORE INSERT OR UPDATE ON episodes
FOR EACH ROW
EXECUTE FUNCTION check_asset_budget();
