# 技术规格文档 - 第二部分

## 2.1.2 Episode 扩展

```typescript
// src/types/index.ts

export interface Episode {
  // ... 现有字段
  id: string;
  projectId: string;
  episodeNumber: number;
  title: string;
  content: string;
  structure: {
    hook?: string;
    climax?: string;
    cliffhanger?: string;
    summary?: string;
  };
  lastEdited: number;

  // ★NEW: 资产预算
  assetBudget: {
    maxAssets: number;        // 默认 3
    usedAssetIds: string[];   // 本集使用的资产ID
    primaryLocation: string;  // 主场景ID
  };

  // ★NEW: 事件状态
  eventStates: {
    inherited: EventState[];  // 从上集继承的事件
    introduced: EventState[]; // 本集新引入的事件
    resolved: EventState[];   // 本集解决的事件
  };

  // ★NEW: 内流控制状态
  engagementState: {
    suppressionIndex: number;      // 当前 SI 值
    plannedPayoff?: PlannedPayoff; // 计划释放的爽点
    hookContract: HookContract;    // 钩子契约
  };
}

// ★NEW: 事件状态
export interface EventState {
  id: string;
  type: 'mainline' | 'subplot';
  description: string;
  status: 'pending' | 'active' | 'resolved';
  introducedInEpisode: number;
  resolvedInEpisode?: number;
  relatedCharacters: string[]; // 角色ID列表
}

// ★NEW: 计划爽点
export interface PlannedPayoff {
  id: string;
  level: 'S' | 'A' | 'B' | 'C';
  description: string;
  suppressionRequired: number;
  released: boolean;
}

// ★NEW: 钩子契约
export interface HookContract {
  id: string;
  type: 'reward_delay' | 'information_gap' | 'power_shift' | 'threat_upgrade' | 'emotional_cliff' | 'identity_reveal_tease';
  strength: '强钩' | '中钩' | '弱钩';
  description: string;
  fulfillByEpisode: number;
  status: 'active' | 'fulfilled' | 'overdue';
}
```

---

## 2.1.3 Shot 扩展

```typescript
// src/types/index.ts

export interface Shot {
  // ... 现有字段
  id: string;
  episodeId: string;
  sequence: number;
  narrativeGoal: string;
  visualEvidence: string;
  description: string;
  dialogue?: string;
  camera: string;
  size: string;
  duration?: number;
  sensitivityReduction: number;
  relatedAssetIds: string[];

  // ★NEW: 导演思维元素
  directorIntent?: {
    narrativeIntent: string;    // 叙事意图
    emotionalTone: string;      // 情绪基调
    visualMetaphor?: string;    // 视觉隐喻
  };

  // ★NEW: 技术参数
  technicalParams?: {
    lighting: string;           // 光照描述
    cinematicFilter: string;    // 电影滤镜
  };

  // ★NEW: 过渡镜头标记
  isTransition?: boolean;
  transitionType?: 'establishing' | 'match_cut' | 'j_cut' | 'l_cut' | 'object';
  fromShotId?: string;
  toShotId?: string;
}
```

---

## 3. 数据库 Schema 更新

### 3.1 Supabase 表结构

```sql
-- 扩展 projects 表
ALTER TABLE projects
ADD COLUMN character_matrices JSONB,
ADD COLUMN conflict_graph JSONB,
ADD COLUMN cinematic_filter JSONB,
ADD COLUMN engagement_config JSONB;

-- 扩展 episodes 表
ALTER TABLE episodes
ADD COLUMN asset_budget JSONB DEFAULT '{"maxAssets": 3, "usedAssetIds": [], "primaryLocation": ""}',
ADD COLUMN event_states JSONB DEFAULT '{"inherited": [], "introduced": [], "resolved": []}',
ADD COLUMN engagement_state JSONB;

-- 扩展 shots 表
ALTER TABLE shots
ADD COLUMN director_intent JSONB,
ADD COLUMN technical_params JSONB,
ADD COLUMN is_transition BOOLEAN DEFAULT FALSE,
ADD COLUMN transition_type TEXT,
ADD COLUMN from_shot_id UUID REFERENCES shots(id),
ADD COLUMN to_shot_id UUID REFERENCES shots(id);

-- 创建索引
CREATE INDEX idx_episodes_asset_budget ON episodes USING GIN (asset_budget);
CREATE INDEX idx_episodes_event_states ON episodes USING GIN (event_states);
CREATE INDEX idx_shots_is_transition ON shots (is_transition);
```

---

## 4. API 设计

### 4.1 新增 API 端点

#### 4.1.1 生成角色利益矩阵

