# Inkplot Workshop - 技术规格说明书 (Technical Specification)

## 1. 系统架构 (System Architecture)

### 1.1 总体架构
Inkplot Workshop 采用 **Local-First** (本地优先) 架构，利用浏览器强大的计算与存储能力，确保创作过程的流畅与隐私。后端仅作为 AI 服务的代理网关与鉴权层。

*   **前端 (Frontend)**: Next.js 14+ (App Router), React, TypeScript.
*   **本地存储 (Local Storage)**: IndexedDB (via Dexie.js) 存储所有剧本、资产与分镜数据。
*   **状态管理 (State Management)**: Zustand 处理复杂的编辑器状态与跨组件通信。
*   **后端服务 (Backend Services)**: Next.js API Routes (Serverless Functions) 负责对接 LLM 与图像生成 API。

### 1.2 技术栈 (Tech Stack)
| 模块 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **Framework** | Next.js 14 (App Router) | 核心框架，SSR/CSR 混合渲染 |
| **Language** | TypeScript | 强类型约束，确保代码健壮性 |
| **Styling** | Tailwind CSS + shadcn/ui | 快速构建 UI，符合极简设计规范 |
| **Animation** | Framer Motion | 实现“墨水晕染”、“纸张翻动”等复杂动效 |
| **State** | Zustand | 轻量级全局状态管理，支持中间件 |
| **Database** | Dexie.js | IndexedDB 的优雅封装，支持复杂查询与事务 |
| **AI Client** | Vercel AI SDK | 统一流式响应处理 (Streaming) |
| **Archive** | JSZip | 客户端打包 ZIP 文件，包含 Markdown、JSON 与原始图片 |

---

## 2. 数据模型设计 (Data Schema - Dexie.js)

数据库名: `InkplotDB`

### 2.1 Projects (剧集/项目)
```typescript
interface Project {
  id: string;             // UUID
  title: string;          // 剧名
  logline: string;        // 核心梗概
  genre: string[];        // 类型标签
  createdAt: number;
  updatedAt: number;
}
```

### 2.2 Episodes (分集剧本)
```typescript
interface Episode {
  id: string;             // UUID
  projectId: string;      // FK -> Project.id
  episodeNumber: number;  // 第几集
  title: string;          // 分集标题
  content: string;        // 剧本内容 (Markdown/HTML)
  structure: {            // 结构化数据 (Hook, Inciting Incident, etc.)
    hook?: string;
    climax?: string;
    cliffhanger?: string;
  };
  lastEdited: number;
}
```

### 2.3 Assets (资产圣经)
```typescript
type AssetType = 'character' | 'location' | 'prop';

interface Asset {
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
```

### 2.4 Shots (分镜脚本)
```typescript
interface Shot {
  id: string;             // UUID
  episodeId: string;      // FK -> Episode.id
  sequence: number;       // 镜头序号
  description: string;    // 画面描述
  camera: string;         // 运镜 (Pan, Tilt, Zoom...)
  size: string;           // 景别 (Close-up, Wide...)
  duration?: number;      // 预估时长
  relatedAssetIds: string[]; // 关联的 Asset ID 列表
}
```

---

## 3. 核心模块实现细节 (Implementation Details)

### 3.1 M1: 剧本工坊 (Script Workshop)
*   **编辑器**: 基于 `Prosemirror` 或 `Tiptap` 定制，实现“专注模式”与“流式生成”效果。
*   **AI 交互**: 使用 `useCompletion` (Vercel AI SDK) 实现剧本续写与润色。
*   **Hook**: 监听用户输入停止事件 (Debounce 2s)，自动保存至 Dexie。

### 3.2 M2: 资产提取 (Asset Extraction)
*   **Pipeline**:
    1.  **Analysis**: 发送完整剧本至 LLM，请求提取 Character/Location 列表 (JSON Mode)。
    2.  **Comparison**: 将提取结果与现有 `Assets` 表比对，避免重复创建。
    3.  **Generation**: 用户确认后，并发请求图像生成 API (Flux/Midjourney Proxy)。
    4.  **Storage**: 将生成的 Base64 图片转换为 Blob 存储在 IndexedDB，避免 LocalStorage 容量限制。

### 3.3 M3: 分镜引擎 (Skeleton Engine)
*   **逻辑编织**:
    *   Regex/NLP 分析剧本中的场景头 (Scene Heading) 自动切分场次。
    *   LLM 将每一场戏拆解为镜头列表 (Shot List)。
*   **自动关联**:
    *   在生成分镜描述时，使用 Aho-Corasick 算法或简单的字符串匹配，查找已定义的 `Asset.name`，自动建立关联。

### 3.4 M4: 交付 (Delivery)
*   **ZIP 打包**:
    *   使用 `JSZip` 在客户端构建压缩包。
    *   **文件结构**:
        ```
        Project_Name/
        ├── scripts/
        │   ├── episode_01.md
        │   └── ...
        ├── assets/
        │   ├── characters/
        │   │   ├── char_01.png
        │   │   └── ...
        │   └── locations/
        ├── meta.json  (包含项目元数据、资产关联关系、分镜结构化数据)
        └── README.md
        ```
*   **数据处理**:
    *   从 IndexedDB 读取所有相关数据。
    *   **Images**: 将 Blob URL 转换为 ArrayBuffer 写入 ZIP，确保是真实的图片文件而非链接。
    *   **Meta**: 将 `Project`, `Assets`, `Shots` 等完整数据序列化为 `meta.json`，方便第三方程序解析。
    *   **Markdown**: 将剧本内容导出为标准 Markdown 文件。

---

## 4. 接口定义 (API Routes)

所有 API 位于 `/api/v1` 下。

*   `POST /api/v1/ai/completion`: 通用文本生成 (用于剧本)。
*   `POST /api/v1/ai/extract`: 结构化数据提取 (用于资产)。
*   `POST /api/v1/ai/image`: 图像生成代理 (Flux/MJ)。
    *   Request: `{ prompt: string, ratio: string }`
    *   Response: `{ url: string, seed: number }`

---

## 5. 安全与性能 (Security & Performance)

*   **API Key Management**: 用户可在设置中填入自己的 OpenAI/Midjourney Key，存储在 LocalStorage (AES 加密)，仅在请求时解密发送至 Serverless Function (不落地)。
*   **Image Optimization**: 列表页使用缩略图，详情页加载原图。
*   **Lazy Loading**: 路由级懒加载 (Next.js default) + 组件级懒加载 (Assets Gallery)。

## 6. 开发规范 (Development Guidelines)

*   **Git Flow**: Main (Production) <- Develop (Staging) <- Feature/xyz
*   **Component Structure**:
    *   `components/ui`: 通用组件 (Button, Input)
    *   `components/business`: 业务组件 (ScriptEditor, AssetCard)
*   **Linting**: ESLint + Prettier (遵循 `design.md` 规则)
