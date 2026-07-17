# 供应商直连 API 文档

本文档只整理当前项目直接请求的模型供应商与素材库 API，不包含本项目自己的 `/api/*` 服务接口。

代码依据：

- `src/lib/ai-server.ts`
- `src/lib/image-generation-models.ts`
- `src/lib/volcengine/video-client.ts`
- `src/lib/volcengine/video-payload.ts`
- `src/lib/volcengine/asset-client.ts`
- `src/lib/volcengine/asset-sync.ts`

官方参考：

- OpenAI Chat Completions: https://developers.openai.com/api/reference/resources/chat
- OpenAI Images: https://developers.openai.com/api/reference/resources/images
- OpenAI Videos: https://developers.openai.com/api/reference/resources/videos/methods/create
- 火山方舟创建视频生成任务: https://api.volcengine.com/api-docs/view?action=CreateContentsGenerationsTasks&serviceCode=ark&version=2024-01-01
- 火山方舟查询视频生成任务: https://www.volcengine.com/docs/82379/1521309
- 火山素材库使用指南: https://www.volcengine.com/docs/82379/2333565

## 1. 当前项目用到的供应商接口清单

| 能力 | 供应商接口形态 | 当前项目端点 | 主要模型/配置 |
| --- | --- | --- | --- |
| 语言模型 | OpenAI-compatible Chat Completions | `POST {baseUrl}/chat/completions` | `AI_LLM_API_MODEL` / `AI_API_MODEL` / `OPENAI_MODEL` |
| 图像生成/编辑 | OpenAI-compatible Images，项目按异步任务适配 | `POST {baseUrl}/images/generations` + `GET {baseUrl}/images/generations/{task_id}` | `gemini-3-pro-image-preview` / `gpt-image-2` |
| 通用视频生成 | OpenAI-compatible/中转供应商视频接口 | `POST {baseUrl}/video/generations` + `GET {baseUrl}/video/generations/{id}` | `AI_API_VIDEO_MODEL` / `OPENAI_VIDEO_MODEL` |
| 通用视频下载 | OpenAI-compatible/中转供应商视频下载 | `GET {baseUrl}/videos/{id}/content?variant=mp4` | 与通用视频任务同一供应商 |
| Seedance 2.0 视频 | 火山方舟内容生成任务 | `POST {baseUrl}/contents/generations/tasks` + `GET {baseUrl}/contents/generations/tasks/{taskId}` | `seedance-2-0-fast-tezan` / `seedance-2-0-tezan` |
| 火山素材库 | 火山素材资产库 OpenAPI / ARTS Bearer 兼容层 | `POST {assetBaseUrl}?Action=...&Version=2024-01-01` | `CreateAssetGroup` / `CreateAsset` / `GetAsset` / `ListAssets` |

## 2. 通用鉴权与请求约定

### 2.1 Bearer Token

语言、图像、通用视频、火山方舟 Seedance 2.0、ARTS 兼容素材库都使用 Bearer Token：

```http
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

### 2.2 火山素材库 legacy AK/SK 签名

如果没有配置 `ARTS_API_BASE_URL` / `ARTS_API_KEY`，项目会走火山 legacy OpenAPI 签名：

```text
POST https://ark.cn-beijing.volcengineapi.com/?Action=<Action>&Version=2024-01-01
```

必需签名头：

- `Content-Type: application/json`
- `Host: ark.cn-beijing.volcengineapi.com`
- `X-Date`
- `X-Content-Sha256`
- `Authorization: HMAC-SHA256 Credential=..., SignedHeaders=..., Signature=...`

签名服务名固定为 `ark`，默认区域为 `cn-beijing`。

## 3. 环境变量

### 3.1 语言模型

读取优先级从左到右：

| 配置项 | 环境变量优先级 | 默认值 |
| --- | --- | --- |
| Base URL | `AI_LLM_API_BASE_URL` -> `AI_TEXT_API_BASE_URL` -> `AI_API_BASE_URL` -> `OPENAI_BASE_URL` | `https://api.openai.com/v1` |
| API Key | `AI_LLM_API_KEY` -> `AI_TEXT_API_KEY` -> `AI_API_KEY` -> `OPENAI_API_KEY` | 无，必填 |
| Model | `AI_LLM_API_MODEL` -> `AI_TEXT_API_MODEL` -> `AI_API_MODEL` -> `OPENAI_MODEL` | `gpt-4o` |
| Timeout | `AI_LLM_API_TIMEOUT_MS` -> `AI_LLM_API_TIMEOUT` -> `AI_TEXT_API_TIMEOUT_MS` -> `AI_TEXT_API_TIMEOUT` -> `AI_API_TIMEOUT_MS` -> `AI_API_TIMEOUT` -> `OPENAI_TIMEOUT_MS` | `300000ms` |
| 并发 | `AI_LLM_API_MAX_CONCURRENCY` -> `AI_TEXT_API_MAX_CONCURRENCY` -> `AI_API_MAX_CONCURRENCY` | `50` |
| 最小间隔 | `AI_LLM_API_MIN_INTERVAL_MS` -> `AI_TEXT_API_MIN_INTERVAL_MS` -> `AI_API_MIN_INTERVAL_MS` | `0` |

