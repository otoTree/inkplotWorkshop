# ARTS 资产与分镜视频接入 Spec

## Why
当前项目已经有火山素材库与 Seedance 视频生成的初步实现，但运行时代码仍以 `VOLCENGINE_*` 口径为主，和 `docs/arts-volcengine-curl.md` 中定义的 ARTS Bearer 鉴权、素材库 API 路径、`asset://` 引用规范并不完全一致。用户现在需要把项目按该文档做成资产级全面接入，并让分镜视频生成稳定支持 Seedance 2.0，同时继续兼容旧的视频生成链路。

## What Changes
- 统一运行时的 ARTS 接入协议，按文档使用 `ARTS_API_BASE_URL`、`ARTS_API_KEY`、`ARTS_VIDEO_MODEL` 和 `.../api?Action=...&Version=2024-01-01` 的素材库调用方式。
- 为项目资产建立完整的素材库生命周期：素材组、素材上传、素材状态轮询、可用态缓存与复用。
- 将分镜视频生成明确拆分为 `seedance-2.0` 与 `legacy` 两条可兼容链路，并保持项目级模型选择能力。
- 规定 Seedance 2.0 在引用已接入 ARTS 素材库的资产时必须发送 `asset://<asset_id>` 形式的 URL，不允许回退成普通公网图片 URL。
- 补齐旧环境变量、旧项目配置、旧视频任务状态字段的兼容和迁移策略，避免现有项目生成流程中断。

## Impact
- Affected specs: 项目配置、资产上传与同步、分镜视频生成、视频任务轮询、环境变量与部署配置
- Affected code: `src/lib/volcengine/asset-client.ts`、`src/lib/volcengine/asset-sync.ts`、`src/lib/volcengine/video-client.ts`、`src/lib/volcengine/video-payload.ts`、`src/app/api/ai/progress-video/route.ts`、`src/app/api/cron/sync-video-status/route.ts`、`src/components/dashboard/ProjectDialog.tsx`、相关类型定义与数据库读写层

## ADDED Requirements
### Requirement: 运行时遵循 ARTS 文档协议
系统 SHALL 以 `docs/arts-volcengine-curl.md` 作为当前项目接入火山素材库与 Seedance 2.0 的运行时协议来源，并按文档定义的环境变量、鉴权方式和 URL 规则发送请求。

#### Scenario: 素材库请求按 ARTS 协议发送
- **WHEN** 系统创建素材组、上传素材或查询素材状态
- **THEN** 系统使用 `ARTS_API_BASE_URL` 和 `ARTS_API_KEY`
- **AND** 素材库请求路径为 `.../api?Action=<Action>&Version=2024-01-01`
- **AND** 如果基础地址配置为 `.../api/v3`，系统会按文档规则回退到 `.../api`

#### Scenario: 视频请求按 ARTS 协议发送
- **WHEN** 系统提交 Seedance 2.0 视频任务或查询任务状态
- **THEN** 系统使用 `ARTS_API_BASE_URL` 和 `ARTS_API_KEY`
- **AND** 视频请求路径为 `.../contents/generations/tasks`
- **AND** 默认视频模型读取 `ARTS_VIDEO_MODEL`

### Requirement: 项目资产支持完整的 ARTS 生命周期
系统 SHALL 以项目为单位管理 ARTS 素材组和素材接入状态，保证参与分镜视频生成的参考资产可被上传、轮询、复用并追踪状态。

#### Scenario: 项目首次启用 ARTS 资产库
- **WHEN** 某项目首次开启资产同步并准备向 ARTS 投递资产
- **THEN** 系统能够创建或绑定一个有效的素材组
- **AND** 后续同项目的相关资产默认同步到该素材组

#### Scenario: 资产上传后等待可用
- **WHEN** 系统向 ARTS 提交素材上传请求成功
- **THEN** 系统记录返回的 `asset_id`
- **AND** 系统继续轮询素材状态直到 `Status=Active` 或 `Status=Failed`
- **AND** 只有 `Status=Active` 的资产才会被标记为可用于 Seedance 2.0

