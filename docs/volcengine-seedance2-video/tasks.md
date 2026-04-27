# 火山素材库同步与 Seedance 2.0 分镜视频生成 Tasks

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持用户选择是否同步素材到火山私域素材库，并在 Seedance 2.0 分镜视频生成时优先使用 `asset://<asset_id>` 参考素材。

**Architecture:** 保留现有分镜视频队列入口，把火山素材同步和 Seedance 2.0 提交放到后台 cron 消费阶段。新增火山素材库 client、Seedance 2.0 video client、payload builder，并用数据库字段保存素材同步状态和视频上游 metadata。

**Tech Stack:** Next.js 16、TypeScript、Supabase、Upstash Redis、火山方舟 Bearer API、火山 OpenAPI AK/SK 签名。

---

## Task 1: 数据库字段与类型扩展

**Files:**

- Create: `supabase/migrations/20260427000000_add_volcengine_asset_and_video_settings.sql`
- Modify: `src/types/index.ts`

- [x] **Step 1: 创建迁移文件**

```sql
ALTER TABLE assets
ADD COLUMN IF NOT EXISTS volcengine_asset_id text,
ADD COLUMN IF NOT EXISTS volcengine_asset_status text,
ADD COLUMN IF NOT EXISTS volcengine_asset_group_id text,
ADD COLUMN IF NOT EXISTS volcengine_asset_project_name text,
ADD COLUMN IF NOT EXISTS volcengine_asset_type text,
ADD COLUMN IF NOT EXISTS volcengine_asset_error jsonb,
ADD COLUMN IF NOT EXISTS volcengine_asset_synced_at timestamp with time zone;

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS volcengine_video_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE shots
ADD COLUMN IF NOT EXISTS video_generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
```

- [x] **Step 2: 扩展 TypeScript 类型**

在 `Project` 中新增：

```ts
volcengineVideoSettings?: {
  syncAssetsToPrivateLibrary?: boolean;
  assetGroupId?: string;
  projectName?: string;
  preferredVideoModel?: 'seedance-2.0' | 'legacy';
};
```

在 `Asset` 中新增：

```ts
volcengineAssetId?: string;
volcengineAssetStatus?: 'Active' | 'Processing' | 'Failed';
volcengineAssetGroupId?: string;
volcengineAssetProjectName?: string;
volcengineAssetType?: 'Image' | 'Video' | 'Audio';
volcengineAssetError?: Record<string, unknown> | null;
volcengineAssetSyncedAt?: string;
```

在 `Shot` 中新增：

```ts
videoGenerationMetadata?: {
  provider?: 'volcengine' | string;
  model?: string;
  requestContentMode?: 'asset_uri' | 'url';
  referenceAssetIds?: string[];
  rawStatus?: string;
  usage?: Record<string, unknown>;
  error?: Record<string, unknown> | string;
};
```

- [ ] **Step 3: 运行静态检查**

验证记录：已运行 `npm run lint`，但完整 lint 被仓库既有问题阻塞；本次新增功能已通过 `node --test src/lib/volcengine/*.test.ts` 和 `npm run build`。

Run: `npm run lint`

Expected: 没有新增类型或 lint 错误。

## Task 2: 火山素材库 OpenAPI Client

**Files:**

- Create: `src/lib/volcengine/asset-client.ts`
- Test: `src/lib/volcengine/asset-client.test.ts` 或项目现有测试目录中的同名测试

- [x] **Step 1: 实现配置读取**

读取并校验：

```ts
VOLCENGINE_ACCESS_KEY_ID
VOLCENGINE_SECRET_ACCESS_KEY
VOLCENGINE_ASSET_REGION
VOLCENGINE_ASSET_PROJECT_NAME
VOLCENGINE_ASSET_GROUP_ID
```

默认：

```ts
region = 'cn-beijing'
projectName = 'default'
host = 'ark.cn-beijing.volcengineapi.com'
version = '2024-01-01'
```

- [x] **Step 2: 实现 AK/SK 签名请求**

提供通用方法：

```ts
requestVolcengineAssetApi<T>(action: string, body: Record<string, unknown>): Promise<T>
```

请求格式：

```text
POST https://ark.cn-beijing.volcengineapi.com/?Action=<ActionName>&Version=2024-01-01
```

必须包含：

```text
Content-Type: application/json
X-Date
X-Content-Sha256
Authorization
Host
```

- [x] **Step 3: 封装素材接口**