### 3.2 图像模型

| 配置项 | 环境变量优先级 | 默认值 |
| --- | --- | --- |
| Base URL | `AI_IMAGE_API_BASE_URL` -> `AI_API_BASE_URL` -> `OPENAI_BASE_URL` | `https://api.openai.com/v1` |
| API Key | `AI_IMAGE_API_KEY` -> `AI_API_KEY` -> `OPENAI_API_KEY` | 无，必填 |
| Model | `AI_IMAGE_API_MODEL` -> `AI_API_IMAGE_MODEL` -> `OPENAI_IMAGE_MODEL` -> `AI_API_MODEL` -> `OPENAI_MODEL` | `gemini-3-pro-image-preview` |
| Timeout | `AI_IMAGE_API_TIMEOUT_MS` -> `AI_IMAGE_API_TIMEOUT` -> `AI_API_TIMEOUT_MS` -> `AI_API_TIMEOUT` -> `OPENAI_TIMEOUT_MS` | `300000ms` |

当前代码只认为以下图像模型是受支持的异步图片模型：

```text
gemini-3-pro-image-preview
gpt-image-2
```

### 3.3 通用视频模型

| 配置项 | 环境变量优先级 | 默认值 |
| --- | --- | --- |
| Base URL | `AI_API_BASE_URL` -> `OPENAI_BASE_URL` | `https://api.openai.com/v1` |
| API Key | `AI_API_KEY` -> `OPENAI_API_KEY` | 无，必填 |
| Model | `AI_API_VIDEO_MODEL` -> `OPENAI_VIDEO_MODEL` -> `AI_API_MODEL` -> `OPENAI_MODEL` | `gpt-4o` |

### 3.4 火山 Seedance 2.0 视频

| 配置项 | 环境变量优先级 | 默认值 |
| --- | --- | --- |
| Base URL | `ARTS_VIDEO_BASE_URL` -> `ARTS_API_BASE_URL` -> `VOLCENGINE_ARK_VIDEO_BASE_URL` -> `ARK_BASE_URL` | `https://ark.cn-beijing.volces.com/api/v3` |
| API Key | `ARTS_API_KEY` -> `VOLCENGINE_ARK_VIDEO_API_KEY` -> `ARK_API_KEY` | 无，必填 |
| Model | 项目模型 -> `ARTS_VIDEO_MODEL` -> `VOLCENGINE_ARK_VIDEO_MODEL` -> `ARK_VIDEO_MODEL` -> Seedance 形态的 `AI_API_VIDEO_MODEL` | 无，必填 |
| Timeout | `VOLCENGINE_ARK_VIDEO_TIMEOUT_MS` -> `AI_API_TIMEOUT_MS` | `300000ms` |

Base URL 规则：

- `ARTS_VIDEO_BASE_URL` 或 `ARTS_API_BASE_URL` 都视为兼容网关根地址，不追加 `/api/v3`。
- 创建任务使用 `/v1/videos/generations`，查询任务使用 `/v1/tasks/{taskId}`。
- 只有旧版 `VOLCENGINE_ARK_VIDEO_BASE_URL` / `ARK_BASE_URL` 继续使用 `/api/v3/contents/generations/tasks`。

### 3.5 火山素材库

ARTS Bearer 模式：

