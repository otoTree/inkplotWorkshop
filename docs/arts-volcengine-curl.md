# ARTS 火山素材库与 Seedance 2.0 Curl 文档

## 说明

这份文档按**当前项目实际接入方式**整理，不是单纯照搬火山官方 OpenAPI 文档。

当前项目里：

- 火山素材库通过 `ARTS_API_BASE_URL` + `ARTS_API_KEY` 走 Bearer 鉴权
- 素材库请求路径是 `.../api/v3?Action=<Action>&Version=2024-01-01`
- 如果 `ARTS_API_BASE_URL` 配的是 `.../api`，素材库请求会自动补全为 `.../api/v3`
- `Seedance 2.0` 视频生成走 `.../contents/generations/tasks`
- 视频模型默认取 `ARTS_VIDEO_MODEL`
- 素材上传成功后，要继续轮询到 `Status=Active`，再在视频请求里写 `asset://<asset_id>`

## 相关环境变量

```bash
export ARTS_API_BASE_URL="https://apis.artsapi.com/api/v3"
export ARTS_API_KEY="replace-with-your-arts-bearer-key"
export ARTS_ASSET_PROJECT_NAME="your-project-name"
export ARTS_VIDEO_MODEL="dreamina-seedance-2-0-260128"
```

## 统一约定

素材库接口根地址：

```bash
export ARTS_ASSET_BASE_URL="${ARTS_API_BASE_URL%/}"
```

视频接口根地址：

```bash
export ARTS_VIDEO_BASE_URL="${ARTS_API_BASE_URL%/}"
```

通用请求头：

```bash
-H "Authorization: Bearer $ARTS_API_KEY"
-H "Content-Type: application/json"
```

## 1. 创建素材组

接口：

```text
POST ${ARTS_ASSET_BASE_URL}?Action=CreateAssetGroup&Version=2024-01-01
```

### Curl

```bash
curl -X POST "${ARTS_ASSET_BASE_URL}?Action=CreateAssetGroup&Version=2024-01-01" \
  -H "Authorization: Bearer $ARTS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "Name": "canvas-demo-subjects",
    "Description": "Canvas demo subject assets",
    "GroupType": "AIGC",
    "ProjectName": "'"$ARTS_ASSET_PROJECT_NAME"'"
  }'
```

### 成功响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "20260507143012010209123000000001",
    "Action": "CreateAssetGroup",
    "Version": "2024-01-01",
    "Service": "ark",
    "Region": "cn-beijing"
  },
  "Result": {
    "Id": "ag_7b8d6b5e9a3c4f1b"
  }
}
```

## 2. 上传素材

接口：

```text
POST ${ARTS_ASSET_BASE_URL}?Action=CreateAsset&Version=2024-01-01
```

说明：

- `URL` 必须是公网可访问地址
- `AssetType` 可选 `Image` / `Video` / `Audio`
- 这里返回的是受理成功，不代表已经能用于生成

### Curl

```bash
export ARTS_ASSET_GROUP_ID="ag_7b8d6b5e9a3c4f1b"

curl -X POST "${ARTS_ASSET_BASE_URL}?Action=CreateAsset&Version=2024-01-01" \
  -H "Authorization: Bearer $ARTS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "GroupId": "'"$ARTS_ASSET_GROUP_ID"'",
    "URL": "https://example.com/assets/model-reference.jpg",
    "Name": "model-reference",
    "AssetType": "Image",
    "ProjectName": "'"$ARTS_ASSET_PROJECT_NAME"'"
  }'
```

### 成功响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "20260507143105010209123000000002",
    "Action": "CreateAsset",
    "Version": "2024-01-01",
    "Service": "ark",
    "Region": "cn-beijing"
  },
  "Result": {
    "Id": "asset_4c3e9fa2b6d1455d"
  }
}
```

## 3. 查询素材状态

接口：

```text
POST ${ARTS_ASSET_BASE_URL}?Action=GetAsset&Version=2024-01-01
```

说明：

- `Status=Processing` 继续轮询
- `Status=Active` 才能用于视频生成
- `Status=Failed` 读 `Error.Code` 和 `Error.Message`

### Curl

```bash
export ARTS_ASSET_ID="asset_4c3e9fa2b6d1455d"

curl -X POST "${ARTS_ASSET_BASE_URL}?Action=GetAsset&Version=2024-01-01" \
  -H "Authorization: Bearer $ARTS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "Id": "'"$ARTS_ASSET_ID"'",
    "ProjectName": "'"$ARTS_ASSET_PROJECT_NAME"'"
  }'
```

### 处理中响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "20260507143136010209123000000003",
    "Action": "GetAsset",
    "Version": "2024-01-01",
    "Service": "ark",
    "Region": "cn-beijing"
  },
  "Result": {
    "Id": "asset_4c3e9fa2b6d1455d",
    "Name": "model-reference",
    "URL": "https://cdn.example.com/private-assets/asset_4c3e9fa2b6d1455d.jpg?expires=1746600000",
    "AssetType": "Image",
    "GroupId": "ag_7b8d6b5e9a3c4f1b",
    "Status": "Processing",
    "ProjectName": "your-project-name",
    "CreateTime": "2026-05-07T14:31:05+08:00",
    "UpdateTime": "2026-05-07T14:31:35+08:00"
  }
}
```

### 可用响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "20260507143208010209123000000004",
    "Action": "GetAsset",
    "Version": "2024-01-01",
    "Service": "ark",
    "Region": "cn-beijing"
  },
  "Result": {
    "Id": "asset_4c3e9fa2b6d1455d",
    "Name": "model-reference",
    "URL": "https://cdn.example.com/private-assets/asset_4c3e9fa2b6d1455d.jpg?expires=1746603600",
    "AssetType": "Image",
    "GroupId": "ag_7b8d6b5e9a3c4f1b",
    "Status": "Active",
    "ProjectName": "your-project-name",
    "CreateTime": "2026-05-07T14:31:05+08:00",
    "UpdateTime": "2026-05-07T14:32:07+08:00"
  }
}
```

