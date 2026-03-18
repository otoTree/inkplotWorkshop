# 内流控制系统 (Engagement Control System) - 文档中心

**版本：v2.0 | 最后更新：2026-03-01**

---

## 📚 文档导航

### 1. [产品需求文档 (PRD)](./PRD.md)
**适合阅读对象:** 产品经理、项目负责人、开发团队

**内容概要:**
- 系统背景与核心目标
- 功能需求详述
- 用户交互流程
- 成功指标与里程碑

**关键亮点:**
- 动态利益矩阵 - 角色身份/秘密/动机/筹码管理
- 冲突拓扑图 - 预先规划角色冲突节点
- 事件状态缓冲器 - 跨集事件状态追踪
- 内流控制层 - 爽点/压抑/钩子系统级调度
- 电影滤镜 - 自动适配视觉风格
- 过渡镜头 - 自动生成转场镜头

---

### 2. [技术规格文档 (TECH_SPEC)](./TECH_SPEC.md) + [第二部分](./TECH_SPEC_PART2.md)
**适合阅读对象:** 开发工程师、架构师

**内容概要:**
- 技术架构设计
- 数据模型与类型定义
- API 端点设计
- 前端组件设计
- AI Prompt 工程
- 实施计划与风险评估

**技术栈:**
- Next.js 16 + React 19
- Zustand (状态管理)
- Dexie (本地存储)
- Supabase (云端存储)
- Vercel AI SDK
- ReactFlow (冲突图可视化)
- Recharts (数据图表)

---

### 3. [实施指南 (IMPLEMENTATION_GUIDE)](./IMPLEMENTATION_GUIDE.md)
**适合阅读对象:** 开发工程师

**内容概要:**
- 快速开始指南
- 数据库迁移步骤
- 核心模块实现
- API 端点创建
- 测试与部署
- 故障排查

**快速开始:**
```bash
# 1. 安装依赖
bun add dagre react-flow-renderer recharts

# 2. 数据库迁移
bunx supabase migration new add_engagement_control_fields
bunx supabase db push

# 3. 运行开发服务器
bun dev
```

---

## 🎯 核心概念速览

### 动态利益矩阵 (Interest Matrix)
为每个角色建立结构化的利益关系:
- **Identity** (身份) - 社会身份或隐藏身份
- **Secret** (秘密) - 不为人知的秘密
- **Motivation** (核心欲望) - 角色驱动力
- **Asset** (筹码) - 拥有的资源/能力

### 冲突拓扑图 (Conflict Graph)
预先规划角色间的冲突节点:
- 明确 A 与 B 在第几集必须产生冲突
- 冲突类型: 利益/秘密/复仇/误会
- 状态追踪: pending → triggered → resolved

### 事件状态缓冲器 (Event State Buffer)
跨集事件状态追踪:
- **Inherited** - 从上集继承的事件
- **Introduced** - 本集新引入的事件
- **Resolved** - 本集解决的事件
- 状态: pending → active → resolved

### 内流控制层 (Engagement Control Layer)
系统级情绪节奏控制:
- **Payoff Ledger** - 爽点账本 (S/A/B/C 级)
- **Suppression Index** - 压抑指数 (0-1)
- **Hook Contract** - 钩子契约 (强/中/弱钩)
- **Release Scheduler** - 释放调度器

### 电影滤镜 (Cinematic Filter)
自动适配视觉风格:
- 逆袭爽剧 → 都市冷峻 (高对比度冷色调)
- 甜宠爽剧 → 柔光暖调 (柔焦暖色调)
- 悬疑短剧 → 黑色电影 (低饱和度强阴影)
- 古装仙侠 → 水墨写意 (低饱和度雾气感)

---

## 📊 数据流图

```
用户输入
   ↓
故事设计 (生成角色利益矩阵 + 冲突拓扑图)
   ↓
资产设计 (适配电影滤镜 + 资产预算约束)
   ↓
剧本设计 (事件状态缓冲 + 内流控制调度)
   ↓
分镜设计 (导演思维提示词 + 过渡镜头)
   ↓
导出
```

---

## 🚀 实施路线图

### Phase 1: 数据结构与基础设施 (Week 1)
- [ ] 扩展 TypeScript 类型定义
- [ ] 更新 Supabase Schema
- [ ] 更新 Dexie 数据库定义
- [ ] 安装新依赖

### Phase 2: 故事设计层 (Week 2-3)
- [ ] 实现角色利益矩阵生成 API
- [ ] 实现冲突拓扑图生成 API
- [ ] 开发角色利益矩阵编辑器组件
- [ ] 开发冲突拓扑图可视化组件

### Phase 3: 资产设计层 (Week 3)
- [ ] 实现电影滤镜适配 API
- [ ] 实现资产预算约束逻辑
- [ ] 开发资产预算指示器组件

### Phase 4: 剧本设计层 (Week 4-5)
- [ ] 实现事件状态缓冲器
- [ ] 实现内流控制调度器
- [ ] 开发内流控制仪表盘组件
- [ ] 更新剧本生成 Prompt

### Phase 5: 分镜设计层 (Week 6)
- [ ] 实现导演思维提示词生成
- [ ] 实现过渡镜头自动生成
- [ ] 更新分镜生成 API

### Phase 6: 测试与优化 (Week 7-8)
- [ ] 端到端测试
- [ ] 性能优化
- [ ] 用户体验优化

---

## 📖 参考资料

### 内流控制模板
- [逆袭爽剧 10集模板](../n/逆袭爽剧_10集模板.md)
- [甜宠爽剧 10集模板](../n/甜宠爽剧_10集模板.md)
- [悬疑短剧 10集模板](../n/悬疑短剧_10集模板.md)
- [内流控制 PRD v2.0](../n/内流控制_PRD_v2.md)

### 外部文档
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [ReactFlow](https://reactflow.dev/)
- [Recharts](https://recharts.org/)
- [Supabase](https://supabase.com/docs)

---

## 🤝 贡献指南

### 文档更新流程
1. 在对应文档中进行修改
2. 更新版本号和最后更新日期
3. 在本 README 中更新变更日志

### 代码贡献流程
1. 阅读 [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)
2. 按照 Phase 1-6 顺序实施
3. 编写单元测试
4. 提交 Pull Request

---

## 📝 变更日志

### v2.0 (2026-03-01)
- ✨ 初始版本发布
- 📚 完成 PRD、技术规格、实施指南文档
- 🎯 定义核心概念与数据模型
- 🗺️ 制定实施路线图

---

## 📧 联系方式

如有问题或建议,请联系项目负责人。

---

**让我们一起打造更好的 AI 短剧生成系统!** 🎬✨