```env
ARTS_API_BASE_URL=https://jphhngvqjmgr.sealosbja.site
ARTS_API_KEY=replace-with-key
ARTS_ASSET_PROJECT_NAME=tz
ARTS_ASSET_GROUP_ID=optional-group-id
```

视频和素材库默认复用这个根地址，也可以分别覆盖：

```env
ARTS_VIDEO_BASE_URL=https://jphhngvqjmgr.sealosbja.site
ARTS_ASSET_BASE_URL=https://jphhngvqjmgr.sealosbja.site
ARTS_API_KEY=replace-with-key
ARTS_VIDEO_MODEL=seedance-2-0-fast-tezan
```

`ARTS_ASSET_BASE_URL` 和 `ARTS_API_BASE_URL` 都不会追加 `/api/v3`，素材库按
`?Action=<Action>&Version=2024-01-01` 拼接，JSON 请求参数保持不变。

例如 `https://jphhngvqjmgr.sealosbja.site` 的素材查询地址为
`https://jphhngvqjmgr.sealosbja.site?Action=ListAssets&Version=2024-01-01`。

应用内批量同步默认每批处理 5 个素材（接口允许 `batchSize` 最大为 10），每批通过
`nextCursor` 继续下一次请求，避免数百张素材占用同一个 Serverless 调用。单个素材库
请求默认 45 秒超时，可通过 `ARTS_ASSET_TIMEOUT_MS` 调整。
Vercel 部署时素材同步路由固定运行在新加坡 `sin1`，响应中的 `region` 字段可用于确认实际执行区域。

Legacy AK/SK 模式：

```env
VOLCENGINE_ACCESS_KEY_ID=replace-with-ak
VOLCENGINE_SECRET_ACCESS_KEY=replace-with-sk
VOLCENGINE_ASSET_REGION=cn-beijing
VOLCENGINE_ASSET_PROJECT_NAME=default
VOLCENGINE_ASSET_GROUP_ID=optional-group-id
```

## 4. 语言模型 API

### 4.1 创建聊天补全

```http
POST {AI_LLM_BASE_URL}/chat/completions
Authorization: Bearer <AI_LLM_API_KEY>
Content-Type: application/json
```

请求体：

```json
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "请输出 JSON。"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 4096,
  "response_format": {
    "type": "json_object"
  }
}
```

字段说明：

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `model` | 是 | string | 语言模型 ID。 |
| `messages` | 是 | array | 对话消息数组。项目支持普通文本，也支持多模态 content 数组。 |
| `temperature` | 否 | number | 默认 `0.7`。 |
| `max_tokens` | 否 | number | 最大输出 token。 |
| `response_format` | 否 | object | 项目常用 `{ "type": "json_object" }` 要求 JSON 输出。 |

成功响应示例：

```json
{
  "id": "chatcmpl_xxx",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "{\"ok\":true}"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 20,
    "total_tokens": 120
  }
}
```

项目解析规则：

- 必须存在 `choices[0].message.content`。
- 如果 `finish_reason === "length"`，视为输出被截断。
- 空字符串会被视为错误。
- HTTP `408` / `409` / `425` / `429` / `500` / `502` / `503` / `504` 会按配置重试。

Curl：

```bash
curl -X POST "$AI_LLM_API_BASE_URL/chat/completions" \
  -H "Authorization: Bearer $AI_LLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'"$AI_LLM_API_MODEL"'",
    "messages": [
      { "role": "user", "content": "输出一个短剧标题，JSON 格式。" }
    ],
    "temperature": 0.7,
    "response_format": { "type": "json_object" }
  }'
```

## 5. 图像模型 API

项目图像链路采用“提交异步任务 -> 查询任务状态”的供应商兼容协议。注意：OpenAI 官方 Images API 的标准响应可以直接返回 `data[].b64_json` 或 `data[].url`；本项目当前实现额外要求供应商支持 `GET /images/generations/{task_id}` 轮询。

### 5.1 创建图像生成任务

```http
POST {AI_IMAGE_BASE_URL}/images/generations
Authorization: Bearer <AI_IMAGE_API_KEY>
Content-Type: application/json
```

通用请求体：

```json
{
  "model": "gemini-3-pro-image-preview",
  "prompt": "电影感竖版人物海报，夜景霓虹，写实风格",
  "size": "9:16",
  "n": 1
}
```

