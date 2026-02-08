export interface Project {
  id: string;             // UUID
  title: string;          // 剧名
  logline: string;        // 核心梗概
  genre: string[];        // 类型标签
  language?: string;      // 剧本语言
  artStyle?: string;      // 美术风格 (e.g. 赛博朋克, 水墨, 皮克斯)
  seriesPlan?: any;       // 10集连载大纲
  createdAt: number;
  updatedAt: number;
}

export interface Episode {
  id: string;             // UUID
  projectId: string;      // FK -> Project.id
  episodeNumber: number;  // 第几集
  title: string;          // 分集标题
  content: string;        // 剧本内容 (Markdown/HTML)
  structure: {            // 结构化数据 (Hook, Inciting Incident, etc.)
    hook?: string;
    climax?: string;
    cliffhanger?: string;
    summary?: string;
  };
  lastEdited: number;
}

export type AssetType = 'character' | 'location' | 'prop';

export interface Asset {
  id: string;             // UUID
  projectId: string;      // FK -> Project.id
  type: AssetType;
  name: string;
  description: string;    // 原始描述
  visualPrompt: string;   // AI 生成的绘画 Prompt
  imageUrl: string;       // 本地 Blob URL 或 云端 URL
  status: 'draft' | 'locked'; // 锁定后不可随意更改
  metadata: Record<string, any>; // 额外属性 (e.g. 年龄, 风格)
}

export interface Shot {
  id: string;             // UUID
  episodeId: string;      // FK -> Episode.id
  sequence: number;       // 镜头序号
  
  // P0: Narrative Causality (因果/状态变化)
  narrativeGoal: string;
  
  // P1: Visual Inference (视觉推断线索)
  visualEvidence: string;
  
  // P2: Expression (画面描述)
  description: string;    // 最终画面描述
  dialogue?: string;      // 对白或旁白
  camera: string;         // 运镜 (Pan, Tilt, Zoom...)
  size: string;           // 景别 (Close-up, Wide...)
  
  duration?: number;      // 预估时长
  relatedAssetIds: string[]; // 关联的 Asset ID 列表
}
