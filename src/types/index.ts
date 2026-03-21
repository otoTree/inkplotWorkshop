export interface Project {
  id: string;             // UUID
  title: string;          // 剧名
  logline: string;        // 核心梗概
  genre: string[];        // 类型标签
  language?: string;      // 剧本语言
  artStyle?: string;      // 美术风格 (e.g. 赛博朋克, 水墨, 皮克斯)
  characterArtStyle?: string;
  sceneArtStyle?: string;
  sensitivityPrompt?: string;
  seriesPlan?: unknown;       // 10集连载大纲
  createdAt: number;
  updatedAt: number;

  // ★NEW: 封面生成字段
  coverImageUrl?: string;
  coverImageCandidates?: string[]; // ★NEW: 用于存储多张候选图的 URL
  coverTitle?: string;
  coverSlogan?: string;
  coverPrompt?: string;

  // ★NEW: 动态利益矩阵
  characterMatrices?: CharacterMatrix[];

  // ★NEW: 冲突拓扑图
  conflictGraph?: ConflictNode[];

  // ★NEW: 电影滤镜
  cinematicFilter?: CinematicFilter;

  // ★NEW: 内流控制配置
  engagementConfig?: EngagementConfig;
}

export type ArtStyleConfig = Pick<Project, 'artStyle' | 'characterArtStyle' | 'sceneArtStyle'>;

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

  // ★NEW: 资产预算
  assetBudget?: {
    maxAssets: number;        // 默认 3
    usedAssetIds: string[];   // 本集使用的资产ID
    primaryLocation: string;  // 主场景ID
  };

  // ★NEW: 事件状态
  eventStates?: {
    inherited: EventState[];  // 从上集继承的事件
    introduced: EventState[]; // 本集新引入的事件
    resolved: EventState[];   // 本集解决的事件
  };

  // ★NEW: 内流控制状态
  engagementState?: {
    suppressionIndex: number;      // 当前 SI 值
    plannedPayoff?: PlannedPayoff; // 计划释放的爽点
    hookContract?: HookContract;    // 钩子契约
  };
}

export type AssetType = 'character' | 'location';

export interface Asset {
  id: string;             // UUID
  projectId: string;      // FK -> Project.id
  type: AssetType;
  name: string;
  description: string;    // 原始描述
  visualPrompt: string;   // AI 生成的绘画 Prompt
  imageUrl: string;       // 本地 Blob URL 或 云端 URL
  status: 'draft' | 'locked'; // 锁定后不可随意更改
  metadata: Record<string, unknown>; // 额外属性 (e.g. 年龄, 风格)
  isMain?: boolean;       // ★NEW: 是否为核心主角 (最多2个)
}

export interface Task {
  id: string;
  type: string;
  status: string;
  payload?: unknown;
  result?: unknown;
  error?: string;
  created_at: string;
  updated_at: string;
  user_id?: string;
}

export interface Shot {
  id: string;             // UUID
  episodeId: string;      // FK -> Episode.id
  sequence: number;       // 镜头序号

  // 画面描述
  description: string;    // 最终画面描述
  dialogue?: string;      // 对白或旁白
  camera: string;         // 运镜 (Pan, Tilt, Zoom...)
  size: string;           // 景别 (Close-up, Wide...)

  duration?: number;      // 预估时长
  sensitivityReduction: number;
  relatedAssetIds: string[]; // 关联的 Asset ID 列表

  // ★NEW: 工业级分镜字段 (Industrial-grade storyboard fields)
  sceneLabel?: string;         // 场景标签 (如: 城市废墟)
  characterAction?: string;    // 角色动作 (如: 极度恐慌、抱紧孩子)
  emotion?: string;            // 情绪 (如: 绝望)
  lightingAtmosphere?: string; // 光影氛围 (如: 末日黄昏的暗橙色火光)
  soundEffect?: string;        // 音效 (如: 沉闷的斧头入肉声)
  referenceImage?: string;     // 参考图URL
  videoPrompt?: string;        // 视频提示词 (用于生成视频)
  videoUrl?: string;           // ★NEW: 生成的视频URL
  videoGenerationId?: string;  // ★NEW: 视频生成任务ID
  videoStatus?: 'pending' | 'queued' | 'processing' | 'completed' | 'failed'; // ★NEW: 视频生成状态
  
  // 支持单镜头多角色描述 (最多3个)
  characters?: Array<{
    name: string;
    description: string;
    imageUrl?: string;
  }>;

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

// ============ 内流控制系统类型 ============

// 角色利益矩阵
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

// 冲突节点
export interface ConflictNode {
  id: string;
  characterA: string;         // 角色A ID
  characterB: string;         // 角色B ID
  conflictType: 'interest' | 'secret' | 'revenge' | 'misunderstanding';
  triggerEpisode: number;     // 必须在第几集触发
  status: 'pending' | 'triggered' | 'resolved';
  description: string;
}

// 电影滤镜
export interface CinematicFilter {
  name: string;               // 滤镜名称
  colorGrading: string;       // 调色描述
  lightingStyle: string;      // 光照风格
  moodKeywords: string[];     // 情绪关键词
  referenceImages?: string[]; // 参考图片URL
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
