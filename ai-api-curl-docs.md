# Inkplot Workshop 外部 AI API (Cloubic) Curl 调用文档

本文档列出了 Inkplot Workshop 底层调用的外部 AI API (`https://api.cloubic.com/v1`) 的 `curl` 请求示例及响应格式说明。
这些接口兼容大部分 OpenAI 标准协议，并扩展了视频生成等能力。

**前置条件：**
请将下面示例中的 `$AI_API_KEY` 替换为您实际的 API 密钥。

---

## 1. 文本/对话生成 (Chat Completions)
用于生成剧本、分镜、提取资产提示词等所有文本类任务。支持传入图片（用于图生文/多模态理解）。

**Endpoint:** `POST https://api.cloubic.com/v1/chat/completions`

### 请求示例 (纯文本)
```bash
curl -X POST https://api.cloubic.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AI_API_KEY" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {
        "role": "system",
        "content": "你是一个专业的编剧。"
      },
      {
        "role": "user",
        "content": "请写一个关于赛博朋克的短故事大纲。"
      }
    ],
    "temperature": 0.7,
    "response_format": { "type": "json_object" }
  }'
```

### 响应格式
```json
{
  "id": "chatcmpl-123456",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "{\"title\": \"霓虹之下\", \"summary\": \"...\"}"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 56,
    "completion_tokens": 31,
    "total_tokens": 87
  }
}
```

---

## 2. 图像生成 (通过 Chat Completions 模拟)
本项目中的图像生成同样复用了 `chat/completions` 接口（通常通过特定的图像模型如 `gemini-3-pro-image-preview`），返回的内容中会包含 Base64 格式的图片数据 URI 或 Markdown 图片链接。

**Endpoint:** `POST https://api.cloubic.com/v1/chat/completions`

### 请求示例
```bash
curl -X POST https://api.cloubic.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AI_API_KEY" \
  -d '{
    "model": "gemini-3-pro-image-preview",
    "messages": [
      {
        "role": "user",
        "content": "一个穿着赛博朋克风格机甲的女孩，站在霓虹闪烁的街头。, aspect ratio 16:9"
      }
    ],
    "n": 1
  }'
```
*(注：如果需要参考图，可将 `content` 改为包含 `type: "image_url"` 和 `type: "text"` 的数组结构)*

### 响应格式
返回的内容通常包含 Markdown 格式的 Base64 字符串：
```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "![image](data:image/jpeg;base64,/9j/4AAQSkZJRgABAQE...)"
      }
    }
  ]
}
```

---

## 3. 视频生成 (Video Generations)
用于将文本提示词（和参考图）转化为短视频。

**Endpoint:** `POST https://api.cloubic.com/v1/video/generations`

### 请求示例
```bash
curl -X POST https://api.cloubic.com/v1/video/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AI_API_KEY" \
  -d '{
    "model": "kling-video-model",
    "prompt": "镜头缓缓推进，男主在雨中回头，眼神中带着一丝忧伤。4k, 电影级光影。",
    "duration": 5,
    "image_url": "https://example.com/reference-image.jpg",
    "metadata": {
      "images": ["https://example.com/reference-image.jpg"]
    }
  }'
```

### 响应格式
此接口通常是异步的，返回任务 ID：
```json
{
  "id": "task_abc123def456",
  "status": "pending"
}
```
*(注：部分模型可能返回 `task_id` 或 `data.task_id`)*

---

## 4. 查询视频状态
查询指定视频生成任务的进度或结果。

**Endpoint:** `GET https://api.cloubic.com/v1/video/generations/{videoId}`

### 请求示例
```bash
curl -X GET https://api.cloubic.com/v1/video/generations/task_abc123def456 \
  -H "Authorization: Bearer $AI_API_KEY"
```

### 响应格式
```json
{
  "id": "task_abc123def456",
  "status": "completed",
  "video_url": "https://cdn.cloubic.com/videos/task_abc123def456.mp4",
  "progress": 100
}
```
*(注：`status` 通常有 `pending`, `processing`, `completed`, `failed` 等状态)*

---

## 5. 视频下载直链重定向
获取视频内容的重定向链接。

**Endpoint:** `GET https://api.cloubic.com/v1/videos/{videoId}/content`

### 请求示例
```bash
# 注意：此接口通常返回 302/307 重定向，使用 -L 参数可让 curl 自动跟随重定向下载视频
curl -L -X GET "https://api.cloubic.com/v1/videos/task_abc123def456/content?variant=mp4" \
  -H "Authorization: Bearer $AI_API_KEY" \
  -o output.mp4
```

### 响应格式
无 JSON 主体，返回 `302 Found` 或 `307 Temporary Redirect` 状态码，`Location` 请求头中包含实际的视频 CDN 下载地址。
