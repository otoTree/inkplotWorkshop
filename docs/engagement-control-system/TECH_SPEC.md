# AI 短剧生成系统 v2.0 - 技术规格文档

**版本：v2.0 | 状态：待评审**
**创建日期：2026-03-01**

---

## 1. 技术架构概览

### 1.1 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端框架 | Next.js 16 + React 19 | 已有 |
| 状态管理 | Zustand | 已有 |
| 本地存储 | Dexie (IndexedDB) | 已有 |
| 云端存储 | Supabase | 已有 |
| AI SDK | Vercel AI SDK | 已有 |
| UI 组件 | Radix UI + Tailwind CSS | 已有 |

### 1.2 新增依赖

```json
{
  "dependencies": {
    "dagre": "^0.8.5",           // 冲突拓扑图布局
    "react-flow-renderer": "^10", // 可视化冲突图
    "recharts": "^2.12.0"        // SI 走势图表
  }
}
```

---

## 2. 数据模型设计

### 2.1 核心类型扩展

#### 2.1.1 Project 扩展

```typescript
// src/types/index.ts

export interface Project {
  // ... 现有字段
  id: string;
  title: string;
  logline: string;
  genre: string[];
  language?: string;
  artStyle?: string;
  characterArtStyle?: string;
  sceneArtStyle?: string;
  sensitivityPrompt?: string;
  seriesPlan?: unknown;
  createdAt: number;
  updatedAt: number;

  // ★NEW: 动态利益矩阵
  characterMatrices?: CharacterMatrix[];

  // ★NEW: 冲突拓扑图
  conflictGraph?: ConflictNode[];

  // ★NEW: 电影滤镜
  cinematicFilter?: CinematicFilter;

  // ★NEW: 内流控制配置
  engagementConfig?: EngagementConfig;
}

// ★NEW: 角色利益矩阵
export interface CharacterMatrix {
  id: string;
  name: string;
  identity: string;           // 身份
  secret: string;             // 秘密
  motivation: string;         // 核心欲望
  asset: string[];            // 筹码
  motivationLocked: boolean;  // 动机锁定状态
  motivationUnlockEvent?: string; // 解锁事件ID
  createdAt: number;
}

// ★NEW: 冲突节点
export interface ConflictNode {
  id: string;
  characterA: string;         // 角色A ID
  characterB: string;         // 角色B ID
  conflictType: 'interest' | 'secret' | 'revenge' | 'misunderstanding';
  triggerEpisode: number;     // 必须在第几集触发
  status: 'pending' | 'triggered' | 'resolved';
  description: string;
}

// ★NEW: 电影滤镜
export interface CinematicFilter {
  name: string;               // 滤镜名称
  colorGrading: string;       // 调色描述
  lightingStyle: string;      // 光照风格
  moodKeywords: string[];     // 情绪关键词
  referenceImages?: string[]; // 参考图片URL
}

// ★NEW: 内流控制配置
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