```typescript
// src/app/api/ai/generate-character-matrix/route.ts

export async function POST(req: Request) {
  const { projectId, storyOutline } = await req.json();

  // 调用 AI 生成角色利益矩阵
  const matrices = await generateCharacterMatrices(storyOutline);

  // 保存到数据库
  await db.projects.update(projectId, {
    characterMatrices: matrices
  });

  return Response.json({ matrices });
}
```

**Prompt 模板:**
```
基于以下故事大纲,为每个主要角色生成利益矩阵:

故事大纲:
{storyOutline}

请为每个角色输出:
1. identity (身份) - 角色的社会身份或隐藏身份
2. secret (秘密) - 角色不为人知的秘密
3. motivation (核心欲望) - 角色的核心驱动力
4. asset (筹码) - 角色拥有的资源/能力

输出格式: JSON数组
```

---

#### 4.1.2 生成冲突拓扑图

```typescript
// src/app/api/ai/generate-conflict-graph/route.ts

export async function POST(req: Request) {
  const { projectId, characterMatrices, totalEpisodes } = await req.json();

  // 调用 AI 生成冲突节点
  const conflictGraph = await generateConflictGraph(
    characterMatrices,
    totalEpisodes
  );

  // 保存到数据库
  await db.projects.update(projectId, {
    conflictGraph
  });

  return Response.json({ conflictGraph });
}
```

---

#### 4.1.3 适配电影滤镜

```typescript
// src/app/api/ai/adapt-cinematic-filter/route.ts

export async function POST(req: Request) {
  const { projectId, genre, mood } = await req.json();

  // 根据题材自动适配滤镜
  const filter = await adaptCinematicFilter(genre, mood);

  // 保存到数据库
  await db.projects.update(projectId, {
    cinematicFilter: filter
  });

  return Response.json({ filter });
}
```

**滤镜映射表:**
```typescript
const FILTER_PRESETS: Record<string, CinematicFilter> = {
  'counterattack': {
    name: '都市冷峻',
    colorGrading: '高对比度,冷色调,锐利边缘',
    lightingStyle: '硬光,强阴影,戏剧性光照',
    moodKeywords: ['压抑', '决心', '冷酷']
  },
  'romance': {
    name: '柔光暖调',
    colorGrading: '柔焦,暖色调,高饱和度',
    lightingStyle: '柔光,自然光,温暖氛围',
    moodKeywords: ['甜蜜', '温馨', '浪漫']
  },
  'mystery': {
    name: '黑色电影',
    colorGrading: '低饱和度,强阴影,蓝绿色调',
    lightingStyle: '侧光,背光,神秘氛围',
    moodKeywords: ['悬疑', '紧张', '不安']
  }
};
```

---

#### 4.1.4 生成事件状态

```typescript
// src/app/api/ai/generate-event-states/route.ts

export async function POST(req: Request) {
  const { episodeId, previousEpisodeId, scriptContent } = await req.json();

  // 读取上一集的事件状态
  const previousStates = previousEpisodeId
    ? await db.episodes.get(previousEpisodeId).then(ep => ep.eventStates)
    : { inherited: [], introduced: [], resolved: [] };

  // 调用 AI 分析当前集的事件状态
  const currentStates = await analyzeEventStates(
    scriptContent,
    previousStates
  );

  // 保存到数据库
  await db.episodes.update(episodeId, {
    eventStates: currentStates
  });

  return Response.json({ eventStates: currentStates });
}
```

---

#### 4.1.5 内流控制调度

```typescript
// src/app/api/ai/engagement-schedule/route.ts

export async function POST(req: Request) {
  const { projectId, episodeNumber } = await req.json();

  // 读取项目配置
  const project = await db.projects.get(projectId);
  const { engagementConfig } = project;

  // 读取前序集的 SI 值
  const previousEpisodes = await db.episodes
    .where('projectId').equals(projectId)
    .and(ep => ep.episodeNumber < episodeNumber)
    .toArray();

  // 调用内流控制调度器
  const schedule = await engagementScheduler({
    config: engagementConfig,
    previousEpisodes,
    currentEpisodeNumber: episodeNumber
  });

  return Response.json({ schedule });
}

// 调度器核心逻辑
async function engagementScheduler(params) {
  const { config, previousEpisodes, currentEpisodeNumber } = params;

  // 1. 计算当前 SI 值
  const currentSI = calculateSuppressionIndex(previousEpisodes);

  // 2. 检查钩子到期情况
  const overdueHooks = checkOverdueHooks(previousEpisodes, currentEpisodeNumber);

  // 3. 匹配可释放爽点
  const availablePayoffs = matchAvailablePayoffs(
    config.payoffBudget,
    currentSI,
    currentEpisodeNumber
  );

  // 4. 生成钩子契约
  const hookContract = generateHookContract(
    config.template,
    currentEpisodeNumber
  );

  // 5. 输出调度指令
  return {
    suppressionIndex: currentSI,
    plannedPayoff: availablePayoffs[0] || null,
    hookContract,
    constraints: generateConstraints(currentSI, availablePayoffs),
    warnings: overdueHooks.length > 0 ? ['存在超期钩子'] : []
  };
}
```

