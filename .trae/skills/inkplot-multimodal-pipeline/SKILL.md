---
name: "inkplot-multimodal-pipeline"
description: "Builds reusable LLM, image, and video Python modules with fixed pipeline orchestration. Invoke when users want standalone multimodal workflow scaffolding in this repo."
---

# Inkplot Multimodal Pipeline

这个 skill 用于把当前项目的 AI 能力抽象成一个可独立演进的多模态开发目录，核心目标是：

- 将 LLM、Image、Video 能力拆成独立 Python 模块
- 将固定流程沉淀为 Python 编排代码
- 保留与当前项目一致的环境变量与 OpenAI 兼容接口约定
- 让后续微调、替换模型、追加流程时只改单个模块

## 何时调用

在以下场景调用：

- 用户希望为当前项目新增独立 skill 目录
- 用户希望把 AI 能力拆成可维护的 LLM / Image / Video 模块
- 用户希望把固定业务流程改成 Python 工作流
- 用户希望为后续微调预留清晰的模块边界

## 目录约定

当前 skill 的 Python 代码位于：

```text
.trae/skills/inkplot-multimodal-pipeline/runtime/
```

目录内约定：

- `core.py`：环境配置、HTTP 请求、通用响应提取
- `schemas.py`：统一的数据结构
- `prompts.py`：项目抽象层，负责把业务输入转成 prompt
- `llm.py`：文本生成模块
- `image.py`：图片生成模块
- `video.py`：视频生成与状态轮询模块
- `project_manager.py`：基于文件系统的项目管理与规划落盘
- `workflows.py`：将 story / image / video / full pipeline 拆成独立可复用工作流
- `pipeline.py`：工作流门面与 CLI 入口

当前项目的提示词源文件是 [prompts.ts](file:///Users/hjr/Desktop/inkplotWorkshop/src/lib/prompts.ts)，skill 内的 `prompts.py` 已开始按这个文件做 Python 映射，优先保持以下 prompt 族的一致性：

- 项目详情提取
- 项目蓝图生成
- 分批分集大纲生成
- 单集脚本生成
- 资产抽取
- 图片生成 prompt 拼装
- 分镜生成
- 封面设计

项目运行产物统一落在：

```text
.trae/skills/inkplot-multimodal-pipeline/workspace/projects/<project-id>/
```

每个项目目录默认包含：

- `project.json`：项目元信息与状态
- `tasks.json`：项目任务看板
- `planning/`：项目规划结果，如 `overview.md`、`blueprint.json`
- `prompts/`：每次生成使用的 prompt 归档
- `outputs/`：LLM、Image、Video 输出结果
- `assets/`：参考图、生成图、视频素材
- `episodes/`：分集级目录与索引
- `shots/`：分镜级目录与索引
- `runs/`：固定流程执行记录

工作台级别还会维护：

- `workspace/projects/index.json`：全部项目索引

## 文件系统工作台规划

推荐把这个 skill 当成一个纯文件系统工作台来使用：

- 项目层：管理主题、风格、整体状态、全局任务
- 分集层：管理每一集的大纲、状态、局部任务
- 分镜层：管理每个 shot 的描述、素材、生成结果
- 运行层：记录每次 pipeline 执行产物，便于回溯

推荐流程：

1. `init-project` 初始化项目骨架
2. `plan-project` 生成项目蓝图并自动创建分集骨架
3. `create-episode` 补全或新增分集
4. `create-shot` 为分集追加镜头规划
5. `add-task` 管理执行任务
6. `pipeline` 将一次完整多模态执行归档到项目目录

## 当前项目抽象原则

### 1. LLM 抽象

统一走 OpenAI 兼容的 `/chat/completions`，并兼容当前项目里已经使用的环境变量：

- `AI_LLM_API_BASE_URL`
- `AI_LLM_API_KEY`
- `AI_LLM_API_MODEL`
- `AI_TEXT_API_*`
- `AI_API_*`
- `OPENAI_*`

### 2. Image 抽象

图片模块默认兼容两种模式：

- `chat`：通过 `/chat/completions` 触发图像模型
- `images`：通过 `/images/generations` 直接生成图像

可通过环境变量 `AI_IMAGE_API_MODE` 切换。

### 3. Video 抽象

视频模块默认走：

- 生成：`/video/generations`
- 查询：`/video/generations/{task_id}`

并保留 `metadata.image_list` 与 `aspect_ratio` 这些当前项目已经在使用的约定。

### 4. 固定流程抽象

固定流程统一放在 `pipeline.py`，原则如下：

- LLM 负责结构化文本与脚本推理
- Image 负责关键帧或视觉参考图生成
- Video 负责镜头视频生成
- Pipeline 只做步骤编排，不直接内嵌模型实现

当前已经进一步拆成：

- `StoryPlanningWorkflow`：只负责故事蓝图规划
- `ImageGenerationWorkflow`：只负责图片 prompt 与图片结果生成
- `VideoGenerationWorkflow`：只负责视频 prompt 与视频任务生成
- `FullPipelineWorkflow`：只负责把前面三个 workflow 串起来

## 推荐扩展方式

如果后续要继续微调：

- 替换模型时优先只改 `core.py` 中的配置来源或对应模块的 payload
- 调整业务提示词时优先改 `prompts.py`
- 如果需要与主项目前端/接口完全一致，先同步比对 [prompts.ts](file:///Users/hjr/Desktop/inkplotWorkshop/src/lib/prompts.ts) 再修改 `prompts.py`
- 新增固定流程时新增编排函数，不要把逻辑回写进 `llm.py`、`image.py`、`video.py`

## 使用方式

```bash
python3 -m compileall .trae/skills/inkplot-multimodal-pipeline
python3 .trae/skills/inkplot-multimodal-pipeline/runtime/pipeline.py --help
python3 .trae/skills/inkplot-multimodal-pipeline/runtime/pipeline.py --mode init-project --project-name "民国悬疑短剧" --theme "民国悬疑短剧"
python3 .trae/skills/inkplot-multimodal-pipeline/runtime/pipeline.py --mode plan-project --project-name "民国悬疑短剧" --theme "民国悬疑短剧"
python3 .trae/skills/inkplot-multimodal-pipeline/runtime/pipeline.py --mode list-projects
python3 .trae/skills/inkplot-multimodal-pipeline/runtime/pipeline.py --mode workspace-index
python3 .trae/skills/inkplot-multimodal-pipeline/runtime/pipeline.py --mode show-project --project-id "民国悬疑短剧"
python3 .trae/skills/inkplot-multimodal-pipeline/runtime/pipeline.py --mode create-episode --project-id "民国悬疑短剧" --episode-number 1 --title "雨夜开场"
python3 .trae/skills/inkplot-multimodal-pipeline/runtime/pipeline.py --mode create-shot --project-id "民国悬疑短剧" --episode-number 1 --shot-number 1 --description "雨夜巷口对峙"
python3 .trae/skills/inkplot-multimodal-pipeline/runtime/pipeline.py --mode add-task --project-id "民国悬疑短剧" --title "整理第一集参考图" --category shot
```

也可以直接在 Python 中引用：

```python
from pipeline import InkplotPipeline
from workflows import (
    FullPipelineWorkflow,
    ImageGenerationWorkflow,
    StoryPlanningWorkflow,
    VideoGenerationWorkflow,
)
```
