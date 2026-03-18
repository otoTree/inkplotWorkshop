# 实施指南 (Implementation Guide)

**版本：v1.0 | 创建日期：2026-03-01**

---

## 1. 快速开始

### 1.1 前置条件

- Node.js >= 18
- Bun (推荐) 或 npm/yarn
- Supabase 项目已配置
- 已有 inkplotWorkshop 项目代码

### 1.2 安装新依赖

```bash
bun add dagre react-flow-renderer recharts
bun add -d @types/dagre
```

---

## 2. 数据库迁移

### 2.1 创建迁移文件

```bash
bunx supabase migration new add_engagement_control_fields
```

### 2.2 编写迁移 SQL

在生成的迁移文件中添加:

```sql
-- supabase/migrations/XXXXXX_add_engagement_control_fields.sql

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
  IF jsonb_array_length(NEW.asset_budget->'usedAssetIds') > (NEW.asset_budget->>'maxAssets')::int THEN
    RAISE EXCEPTION '资产预算超限: 最多允许 % 个资产', (NEW.asset_budget->>'maxAssets')::int;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器
CREATE TRIGGER enforce_asset_budget
BEFORE INSERT OR UPDATE ON episodes
FOR EACH ROW
EXECUTE FUNCTION check_asset_budget();
```

### 2.3 执行迁移

```bash
bunx supabase db push
```

---

## 3. 类型定义更新

### 3.1 更新 src/types/index.ts

将以下类型定义添加到文件末尾:

```typescript
// ============ 内流控制系统类型 ============

// 角色利益矩阵
export interface CharacterMatrix {
  id: string;
  name: string;
  identity: string;
  secret: string;
  motivation: string;
  asset: string[];
  motivationLocked: boolean;
  motivationUnlockEvent?: string;
  createdAt: number;
}

// 冲突节点
export interface ConflictNode {
  id: string;
  characterA: string;
  characterB: string;
  conflictType: 'interest' | 'secret' | 'revenge' | 'misunderstanding';
  triggerEpisode: number;
  status: 'pending' | 'triggered' | 'resolved';
  description: string;
}

// 电影滤镜
export interface CinematicFilter {
  name: string;
  colorGrading: string;
  lightingStyle: string;
  moodKeywords: string[];
  referenceImages?: string[];
}

// 内流控制配置
export interface EngagementConfig {
  template: 'counterattack' | 'romance' | 'mystery' | 'custom';
  totalEpisodes: number;
  payoffBudget: {
    S: number;
    A: number;
    B: number;
  };
  suppressionWeights: Record<string, number>;
}

// 事件状态
export interface EventState {
  id: string;
  type: 'mainline' | 'subplot';
  description: string;
  status: 'pending' | 'active' | 'resolved';
  introducedInEpisode: number;
  resolvedInEpisode?: number;
  relatedCharacters: string[];
}

// 计划爽点
export interface PlannedPayoff {
  id: string;
  level: 'S' | 'A' | 'B' | 'C';
  description: string;
  suppressionRequired: number;
  released: boolean;
}

// 钩子契约
export interface HookContract {
  id: string;
  type: 'reward_delay' | 'information_gap' | 'power_shift' | 'threat_upgrade' | 'emotional_cliff' | 'identity_reveal_tease';
  strength: '强钩' | '中钩' | '弱钩';
  description: string;
  fulfillByEpisode: number;
  status: 'active' | 'fulfilled' | 'overdue';
}

// 扩展 Project 接口
export interface Project {
  // ... 保留现有字段
  characterMatrices?: CharacterMatrix[];
  conflictGraph?: ConflictNode[];
  cinematicFilter?: CinematicFilter;
  engagementConfig?: EngagementConfig;
}

// 扩展 Episode 接口
export interface Episode {
  // ... 保留现有字段
  assetBudget?: {
    maxAssets: number;
    usedAssetIds: string[];
    primaryLocation: string;
  };
  eventStates?: {
    inherited: EventState[];
    introduced: EventState[];
    resolved: EventState[];
  };
  engagementState?: {
    suppressionIndex: number;
    plannedPayoff?: PlannedPayoff;
    hookContract?: HookContract;
  };
}

// 扩展 Shot 接口
export interface Shot {
  // ... 保留现有字段
  directorIntent?: {
    narrativeIntent: string;
    emotionalTone: string;
    visualMetaphor?: string;
  };
  technicalParams?: {
    lighting: string;
    cinematicFilter: string;
  };
  isTransition?: boolean;
  transitionType?: 'establishing' | 'match_cut' | 'j_cut' | 'l_cut' | 'object';
  fromShotId?: string;
  toShotId?: string;
}
```

