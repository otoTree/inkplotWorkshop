# 快速开始指南 - 内流控制系统

**更新日期:** 2026-03-02

---

## 🚀 立即开始使用

### 1. 执行数据库迁移

```bash
# 如果使用本地 Supabase
bunx supabase start
bunx supabase db push

# 如果使用云端 Supabase
# 在 Supabase Dashboard 中执行迁移文件内容
```

### 2. 启动开发服务器

```bash
bun dev
```

---

## 📝 使用示例

### 示例 1: 为项目适配电影滤镜

```typescript
// 在项目创建或编辑时调用
const response = await fetch('/api/ai/adapt-cinematic-filter', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId: 'your-project-id',
    genre: ['逆袭', '爽剧']  // 可选,不提供则使用项目的 genre
  })
});

const { filter } = await response.json();

console.log(filter);
// {
//   name: '都市冷峻',
//   colorGrading: '高对比度,冷色调,锐利边缘,蓝灰色主导',
//   lightingStyle: '硬光,强阴影,戏剧性光照,侧光为主',
//   moodKeywords: ['压抑', '决心', '冷酷', '孤独']
// }
```

### 示例 2: 获取内流控制调度

```typescript
// 在生成剧本前调用
const response = await fetch('/api/ai/engagement-schedule', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId: 'your-project-id',
    episodeNumber: 5  // 当前要生成的集数
  })
});

const { schedule } = await response.json();

console.log(schedule);
// {
//   suppressionIndex: 0.65,
//   plannedPayoff: {
//     id: 'payoff-a-5',
//     level: 'A',
//     description: '阶段性爽点 - 公开打脸/资源夺回',
//     suppressionRequired: 0.6,
//     released: false
//   },
//   hookContract: {
//     id: 'hook-5',
//     type: 'reward_delay',
//     strength: '强钩',
//     description: '第 5 集钩子',
//     fulfillByEpisode: 7,
//     status: 'active'
//   },
//   constraints: [
//     '本集不得释放第二个 A 级或以上爽点',
//     '结尾必须包含有效钩子',
//     'SI 不得低于 0.3 (保留追剧动力)'
//   ],
//   warnings: []
// }
```

### 示例 3: 在项目中配置内流控制

```typescript
import { db } from '@/lib/db';

// 创建项目时配置
await db.projects.add({
  id: crypto.randomUUID(),
  title: '逆袭之路',
  logline: '草根青年的逆袭故事',
  genre: ['逆袭', '爽剧'],
  createdAt: Date.now(),
  updatedAt: Date.now(),

  // ★ 配置内流控制
  engagementConfig: {
    template: 'counterattack',  // 使用逆袭爽剧模板
    totalEpisodes: 10,
    payoffBudget: {
      S: 2,  // 2个史诗级爽点
      A: 3,  // 3个阶段性爽点
      B: 5   // 5个小爽点
    },
    suppressionWeights: {}
  }
});
```

### 示例 4: 在剧本生成中使用调度结果

```typescript
// 1. 获取调度结果
const { schedule } = await fetch('/api/ai/engagement-schedule', {
  method: 'POST',
  body: JSON.stringify({ projectId, episodeNumber: 5 })
}).then(r => r.json());

// 2. 构建 Prompt
const prompt = `
你正在撰写第 5 集剧本。

## 内流控制要求

### 当前压抑指数
SI: ${schedule.suppressionIndex}

### 本集必须释放的爽点
${schedule.plannedPayoff ? `
等级: ${schedule.plannedPayoff.level}
描述: ${schedule.plannedPayoff.description}
` : '本集无需释放爽点'}

### 本集钩子要求
类型: ${schedule.hookContract.type}
强度: ${schedule.hookContract.strength}
描述: ${schedule.hookContract.description}
兑现期限: 第 ${schedule.hookContract.fulfillByEpisode} 集

### 约束条件
${schedule.constraints.map(c => `- ${c}`).join('\n')}

${schedule.warnings.length > 0 ? `
### ⚠️ 警告
${schedule.warnings.map(w => `- ${w}`).join('\n')}
` : ''}

请根据以上要求生成剧本...
`;

// 3. 调用 AI 生成剧本
const script = await generateScript(prompt);

// 4. 保存剧本时记录内流控制状态
await db.episodes.add({
  id: crypto.randomUUID(),
  projectId,
  episodeNumber: 5,
  title: '第5集',
  content: script,
  structure: {},
  lastEdited: Date.now(),

  // ★ 记录内流控制状态
  engagementState: {
    suppressionIndex: schedule.suppressionIndex,
    plannedPayoff: schedule.plannedPayoff,
    hookContract: schedule.hookContract
  }
});
```

---

## 🎨 电影滤镜使用

### 在分镜生成中应用滤镜

```typescript
import { generateFilterPrompt } from '@/lib/engagement';

// 1. 获取项目的电影滤镜
const project = await db.projects.get(projectId);
const filter = project.cinematicFilter;

// 2. 生成滤镜提示词
const filterPrompt = generateFilterPrompt(filter);

// 3. 集成到分镜生成 Prompt
const shotPrompt = `
你是一位电影导演,正在设计镜头。

${filterPrompt}

场景描述: ${sceneDescription}

请生成镜头设计...
`;
```

### 可用的滤镜预设

