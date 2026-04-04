# tommy.live 评论系统设计文档

> 日期：2026-04-04
> 状态：已确认

## 概述

为 tommy.live 博客文章页面添加评论系统。使用 Cloudflare Pages Functions + D1 实现，支持匿名评论、楼中楼回复、审核机制。前端使用 vanilla JS，风格与站点像素主题一致。

## 需求

- 评论范围：仅博客文章页面
- 评论方式：匿名，填写昵称即可
- 回复方式：经典嵌套式楼中楼，最多 2 层
- 审核机制：评论提交后为 pending 状态，管理员审核通过后才公开显示
- 管理后台：`/admin/comments/`，密码保护

## 架构

```
用户浏览器                    Cloudflare
┌──────────┐    fetch     ┌──────────────────┐
│ 博客文章页 │ ─────────→ │ Pages Functions   │
│ (评论组件) │ ←───────── │ /functions/api/   │
└──────────┘   JSON       │   comments.js     │
                          │        ↕          │
┌──────────┐    fetch     │   D1 Database     │
│ 管理后台页 │ ─────────→ │   (SQLite)        │
│ /admin/   │ ←───────── │                    │
└──────────┘              └──────────────────┘
```

- **前端**：纯 vanilla JS 评论组件，嵌入博客文章底部，无框架依赖
- **API**：Cloudflare Pages Functions，路径 `/functions/api/`
- **数据库**：Cloudflare D1（serverless SQLite）
- **管理后台**：`/admin/comments/index.html`，密码保护

## 数据库设计

一张 `comments` 表：

```sql
CREATE TABLE comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL,        -- 文章标识（如 "ai-saas-frontend"）
  nickname   TEXT NOT NULL,        -- 昵称
  content    TEXT NOT NULL,        -- 评论内容
  status     TEXT NOT NULL DEFAULT 'pending',  -- "pending" | "approved" | "rejected"
  parent_id  INTEGER,              -- 回复目标评论 ID（NULL 表示顶层评论）
  created_at TEXT NOT NULL,        -- ISO 8601 时间戳
  ip_hash    TEXT,                 -- IP 哈希，用于限频（不存明文 IP）
  FOREIGN KEY (parent_id) REFERENCES comments(id)
);

CREATE INDEX idx_comments_slug ON comments(slug, status);
CREATE INDEX idx_comments_status ON comments(status);
```

## API 设计

| 端点 | 方法 | 说明 | 鉴权 |
|------|------|------|------|
| `/api/comments?slug=xxx` | GET | 获取某篇文章已审核评论 | 无 |
| `/api/comments` | POST | 提交新评论（status=pending） | 无 |
| `/api/admin/comments?status=pending` | GET | 获取评论列表（可按状态筛选） | X-Admin-Token |
| `/api/admin/comments` | PATCH | 审核评论（通过/拒绝） | X-Admin-Token |
| `/api/admin/comments` | DELETE | 删除评论 | X-Admin-Token |

管理接口通过请求头 `X-Admin-Token` 传递密码，密码存在 Cloudflare 环境变量 `ADMIN_TOKEN` 中。

## 前端评论组件

### 评论表单

- 输入框：昵称（单行）+ 内容（多行）
- 昵称存 localStorage，下次自动填充
- 前端校验：昵称和内容非空，内容最长 500 字
- 提交后显示提示："评论已提交，等待审核后显示 ✨"

### 评论列表

- 经典嵌套式布局：回复嵌套在父评论下方
- 左侧绿色竖线（`--pixel-green`）标记嵌套层级
- 最多嵌套 2 层，超过 2 层的回复平铺在第 2 层
- 每条评论显示：昵称、内容、相对时间、回复按钮
- 点击"↩ 回复"：输入框滚入视图并聚焦，显示"回复 @xxx"
- 空状态："还没有评论，来做第一个勇者吧 🎮"
- 加载状态：像素风 loading 动画
- 标题显示评论总数

### 视觉风格

与站点像素主题一致：
- 背景色：`--bg-card` (#1a1925)
- 边框：3px solid `--border-color`
- 昵称颜色：`--pixel-blue`
- 标题字体：Press Start 2P
- 正文字体：VT323
- 回复竖线：`--pixel-green`
- 按钮：绿色背景 (`--pixel-green`)，深色文字

## 管理后台

### 页面：`/admin/comments/index.html`

- 打开页面时弹出密码输入框
- 默认视图：待审核评论列表
- 可切换标签页：待审核 / 已通过 / 已拒绝
- 每条评论显示：昵称、内容、所属文章标题、提交时间
- 操作按钮：✅ 通过 / ❌ 拒绝 / 🗑 删除
- 批量操作：全选 + 批量通过/拒绝
- 风格与站点一致的像素风

## 安全与防护

| 项目 | 方案 |
|------|------|
| XSS 防护 | 评论内容渲染时转义 HTML，纯文本展示 |
| 防刷 | 同一 IP 60 秒内只能提交 1 条，基于 IP 哈希在 D1 中查询 |
| 管理鉴权 | X-Admin-Token 请求头，与环境变量 ADMIN_TOKEN 比对 |
| IP 隐私 | 仅存储 IP 的 SHA-256 哈希，不存明文 |

## 文件结构

```
tommy-live/
├── functions/
│   └── api/
│       ├── comments.js          -- GET/POST 公开评论 API
│       └── admin/
│           └── comments.js      -- GET/PATCH/DELETE 管理 API
├── admin/
│   └── comments/
│       └── index.html           -- 管理后台页面
├── blog/
│   └── comment-widget.js        -- 评论前端组件
│   └── comment-widget.css       -- 评论组件样式
└── wrangler.toml                -- D1 绑定配置
```

## 用户操作步骤

用户（站长）仅需完成以下操作：

1. 在 Cloudflare 控制台创建 D1 数据库（命名为 `tommy-comments`）
2. 设置环境变量 `ADMIN_TOKEN`（自定义管理密码）
3. 推送代码到 GitHub，Cloudflare Pages 自动部署

建表 SQL 通过 wrangler 或控制台执行，具体步骤在实施计划中提供。

## 不在范围内

- 邮件/通知提醒（未来可加）
- 表情/Markdown 支持（未来可加）
- 评论点赞
- 第三方登录