---

## 4. 创建核心模块

### 4.1 内流控制调度器

创建 `src/lib/engagement/scheduler.ts`:

```typescript
import type { EngagementConfig, Episode, PlannedPayoff, HookContract } from '@/types';

export interface ScheduleParams {
  config: EngagementConfig;
  previousEpisodes: Episode[];
  currentEpisodeNumber: number;
}

export interface ScheduleResult {
  suppressionIndex: number;
  plannedPayoff: PlannedPayoff | null;
  hookContract: HookContract;
  constraints: string[];
  warnings: string[];
}

export async function engagementScheduler(params: ScheduleParams): Promise<ScheduleResult> {
  const { config, previousEpisodes, currentEpisodeNumber } = params;

  // 1. 计算当前 SI 值
  const currentSI = calculateSuppressionIndex(previousEpisodes, config.suppressionWeights);

  // 2. 检查钩子到期情况
  const overdueHooks = checkOverdueHooks(previousEpisodes, currentEpisodeNumber);

  // 3. 匹配可释放爽点
  const availablePayoffs = matchAvailablePayoffs(
    config.payoffBudget,
    currentSI,
    currentEpisodeNumber,
    config.totalEpisodes
  );

  // 4. 生成钩子契约
  const hookContract = generateHookContract(
    config.template,
    currentEpisodeNumber,
    config.totalEpisodes
  );

  // 5. 生成约束条件
  const constraints = generateConstraints(currentSI, availablePayoffs);

  // 6. 生成警告
  const warnings = [];
  if (overdueHooks.length > 0) {
    warnings.push(`存在 ${overdueHooks.length} 个超期钩子`);
  }
  if (currentSI > 0.85) {
    warnings.push('压抑指数过高,必须释放爽点');
  }

  return {
    suppressionIndex: currentSI,
    plannedPayoff: availablePayoffs[0] || null,
    hookContract,
    constraints,
    warnings
  };
}

// 计算压抑指数
function calculateSuppressionIndex(
  episodes: Episode[],
  weights: Record<string, number>
): number {
  if (episodes.length === 0) return 0.1;

  const lastEpisode = episodes[episodes.length - 1];
  const lastSI = lastEpisode.engagementState?.suppressionIndex || 0;

  // 简化计算: 基于上一集的 SI 和是否释放了爽点
  const payoffReleased = lastEpisode.engagementState?.plannedPayoff?.released;

  if (payoffReleased) {
    const payoffLevel = lastEpisode.engagementState?.plannedPayoff?.level;
    const reduction = payoffLevel === 'S' ? 0.6 : payoffLevel === 'A' ? 0.3 : 0.15;
    return Math.max(0, lastSI - reduction);
  } else {
    // 未释放爽点,SI 累加
    return Math.min(1, lastSI + 0.15);
  }
}

// 检查超期钩子
function checkOverdueHooks(episodes: Episode[], currentEpisode: number): HookContract[] {
  const overdue: HookContract[] = [];

  for (const ep of episodes) {
    const hook = ep.engagementState?.hookContract;
    if (hook && hook.status === 'active' && hook.fulfillByEpisode < currentEpisode) {
      overdue.push(hook);
    }
  }

  return overdue;
}

// 匹配可释放爽点
function matchAvailablePayoffs(
  budget: { S: number; A: number; B: number },
  currentSI: number,
  currentEpisode: number,
  totalEpisodes: number
): PlannedPayoff[] {
  const available: PlannedPayoff[] = [];

  // 规则: 前 30% 禁止 S 级
  const canReleaseS = currentEpisode > totalEpisodes * 0.3;

  // 规则: SI >= 0.75 才能释放 S 级
  if (canReleaseS && currentSI >= 0.75 && budget.S > 0) {
    available.push({
      id: `payoff-s-${currentEpisode}`,
      level: 'S',
      description: '史诗级爽点',
      suppressionRequired: 0.75,
      released: false
    });
  }

  // 规则: SI >= 0.6 才能释放 A 级
  if (currentSI >= 0.6 && budget.A > 0) {
    available.push({
      id: `payoff-a-${currentEpisode}`,
      level: 'A',
      description: '阶段性爽点',
      suppressionRequired: 0.6,
      released: false
    });
  }

  // 规则: SI >= 0.4 才能释放 B 级
  if (currentSI >= 0.4 && budget.B > 0) {
    available.push({
      id: `payoff-b-${currentEpisode}`,
      level: 'B',
      description: '小爽点',
      suppressionRequired: 0.4,
      released: false
    });
  }

  return available;
}

// 生成钩子契约
function generateHookContract(
  template: string,
  currentEpisode: number,
  totalEpisodes: number
): HookContract {
  // 根据模板和集数选择钩子类型
  const hookTypes = {
    counterattack: ['reward_delay', 'power_shift', 'threat_upgrade'],
    romance: ['emotional_cliff', 'information_gap'],
    mystery: ['information_gap', 'power_shift', 'identity_reveal_tease']
  };

  const types = hookTypes[template as keyof typeof hookTypes] || hookTypes.counterattack;
  const randomType = types[Math.floor(Math.random() * types.length)];

  return {
    id: `hook-${currentEpisode}`,
    type: randomType as any,
    strength: currentEpisode < totalEpisodes * 0.7 ? '强钩' : '中钩',
    description: `第 ${currentEpisode} 集钩子`,
    fulfillByEpisode: currentEpisode + 2,
    status: 'active'
  };
}

// 生成约束条件
function generateConstraints(currentSI: number, payoffs: PlannedPayoff[]): string[] {
  const constraints: string[] = [];

  if (currentSI > 0.85) {
    constraints.push('本集必须释放至少 B 级爽点');
  }

  if (payoffs.length > 0 && payoffs[0].level === 'A') {
    constraints.push('本集不得释放第二个 A 级或以上爽点');
  }

  constraints.push('结尾必须包含有效钩子');
  constraints.push('SI 不得低于 0.3');

  return constraints;
}
```

