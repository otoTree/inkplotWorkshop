# 分镜脚本增强功能设计文档

## 1. 背景与目标 (Background & Goals)

当前分镜脚本模块主要侧重于基于 AI 生成的文本内容（P0/P1/P2 逻辑）展示与基础编辑。用户反馈需要加强自定义编辑能力，并支持单个分镜头的导出功能。本设计旨在提升分镜头的编辑灵活性，并满足单镜头分享与交付的需求。

## 2. 需求分析 (Requirements Analysis)

### 2.1 自定义编辑增强 (Enhanced Custom Editing)
目前编辑功能较为基础（行内文本框），难以应对复杂内容的调整。
- **需求点**:
    - **专注模式**: 提供弹窗或独立视图，专注于单个镜头的详细打磨。
    - **字段完善**: 除了 P0/P1/P2，需更好地支持运镜（Camera）、景别（Size）、时长（Duration）的调整。
    - **资产关联**: 优化资产关联的交互体验。
    - **排序调整**: (隐含需求) 支持镜头的拖拽排序或序号调整。

### 2.2 单个分镜头导出 (Single Shot Export)
目前仅支持整项目导出，缺乏对单个镜头的灵活输出。
- **需求点**:
    - **图片导出**: 将单个镜头卡片（包含序号、描述、参数、关联资产图）生成为一张图片（PNG/JPG），便于社交分享或即时沟通。
    - **文本导出**: 复制单个镜头的结构化文本（Markdown/JSON）至剪贴板。

## 3. 功能设计 (Feature Design)

### 3.1 UI/UX 设计

#### A. 镜头卡片优化 (Shot Card Optimization)
- **增加操作栏**: 在卡片右上角增加“导出”和“详情编辑”按钮。
- **视觉层级**: 保持 Eastern Editorial Minimalism 风格，使用留白区分 P0/P1/P2。

#### B. 详情编辑弹窗 (Detail Edit Dialog)
- **布局**: 左侧为文本编辑区（P0/P1/P2/对白），右侧为参数设置（运镜、景别、时长）与资产关联区。
- **预览**: 实时预览卡片样式。

#### C. 导出预览 (Export Preview)
- **生成图片**: 点击导出时，在后台渲染一个专门用于导出的高展示性组件（去除编辑按钮，排版更紧凑美观），转换为图片供用户下载。
- **样式**:
    - 包含项目名称、集数、镜头序号。
    - 突出 P2 画面描述与 P1 视觉证据。
    - 展示关联资产的缩略图。

### 3.2 数据模型 (Data Model)
无需大幅修改现有 `Shot` 结构，但建议在前端或 API 层增加对 `order` (sequence) 的更灵活处理。

```typescript
// src/types/index.ts (Existing)
export interface Shot {
  id: string;
  episodeId: string;
  sequence: number;
  narrativeGoal: string; // P0
  visualEvidence: string; // P1
  description: string; // P2
  dialogue?: string;
  camera: string;
  size: string;
  duration?: number;
  relatedAssetIds: string[];
}
```

## 4. 技术方案 (Technical Implementation)

### 4.1 导出实现 (Export Implementation)
- **库选型**: 使用 `html-to-image` 或 `html2canvas`。
- **流程**:
    1. 创建一个隐藏的 `ShotExportTemplate` 组件，接收 `Shot` 数据。
    2. 将该组件渲染到 DOM（屏幕外或临时层）。
    3. 调用 `toPng` 方法生成 Blob。
    4. 触发下载。

### 4.2 编辑交互 (Interaction)
- **组件拆分**:
    - `ShotCard`: 展示态。
    - `ShotEditorDialog`: 弹窗编辑态。
    - `ShotExportTemplate`: 导出专用排版。

### 4.3 目录结构
```
src/components/storyboard/
├── StoryboardEditor.tsx   # 主容器
├── ShotCard.tsx           # 列表卡片
├── ShotDetailDialog.tsx   # [新增] 详情编辑弹窗
└── ShotExportPreview.tsx  # [新增] 导出模板
```

## 5. 后续规划 (Future Plan)
- **图片上传**: 允许用户为镜头上传手绘草图或参考图（需新增 `imageUrl` 字段）。
- **AI 绘图**: 集成 AI 生图功能，直接根据 P2 描述生成分镜草图。
