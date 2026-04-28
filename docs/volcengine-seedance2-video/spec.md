# 火山素材库同步与 Seedance 2.0 分镜视频生成 Spec

## 1. 背景

当前分镜视频生成链路已经具备镜头级排队、后台 cron 消费、状态轮询和视频 URL 回写能力，但视频生成仍以通用 `/video/generations` 适配层为主，参考素材主要通过公网 URL 传入。

现在需要接入火山方舟 `contents/generations/tasks` 视频生成任务，并支持用户在生成前选择是否把参考素材同步到火山私域素材库。使用 Seedance 2.0 生成分镜视频时，如果素材已同步并处于 `Active` 状态，请求体应优先使用火山返回的素材 ID，格式为 `asset://asset-20260424120352-8lkvp`，而不是原始 URL。

## 2. 目标

- 用户可以选择是否将项目素材同步到火山素材库。
- 分镜镜头视频生成支持 Seedance 2.0 模型。
- Seedance 2.0 请求体支持 `content[]` 多模态格式。
- Seedance 2.0 生成时优先使用 `asset://<asset_id>` 作为参考图片、视频、音频地址。
- 仅当素材库素材状态为 `Active` 时，才允许用 `asset://<asset_id>` 参与视频生成。
- 视频状态查询使用火山方舟任务查询接口，并兼容返回的 `content.video_url`。
- 不破坏现有通用视频生成队列和旧模型配置。

## 3. 非目标

- 不做火山素材库删除与批量清理 UI。
- 不把所有 AI 视频模型统一改造成火山方舟专用格式。
- 不在提示词正文中直接写素材 ID。
- 不实现素材文件长期转存；素材库 `GetAsset` 返回的 URL 仅作为状态和回显辅助。
- 不在本次设计中重构整个分镜编辑器。

## 4. 用户体验

### 4.1 项目级设置

在项目或视频生成设置中增加火山素材库同步选项：

- `不同步素材库`：沿用现有 URL 参考素材链路。
- `同步并优先使用素材库`：生成视频前，把可同步的参考素材上传到火山素材库；Seedance 2.0 请求优先使用 `asset://<asset_id>`。

推荐默认值为 `不同步素材库`，避免用户在未配置 AK/SK、素材组或授权函时被阻塞。

### 4.2 镜头级生成

用户点击“生成视频”后：

1. 系统把镜头置为 `queued`。
2. 后台任务收集 `reference_image` 和 `related_asset_ids`。
3. 如果模型为 Seedance 2.0 且用户启用了同步：
   - 查询每个参考素材是否已有可用火山素材 ID。
   - 没有则调用 `CreateAsset` 上传。
   - 轮询 `GetAsset`，只使用 `Status = Active` 的素材。
4. 构建 Seedance 2.0 请求体。
5. 提交火山方舟视频任务。
6. 轮询任务状态并把成功返回的 `content.video_url` 写回镜头。

### 4.3 失败反馈

- 素材同步失败：镜头视频任务失败，错误原因应说明是素材同步失败，而不是笼统显示视频生成失败。
- 素材仍在 `Processing`：任务保持 `queued` 或 `processing`，等待后续 cron 继续推进。
- 火山任务失败：镜头 `video_status` 置为 `failed`，保留上游错误详情供排查。

## 5. 数据模型

### 5.1 `assets` 表新增字段

```sql
ALTER TABLE assets
ADD COLUMN IF NOT EXISTS volcengine_asset_id text,
ADD COLUMN IF NOT EXISTS volcengine_asset_status text,
ADD COLUMN IF NOT EXISTS volcengine_asset_group_id text,
ADD COLUMN IF NOT EXISTS volcengine_asset_project_name text,
ADD COLUMN IF NOT EXISTS volcengine_asset_type text,
ADD COLUMN IF NOT EXISTS volcengine_asset_error jsonb,
ADD COLUMN IF NOT EXISTS volcengine_asset_synced_at timestamp with time zone;
```

字段约定：