---

### 4.2 电影滤镜预设

创建 `src/lib/engagement/cinematic-filters.ts`:

```typescript
import type { CinematicFilter } from '@/types';

export const CINEMATIC_FILTER_PRESETS: Record<string, CinematicFilter> = {
  counterattack: {
    name: '都市冷峻',
    colorGrading: '高对比度,冷色调,锐利边缘,蓝灰色主导',
    lightingStyle: '硬光,强阴影,戏剧性光照,侧光为主',
    moodKeywords: ['压抑', '决心', '冷酷', '孤独']
  },
  romance: {
    name: '柔光暖调',
    colorGrading: '柔焦,暖色调,高饱和度,粉橙色主导',
    lightingStyle: '柔光,自然光,温暖氛围,均匀照明',
    moodKeywords: ['甜蜜', '温馨', '浪漫', '梦幻']
  },
  mystery: {
    name: '黑色电影',
    colorGrading: '低饱和度,强阴影,蓝绿色调,高对比度',
    lightingStyle: '侧光,背光,神秘氛围,不均匀照明',
    moodKeywords: ['悬疑', '紧张', '不安', '神秘']
  },
  fantasy: {
    name: '水墨写意',
    colorGrading: '低饱和度,雾气感,中国传统色,柔和过渡',
    lightingStyle: '漫射光,朦胧感,自然光,柔和阴影',
    moodKeywords: ['飘逸', '空灵', '古典', '诗意']
  }
};

export function adaptCinematicFilter(
  genre: string[],
  mood?: string
): CinematicFilter {
  // 根据题材选择滤镜
  if (genre.includes('逆袭') || genre.includes('爽剧')) {
    return CINEMATIC_FILTER_PRESETS.counterattack;
  }
  if (genre.includes('甜宠') || genre.includes('言情')) {
    return CINEMATIC_FILTER_PRESETS.romance;
  }
  if (genre.includes('悬疑') || genre.includes('推理')) {
    return CINEMATIC_FILTER_PRESETS.mystery;
  }
  if (genre.includes('古装') || genre.includes('仙侠')) {
    return CINEMATIC_FILTER_PRESETS.fantasy;
  }

  // 默认返回都市冷峻
  return CINEMATIC_FILTER_PRESETS.counterattack;
}
```

---

## 5. 创建 API 端点

### 5.1 生成角色利益矩阵

创建 `src/app/api/ai/generate-character-matrix/route.ts`:

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { CharacterMatrix } from '@/types';

