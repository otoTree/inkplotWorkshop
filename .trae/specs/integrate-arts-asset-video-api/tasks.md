# Tasks
- [x] Task 1: 统一 ARTS 运行时接入协议
  - [x] 盘点当前 `VOLCENGINE_*`、素材库签名逻辑、Seedance 请求逻辑与文档口径的差异
  - [x] 设计 `ARTS_API_BASE_URL`、`ARTS_API_KEY`、`ARTS_VIDEO_MODEL` 的运行时读取与旧变量兼容策略
  - [x] 收敛素材库与视频接口的基础 URL 规则，明确 `.../api` 与 `.../contents/generations/tasks` 的构造方式

- [x] Task 2: 打通项目资产到 ARTS 素材库的完整生命周期
  - [x] 明确项目级素材组创建、绑定和持久化策略
  - [x] 补齐素材上传成功后的状态轮询、失败处理和 `Active` 可用态缓存
  - [x] 统一相同资产的复用规则，避免重复上传和跨项目误复用

- [x] Task 3: 重构 Seedance 2.0 分镜视频提交流程
  - [x] 将 Seedance 2.0 请求改为严格依赖 ARTS 资产协议
  - [x] 对已激活资产统一输出 `asset://<asset_id>` 引用
  - [x] 对未激活资产引入等待、重试或延迟提交机制，不再回退为普通公网 URL
  - [x] 保留 `content` 至少包含文本项、并兼容参考图等多模态内容

- [x] Task 4: 保持 legacy 视频链路兼容可用
  - [x] 明确项目级模型选择与默认值策略
  - [x] 确保 `legacy` 继续走旧视频生成链路
  - [x] 处理旧项目缺省配置与旧任务元数据的兼容映射

- [x] Task 5: 统一视频任务状态、轮询与前端展示
  - [x] 收敛前台 `progress-video`、状态查询接口、后台 cron 的状态映射逻辑
  - [x] 保存结构化任务元数据、失败原因和引用资产信息
  - [x] 校验分镜卡片、批量生成、后台续跑对 Seedance 2.0 与 legacy 的展示一致性

- [x] Task 6: 完成联调与回归验证
  - [x] 按“创建素材组 -> 上传素材 -> 轮询到 Active -> 提交视频任务 -> 轮询到完成”验证 Seedance 2.0 全链路
  - [x] 验证 `seedance-2.0` 与 `legacy` 两种项目配置都能正常生成分镜视频
  - [x] 验证旧环境变量、旧项目数据、旧任务状态字段的兼容行为
  - [x] 运行最小必要的类型检查、诊断或针对性测试

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 1]
- [Task 5] depends on [Task 3]
- [Task 5] depends on [Task 4]
- [Task 6] depends on [Task 2]
- [Task 6] depends on [Task 5]