| 字段 | 用途 |
| --- | --- |
| `volcengine_asset_id` | 火山素材库返回的 Asset ID，不带 `asset://` 前缀 |
| `volcengine_asset_status` | `Active` / `Processing` / `Failed` |
| `volcengine_asset_group_id` | 上传目标素材组 ID |
| `volcengine_asset_project_name` | 火山项目名，默认 `default` |
| `volcengine_asset_type` | 火山素材类型，当前本项目资产主要映射为 `Image` |
| `volcengine_asset_error` | `GetAsset` 或 `CreateAsset` 失败详情 |
| `volcengine_asset_synced_at` | 最近一次同步或状态更新的时间 |

### 5.2 `projects` 表配置

建议把火山视频生成设置放进 `projects` 的 JSON 配置，避免为少量开关膨胀项目表字段：

```ts
type VolcengineVideoSettings = {
  syncAssetsToPrivateLibrary: boolean;
  assetGroupId?: string;
  projectName?: string;
  preferredVideoModel?: 'seedance-2.0' | 'legacy';
};
```

可落在现有 `projects` 表的一个新 JSONB 字段中：

```sql
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS volcengine_video_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
```

### 5.3 `shots` 表视频元信息

现有字段 `video_generation_id`、`video_status`、`video_url` 可以继续使用。建议新增一个 JSONB 字段保存上游返回和 provider 信息：

```sql
ALTER TABLE shots
ADD COLUMN IF NOT EXISTS video_generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
```

需要记录：

- `provider`: `volcengine`
- `model`: 例如 `doubao-seedance-2-0-pro-*`
- `requestContentMode`: `asset_uri` 或 `url`
- `referenceAssetIds`: 本次生成实际使用的火山素材 ID 列表
- `rawStatus`: 上游原始状态
- `usage`: 上游返回的 token 使用信息

## 6. 配置与密钥

### 6.1 视频生成任务

火山方舟视频生成使用 Bearer Token：

```env
VOLCENGINE_ARK_VIDEO_API_KEY=
VOLCENGINE_ARK_VIDEO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
VOLCENGINE_ARK_VIDEO_MODEL=doubao-seedance-2-0-pro
```

提交任务：

```text
POST /contents/generations/tasks
```

查询任务：

```text
GET /contents/generations/tasks/{taskId}
```

### 6.2 私域素材库

火山私域素材库使用 AK/SK 签名，不使用 Bearer Token：

```env
VOLCENGINE_ACCESS_KEY_ID=
VOLCENGINE_SECRET_ACCESS_KEY=
VOLCENGINE_ASSET_GROUP_ID=
VOLCENGINE_ASSET_PROJECT_NAME=default
VOLCENGINE_ASSET_REGION=cn-beijing
```

请求域名：

```text
POST https://ark.cn-beijing.volcengineapi.com/?Action=<ActionName>&Version=2024-01-01
```

## 7. Seedance 2.0 请求体

### 7.1 文本与参考图

Seedance 2.0 使用 `content[]` 描述输入。素材引用优先级如下：

1. `asset://<volcengine_asset_id>`，仅当素材状态为 `Active`。
2. 原始公网 URL，仅当用户未启用同步，或素材未能同步但业务允许降级。
3. 不传该素材，并在错误或 metadata 中记录原因。

示例：

```json
{
  "model": "doubao-seedance-2-0-pro",
  "content": [
    {
      "type": "text",
      "text": "全程参考图片1的角色身份和服装连续性。镜头从近景开始，角色转身冲向雨夜街口..."
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "asset://asset-20260424120352-8lkvp"
      },
      "role": "reference_image"
    }
  ],
  "generate_audio": true,
  "ratio": "9:16",
  "duration": 5,
  "watermark": false
}
```

### 7.2 提示词引用规则

提示词文本中使用“图片 1”“视频 1”“音频 1”这类相对引用，不直接写 Asset ID。

推荐结构：

```text
图片1是主角身份参考，必须保持脸型、发型、服装和年龄感一致。
图片2是场景参考，必须保持空间结构、色温和主要道具一致。

镜头描述：...
角色动作：...
运镜与景别：...
声音设计：...
```

## 8. 火山素材库同步流程

### 8.1 创建或选择素材组

MVP 建议先使用环境变量或项目设置中的 `assetGroupId`。如果为空，后台可调用 `CreateAssetGroup` 创建项目级素材组：

- `Name`: `inkplot-{projectId}`
- `Description`: `Inkplot Workshop private assets for project {projectId}`
- `GroupType`: `AIGC`
- `ProjectName`: 配置中的 `projectName` 或 `default`