export async function POST(req: Request) {
  try {
    const { projectId, storyOutline } = await req.json();

    const prompt = `
基于以下故事大纲,为每个主要角色生成利益矩阵:

故事大纲:
${storyOutline}

请为每个角色输出:
1. identity (身份) - 角色的社会身份或隐藏身份
2. secret (秘密) - 角色不为人知的秘密
3. motivation (核心欲望) - 角色的核心驱动力
4. asset (筹码) - 角色拥有的资源/能力 (数组)

输出格式: JSON数组,每个元素包含 name, identity, secret, motivation, asset 字段
只输出 JSON,不要其他文字
`;

    const { text } = await generateText({
      model: openai('gpt-4-turbo'),
      prompt
    });

    // 解析 JSON
    const rawMatrices = JSON.parse(text);

    // 补充字段
    const matrices: CharacterMatrix[] = rawMatrices.map((m: any) => ({
      id: crypto.randomUUID(),
      name: m.name,
      identity: m.identity,
      secret: m.secret,
      motivation: m.motivation,
      asset: m.asset,
      motivationLocked: false,
      createdAt: Date.now()
    }));

    return Response.json({ matrices });
  } catch (error) {
    console.error('生成角色矩阵失败:', error);
    return Response.json({ error: '生成失败' }, { status: 500 });
  }
}
```

---

### 5.2 内流控制调度

创建 `src/app/api/ai/engagement-schedule/route.ts`:

```typescript
import { engagementScheduler } from '@/lib/engagement/scheduler';
import { db } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { projectId, episodeNumber } = await req.json();

    // 读取项目配置
    const project = await db.projects.get(projectId);
    if (!project || !project.engagementConfig) {
      return Response.json({ error: '项目配置不存在' }, { status: 404 });
    }

    // 读取前序集
    const previousEpisodes = await db.episodes
      .where('projectId').equals(projectId)
      .and(ep => ep.episodeNumber < episodeNumber)
      .toArray();

    // 调用调度器
    const schedule = await engagementScheduler({
      config: project.engagementConfig,
      previousEpisodes,
      currentEpisodeNumber: episodeNumber
    });

    return Response.json({ schedule });
  } catch (error) {
    console.error('内流控制调度失败:', error);
    return Response.json({ error: '调度失败' }, { status: 500 });
  }
}
```

---

## 6. 测试

### 6.1 单元测试

创建 `src/lib/engagement/__tests__/scheduler.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { engagementScheduler } from '../scheduler';
import type { EngagementConfig, Episode } from '@/types';

describe('engagementScheduler', () => {
  const mockConfig: EngagementConfig = {
    template: 'counterattack',
    totalEpisodes: 10,
    payoffBudget: { S: 2, A: 3, B: 5 },
    suppressionWeights: {}
  };

  it('应该在第1集返回低SI值', async () => {
    const result = await engagementScheduler({
      config: mockConfig,
      previousEpisodes: [],
      currentEpisodeNumber: 1
    });

    expect(result.suppressionIndex).toBeLessThan(0.3);
    expect(result.plannedPayoff).toBeNull();
  });

  it('应该在SI > 0.85时强制释放爽点', async () => {
    const mockEpisodes: Episode[] = [
      {
        id: '1',
        projectId: 'test',
        episodeNumber: 1,
        title: 'Test',
        content: '',
        structure: {},
        lastEdited: Date.now(),
        engagementState: {
          suppressionIndex: 0.9,
          hookContract: {
            id: 'hook-1',
            type: 'reward_delay',
            strength: '强钩',
            description: 'Test',
            fulfillByEpisode: 3,
            status: 'active'
          }
        }
      }
    ];

    const result = await engagementScheduler({
      config: mockConfig,
      previousEpisodes: mockEpisodes,
      currentEpisodeNumber: 2
    });

    expect(result.warnings).toContain('压抑指数过高,必须释放爽点');
    expect(result.plannedPayoff).not.toBeNull();
  });
});
```

运行测试:

```bash
bun test
```

---

## 7. 部署

### 7.1 环境变量

确保 `.env.local` 包含:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI
OPENAI_API_KEY=your_openai_key
```

### 7.2 构建

```bash
bun run build
```

### 7.3 部署到 Vercel

```bash
vercel --prod
```

---

## 8. 故障排查

### 8.1 常见问题

**Q: 数据库迁移失败**
```bash
# 检查迁移状态
bunx supabase migration list

# 回滚迁移
bunx supabase db reset
```

**Q: TypeScript 类型错误**
```bash
# 重新生成类型
bunx supabase gen types typescript --local > src/types/supabase.ts
```

**Q: AI 生成超时**
- 增加 API 超时时间
- 使用更快的模型 (gpt-3.5-turbo)

---

## 9. 下一步

- [ ] 阅读 [PRD.md](./PRD.md) 了解完整需求
- [ ] 阅读 [TECH_SPEC.md](./TECH_SPEC.md) 了解技术细节
- [ ] 按照 Phase 1-6 逐步实施
- [ ] 定期测试和优化

---

**祝开发顺利!** 🚀