---

#### 4.1.6 生成过渡镜头

```typescript
// src/app/api/ai/generate-transition-shots/route.ts

export async function POST(req: Request) {
  const { episodeId, shots } = await req.json();

  // 分析镜头序列,识别需要过渡的位置
  const transitionPoints = identifyTransitionPoints(shots);

  // 为每个过渡点生成过渡镜头
  const transitionShots = await Promise.all(
    transitionPoints.map(point => generateTransitionShot(point))
  );

  // 插入到镜头序列中
  const updatedShots = insertTransitionShots(shots, transitionShots);

  // 保存到数据库
  await db.shots.bulkPut(updatedShots);

  return Response.json({ transitionShots, updatedShots });
}

// 识别过渡点
function identifyTransitionPoints(shots: Shot[]) {
  const points = [];

  for (let i = 0; i < shots.length - 1; i++) {
    const current = shots[i];
    const next = shots[i + 1];

    // 场景切换
    if (hasLocationChange(current, next)) {
      points.push({
        type: 'establishing',
        fromShot: current,
        toShot: next,
        insertAfter: i
      });
    }

    // 情绪转折
    if (hasEmotionalShift(current, next)) {
      points.push({
        type: 'object',
        fromShot: current,
        toShot: next,
        insertAfter: i
      });
    }
  }

  return points;
}
```

---

## 5. 前端组件设计

### 5.1 角色利益矩阵编辑器

```typescript
// src/components/story/CharacterMatrixEditor.tsx

interface Props {
  projectId: string;
  matrices: CharacterMatrix[];
  onUpdate: (matrices: CharacterMatrix[]) => void;
}

export function CharacterMatrixEditor({ projectId, matrices, onUpdate }: Props) {
  return (
    <div className="space-y-4">
      {matrices.map(matrix => (
        <Card key={matrix.id}>
          <CardHeader>
            <CardTitle>{matrix.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>身份 (Identity)</Label>
              <Input
                value={matrix.identity}
                onChange={e => updateMatrix(matrix.id, 'identity', e.target.value)}
              />
            </div>
            <div>
              <Label>秘密 (Secret)</Label>
              <Textarea
                value={matrix.secret}
                onChange={e => updateMatrix(matrix.id, 'secret', e.target.value)}
              />
            </div>
            <div>
              <Label>核心欲望 (Motivation)</Label>
              <Input
                value={matrix.motivation}
                onChange={e => updateMatrix(matrix.id, 'motivation', e.target.value)}
                disabled={matrix.motivationLocked}
              />
              {matrix.motivationLocked && (
                <Badge variant="secondary">
                  锁定 - 需触发事件: {matrix.motivationUnlockEvent}
                </Badge>
              )}
            </div>
            <div>
              <Label>筹码 (Assets)</Label>
              <TagInput
                value={matrix.asset}
                onChange={assets => updateMatrix(matrix.id, 'asset', assets)}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

---

### 5.2 冲突拓扑图可视化

```typescript
// src/components/story/ConflictGraphViewer.tsx

import ReactFlow, { Node, Edge } from 'react-flow-renderer';

interface Props {
  conflictGraph: ConflictNode[];
  characterMatrices: CharacterMatrix[];
}

export function ConflictGraphViewer({ conflictGraph, characterMatrices }: Props) {
  // 转换为 ReactFlow 节点和边
  const nodes: Node[] = characterMatrices.map((char, index) => ({
    id: char.id,
    type: 'default',
    data: { label: char.name },
    position: { x: index * 200, y: 100 }
  }));

  const edges: Edge[] = conflictGraph.map(conflict => ({
    id: conflict.id,
    source: conflict.characterA,
    target: conflict.characterB,
    label: `第${conflict.triggerEpisode}集: ${conflict.conflictType}`,
    animated: conflict.status === 'pending',
    style: {
      stroke: conflict.status === 'resolved' ? '#10b981' : '#ef4444'
    }
  }));

  return (
    <div className="h-[600px] border rounded-lg">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
      />
    </div>
  );
}
```

---

### 5.3 内流控制仪表盘

```typescript
// src/components/script/EngagementDashboard.tsx

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface Props {
  episodes: Episode[];
  currentEpisodeNumber: number;
}

