# Inkplot Workshop - 云端架构与用户系统规格说明书 (Cloud Architecture & User System Spec)

本文档描述了 Inkplot Workshop 从“本地优先”架构向“云端协同”架构演进的技术细节，引入 **Supabase** 作为用户认证与数据库服务，以及 **Vercel Blob** 作为对象存储服务。

## 1. 架构演进 (Architecture Evolution)

### 1.1 目标 (Goals)
*   **用户系统**: 实现用户注册、登录与鉴权，确保数据隔离。
*   **多端同步**: 数据存储于云端 Postgres 数据库，支持跨设备访问。
*   **持久化存储**: 资产图片从本地 IndexedDB 迁移至云端 Vercel Blob，解决本地存储容量限制。

### 1.2 混合架构 (Hybrid Architecture)
虽然引入了云端服务，但为了保持编辑体验的流畅性，建议保留部分本地优先的特性（如乐观更新），逐步迁移数据源。

*   **Auth**: Supabase Auth (JWT)
*   **Database**: Supabase (PostgreSQL)
*   **Storage**: Vercel Blob
*   **API**: Next.js Server Actions / API Routes

---

## 2. 数据库设计 (Database Schema - Supabase)

所有表都必须包含 `user_id` 字段以支持 RLS (Row Level Security) 数据隔离。

### 2.1 Users (由 Supabase Auth 管理)
使用 Supabase 内置 `auth.users` 表。可根据需要创建 `public.profiles` 表扩展用户信息。

```sql
-- public.profiles (可选，用于存储额外用户信息)
create table profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  avatar_url text,
  full_name text,
  updated_at timestamp with time zone
);
```

### 2.2 Projects (剧集项目)
对应原 Dexie `Project` 表。

```sql
create table projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  logline text,
  genre text[], -- PostgreSQL 数组类型
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS Policy
create policy "Users can only access their own projects"
  on projects for all
  using (auth.uid() = user_id);
```

### 2.3 Episodes (分集剧本)
对应原 Dexie `Episode` 表。

```sql
create table episodes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  episode_number integer not null,
  title text,
  content text, -- Markdown 内容
  structure jsonb, -- 存储 hook, climax 等结构化数据
  last_edited timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index
create index episodes_project_id_idx on episodes(project_id);
```

### 2.4 Assets (资产)
对应原 Dexie `Asset` 表。

```sql
create type asset_type as enum ('character', 'location', 'prop');
create type asset_status as enum ('draft', 'locked');

create table assets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  type asset_type not null,
  name text not null,
  description text,
  visual_prompt text,
  image_url text, -- 指向 Vercel Blob 的 URL
  status asset_status default 'draft',
  metadata jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
```

### 2.5 Shots (分镜)
对应原 Dexie `Shot` 表。

```sql
create table shots (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  episode_id uuid references episodes(id) on delete cascade not null,
  sequence_number integer not null, -- 重命名 sequence 以避免关键字冲突
  description text,
  camera text,
  size text,
  duration integer,
  related_asset_ids uuid[], -- 关联的 Asset ID 数组
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
```

---

## 3. 对象存储 (Object Storage - Vercel Blob)

### 3.1 存储策略
不再将图片转换为 Base64/Blob 存入 IndexedDB，而是直接上传至 Vercel Blob。

### 3.2 上传流程
1.  **Server-Side Upload (推荐)**:
    通过 Server Action 或 API Route 处理上传，避免暴露 Write Token。
    ```typescript
    // app/api/upload/route.ts
    import { put } from '@vercel/blob';

    export async function POST(request: Request) {
      const { searchParams } = new URL(request.url);
      const filename = searchParams.get('filename');

      // 鉴权检查 (确保用户已登录)
      // ...

      const blob = await put(filename, request.body, {
        access: 'public',
      });

      return NextResponse.json(blob);
    }
    ```

2.  **Client-Side Upload**:
    若需从客户端直接上传，需生成 Client Token (增加了复杂性，暂不推荐)。

### 3.3 图片管理
*   **生成**: AI 生成图片后，后端代理直接将其流式传输到 Vercel Blob，返回 URL 给前端。
*   **删除**: 当 Asset 被删除时，触发 Webhook 或在 Server Action 中同步删除 Vercel Blob 对应的文件。

---

## 4. 认证与集成 (Authentication & Integration)

### 4.1 技术选型
*   **SDK**: `@supabase/ssr` (用于 Next.js App Router)
*   **Auth UI**: 自定义 UI 或 Shadcn Form + Supabase Auth API (不使用 Supabase Auth UI 组件库以保持设计一致性)。

### 4.2 登录流程
1.  用户访问 `/login`。
2.  输入邮箱/密码或点击 GitHub/Google 登录。
3.  Supabase 返回 Session (Cookie based)。
4.  Middleware (`middleware.ts`) 拦截受保护路由，验证 Session 有效性。

### 4.3 状态同步
*   **Data Fetching**: 使用 `SWR` 或 `React Query` 替代直接的 Dexie `useLiveQuery`。
*   **Realtime**: 可选开启 Supabase Realtime 功能，实现多端协同编辑（即时看到队友的修改）。

---

## 5. 迁移策略 (Migration Strategy)

### 5.1 阶段一：双栈共存 (Current)
*   新用户直接使用云端存储。
*   老用户保留本地数据，提供“同步/导出”按钮。

### 5.2 阶段二：数据上云
*   提供 Migration Tool，读取本地 IndexedDB 数据 -> 调用 Supabase API 批量插入 -> 上传本地图片至 Blob -> 更新 Image URL。
*   迁移完成后清空本地 Dexie 数据或将其作为只读缓存。

---

## 6. 环境配置 (Environment Variables)

需要在 `.env.local` 中配置以下变量：

### 6.1 Supabase 安全性说明 (Security Note)
*   `NEXT_PUBLIC_SUPABASE_URL`: 它是您的 API 网关地址，类似于网站域名，公开是安全的。
*   `NEXT_PUBLIC_SUPABASE_ANON_KEY`: 这是 **公开匿名密钥 (Anonymous Key)**，**设计上就是要在浏览器端使用的**。
    *   **安全性保障**: 它的权限完全受控于 Postgres 数据库的 **RLS (Row Level Security)** 策略。
    *   **原理**: 即使拥有此 Key，如果没有登录 (Auth Token) 或不符合 RLS 规则 (如 `auth.uid() = user_id`)，用户也无法读写任何敏感数据。
*   **严禁泄露**: `SUPABASE_SERVICE_ROLE_KEY`。此 Key 拥有上帝权限 (Bypass RLS)，**绝对不能** 暴露在前端或 `NEXT_PUBLIC_` 变量中，只能在服务端 (`Server Actions`, `API Routes`) 使用。

### 6.2 变量列表

```bash
# Supabase (Public - Safe to expose)
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Vercel Blob (Private - Server Only)
BLOB_READ_WRITE_TOKEN=your-blob-token
```