字段说明：

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `model` | 是 | string | `gemini-3-pro-image-preview` 或 `gpt-image-2`。 |
| `prompt` | 是 | string | 图片提示词。 |
| `size` | 是 | string | 项目直接传宽高比，如 `1:1`、`9:16`、`16:9`、`3:2`、`2:3`。 |
| `n` | 否 | number | 生成数量，默认 `1`。 |
| `client_business_id` | 否 | string | 业务幂等 ID；代码预留字段。 |

#### 5.1.1 `gpt-image-2` 请求扩展

```json
{
  "model": "gpt-image-2",
  "prompt": "参考图中的角色，生成一张电影感角色定妆照",
  "size": "9:16",
  "n": 1,
  "resolution": "2K",
  "response_format": "url",
  "reference_images": [
    "https://example.com/reference.jpg"
  ]
}
```

项目分辨率映射：

| `size` | `resolution` |
| --- | --- |
| `1:1` / `3:2` / `2:3` | `1K` |
| `16:9` / `9:16` / `2:1` / `1:2` / `21:9` / `9:21` | `2K` |
| 其他 | `2K` |

#### 5.1.2 `gemini-3-pro-image-preview` 请求扩展

```json
{
  "model": "gemini-3-pro-image-preview",
  "prompt": "参考图中的角色，生成一张电影感角色定妆照",
  "size": "9:16",
  "n": 1,
  "metadata": {
    "resolution": "1K",
    "orientation": "portrait"
  },
  "image_urls": [
    {
      "url": "https://example.com/reference.jpg"
    }
  ]
}
```

项目方向映射：

| `size` | `metadata.orientation` |
| --- | --- |
| 宽大于高，如 `16:9` | `landscape` |
| 高大于宽，如 `9:16` | `portrait` |
| 正方形或无法解析 | 不传 |

成功响应必须包含任务 ID：

```json
{
  "id": "img_task_xxx",
  "status": "queued"
}
```

或：

```json
{
  "task_id": "img_task_xxx",
  "status": "queued"
}
```

### 5.2 查询图像生成任务

```http
GET {AI_IMAGE_BASE_URL}/images/generations/{task_id}
Authorization: Bearer <AI_IMAGE_API_KEY>
```

处理中响应：

```json
{
  "id": "img_task_xxx",
  "status": "processing"
}
```

完成响应：

```json
{
  "id": "img_task_xxx",
  "status": "completed",
  "data": [
    {
      "url": "https://cdn.example.com/generated/image.png"
    }
  ]
}
```

也兼容：

```json
{
  "status": "completed",
  "result": {
    "data": [
      {
        "b64_json": "iVBORw0KGgo..."
      }
    ]
  }
}
```

失败响应：

```json
{
  "id": "img_task_xxx",
  "status": "failed",
  "error": {
    "code": "INVALID_PROMPT",
    "message": "Prompt rejected"
  }
}
```

项目轮询策略：

- 首次等待 `2000ms`。
- 每 `3000ms` 查询一次。
- 最长等待 `120000ms`。
- `status === "completed"` 成功。
- `status === "failed"` 失败。

Curl：

```bash
TASK_ID=$(
  curl -s -X POST "$AI_IMAGE_API_BASE_URL/images/generations" \
    -H "Authorization: Bearer $AI_IMAGE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "gemini-3-pro-image-preview",
      "prompt": "写实电影感女主定妆照",
      "size": "9:16",
      "n": 1,
      "metadata": { "resolution": "1K", "orientation": "portrait" }
    }' | jq -r '.id // .task_id'
)

curl -X GET "$AI_IMAGE_API_BASE_URL/images/generations/$TASK_ID" \
  -H "Authorization: Bearer $AI_IMAGE_API_KEY"
```

## 6. 通用视频模型 API

这是非火山 Seedance 2.0 的 legacy 视频供应商兼容接口。它不是本项目内部 API，也不等同于 OpenAI 官方当前 `POST /videos` 标准接口；项目代码实际调用的是 `/video/generations`。

### 6.1 创建视频任务

```http
POST {AI_API_BASE_URL}/video/generations
Authorization: Bearer <AI_API_KEY>
Content-Type: application/json
```

请求体：