导出：

```ts
createAssetGroup(input)
createAsset(input)
getAsset(input)
listAssets(input)
```

至少支持 `CreateAsset` 和 `GetAsset`，因为 MVP 生成链路依赖这两个接口。

- [x] **Step 4: 测试签名与请求体**

Mock `fetch`，断言：

- `Action=CreateAsset`
- `Version=2024-01-01`
- `URL` 只接收公网 URL，不接收 Base64
- 返回 `Result.Id` 被正确解析

## Task 3: 素材同步服务

**Files:**

- Create: `src/lib/volcengine/asset-sync.ts`
- Modify: `src/app/api/cron/sync-video-status/route.ts`

- [x] **Step 1: 定义同步输入输出**

```ts
type LocalReferenceAsset = {
  id?: string;
  name?: string | null;
  type?: string | null;
  imageUrl?: string | null;
  volcengineAssetId?: string | null;
  volcengineAssetStatus?: string | null;
};

type ResolvedReferenceAsset = LocalReferenceAsset & {
  sourceUrl?: string;
  volcengineAssetUri?: string;
  usableUrl: string;
  contentType: 'image_url';
  role: 'reference_image';
  mode: 'asset_uri' | 'url';
};
```

- [x] **Step 2: 实现 `resolveVolcengineReferenceAssets`**

逻辑：

1. 如果项目未开启同步，返回原始 URL，`mode = 'url'`。
2. 如果素材已有 `volcengineAssetId` 且状态为 `Active`，返回 `asset://<id>`。
3. 如果素材有 ID 但状态非 `Active`，调用 `GetAsset` 刷新。
4. 如果没有 ID，调用 `CreateAsset` 上传并保存 `Processing`。
5. 只有 `Active` 素材可以返回 `asset://<id>`。

- [x] **Step 3: 更新数据库中的素材状态**

每次 `CreateAsset` 或 `GetAsset` 后更新：

```ts
volcengine_asset_id
volcengine_asset_status
volcengine_asset_group_id
volcengine_asset_project_name
volcengine_asset_type
volcengine_asset_error
volcengine_asset_synced_at
```

- [x] **Step 4: 接入 cron 队列消费**

在 `src/app/api/cron/sync-video-status/route.ts` 中，收集 `referenceAssets` 后：

- 查询项目配置 `volcengine_video_settings`。
- 如果 `preferredVideoModel === 'seedance-2.0'`，调用同步服务。
- 把 resolved assets 传给 Seedance 2.0 payload builder。

## Task 4: Seedance 2.0 Video Client

**Files:**

- Create: `src/lib/volcengine/video-client.ts`
- Create: `src/lib/volcengine/video-payload.ts`
- Modify: `src/lib/ai-server.ts`
- Modify: `src/app/api/ai/video-status/route.ts`

- [x] **Step 1: 实现视频配置读取**

读取：

```ts
VOLCENGINE_ARK_VIDEO_API_KEY
VOLCENGINE_ARK_VIDEO_BASE_URL
VOLCENGINE_ARK_VIDEO_MODEL
```

默认 base URL：

```text
https://ark.cn-beijing.volces.com/api/v3
```

- [x] **Step 2: 实现 Seedance 2.0 payload builder**

导出：

```ts
buildSeedance2VideoPayload({
  model,
  prompt,
  references,
  duration,
  ratio,
  generateAudio,
  watermark,
})
```

输出示例：

```ts
{
  model,
  content: [
    { type: 'text', text: prompt },
    {
      type: 'image_url',
      image_url: { url: 'asset://asset-20260424120352-8lkvp' },
      role: 'reference_image',
    },
  ],
  generate_audio: true,
  ratio: '9:16',
  duration: 5,
  watermark: false,
}
```

- [x] **Step 3: 实现提交任务**

```ts
createSeedance2VideoTask(payload)
```

请求：

```text
POST /contents/generations/tasks
Authorization: Bearer $VOLCENGINE_ARK_VIDEO_API_KEY
Content-Type: application/json
```

返回解析：

```ts
taskId = result.id || result.task_id || result.data?.id || result.data?.task_id
```

- [x] **Step 4: 实现查询任务**

```ts
getSeedance2VideoTask(taskId)
```

请求：

```text
GET /contents/generations/tasks/{taskId}
```

完成 URL 读取：

```ts
videoUrl =
  result.content?.video_url ||
  result.video_url ||
  result.url ||
  result.data?.content?.video_url ||
  result.data?.video_url ||
  result.data?.url
```

