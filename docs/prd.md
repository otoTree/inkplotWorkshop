# Inkplot Workshop - 一站式剧本创作与影像生成工坊 PRD

## 1. 项目概述 (Overview)

### 1.1 背景
当前 AI 内容创作流程割裂：创作者需要在“文本生成工具”（如 ChatGPT/Claude）撰写剧本，在“图像生成工具”（如 Midjourney）制作素材，再到“剪辑工具”合成视频。且在长篇/多集创作中，角色与场景的**视觉一致性**极难维持。

### 1.2 愿景
Inkplot Workshop 旨在打造一个**专业级剧本与资产规划平台**。融合 `AIMANJU` 的剧本结构化能力与 `aicut` 的资产管理逻辑，以“东方极简主义”为设计语言，实现从**灵感 -> 剧本 -> 资产圣经 -> 结构化分镜脚本**的无缝流转。我们专注于**前期策划（Pre-production）**，为后续的制作环节提供精确的文本描述与资产指引，而非直接生成最终视频。

## 2. 核心模块与功能 (Core Modules)

### 2.1 M1: 灵感与剧本工坊 (Script Workshop)
*参考 AIMANJU 核心能力*
- **灵感孵化 (Idea to Story)**：输入核心创意（Logline），AI 自动推导故事大纲、世界观及人物小传。
- **剧集结构规划 (Series Structure)**：
    - **智能分集**：将长篇故事/小说自动切分为 10-12 集的短剧结构，确保每集都有独立的起承转合。
    - **钩子设计 (Hook Design)**：为每一集自动植入开头黄金 3 秒（Hook）和结尾悬念（Cliffhanger）。
- **剧本洗稿与格式化 (Script Washer)**：
    - 支持导入小说/粗糙文本，自动转换为标准影视剧本格式。
- **多语言适配**：支持中英双语对照生成，方便国际化分发。

### 2.2 M2: 资产圣经系统 (Series Bible System)
*参考 aicut 核心能力*
- **智能提取 (Auto Extraction)**：深度分析剧本，自动提取“全局角色”（Characters）与“全局场景”（Environments）。
- **立绘与概念库 (Asset Library)**：
    - **角色立绘**：生成并管理核心角色的标准立绘（Character Sheet），确保后续引用的一致性。
    - **场景概念**：生成核心场景的概念氛围图（Concept Art），确立视觉基调。
- **一致性管理**：所有分镜中的描述将严格引用此处的资产定义。

### 2.3 M3: 分镜与骨架引擎 (Skeleton Engine)
*参考 aicut 多集管理能力*
- **结构化分镜 (Structured Shot List)**：
    - **分镜描述生成**：基于 M1 确定的剧本内容，AI 为每个镜头生成详细的画面描述（Prompt/Description）、运镜方式（Camera Movement）及景别（Shot Size）。
    - **资产强关联**：
        - 自动标记每个分镜中出现的**角色 ID**（引用 M2 立绘）。
        - 自动标记分镜发生的**场景 ID**（引用 M2 概念图）。
    - **不生成分镜图**：专注于文本层面的精准描述与逻辑连贯，不消耗算力生成海量中间态分镜图。

### 2.4 M4: 交付与导出 (Delivery & Export)
- **制作包 (Production Package)**:
    - 一键导出包含剧本 (Markdown)、原始图片素材 (PNG/JPG)、元数据 (JSON) 的 ZIP 压缩包。
    - **Meta.json**: 包含完整的项目结构、资产关联关系与分镜数据，便于程序化读取。
    - **Assets**: 包含所有生成的高清立绘与场景概念图文件。
- **数据结构化**:
    - 彻底分离数据与表现，不强制生成 PDF，而是提供最灵活的原始素材包，方便对接下游制作团队（如导入游戏引擎或专业剪辑软件）。

## 3. 业务流程 (Workflow)

```mermaid
graph LR
    A[灵感/小说] --> B(M1: 剧本生成/清洗)
    B --> C{用户确认剧本}
    C --> D(M2: 提取资产圣经)
    D --> E[生成角色立绘/场景概念图]
    E --> F(M3: 生成结构化分镜脚本)
    F --> G[关联资产 & 优化描述]
    G --> H[导出 ZIP 制作包 (Markdown+Images+JSON)]
```

## 4. 技术架构 (Tech Stack)

- **前端框架**：Next.js (App Router) + React
- **状态管理**：Zustand (支持 Series/Episode 复杂状态)
- **本地存储**：Dexie.js (IndexedDB) - 存储大量剧本与分镜数据
- **UI 组件库**：shadcn/ui + framer-motion (动画)
- **AI 核心**：
    - **LLM**：OpenAI GPT-4o / Claude 3.5 (剧本逻辑与 Prompt 优化)
    - **Image/Video**：Flux / Midjourney / Runway (外部 API 集成)
- **后端/API**：Next.js API Routes (Serverless)

## 5. UI/UX 设计原则
遵循 [design.md](file:///Users/hjr/Desktop/inkplotWorkshop/.trae/rules/design.md)：
- **东方极简 (Eastern Editorial)**：大留白、衬线字体、黑白灰主色调。
- **杂志化排版**：资产圣经以杂志画册形式呈现，而非枯燥的表单。
- **沉浸式写作**：剧本编辑器提供专注模式。

## 6. 路线图 (Roadmap)

- **Phase 1 (Fusion)**: 整合 AIMANJU 剧本生成逻辑与 aicut 骨架编辑器，打通文本到分镜的链路。
- **Phase 2 (Visual)**: 完善“资产圣经”UI，接入 Stable Diffusion/Flux 实现角色定妆。
- **Phase 3 (Render)**: 实现多集批量渲染与导出功能。