```json
{
  "model": "kling-v3-omni-pro",
  "prompt": "竖屏 5 秒短剧镜头，角色推门进入雨夜街道，镜头缓慢推进。",
  "duration": 5,
  "multi_shot": false,
  "aspect_ratio": "9:16",
  "sound": "on",
  "metadata": {
    "image_list": [
      {
        "image_url": "https://example.com/reference-character.jpg"
      }
    ],
    "aspect_ratio": "9:16"
  }
}
```

字段说明：

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `model` | 是 | string | 来自 `AI_API_VIDEO_MODEL` / `OPENAI_VIDEO_MODEL`。 |
| `prompt` | 是 | string | 视频提示词。 |
| `duration` | 否 | number | 秒数。 |
| `multi_shot` | 否 | boolean | 项目传 `false`。 |
| `aspect_ratio` | 否 | string | `9:16` 或 `16:9`。 |
| `sound` | 否 | string | 项目传 `on`。 |
| `metadata.image_list` | 否 | array | 参考图片数组，元素为 `{ "image_url": "..." }`。 |

成功响应兼容以下任务 ID 字段：

```json
{
  "task_id": "video_task_xxx",
  "status": "processing"
}
```

或：

```json
{
  "id": "video_task_xxx",
  "data": {
    "status": "processing"
  }
}
```

如果供应商同步返回视频地址，也兼容：

```json
{
  "id": "video_task_xxx",
  "status": "succeeded",
  "url": "https://cdn.example.com/video.mp4"
}
```

### 6.2 查询视频任务

```http
GET {AI_API_BASE_URL}/video/generations/{videoId}
Authorization: Bearer <AI_API_KEY>
```

处理中：

```json
{
  "id": "video_task_xxx",
  "status": "processing"
}
```

完成：

```json
{
  "id": "video_task_xxx",
  "status": "succeeded",
  "video_url": "https://cdn.example.com/video.mp4"
}
```

失败：

```json
{
  "id": "video_task_xxx",
  "status": "failed",
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "image_url is invalid"
  }
}
```

状态映射：

| 供应商状态 | 项目语义 |
| --- | --- |
| `completed` / `succeeded` / `success` | completed |
| `failed` / `error` | failed |
| 其他 | processing |

### 6.3 下载视频内容

```http
GET {AI_API_BASE_URL}/videos/{videoId}/content?variant=mp4
Authorization: Bearer <AI_API_KEY>
```

说明：

- 供应商可能返回 `302` / `307` 跳转到 CDN。
- 项目支持透传 `content-type`、`content-length`、`content-disposition`、`accept-ranges`、`content-range`。

Curl：

```bash
curl -X POST "$AI_API_BASE_URL/video/generations" \
  -H "Authorization: Bearer $AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'"$AI_API_VIDEO_MODEL"'",
    "prompt": "5 秒写实短剧镜头，女主在雨夜回头。",
    "duration": 5,
    "multi_shot": false,
    "aspect_ratio": "9:16",
    "sound": "on",
    "metadata": {
      "image_list": [
        { "image_url": "https://example.com/ref.jpg" }
      ],
      "aspect_ratio": "9:16"
    }
  }'
```

## 7. 火山方舟 Seedance 2.0 视频 API

### 7.1 创建视频生成任务

```http
POST {VOLCENGINE_VIDEO_BASE_URL}/contents/generations/tasks
Authorization: Bearer <ARTS_API_KEY>
Content-Type: application/json
```

项目默认模型：

```text
seedance-2-0-fast-tezan
seedance-2-0-tezan
```

请求体：

```json
{
  "model": "seedance-2-0-fast-tezan",
  "content": [
    {
      "type": "text",
      "text": "竖屏 5 秒写实短剧镜头。参考图片 1 保持角色脸型、发型、服装一致。镜头从中景缓慢推进，角色推门进入雨夜街道。"
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
  "resolution": "480p",
  "duration": 5,
  "watermark": false
}
```

字段说明：

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `model` | 是 | string | Seedance 2.0 模型 ID。 |
| `content` | 是 | array | 多模态输入，至少包含一个 `{ "type": "text" }`。 |
| `generate_audio` | 否 | boolean | 项目传 `true`。 |
| `ratio` | 否 | string | `9:16` 或 `16:9`，默认项目侧归一为 `9:16`。 |
| `resolution` | 是 | string | 固定为 `480p`。 |
| `duration` | 否 | number | 秒数。 |
| `watermark` | 否 | boolean | 项目传 `false`。 |