export function EngagementDashboard({ episodes, currentEpisodeNumber }: Props) {
  // 准备 SI 走势数据
  const siData = episodes.map(ep => ({
    episode: ep.episodeNumber,
    si: ep.engagementState?.suppressionIndex || 0,
    payoff: ep.engagementState?.plannedPayoff?.level || null
  }));

  const currentEpisode = episodes.find(ep => ep.episodeNumber === currentEpisodeNumber);
  const currentState = currentEpisode?.engagementState;

  return (
    <Card>
      <CardHeader>
        <CardTitle>内流控制仪表盘</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* SI 值显示 */}
        <div>
          <Label>当前压抑指数 (SI)</Label>
          <div className="flex items-center gap-4">
            <Progress value={currentState?.suppressionIndex * 100} className="flex-1" />
            <span className="text-2xl font-bold">
              {(currentState?.suppressionIndex || 0).toFixed(2)}
            </span>
          </div>
          {currentState?.suppressionIndex > 0.85 && (
            <Alert variant="destructive" className="mt-2">
              <AlertDescription>
                压抑过载!必须在本集释放至少 B 级爽点
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* 计划爽点 */}
        {currentState?.plannedPayoff && (
          <div>
            <Label>计划释放爽点</Label>
            <Badge variant="default" className="text-lg">
              {currentState.plannedPayoff.level} 级
            </Badge>
            <p className="text-sm text-muted-foreground mt-1">
              {currentState.plannedPayoff.description}
            </p>
          </div>
        )}

        {/* 钩子契约 */}
        {currentState?.hookContract && (
          <div>
            <Label>钩子契约</Label>
            <div className="flex items-center gap-2">
              <Badge>{currentState.hookContract.type}</Badge>
              <Badge variant="outline">{currentState.hookContract.strength}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {currentState.hookContract.description}
            </p>
            <p className="text-xs text-muted-foreground">
              兑现期限: 第 {currentState.hookContract.fulfillByEpisode} 集
            </p>
          </div>
        )}

        {/* SI 走势图 */}
        <div>
          <Label>压抑指数走势</Label>
          <LineChart width={600} height={300} data={siData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="episode" label={{ value: '集数', position: 'insideBottom', offset: -5 }} />
            <YAxis label={{ value: 'SI', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Line type="monotone" dataKey="si" stroke="#8884d8" strokeWidth={2} />
          </LineChart>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

### 5.4 资产预算提示

```typescript
// src/components/script/AssetBudgetIndicator.tsx

interface Props {
  episode: Episode;
  assets: Asset[];
}

export function AssetBudgetIndicator({ episode, assets }: Props) {
  const { maxAssets, usedAssetIds } = episode.assetBudget;
  const usedAssets = assets.filter(a => usedAssetIds.includes(a.id));
  const remaining = maxAssets - usedAssetIds.length;

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg">
      <div className="flex-1">
        <Label>资产预算</Label>
        <div className="flex items-center gap-2 mt-1">
          {usedAssets.map(asset => (
            <Badge key={asset.id} variant="secondary">
              {asset.name}
            </Badge>
          ))}
        </div>
      </div>
      <div className="text-right">
        <div className="text-2xl font-bold">
          {usedAssetIds.length} / {maxAssets}
        </div>
        <div className="text-sm text-muted-foreground">
          剩余 {remaining} 个
        </div>
      </div>
      {remaining === 0 && (
        <Alert variant="warning">
          <AlertDescription>
            资产预算已用完,请复用现有资产
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
```

---

## 6. AI Prompt 工程

### 6.1 生成分集梗概 (带事件状态)

```typescript
const EPISODE_OUTLINE_PROMPT = `
你是一位专业的编剧,正在为第 {episodeNumber} 集撰写梗概。

## 上下文信息

### 角色利益矩阵
{characterMatrices}

### 冲突拓扑图
本集必须触发的冲突:
{requiredConflicts}

### 上一集的事件状态
{previousEventStates}

### 内流控制要求
- 当前压抑指数 (SI): {currentSI}
- 本集必须释放: {plannedPayoff}
- 本集钩子要求: {hookContract}

### 资产约束
- 最多使用 3 个资产 (人物+场景+道具)
- 优先复用: {existingAssets}

## 任务

请生成第 {episodeNumber} 集的梗概,包含:

1. **事件状态更新**
   - 继承的事件: 哪些事件从上集延续?
   - 新引入的事件: 本集新增哪些事件?
   - 解决的事件: 本集解决了哪些事件?

2. **爽点释放** (如果有)
   - 如何释放 {plannedPayoff} 级爽点?
   - 释放时机和方式

3. **钩子设置**
   - 如何在集尾设置 {hookContract.type} 钩子?
   - 钩子的具体表现形式

4. **资产使用**
   - 本集使用哪 3 个资产?
   - 主场景是什么?

输出格式: JSON
{
  "summary": "梗概文本",
  "eventStates": {
    "inherited": [...],
    "introduced": [...],
    "resolved": [...]
  },
  "payoffExecution": "爽点释放描述",
  "hookSetup": "钩子设置描述",
  "assetUsage": {
    "usedAssetIds": ["id1", "id2", "id3"],
    "primaryLocation": "id1"
  }
}
`;
```

---

### 6.2 生成分镜提示词 (导演思维)

```typescript
const SHOT_PROMPT_TEMPLATE = `
你是一位电影导演,正在为以下场景设计镜头。

## 场景信息
{sceneDescription}

## 叙事要求
- 叙事意图: {narrativeIntent}
- 情绪基调: {emotionalTone}

## 电影滤镜
{cinematicFilter}

## 任务

请生成镜头设计,包含:

1. **导演思维**
   - 这个镜头要传达什么? (narrativeIntent)
   - 情绪基调是什么? (emotionalTone)
   - 是否有视觉隐喻? (visualMetaphor)

2. **技术参数**
   - 景别 (shotSize): Close-up / Medium / Wide / Extreme Wide
   - 运镜 (cameraMovement): Static / Pan / Tilt / Dolly / Crane
   - 光照 (lighting): 自然光 / 戏剧性光 / 背光 / 侧光

3. **画面描述**
   - 详细的视觉描述 (适用于 AI 视频生成)
   - 融入电影滤镜风格

输出格式: JSON
{
  "directorIntent": {
    "narrativeIntent": "...",
    "emotionalTone": "...",
    "visualMetaphor": "..."
  },
  "technicalParams": {
    "shotSize": "...",
    "cameraMovement": "...",
    "lighting": "..."
  },
  "visualDescription": "...",
  "dialogue": "..."
}
`;
```

---

## 7. 实施计划

### Phase 1: 数据结构与基础设施 (Week 1)
- [ ] 扩展 TypeScript 类型定义
- [ ] 更新 Supabase Schema
- [ ] 更新 Dexie 数据库定义
- [ ] 安装新依赖 (dagre, react-flow-renderer, recharts)

### Phase 2: 故事设计层 (Week 2-3)
- [ ] 实现角色利益矩阵生成 API
- [ ] 实现冲突拓扑图生成 API
- [ ] 开发角色利益矩阵编辑器组件
- [ ] 开发冲突拓扑图可视化组件
- [ ] 集成到项目创建流程

### Phase 3: 资产设计层 (Week 3)
- [ ] 实现电影滤镜适配 API
- [ ] 实现资产预算约束逻辑
- [ ] 开发资产预算指示器组件
- [ ] 更新资产提取流程

### Phase 4: 剧本设计层 (Week 4-5)
- [ ] 实现事件状态缓冲器
- [ ] 实现内流控制调度器
- [ ] 开发内流控制仪表盘组件
- [ ] 更新剧本生成 Prompt
- [ ] 集成到剧本编辑器

### Phase 5: 分镜设计层 (Week 6)
- [ ] 实现导演思维提示词生成
- [ ] 实现过渡镜头自动生成
- [ ] 更新分镜生成 API
- [ ] 更新分镜编辑器 UI

### Phase 6: 测试与优化 (Week 7-8)
- [ ] 端到端测试
- [ ] 性能优化
- [ ] 用户体验优化
- [ ] 文档完善

---

## 8. 风险与挑战

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| AI 生成质量不稳定 | 高 | 多轮迭代 + 人工审核 |
| 数据结构复杂度增加 | 中 | 充分测试 + 数据迁移脚本 |
| 性能问题 (大量计算) | 中 | 异步处理 + 缓存 |
| 用户学习成本 | 中 | 渐进式引导 + 默认模板 |

---

## 9. 附录

### 9.1 参考资料
- [内流控制 PRD v2.0](./PRD.md)
- [Vercel AI SDK 文档](https://sdk.vercel.ai/docs)
- [ReactFlow 文档](https://reactflow.dev/)
- [Recharts 文档](https://recharts.org/)

### 9.2 代码示例仓库
- TBD: 创建示例代码仓库

---

**文档结束**