```typescript
import { CINEMATIC_FILTER_PRESETS, getAllFilterPresets } from '@/lib/engagement';

// 获取所有预设
const presets = getAllFilterPresets();

presets.forEach(({ key, filter }) => {
  console.log(`${key}: ${filter.name}`);
});

// 输出:
// counterattack: 都市冷峻
// romance: 柔光暖调
// mystery: 黑色电影
// fantasy: 水墨写意
// urban: 现代都市
```

---

## 🔧 集成到现有流程

### 在项目创建流程中集成

```typescript
// src/components/dashboard/ProjectDialog.tsx

async function handleCreateProject(data: ProjectFormData) {
  // 1. 创建项目
  const projectId = crypto.randomUUID();

  // 2. 适配电影滤镜
  const filterResponse = await fetch('/api/ai/adapt-cinematic-filter', {
    method: 'POST',
    body: JSON.stringify({
      projectId,
      genre: data.genre
    })
  });
  const { filter } = await filterResponse.json();

  // 3. 保存项目
  await db.projects.add({
    id: projectId,
    ...data,
    cinematicFilter: filter,
    engagementConfig: {
      template: detectTemplate(data.genre),  // 根据题材自动选择模板
      totalEpisodes: 10,
      payoffBudget: getDefaultBudget(data.genre),
      suppressionWeights: {}
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
}

function detectTemplate(genre: string[]): 'counterattack' | 'romance' | 'mystery' | 'custom' {
  const genreStr = genre.join(',').toLowerCase();
  if (genreStr.includes('逆袭') || genreStr.includes('爽剧')) return 'counterattack';
  if (genreStr.includes('甜宠') || genreStr.includes('言情')) return 'romance';
  if (genreStr.includes('悬疑') || genreStr.includes('推理')) return 'mystery';
  return 'custom';
}

function getDefaultBudget(genre: string[]) {
  const template = detectTemplate(genre);
  const budgets = {
    counterattack: { S: 2, A: 3, B: 5 },
    romance: { S: 1, A: 4, B: 6 },
    mystery: { S: 1, A: 2, B: 4 },
    custom: { S: 2, A: 3, B: 5 }
  };
  return budgets[template];
}
```

### 在剧本生成流程中集成

```typescript
// src/app/api/ai/generate/route.ts

export async function POST(req: Request) {
  const { projectId, episodeNumber, outline } = await req.json();

  // 1. 获取内流控制调度
  const scheduleResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/ai/engagement-schedule`, {
    method: 'POST',
    body: JSON.stringify({ projectId, episodeNumber })
  });
  const { schedule } = await scheduleResponse.json();

  // 2. 构建增强的 Prompt
  const enhancedPrompt = `
${outline}

## 内流控制要求
- 当前压抑指数: ${schedule.suppressionIndex}
- 计划爽点: ${schedule.plannedPayoff?.description || '无'}
- 钩子类型: ${schedule.hookContract.type}
- 约束: ${schedule.constraints.join('; ')}

请生成符合以上要求的剧本...
`;

  // 3. 调用 AI 生成
  const script = await generateWithAI(enhancedPrompt);

  // 4. 保存时记录状态
  await db.episodes.add({
    // ... 其他字段
    engagementState: {
      suppressionIndex: schedule.suppressionIndex,
      plannedPayoff: schedule.plannedPayoff,
      hookContract: schedule.hookContract
    }
  });

  return Response.json({ script });
}
```

---

## 📊 监控和调试

### 查看项目的内流控制状态

```typescript
// 获取项目的所有集
const episodes = await db.episodes
  .where('projectId').equals(projectId)
  .sortBy('episodeNumber');

// 打印 SI 走势
console.log('SI 走势:');
episodes.forEach(ep => {
  const si = ep.engagementState?.suppressionIndex || 0;
  const payoff = ep.engagementState?.plannedPayoff?.level || '-';
  console.log(`第${ep.episodeNumber}集: SI=${si.toFixed(2)}, 爽点=${payoff}`);
});

// 检查超期钩子
const overdueHooks = episodes.filter(ep => {
  const hook = ep.engagementState?.hookContract;
  return hook && hook.status === 'active' && hook.fulfillByEpisode < episodes.length;
});

if (overdueHooks.length > 0) {
  console.warn('存在超期钩子:', overdueHooks);
}
```

---

## 🐛 常见问题

### Q: 项目没有 engagementConfig 怎么办?

A: 为现有项目添加配置:

```typescript
await db.projects.update(projectId, {
  engagementConfig: {
    template: 'counterattack',
    totalEpisodes: 10,
    payoffBudget: { S: 2, A: 3, B: 5 },
    suppressionWeights: {}
  }
});
```

### Q: 如何手动调整 SI 值?

A: 直接更新 episode 的 engagementState:

```typescript
await db.episodes.update(episodeId, {
  engagementState: {
    ...episode.engagementState,
    suppressionIndex: 0.7  // 手动设置
  }
});
```

### Q: 如何标记爽点已释放?

A: 更新 plannedPayoff 的 released 状态:

```typescript
await db.episodes.update(episodeId, {
  engagementState: {
    ...episode.engagementState,
    plannedPayoff: {
      ...episode.engagementState.plannedPayoff,
      released: true
    }
  }
});
```

---

## 📚 更多资源

- [完整 PRD](./PRD.md)
- [技术规格](./TECH_SPEC.md)
- [实施指南](./IMPLEMENTATION_GUIDE.md)
- [Phase 1&2 完成报告](./PHASE1_2_COMPLETION_REPORT.md)

---

**祝使用愉快!** 🎬✨