`content` 支持的项目结构：

```ts
type ContentItem =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string }; role: 'reference_image' }
  | { type: 'video_url'; video_url: { url: string }; role: 'reference_video' }
  | { type: 'audio_url'; audio_url: { url: string }; role: 'reference_audio' };
```

参考素材 URL 可以是：

- `asset://<asset_id>`：素材库状态为 `Active` 时优先使用。
- `https://...`：未启用素材库同步或降级时使用。

成功响应兼容：

```json
{
  "id": "cgt-20260507143012-abcd1"
}
```

或：

```json
{
  "task_id": "cgt-20260507143012-abcd1"
}
```

Curl：

```bash
curl -X POST "$ARTS_API_BASE_URL/contents/generations/tasks" \
  -H "Authorization: Bearer $ARTS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'"$ARTS_VIDEO_MODEL"'",
    "content": [
      {
        "type": "text",
        "text": "生成 5 秒竖屏写实短剧镜头，角色在雨夜街口回头，镜头缓慢推进。"
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
    "resolution": "480p",
    "duration": 5,
    "watermark": false
  }'
```

### 7.2 查询视频生成任务

```http
GET {VOLCENGINE_VIDEO_BASE_URL}/contents/generations/tasks/{taskId}
Authorization: Bearer <ARTS_API_KEY>
Content-Type: application/json
```

处理中：

```json
{
  "id": "cgt-20260507143012-abcd1",
  "model": "seedance-2-0-fast-tezan",
  "status": "processing",
  "updated_at": 1778135602
}
```

完成：

```json
{
  "id": "cgt-20260507143012-abcd1",
  "model": "seedance-2-0-fast-tezan",
  "status": "succeeded",
  "content": {
    "video_url": "https://cdn.example.com/video.mp4"
  },
  "usage": {
    "total_tokens": 100
  },
  "resolution": "480p",
  "ratio": "9:16",
  "duration": 5,
  "generate_audio": true
}
```

失败：

```json
{
  "id": "cgt-20260507143012-abcd1",
  "model": "seedance-2-0-fast-tezan",
  "status": "failed",
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "content.image_url.url is invalid"
  }
}
```

状态映射：

| 火山状态 | 项目语义 |
| --- | --- |
| `succeeded` / `completed` / `success` | completed |
| `failed` / `error` / `cancelled` / `canceled` | failed |
| 其他 | processing |

注意：

- 火山文档说明视频任务查询只支持最近 7 天任务记录。
- 视频 URL 通常有有效期限制，拿到后应及时下载或转存。

Curl：

```bash
curl -X GET "$ARTS_API_BASE_URL/contents/generations/tasks/$TASK_ID" \
  -H "Authorization: Bearer $ARTS_API_KEY" \
  -H "Content-Type: application/json"
```

## 8. 火山素材库 API

素材库用于把参考图上传为私域素材，Seedance 2.0 请求里可用 `asset://<asset_id>` 引用。当前项目主要使用 `Image` 类型。

统一请求：

```http
POST {VOLCENGINE_ASSET_BASE_URL}?Action=<Action>&Version=2024-01-01
Authorization: Bearer <ARTS_API_KEY>
Content-Type: application/json
```

如果是 legacy AK/SK 模式，`Authorization` 改为 HMAC 签名。

统一响应解包规则：

- 优先读取 `Result`
- 兼容读取 `result`
- 兼容读取 `data`
- 如果存在 `ResponseMetadata.Error`，视为供应商错误

### 8.1 创建素材组 `CreateAssetGroup`

```http
POST {VOLCENGINE_ASSET_BASE_URL}?Action=CreateAssetGroup&Version=2024-01-01
```

请求体：

```json
{
  "Name": "project-default-assets",
  "Description": "Assets for project default",
  "GroupType": "AIGC",
  "ProjectName": "default"
}
```

字段说明：

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `Name` | 是 | string | 素材组名称，项目会截断到 128 字符。 |
| `Description` | 否 | string | 描述，项目会截断到 256 字符。 |
| `GroupType` | 否 | string | 项目传 `AIGC`。 |
| `ProjectName` | 否 | string | 默认 `default`。 |

成功响应：

```json
{
  "Result": {
    "Id": "ag_7b8d6b5e9a3c4f1b"
  }
}
```

