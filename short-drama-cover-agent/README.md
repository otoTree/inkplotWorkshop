# 短剧封面生成 Agent

自动从飞书多维表格读取短剧信息，生成封面设计方案并调用 AI 生图模型生成封面图片。

## 功能特性

- 📊 自动读取飞书多维表格中的短剧信息
- 🤖 使用 AI 识别题材并生成封面文案（Title、Slogan）
- 🎨 生成专业的图片 Prompt（总封面 16:9 + 分集封面 3:4）
- 🖼️ 调用 Replicate Flux 模型生成高质量封面图片
- ✅ 自动回填所有结果到飞书表格

## 环境要求

- Python 3.8+
- 飞书应用权限（读写多维表格）
- AI API 访问权限
- Replicate API Token

## 快速开始

### 1. 安装依赖

```bash
cd short-drama-cover-agent
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填写你的密钥：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填写以下信息：

- `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`：已预填
- `FEISHU_APP_TOKEN`：从飞书多维表格 URL 中获取（格式如：https://xxx.feishu.cn/base/APP_TOKEN?table=TABLE_ID）
- `FEISHU_TABLE_ID`：具体表格的 ID
- `AI_API_KEY`：AI 服务的 API 密钥
- `REPLICATE_API_TOKEN`：Replicate 平台的 API Token

### 3. 运行程序

```bash
python main.py
```

程序会自动：
1. 扫描飞书表格中"触发生成"字段为"待生成"的行
2. 逐行处理，生成封面设计方案
3. 调用 Flux 模型生成图片
4. 将所有结果回填到表格

## 飞书表格字段说明

| 字段名 | 类型 | 说明 |
|--------|------|------|
| 剧名 | 文本 | 短剧名称 |
| 故事介绍 | 长文本 | 剧情简介 |
| 主角名称 | 文本 | 主角姓名 |
| 主角形象图 | 附件 | 可选，主角参考图 |
| 触发生成 | 单选 | 待生成/生成中/已完成/失败 |
| 识别题材 | 文本 | AI 自动识别 |
| 封面标题 Title | 文本 | AI 生成 |
| 副标题 Slogan | 文本 | AI 生成 |
| 图片 Prompt | 长文本 | 16:9 总封面 Prompt |
| 分集封面 Prompt | 长文本 | 3:4 分集 Prompt |
| 生成图片 URL | 文本 | Flux 生成的图片链接 |
| 处理状态 | 单选 | 待生成/生成中/已完成/失败 |

## 注意事项

- 确保飞书应用已获得多维表格的读写权限
- Replicate API 调用可能需要几秒到几十秒，请耐心等待
- 建议先用少量数据测试，确认无误后再批量处理

## 故障排查

- 如果提示权限错误，检查飞书应用权限配置
- 如果 AI 生成失败，检查 API 密钥和余额
- 如果图片生成失败，检查 Replicate Token 和网络连接

## 许可证

MIT
