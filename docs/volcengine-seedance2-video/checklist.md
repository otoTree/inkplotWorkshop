# 火山素材库同步与 Seedance 2.0 验收 Checklist

## 1. 配置

- [ ] 已配置 `VOLCENGINE_ARK_VIDEO_API_KEY`。
- [ ] 已配置 `VOLCENGINE_ARK_VIDEO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3` 或使用默认值。
- [ ] 已配置 Seedance 2.0 模型名。
- [ ] 如启用素材同步，已配置 `VOLCENGINE_ACCESS_KEY_ID`。
- [ ] 如启用素材同步，已配置 `VOLCENGINE_SECRET_ACCESS_KEY`。
- [ ] 如启用素材同步，已确认火山控制台完成素材库授权。
- [ ] 如启用素材同步，项目名与视频生成 API Key 所属项目一致。
- [ ] 如启用素材同步，存在可用 Asset Group，或系统可自动创建。

## 2. 数据库

- [ ] `assets` 表存在 `volcengine_asset_id`。
- [ ] `assets` 表存在 `volcengine_asset_status`。
- [ ] `assets` 表存在 `volcengine_asset_group_id`。
- [ ] `assets` 表存在 `volcengine_asset_project_name`。
- [ ] `assets` 表存在 `volcengine_asset_type`。
- [ ] `assets` 表存在 `volcengine_asset_error`。
- [ ] `assets` 表存在 `volcengine_asset_synced_at`。
- [ ] `projects` 表存在 `volcengine_video_settings`。
- [ ] `shots` 表存在 `video_generation_metadata`。
- [ ] 旧项目默认 `syncAssetsToPrivateLibrary` 为关闭效果。

## 3. 用户开关

- [ ] 用户可以选择“不同步素材库”。
- [ ] 用户可以选择“同步并优先使用素材库”。
- [ ] 用户可以选择 Seedance 2.0 作为分镜视频生成模型。
- [ ] 未配置 AK/SK 时，开启同步会显示明确配置错误。
- [ ] 关闭同步时，不会调用火山素材库 OpenAPI。

## 4. 素材同步

- [ ] `CreateAsset` 请求使用 `https://ark.cn-beijing.volcengineapi.com/?Action=CreateAsset&Version=2024-01-01`。
- [ ] `CreateAsset` 使用 AK/SK 签名，不使用 Bearer Token。
- [ ] `CreateAsset` 请求体包含 `GroupId`、`URL`、`AssetType`、`ProjectName`。
- [ ] `CreateAsset` 成功后保存 `Result.Id`。
- [ ] `GetAsset` 能刷新 `Active` / `Processing` / `Failed` 状态。
- [ ] 只有 `Status = Active` 的素材会被转成 `asset://<asset_id>`。
- [ ] `Processing` 素材不会被当作可用参考素材。
- [ ] `Failed` 素材会记录 `Error.Code` 和 `Error.Message`。
- [ ] 相同素材重复生成时复用已有火山 Asset ID。

## 5. Seedance 2.0 请求体

- [ ] 提交接口为 `POST /contents/generations/tasks`。
- [ ] 查询接口为 `GET /contents/generations/tasks/{taskId}`。
- [ ] 视频生成接口使用 `Authorization: Bearer $VOLCENGINE_ARK_VIDEO_API_KEY`。
- [ ] 请求体包含 `model`。
- [ ] 请求体包含 `content[]`。
- [ ] `content[0]` 是 `{ "type": "text", "text": "..." }`。
- [ ] 参考图使用 `{ "type": "image_url", "image_url": { "url": "..." }, "role": "reference_image" }`。
- [ ] 开启同步且素材 Active 时，`image_url.url` 为 `asset://asset-...`。
- [ ] 未开启同步时，`image_url.url` 为原始公网 URL。
- [ ] 提示词文本中不直接写 Asset ID。
- [ ] 提示词文本使用“图片1 / 视频1 / 音频1”这类相对引用。
- [ ] 请求体可携带 `generate_audio`。
- [ ] 请求体可携带 `ratio`。
- [ ] 请求体可携带 `duration`。
- [ ] 请求体可携带 `watermark`。

## 6. 视频队列

- [ ] 点击生成视频后，镜头进入 `queued`。
- [ ] cron 能消费 `queued` 镜头。
- [ ] Seedance 2.0 镜头生成前会解析项目视频设置。
- [ ] Seedance 2.0 镜头生成前会收集 `reference_image`。
- [ ] Seedance 2.0 镜头生成前会收集 `related_asset_ids`。
- [ ] 上游返回任务 ID 后写入 `shots.video_generation_id`。
- [ ] 上游任务处理中，本地状态为 `processing`。
- [ ] 上游任务成功后，本地状态为 `completed`。
- [ ] 上游任务失败后，本地状态为 `failed`。
- [ ] 视频并发槽位在提交失败时会释放。
- [ ] 视频并发槽位在任务完成后会释放。

## 7. 状态查询

- [ ] 火山任务查询成功解析 `id`。
- [ ] 火山任务查询成功解析 `status`。
- [ ] `succeeded` 映射为本地 `completed`。
- [ ] `failed` / `error` / `cancelled` 映射为本地 `failed`。
- [ ] 处理中状态映射为本地 `processing`。
- [ ] 成功时优先读取 `content.video_url`。
- [ ] 成功时把 `content.video_url` 写入 `shots.video_url`。
- [ ] 成功时把 `usage` 写入 `video_generation_metadata.usage`。
- [ ] 状态查询失败时不会误标记为 `completed`。

## 8. 回归

- [ ] 旧视频模型仍可生成视频。
- [ ] 旧视频模型仍使用现有 URL / metadata 链路。
- [ ] 旧 `video-status` API 仍能查询非火山任务。
- [ ] 没有素材的镜头仍可纯文本生成。
- [ ] 有多个参考素材时顺序稳定。
- [ ] `asset://` URI 不会被 `encodeURI` 破坏。
- [ ] 原始 URL 中的中文或空格仍会被正确编码。

## 9. 手动验收脚本

### 9.1 查询火山视频任务

```bash
TASK_ID="cgt-example-task-id"
curl -X GET "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/$TASK_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY"
```

验收点：

- [ ] 返回 `status`。
- [ ] 成功时返回 `content.video_url`。
- [ ] 本地镜头最终展示该视频。

### 9.2 检查请求体中的参考素材

开启同步后，生成请求体应包含：

```json
{
  "type": "image_url",
  "image_url": {
    "url": "asset://asset-20260424120352-8lkvp"
  },
  "role": "reference_image"
}
```

验收点：

- [ ] `url` 使用 `asset://`。
- [ ] `asset://` 后面的 ID 与 `CreateAsset` 返回的 `Result.Id` 一致。
- [ ] 提示词正文没有直接出现 `asset-202604...`。

## 10. 发布前

- [ ] `npm run lint` 通过。
- [ ] Supabase migration 已在测试环境执行。
- [ ] 环境变量文档已更新。
- [ ] 至少一个“关闭同步”的旧链路用例通过。
- [ ] 至少一个“开启同步 + Active 素材 + Seedance 2.0”的用例通过。
- [ ] 至少一个“素材 Processing 后继续轮询”的用例通过。
- [ ] 至少一个“火山任务 succeeded 后回写视频 URL”的用例通过。