Curl：

```bash
ARTS_ASSET_BASE_URL="${ARTS_API_BASE_URL%/}"

curl -X POST "$ARTS_ASSET_BASE_URL?Action=CreateAssetGroup&Version=2024-01-01" \
  -H "Authorization: Bearer $ARTS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "Name": "project-default-assets",
    "Description": "Assets for project default",
    "GroupType": "AIGC",
    "ProjectName": "'"${ARTS_ASSET_PROJECT_NAME:-default}"'"
  }'
```

### 8.2 创建素材 `CreateAsset`

```http
POST {VOLCENGINE_ASSET_BASE_URL}?Action=CreateAsset&Version=2024-01-01
```

请求体：

```json
{
  "GroupId": "ag_7b8d6b5e9a3c4f1b",
  "URL": "https://example.com/assets/character-reference.jpg",
  "Name": "character-reference",
  "AssetType": "Image",
  "ProjectName": "default"
}
```

字段说明：

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `GroupId` | 是 | string | 素材组 ID。 |
| `URL` | 是 | string | 必须是公网可访问 `http` / `https` URL，不支持 `data:`。 |
| `Name` | 否 | string | 素材名称。 |
| `AssetType` | 是 | string | `Image` / `Video` / `Audio`；项目当前主要传 `Image`。 |
| `ProjectName` | 否 | string | 默认 `default`。 |

成功响应：

```json
{
  "Result": {
    "Id": "asset-20260424120352-8lkvp",
    "Status": "Processing"
  }
}
```

说明：

- `CreateAsset` 是异步入库，返回 ID 不代表素材已经可用于生成。
- 必须继续调用 `GetAsset`，直到 `Status === "Active"`。

Curl：

```bash
curl -X POST "$ARTS_ASSET_BASE_URL?Action=CreateAsset&Version=2024-01-01" \
  -H "Authorization: Bearer $ARTS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "GroupId": "'"$ARTS_ASSET_GROUP_ID"'",
    "URL": "https://example.com/assets/character-reference.jpg",
    "Name": "character-reference",
    "AssetType": "Image",
    "ProjectName": "'"${ARTS_ASSET_PROJECT_NAME:-default}"'"
  }'
```

### 8.3 查询素材 `GetAsset`

```http
POST {VOLCENGINE_ASSET_BASE_URL}?Action=GetAsset&Version=2024-01-01
```

请求体：

```json
{
  "Id": "asset-20260424120352-8lkvp",
  "ProjectName": "default"
}
```

成功响应：

```json
{
  "Result": {
    "Id": "asset-20260424120352-8lkvp",
    "Name": "character-reference",
    "URL": "https://cdn.example.com/private-assets/asset.jpg",
    "AssetType": "Image",
    "GroupId": "ag_7b8d6b5e9a3c4f1b",
    "Status": "Active",
    "ProjectName": "default"
  }
}
```

失败状态响应：

```json
{
  "Result": {
    "Id": "asset-20260424120352-8lkvp",
    "AssetType": "Image",
    "GroupId": "ag_7b8d6b5e9a3c4f1b",
    "Status": "Failed",
    "ProjectName": "default",
    "Error": {
      "Code": "InvalidImageSize",
      "Message": "The image width or height is out of allowed range."
    }
  }
}
```

状态说明：

| 状态 | 是否可用于 `asset://` | 处理 |
| --- | --- | --- |
| `Active` | 是 | 使用 `asset://<Id>`。 |
| `Processing` | 否 | 稍后继续轮询。 |
| `Failed` / `Error` | 否 | 记录错误，任务失败或重试上传。 |

Curl：

```bash
curl -X POST "$ARTS_ASSET_BASE_URL?Action=GetAsset&Version=2024-01-01" \
  -H "Authorization: Bearer $ARTS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "Id": "'"$ARTS_ASSET_ID"'",
    "ProjectName": "'"${ARTS_ASSET_PROJECT_NAME:-default}"'"
  }'
```

### 8.4 查询素材列表 `ListAssets`

```http
POST {VOLCENGINE_ASSET_BASE_URL}?Action=ListAssets&Version=2024-01-01
```

请求体：