- [x] **Step 5: 状态映射**

```ts
function mapVolcengineTaskStatus(status: string) {
  if (['succeeded', 'completed', 'success'].includes(status)) return 'completed';
  if (['failed', 'error', 'cancelled'].includes(status)) return 'failed';
  return 'processing';
}
```

## Task 5: 视频队列与状态回写接入

**Files:**

- Modify: `src/app/api/cron/sync-video-status/route.ts`
- Modify: `src/app/api/ai/progress-video/route.ts`
- Modify: `src/app/api/ai/video-status/route.ts`

- [x] **Step 1: 队列消费时选择 provider**

选择条件：

```ts
const useSeedance2 =
  project.volcengine_video_settings?.preferredVideoModel === 'seedance-2.0' ||
  process.env.VOLCENGINE_ARK_VIDEO_MODEL?.includes('seedance-2');
```

- [x] **Step 2: Seedance 2.0 生成成功后写回**

更新 `shots`：

```ts
{
  video_generation_id: taskId,
  video_status: videoStatus,
  video_url: directUrl,
  video_generation_metadata: {
    provider: 'volcengine',
    model,
    requestContentMode,
    referenceAssetIds,
    rawStatus,
    usage,
  },
}
```

- [x] **Step 3: 状态查询时识别 provider**

如果 `video_generation_metadata.provider === 'volcengine'`，使用 `getSeedance2VideoTask(videoId)`。

否则沿用现有 `getAIVideoStatus(videoId)`。

- [x] **Step 4: 完成时写入火山 `content.video_url`**

当状态为 `succeeded`：

```ts
video_status = 'completed'
video_url = result.content.video_url
video_generation_metadata.rawStatus = 'succeeded'
video_generation_metadata.usage = result.usage
```

## Task 6: 用户设置入口

**Files:**

- Modify: 项目设置组件或现有视频生成设置组件
- Modify: 相关项目保存 API / Supabase mapper

- [x] **Step 1: 增加同步开关**

字段：

```ts
syncAssetsToPrivateLibrary: boolean
```

UI 文案：

```text
同步素材到火山素材库
```

说明文案：

```text
开启后，Seedance 2.0 会优先使用火山素材库 ID 作为参考素材；素材需处理完成后才能用于生成。
```

- [x] **Step 2: 增加模型选择**

选项：

```text
默认视频模型
Seedance 2.0
```

保存为：

```ts
preferredVideoModel: 'legacy' | 'seedance-2.0'
```

- [x] **Step 3: 增加素材组配置**

字段：

```ts
assetGroupId?: string
projectName?: string
```

MVP 可先隐藏在高级设置中，或先只读环境变量。

## Task 7: 测试与验收

**Files:**

- Test: `src/lib/volcengine/video-payload.test.ts`
- Test: `src/lib/volcengine/asset-sync.test.ts`
- Test: `src/lib/volcengine/video-client.test.ts`

- [x] **Step 1: 测试 payload 优先使用 asset URI**

输入素材包含：

```ts
{
  imageUrl: 'https://example.com/a.png',
  volcengineAssetId: 'asset-20260424120352-8lkvp',
  volcengineAssetStatus: 'Active',
}
```

Expected:

```ts
image_url.url === 'asset://asset-20260424120352-8lkvp'
```

- [x] **Step 2: 测试未同步时使用 URL**

输入项目设置：

```ts
syncAssetsToPrivateLibrary: false
```

Expected:

```ts
image_url.url === 'https://example.com/a.png'
```

- [x] **Step 3: 测试状态查询解析 `content.video_url`**

Mock response:

```json
{
  "id": "cgt-test",
  "status": "succeeded",
  "content": {
    "video_url": "https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/test.mp4"
  }
}
```

Expected:

```ts
videoStatus === 'completed'
videoUrl === 'https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/test.mp4'
```

- [x] **Step 4: 回归旧链路**

不开启 Seedance 2.0 时：

- 不调用火山素材库。
- 不生成 `asset://`。
- 仍使用现有 `callAIVideoGeneration`。

- [ ] **Step 5: 最终检查**

验证记录：已运行 `npm run lint`，但完整 lint 被仓库既有问题阻塞；本次新增功能已通过 `node --test src/lib/volcengine/*.test.ts` 和 `npm run build`。

Run:

```bash
npm run lint
```

Expected: PASS。