### 8.2 上传素材

对每个需要参与 Seedance 2.0 的素材：

1. 读取 `assets.image_url`。
2. 如果已有 `volcengine_asset_id` 且状态为 `Active`，直接复用。
3. 如果状态为 `Processing`，调用 `GetAsset` 刷新状态。
4. 如果没有火山素材 ID，调用 `CreateAsset`。
5. 保存返回的 `Result.Id` 和 `Processing` 状态。
6. 后续 cron 继续轮询 `GetAsset`。

### 8.3 可用性判定

只有以下条件同时满足，才生成 `asset://<id>`：

- `volcengine_asset_id` 非空。
- `volcengine_asset_status === 'Active'`。
- `volcengine_asset_project_name` 与当前视频生成 API Key 所属项目一致。
- `volcengine_asset_group_id` 与项目设置一致，或被明确允许复用。

## 9. 视频任务状态映射

火山查询接口示例：

```text
GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{taskId}
```

关键响应：

```json
{
  "id": "cgt-2025******-****",
  "model": "doubao-seedance-1-5-pro-251215",
  "status": "succeeded",
  "content": {
    "video_url": "https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/xxx"
  },
  "usage": {
    "completion_tokens": 108900,
    "total_tokens": 108900
  }
}
```

状态映射：

| 火山状态 | 本地 `video_status` | 处理 |
| --- | --- | --- |
| `queued` / `pending` | `processing` | 继续轮询 |
| `running` / `processing` | `processing` | 继续轮询 |
| `succeeded` | `completed` | 写入 `content.video_url` |
| `failed` / `error` / `cancelled` | `failed` | 写入错误 metadata |

完成时 URL 读取优先级：

1. `content.video_url`
2. `video_url`
3. `url`
4. 本地下载代理兜底 URL

## 10. 模块边界

建议新增或调整以下模块：

| 模块 | 职责 |
| --- | --- |
| `src/lib/volcengine/asset-client.ts` | AK/SK 签名与素材库 OpenAPI 请求 |
| `src/lib/volcengine/video-client.ts` | Seedance 2.0 任务提交与查询 |
| `src/lib/volcengine/video-payload.ts` | 把镜头、提示词、参考素材转换成 `content[]` |
| `src/lib/volcengine/asset-sync.ts` | 素材同步、状态刷新、`asset://` 选择逻辑 |
| `src/app/api/ai/generate-video/route.ts` | 接收用户设置，继续只负责入队 |
| `src/app/api/cron/sync-video-status/route.ts` | 消费队列时执行素材同步和 Seedance 2.0 提交 |
| `src/app/api/ai/video-status/route.ts` | 根据 provider 查询任务状态 |

## 11. 错误处理

- 缺少 Bearer Token：Seedance 2.0 生成入口返回配置错误。
- 缺少 AK/SK 但用户开启同步：拒绝任务并提示配置素材库鉴权。
- `CreateAsset` 返回失败：记录到 `assets.volcengine_asset_error`，镜头任务保持可重试。
- `GetAsset` 返回 `Failed`：不使用该素材生成；如果该素材是必需参考，镜头任务失败。
- 生成任务提交失败：释放视频并发槽位，镜头回到 `queued` 或置为 `failed`，由错误类型决定。

## 12. 测试策略

- 单元测试：素材 URI 选择、状态映射、Seedance 2.0 payload 构建。
- API mock 测试：`CreateAsset`、`GetAsset`、生成任务提交、任务查询。
- 数据库迁移测试：新增字段可重复执行，旧数据默认不启用同步。
- 回归测试：旧模型和不同步素材库时仍走现有 URL 链路。
- 手动验收：启用同步后，生成请求体中的参考图片地址为 `asset://...`。

## 13. 验收标准

- 用户能在项目设置中开启或关闭“同步素材到火山素材库”。
- 开启同步且素材 `Active` 时，Seedance 2.0 请求体使用 `asset://<asset_id>`。
- 关闭同步时，视频生成仍使用原 URL 参考素材。
- 火山任务 `succeeded` 后，本地镜头展示生成视频。
- 火山任务状态和 usage 被写入 `video_generation_metadata`。
- 旧的分镜视频队列不会因为没有火山素材库配置而失效。