```json
{
  "Filter": {
    "GroupId": "ag_7b8d6b5e9a3c4f1b"
  },
  "PageNumber": 1,
  "PageSize": 20,
  "SortBy": "CreateTime",
  "SortOrder": "Desc",
  "ProjectName": "default"
}
```

响应：

```json
{
  "Result": {
    "Items": [
      {
        "Id": "asset-20260424120352-8lkvp",
        "Name": "character-reference",
        "AssetType": "Image",
        "GroupId": "ag_7b8d6b5e9a3c4f1b",
        "Status": "Active",
        "ProjectName": "default"
      }
    ],
    "TotalCount": 1,
    "PageNumber": 1,
    "PageSize": 20
  }
}
```

## 9. 素材到 Seedance 2.0 的完整直连流程

```text
CreateAssetGroup
  -> CreateAsset
  -> GetAsset 轮询到 Active
  -> POST /contents/generations/tasks，content[].image_url.url 使用 asset://<asset_id>
  -> GET /contents/generations/tasks/{taskId} 轮询到 succeeded
  -> 读取 content.video_url
```

关键规则：

- `CreateAsset` 的 `URL` 必须是公网 URL。
- 只有 `GetAsset` 返回 `Active` 才能使用 `asset://<asset_id>`。
- 如果素材还在 `Processing`，不要提交 Seedance 2.0 任务，继续等待。
- 如果素材 `Failed`，不要把它作为 `asset://` 传入。
- 如果项目未启用私域素材库同步，可以直接给 Seedance 2.0 传公网 URL。

## 10. 常见错误与排查

| 场景 | 可能原因 | 排查 |
| --- | --- | --- |
| 语言模型返回非 JSON | Prompt 未约束、模型不支持 `response_format`、输出被截断 | 检查 `response_format`、`finish_reason`、`max_tokens`。 |
| 图像任务没有 `id` / `task_id` | 供应商不是当前异步图像协议 | 确认是否支持 `POST /images/generations` 后返回任务 ID。 |
| 图像轮询超时 | 供应商任务长时间未完成 | 查供应商后台任务状态，或调大项目等待时间。 |
| 通用视频 404 | 供应商不支持 `/video/generations` | 该接口是 legacy 兼容协议，不是 OpenAI 官方当前 `/videos`。 |
| Seedance 2.0 `content.image_url.url is invalid` | 传入了未 Active 的 `asset://`，或 URL 不可访问 | 先 `GetAsset` 确认 `Active`，公网 URL 用浏览器/curl 验证可访问。 |
| 素材库 `CreateAsset` 失败 | URL 非公网、尺寸/格式不合规、ProjectName/GroupId 不匹配 | 检查 `URL`、`AssetType`、`ProjectName`、`GroupId`。 |
| 素材一直 `Processing` | 素材入库排队或审核耗时 | 继续轮询；必要时用 `retry-processing` 逻辑重建素材。 |

## 11. 最小联调命令顺序

```bash
# 1. LLM
curl -X POST "$AI_LLM_API_BASE_URL/chat/completions" \
  -H "Authorization: Bearer $AI_LLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"'"$AI_LLM_API_MODEL"'","messages":[{"role":"user","content":"hello"}]}'

# 2. Image
curl -X POST "$AI_IMAGE_API_BASE_URL/images/generations" \
  -H "Authorization: Bearer $AI_IMAGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-3-pro-image-preview","prompt":"test image","size":"1:1","n":1}'

# 3. Legacy video
curl -X POST "$AI_API_BASE_URL/video/generations" \
  -H "Authorization: Bearer $AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"'"$AI_API_VIDEO_MODEL"'","prompt":"test video","duration":5}'

# 4. Volcengine asset
curl -X POST "$ARTS_ASSET_BASE_URL?Action=GetAsset&Version=2024-01-01" \
  -H "Authorization: Bearer $ARTS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"Id":"'"$ARTS_ASSET_ID"'","ProjectName":"'"${ARTS_ASSET_PROJECT_NAME:-default}"'"}'

# 5. Seedance 2.0
curl -X POST "$ARTS_API_BASE_URL/contents/generations/tasks" \
  -H "Authorization: Bearer $ARTS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"'"$ARTS_VIDEO_MODEL"'","content":[{"type":"text","text":"test video"}],"ratio":"9:16","resolution":"480p","duration":5,"generate_audio":true,"watermark":false}'
```