#### Scenario: 已接入资产被重复使用
- **WHEN** 同一项目再次使用已经接入且状态为 `Active` 的资产
- **THEN** 系统直接复用已有 `asset_id`
- **AND** 不重复上传相同资产

### Requirement: Seedance 2.0 必须使用 asset 协议引用资产
系统 SHALL 在 Seedance 2.0 请求中，把来自 ARTS 素材库且已变为 `Active` 的参考资产统一编码为 `asset://<asset_id>`。

#### Scenario: Seedance 2.0 使用已激活参考图
- **WHEN** 项目视频模型为 `seedance-2.0` 且某参考图已经在 ARTS 中为 `Active`
- **THEN** 视频请求 `content` 中的该引用 URL 必须为 `asset://<asset_id>`
- **AND** 不得发送该资产原始公网 URL

#### Scenario: Seedance 2.0 遇到未激活资产
- **WHEN** 项目视频模型为 `seedance-2.0` 且参考资产尚未进入 `Active`
- **THEN** 系统不得直接以普通公网 URL 代替该 ARTS 资产继续提交视频任务
- **AND** 系统应将任务保持在可恢复的等待或重试状态，直到资产可用或明确失败

### Requirement: 分镜视频生成兼容双模型链路
系统 SHALL 继续支持旧的视频生成链路，同时为 `seedance-2.0` 提供基于 ARTS 资产协议的专用分支，且项目级配置可以明确选择默认视频模型。

#### Scenario: 项目选择 Seedance 2.0
- **WHEN** 项目默认视频模型设置为 `seedance-2.0`
- **THEN** 分镜视频生成走 ARTS Seedance 2.0 提交与轮询链路
- **AND** 任务元数据中可区分该镜头由 Seedance 2.0 生成

#### Scenario: 项目选择 legacy
- **WHEN** 项目默认视频模型设置为 `legacy`
- **THEN** 分镜视频生成继续走现有旧链路
- **AND** 不要求资产必须先转换为 `asset://` 形式

#### Scenario: 旧项目未显式设置模型
- **WHEN** 历史项目缺少新的默认视频模型字段或仍保存旧值
- **THEN** 系统提供稳定兜底映射
- **AND** 不因配置缺失导致分镜视频生成报错

### Requirement: 视频状态与失败原因统一可观测
系统 SHALL 统一 Seedance 2.0 与 legacy 链路的视频任务状态映射、存储和前端展示，使分镜卡片、轮询接口和后台 cron 对任务状态理解一致。

#### Scenario: Seedance 2.0 任务处理中
- **WHEN** 上游返回 `processing`
- **THEN** 系统将镜头状态映射为统一的处理中状态
- **AND** 前台轮询接口与后台 cron 使用同一语义更新数据库

#### Scenario: Seedance 2.0 任务失败
- **WHEN** 上游返回 `failed` 且附带错误信息
- **THEN** 系统保存结构化失败原因
- **AND** 分镜界面可以展示任务失败而不是只显示笼统错误

## MODIFIED Requirements
### Requirement: 项目视频模型配置
项目级视频模型配置从“根据环境变量或局部逻辑隐式判断是否使用 Seedance”调整为“以项目设置为主、环境变量为默认值或兜底”的显式配置方式。系统必须允许用户在 `seedance-2.0` 与 `legacy` 之间切换，并保证后端执行链路与该配置一致。

### Requirement: 资产同步到视频生成的衔接
现有“素材未激活时允许直接用公网 URL 生成 Seedance 视频”的宽松行为需要修改。对于 Seedance 2.0，系统必须等待 ARTS 资产进入 `Active` 后再使用 `asset://<asset_id>` 提交；只有 legacy 链路可以继续直接使用公网 URL。

### Requirement: 环境变量兼容策略
现有代码中基于 `VOLCENGINE_*` 的实现需要调整为优先读取 `ARTS_*` 配置，同时保留明确、可控的旧配置兼容策略，确保已有部署不会因为变量名迁移立即失效。