### 失败响应示例

```json
{
  "ResponseMetadata": {
    "RequestId": "20260507143235010209123000000005",
    "Action": "GetAsset",
    "Version": "2024-01-01",
    "Service": "ark",
    "Region": "cn-beijing"
  },
  "Result": {
    "Id": "asset_4c3e9fa2b6d1455d",
    "Name": "model-reference",
    "AssetType": "Image",
    "GroupId": "ag_7b8d6b5e9a3c4f1b",
    "Status": "Failed",
    "ProjectName": "your-project-name",
    "Error": {
      "Code": "InvalidImageSize",
      "Message": "The image width or height is out of allowed range."
    },
    "CreateTime": "2026-05-07T14:31:05+08:00",
    "UpdateTime": "2026-05-07T14:32:35+08:00"
  }
}
```

## 4. Seedance 2.0 提交视频任务

接口：

```text
POST ${ARTS_VIDEO_BASE_URL}/contents/generations/tasks
```

说明：

- `model` 用当前项目默认值 `ARTS_VIDEO_MODEL`；国际版默认 `dreamina-seedance-2-0-260128`，国内版可用 `doubao-seedance-2-0-260128`
- 项目实际发送字段为：
  - `model`
  - `content`
  - 可选 `generate_audio`
  - 可选 `ratio`
  - 可选 `duration`
  - 可选 `watermark`
- `content` 至少要有一个 `type=text`
- 图像、视频、音频引用支持：
  - `https://...`
  - `data:...`
  - `asset://<asset_id>`

### Curl

```bash
curl -X POST "${ARTS_VIDEO_BASE_URL}/contents/generations/tasks" \
  -H "Authorization: Bearer $ARTS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'"$ARTS_VIDEO_MODEL"'",
    "content": [
      {
        "type": "text",
        "text": "生成一个 5 秒的女装展示视频，镜头自然推进，画面高级，适合电商短视频。"
      },
      {
        "type": "image_url",
        "image_url": {
          "url": "asset://asset_4c3e9fa2b6d1455d"
        },
        "role": "reference_image"
      }
    ],
    "generate_audio": true,
    "ratio": "16:9",
    "duration": 5,
    "watermark": false
  }'
```

### 提交成功响应示例

```json
{
  "id": "cgt_2b1b0f2f8fd44b73a0a6b64f3a6a7f11"
}
```

## 5. 查询视频任务状态

接口：

```text
GET ${ARTS_VIDEO_BASE_URL}/contents/generations/tasks/{task_id}
```

### Curl

```bash
export ARTS_VIDEO_TASK_ID="cgt_2b1b0f2f8fd44b73a0a6b64f3a6a7f11"

curl -X GET "${ARTS_VIDEO_BASE_URL}/contents/generations/tasks/${ARTS_VIDEO_TASK_ID}" \
  -H "Authorization: Bearer $ARTS_API_KEY"
```

### 处理中响应示例

```json
{
  "id": "cgt_2b1b0f2f8fd44b73a0a6b64f3a6a7f11",
  "model": "dreamina-seedance-2-0-260128",
  "status": "processing",
  "updated_at": 1778135602
}
```

### 成功响应示例

```json
{
  "id": "cgt_2b1b0f2f8fd44b73a0a6b64f3a6a7f11",
  "model": "dreamina-seedance-2-0-260128",
  "status": "succeeded",
  "content": {
    "video_url": "https://cdn.example.com/video/cgt_2b1b0f2f8fd44b73a0a6b64f3a6a7f11.mp4"
  },
  "usage": {
    "total_tokens": 100
  },
  "created_at": 1778135596,
  "updated_at": 1778135602,
  "seed": 42,
  "resolution": "720p",
  "ratio": "16:9",
  "duration": 5,
  "framespersecond": 24,
  "service_tier": "default",
  "execution_expires_after": 172800,
  "generate_audio": true,
  "draft": false
}
```

### 失败响应示例

```json
{
  "id": "cgt_2b1b0f2f8fd44b73a0a6b64f3a6a7f11",
  "model": "dreamina-seedance-2-0-260128",
  "status": "failed",
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "content.image_url.url is invalid"
  },
  "updated_at": 1778135602
}
```

## 6. 一条龙联调顺序

```text
CreateAssetGroup
  -> CreateAsset
  -> GetAsset 轮询到 Active
  -> POST /contents/generations/tasks
  -> GET /contents/generations/tasks/{task_id} 轮询到 succeeded
```

## 7. 关键注意事项

- 素材库和视频都复用 `ARTS_API_KEY`
- 素材库请求路径保留在 `.../api/v3`
- 视频请求路径保留在 `.../api/v3/contents/generations/tasks`
- 当前项目素材库使用 `ProjectName`
- 用于生成的视频引用建议写 `asset://<asset_id>`
- 只有 `GetAsset` 返回 `Status=Active` 时再投喂到视频生成
- `content` 里必须至少有一条文本项
- 当前项目支持把 `size` 映射成 `ratio`，但直连 curl 建议直接传 `ratio`
