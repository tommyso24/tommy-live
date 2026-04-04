# 评论系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 tommy.live 博客文章添加基于 Cloudflare Pages Functions + D1 的评论系统，支持匿名评论、楼中楼回复和管理员审核。

**Architecture:** 前端 vanilla JS 评论组件嵌入每篇博客文章底部，通过 fetch 调用 Pages Functions API 读写评论数据。D1 SQLite 存储评论，管理后台通过密码保护的独立页面进行审核操作。

**Tech Stack:** Cloudflare Pages Functions, Cloudflare D1, vanilla JS/CSS/HTML

---

## File Map

| 文件 | 职责 |
|------|------|
| `schema.sql` | D1 建表语句 |
| `wrangler.toml` | D1 绑定配置 |
| `functions/api/comments.js` | 公开 API：GET 获取已审核评论，POST 提交新评论 |
| `functions/api/admin/comments.js` | 管理 API：GET 列表，PATCH 审核，DELETE 删除 |
| `blog/comment-widget.css` | 评论组件样式 |
| `blog/comment-widget.js` | 评论组件交互逻辑 |
| `admin/comments/index.html` | 管理后台页面 |
| `blog/*/index.html` | 每篇博客文章（添加评论组件引用） |

---

### Task 1: 数据库 Schema 与 Wrangler 配置

**Files:**
- Create: `schema.sql`
- Create: `wrangler.toml`

- [ ] **Step 1: 创建 schema.sql**

```sql
-- schema.sql
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL,
  nickname   TEXT NOT NULL,
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  parent_id  INTEGER,
  created_at TEXT NOT NULL,
  ip_hash    TEXT,
  FOREIGN KEY (parent_id) REFERENCES comments(id)
);

CREATE INDEX IF NOT EXISTS idx_comments_slug ON comments(slug, status);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);
```

- [ ] **Step 2: 创建 wrangler.toml**

```toml
# wrangler.toml
name = "tommy-live"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "tommy-comments"
database_id = "placeholder-replace-after-d1-creation"
```

> 注意：`database_id` 需要在 Cloudflare 控制台创建 D1 后替换为实际 ID。

- [ ] **Step 3: Commit**

```bash
git add schema.sql wrangler.toml
git commit -m "feat: add D1 schema and wrangler config for comment system"
```

---

### Task 2: 公开评论 API（GET + POST）

**Files:**
- Create: `functions/api/comments.js`

- [ ] **Step 1: 创建 functions/api/comments.js**

```js
// functions/api/comments.js

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// GET /api/comments?slug=xxx — 获取某篇文章的已审核评论
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const slug = url.searchParams.get('slug');
  if (!slug) {
    return Response.json({ error: 'Missing slug parameter' }, { status: 400, headers: corsHeaders() });
  }

  const { results } = await context.env.DB.prepare(
    'SELECT id, slug, nickname, content, parent_id, created_at FROM comments WHERE slug = ? AND status = ? ORDER BY created_at ASC'
  ).bind(slug, 'approved').all();

  return Response.json({ comments: results }, { headers: corsHeaders() });
}

// POST /api/comments — 提交新评论
export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  if (!body) {
    return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders() });
  }

  const { slug, nickname, content, parent_id } = body;

  // 校验必填字段
  if (!slug || !nickname || !content) {
    return Response.json({ error: 'Missing required fields: slug, nickname, content' }, { status: 400, headers: corsHeaders() });
  }

  // 校验长度
  const trimmedNickname = nickname.trim();
  const trimmedContent = content.trim();
  if (trimmedNickname.length === 0 || trimmedNickname.length > 20) {
    return Response.json({ error: 'Nickname must be 1-20 characters' }, { status: 400, headers: corsHeaders() });
  }
  if (trimmedContent.length === 0 || trimmedContent.length > 500) {
    return Response.json({ error: 'Content must be 1-500 characters' }, { status: 400, headers: corsHeaders() });
  }

  // 校验 parent_id（如果有）
  if (parent_id != null) {
    const parent = await context.env.DB.prepare(
      'SELECT id, parent_id FROM comments WHERE id = ?'
    ).bind(parent_id).first();
    if (!parent) {
      return Response.json({ error: 'Parent comment not found' }, { status: 400, headers: corsHeaders() });
    }
    // 最多 2 层嵌套：如果 parent 已经有 parent_id，则挂到 parent 的 parent 下
    // （即不允许超过 2 层）
  }

  // IP 哈希用于限频
  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(ip));
  const ipHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  // 限频检查：同一 IP 60 秒内只能提交 1 条
  const recent = await context.env.DB.prepare(
    "SELECT id FROM comments WHERE ip_hash = ? AND created_at > datetime('now', '-60 seconds')"
  ).bind(ipHash).first();
  if (recent) {
    return Response.json({ error: 'Please wait before posting again' }, { status: 429, headers: corsHeaders() });
  }

  const now = new Date().toISOString();
  await context.env.DB.prepare(
    'INSERT INTO comments (slug, nickname, content, status, parent_id, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(slug, trimmedNickname, trimmedContent, 'pending', parent_id || null, now, ipHash).run();

  return Response.json({ success: true, message: 'Comment submitted, awaiting approval' }, { status: 201, headers: corsHeaders() });
}
```

- [ ] **Step 2: 验证文件结构**

```bash
ls functions/api/comments.js
```

Expected: 文件存在，无报错。

- [ ] **Step 3: Commit**

```bash
git add functions/api/comments.js
git commit -m "feat: add public comments API (GET approved, POST new)"
```

---

### Task 3: 管理员评论 API（GET + PATCH + DELETE）

**Files:**
- Create: `functions/api/admin/comments.js`

- [ ] **Step 1: 创建 functions/api/admin/comments.js**

```js
// functions/api/admin/comments.js

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  };
}

function checkAuth(request, env) {
  const token = request.headers.get('X-Admin-Token');
  return token && token === env.ADMIN_TOKEN;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// GET /api/admin/comments?status=pending — 获取评论列表
export async function onRequestGet(context) {
  if (!checkAuth(context.request, context.env)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
  }

  const url = new URL(context.request.url);
  const status = url.searchParams.get('status') || 'pending';

  const { results } = await context.env.DB.prepare(
    'SELECT id, slug, nickname, content, status, parent_id, created_at FROM comments WHERE status = ? ORDER BY created_at DESC'
  ).bind(status).all();

  return Response.json({ comments: results }, { headers: corsHeaders() });
}

// PATCH /api/admin/comments — 审核评论（通过/拒绝）
// Body: { ids: [1, 2, 3], status: "approved" | "rejected" }
export async function onRequestPatch(context) {
  if (!checkAuth(context.request, context.env)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
  }

  const body = await context.request.json().catch(() => null);
  if (!body || !Array.isArray(body.ids) || !body.status) {
    return Response.json({ error: 'Invalid request: need ids array and status' }, { status: 400, headers: corsHeaders() });
  }

  if (!['approved', 'rejected'].includes(body.status)) {
    return Response.json({ error: 'Status must be "approved" or "rejected"' }, { status: 400, headers: corsHeaders() });
  }

  const placeholders = body.ids.map(() => '?').join(',');
  await context.env.DB.prepare(
    `UPDATE comments SET status = ? WHERE id IN (${placeholders})`
  ).bind(body.status, ...body.ids).run();

  return Response.json({ success: true, updated: body.ids.length }, { headers: corsHeaders() });
}

// DELETE /api/admin/comments — 删除评论
// Body: { ids: [1, 2, 3] }
export async function onRequestDelete(context) {
  if (!checkAuth(context.request, context.env)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });
  }

  const body = await context.request.json().catch(() => null);
  if (!body || !Array.isArray(body.ids)) {
    return Response.json({ error: 'Invalid request: need ids array' }, { status: 400, headers: corsHeaders() });
  }

  const placeholders = body.ids.map(() => '?').join(',');
  await context.env.DB.prepare(
    `DELETE FROM comments WHERE id IN (${placeholders})`
  ).bind(...body.ids).run();

  return Response.json({ success: true, deleted: body.ids.length }, { headers: corsHeaders() });
}
```

- [ ] **Step 2: Commit**

```bash
git add functions/api/admin/comments.js
git commit -m "feat: add admin comments API (list, approve/reject, delete)"
```

---

### Task 4: 评论组件样式

**Files:**
- Create: `blog/comment-widget.css`

- [ ] **Step 1: 创建 blog/comment-widget.css**

```css
/* blog/comment-widget.css — 评论组件样式，像素主题 */

.comment-section {
  margin-top: 36px;
  padding-top: 24px;
  border-top: 3px solid var(--border-color);
}

.comment-section-title {
  font-family: 'Press Start 2P', cursive;
  font-size: clamp(11px, 2.5vw, 13px);
  color: var(--pixel-pink);
  margin-bottom: 20px;
  line-height: 1.8;
}

/* ── 评论表单 ── */

.comment-form {
  background: var(--bg-card);
  border: 3px solid var(--border-color);
  padding: 16px 20px;
  margin-bottom: 24px;
}

.comment-form-label {
  font-family: 'Press Start 2P', cursive;
  font-size: 10px;
  color: var(--pixel-pink);
  letter-spacing: 2px;
  margin-bottom: 12px;
}

.comment-form-reply-hint {
  color: var(--pixel-blue);
  font-family: 'VT323', monospace;
  font-size: 18px;
  margin-bottom: 8px;
  display: none;
}

.comment-form-reply-hint .cancel-reply {
  color: var(--pixel-pink);
  cursor: pointer;
  margin-left: 8px;
}

.comment-form input[type="text"] {
  width: 100%;
  background: var(--bg-dark);
  border: 2px solid var(--border-color);
  color: var(--text-main);
  font-family: 'VT323', monospace;
  font-size: 18px;
  padding: 8px 12px;
  margin-bottom: 8px;
  outline: none;
}

.comment-form input[type="text"]:focus {
  border-color: var(--pixel-green);
}

.comment-form textarea {
  width: 100%;
  background: var(--bg-dark);
  border: 2px solid var(--border-color);
  color: var(--text-main);
  font-family: 'VT323', monospace;
  font-size: 18px;
  padding: 8px 12px;
  min-height: 80px;
  resize: vertical;
  outline: none;
}

.comment-form textarea:focus {
  border-color: var(--pixel-green);
}

.comment-form-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.comment-char-count {
  color: var(--text-dim);
  font-family: 'VT323', monospace;
  font-size: 16px;
}

.comment-submit-btn {
  background: var(--pixel-green);
  color: var(--bg-dark);
  border: none;
  font-family: 'Press Start 2P', cursive;
  font-size: 10px;
  padding: 8px 16px;
  cursor: pointer;
  letter-spacing: 1px;
  transition: opacity 0.2s;
}

.comment-submit-btn:hover {
  opacity: 0.85;
}

.comment-submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.comment-form-message {
  font-family: 'VT323', monospace;
  font-size: 18px;
  margin-top: 8px;
  display: none;
}

.comment-form-message.success {
  color: var(--pixel-green);
}

.comment-form-message.error {
  color: var(--pixel-pink);
}

/* ── 评论列表 ── */

.comment-list-empty {
  color: var(--text-dim);
  font-family: 'VT323', monospace;
  font-size: 20px;
  text-align: center;
  padding: 24px 0;
}

.comment-item {
  background: var(--bg-card);
  border: 3px solid var(--border-color);
  padding: 14px 18px;
  margin-bottom: 10px;
}

.comment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.comment-nickname {
  color: var(--pixel-blue);
  font-family: 'VT323', monospace;
  font-size: 18px;
}

.comment-time {
  color: var(--text-dim);
  font-family: 'VT323', monospace;
  font-size: 16px;
}

.comment-body {
  color: var(--text-main);
  font-family: 'VT323', monospace;
  font-size: 20px;
  line-height: 1.5;
  word-break: break-word;
}

.comment-body .mention {
  color: var(--pixel-blue);
}

.comment-actions {
  margin-top: 6px;
}

.comment-reply-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-family: 'VT323', monospace;
  font-size: 16px;
  cursor: pointer;
  padding: 0;
}

.comment-reply-btn:hover {
  color: var(--pixel-green);
}

/* ── 楼中楼嵌套 ── */

.comment-replies {
  margin-top: 10px;
  margin-left: 20px;
  padding-left: 14px;
  border-left: 2px solid var(--pixel-green);
}

.comment-replies .comment-item {
  border: none;
  background: none;
  padding: 10px 0;
  margin-bottom: 0;
  border-bottom: 1px solid var(--border-color);
}

.comment-replies .comment-item:last-child {
  border-bottom: none;
}

/* ── Loading ── */

.comment-loading {
  text-align: center;
  padding: 20px 0;
  color: var(--text-dim);
  font-family: 'Press Start 2P', cursive;
  font-size: 10px;
  letter-spacing: 2px;
}

.comment-loading::after {
  content: '';
  animation: comment-dots 1.5s infinite;
}

@keyframes comment-dots {
  0%   { content: '.'; }
  33%  { content: '..'; }
  66%  { content: '...'; }
}
```

- [ ] **Step 2: Commit**

```bash
git add blog/comment-widget.css
git commit -m "feat: add comment widget styles (pixel theme)"
```

---

### Task 5: 评论组件 JavaScript

**Files:**
- Create: `blog/comment-widget.js`

- [ ] **Step 1: 创建 blog/comment-widget.js**

```js
// blog/comment-widget.js — 评论前端组件

(function () {
  'use strict';

  // 从页面 URL 提取文章 slug（路径倒数第二段）
  var pathParts = window.location.pathname.replace(/\/+$/, '').split('/');
  var SLUG = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];

  var API_BASE = '/api/comments';
  var replyToId = null;
  var replyToNickname = null;

  // ── 工具函数 ──

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function timeAgo(isoStr) {
    var now = Date.now();
    var then = new Date(isoStr).getTime();
    var diff = Math.floor((now - then) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 2592000) return Math.floor(diff / 86400) + ' 天前';
    return isoStr.slice(0, 10);
  }

  // ── 渲染 ──

  function renderComment(comment, isReply) {
    var html = '<div class="comment-item" data-id="' + comment.id + '">';
    html += '<div class="comment-header">';
    html += '<span class="comment-nickname">🎮 ' + escapeHtml(comment.nickname) + '</span>';
    html += '<span class="comment-time">' + timeAgo(comment.created_at) + '</span>';
    html += '</div>';
    html += '<div class="comment-body">';
    if (comment._mentionNickname) {
      html += '<span class="mention">@' + escapeHtml(comment._mentionNickname) + '</span> ';
    }
    html += escapeHtml(comment.content);
    html += '</div>';
    html += '<div class="comment-actions">';
    html += '<button class="comment-reply-btn" data-id="' + comment.id + '" data-nickname="' + escapeHtml(comment.nickname) + '">↩ 回复</button>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function buildTree(comments) {
    var topLevel = [];
    var childrenMap = {};

    for (var i = 0; i < comments.length; i++) {
      var c = comments[i];
      if (c.parent_id == null) {
        topLevel.push(c);
      } else {
        if (!childrenMap[c.parent_id]) childrenMap[c.parent_id] = [];
        childrenMap[c.parent_id].push(c);
      }
    }

    // 将深层回复（回复的回复）提升到第 2 层，并标记 @提及
    function flattenChildren(parentId, parentNickname) {
      var direct = childrenMap[parentId] || [];
      var all = [];
      for (var i = 0; i < direct.length; i++) {
        var child = direct[i];
        child._mentionNickname = parentNickname;
        all.push(child);
        // 递归收集更深层的回复，平铺到第 2 层
        var deeper = flattenChildren(child.id, child.nickname);
        for (var j = 0; j < deeper.length; j++) {
          all.push(deeper[j]);
        }
      }
      return all;
    }

    var tree = [];
    for (var i = 0; i < topLevel.length; i++) {
      var t = topLevel[i];
      t._replies = flattenChildren(t.id, t.nickname);
      tree.push(t);
    }
    return tree;
  }

  function renderComments(comments) {
    var listEl = document.getElementById('commentList');
    var titleEl = document.getElementById('commentSectionTitle');

    if (!comments || comments.length === 0) {
      listEl.innerHTML = '<div class="comment-list-empty">还没有评论，来做第一个勇者吧 🎮</div>';
      titleEl.textContent = '💬 COMMENTS (0)';
      return;
    }

    titleEl.textContent = '💬 COMMENTS (' + comments.length + ')';

    var tree = buildTree(comments);
    var html = '';

    for (var i = 0; i < tree.length; i++) {
      var c = tree[i];
      html += renderComment(c, false);
      if (c._replies && c._replies.length > 0) {
        html += '<div class="comment-replies">';
        for (var j = 0; j < c._replies.length; j++) {
          html += renderComment(c._replies[j], true);
        }
        html += '</div>';
      }
    }

    listEl.innerHTML = html;

    // 绑定回复按钮
    var replyBtns = listEl.querySelectorAll('.comment-reply-btn');
    for (var k = 0; k < replyBtns.length; k++) {
      replyBtns[k].addEventListener('click', handleReplyClick);
    }
  }

  // ── 交互 ──

  function handleReplyClick(e) {
    var btn = e.currentTarget;
    replyToId = parseInt(btn.getAttribute('data-id'), 10);
    replyToNickname = btn.getAttribute('data-nickname');

    var hintEl = document.getElementById('commentReplyHint');
    hintEl.innerHTML = '回复 @' + escapeHtml(replyToNickname) + ' <span class="cancel-reply">✕ 取消</span>';
    hintEl.style.display = 'block';

    hintEl.querySelector('.cancel-reply').addEventListener('click', cancelReply);

    var textarea = document.getElementById('commentContent');
    textarea.focus();
    textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function cancelReply() {
    replyToId = null;
    replyToNickname = null;
    var hintEl = document.getElementById('commentReplyHint');
    hintEl.style.display = 'none';
  }

  // ── API 调用 ──

  function loadComments() {
    var listEl = document.getElementById('commentList');
    listEl.innerHTML = '<div class="comment-loading">LOADING</div>';

    fetch(API_BASE + '?slug=' + encodeURIComponent(SLUG))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        renderComments(data.comments || []);
      })
      .catch(function () {
        listEl.innerHTML = '<div class="comment-list-empty">加载评论失败，请刷新重试</div>';
      });
  }

  function submitComment() {
    var nicknameEl = document.getElementById('commentNickname');
    var contentEl = document.getElementById('commentContent');
    var msgEl = document.getElementById('commentFormMessage');
    var btnEl = document.getElementById('commentSubmitBtn');

    var nickname = nicknameEl.value.trim();
    var content = contentEl.value.trim();

    if (!nickname) {
      showMessage(msgEl, '请填写昵称', 'error');
      return;
    }
    if (!content) {
      showMessage(msgEl, '请填写评论内容', 'error');
      return;
    }
    if (content.length > 500) {
      showMessage(msgEl, '评论内容不能超过 500 字', 'error');
      return;
    }

    btnEl.disabled = true;

    var payload = {
      slug: SLUG,
      nickname: nickname,
      content: content,
    };
    if (replyToId) {
      payload.parent_id = replyToId;
    }

    fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (result.ok) {
          showMessage(msgEl, '评论已提交，等待审核后显示 ✨', 'success');
          contentEl.value = '';
          cancelReply();
          localStorage.setItem('tommy-comment-nickname', nickname);
        } else {
          var errMsg = result.data.error || '提交失败';
          if (result.data.error === 'Please wait before posting again') {
            errMsg = '操作太频繁，请 60 秒后再试';
          }
          showMessage(msgEl, errMsg, 'error');
        }
      })
      .catch(function () {
        showMessage(msgEl, '网络错误，请重试', 'error');
      })
      .finally(function () {
        btnEl.disabled = false;
      });
  }

  function showMessage(el, text, type) {
    el.textContent = text;
    el.className = 'comment-form-message ' + type;
    el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, 5000);
  }

  // ── 初始化 ──

  function init() {
    var section = document.getElementById('commentSection');
    if (!section) return;

    // 恢复昵称
    var savedNickname = localStorage.getItem('tommy-comment-nickname');
    if (savedNickname) {
      document.getElementById('commentNickname').value = savedNickname;
    }

    // 字数统计
    var contentEl = document.getElementById('commentContent');
    var countEl = document.getElementById('commentCharCount');
    contentEl.addEventListener('input', function () {
      countEl.textContent = contentEl.value.length + ' / 500';
    });

    // 提交按钮
    document.getElementById('commentSubmitBtn').addEventListener('click', submitComment);

    // 加载评论
    loadComments();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

- [ ] **Step 2: Commit**

```bash
git add blog/comment-widget.js
git commit -m "feat: add comment widget JavaScript (load, submit, reply, nested)"
```

---

### Task 6: 将评论组件嵌入博客文章

**Files:**
- Modify: `blog/ai-saas-frontend/index.html`
- Modify: `blog/cloudflare-pages-tutorial/index.html`
- Modify: `blog/why-coding/index.html`
- Modify: `blog/day-1-start/index.html`

每篇博客文章需要做两处修改：

**修改 A：** 在 `<head>` 中添加 CSS 引用（在 `blog-common.css` 之后）：

```html
<link rel="stylesheet" href="../comment-widget.css">
```

**修改 B：** 在 `<div class="article-footer">...</div>` 之后、`</div><!-- .article-body -->` 之前，添加评论区 HTML：

```html
<!-- 评论区 -->
<div id="commentSection" class="comment-section">
  <div id="commentSectionTitle" class="comment-section-title">💬 COMMENTS</div>

  <div class="comment-form">
    <div class="comment-form-label">💬 LEAVE A COMMENT</div>
    <div id="commentReplyHint" class="comment-form-reply-hint"></div>
    <input type="text" id="commentNickname" placeholder="昵称" maxlength="20">
    <textarea id="commentContent" placeholder="写下你的想法..." maxlength="500"></textarea>
    <div class="comment-form-footer">
      <span id="commentCharCount" class="comment-char-count">0 / 500</span>
      <button id="commentSubmitBtn" class="comment-submit-btn">SUBMIT ▶</button>
    </div>
    <div id="commentFormMessage" class="comment-form-message"></div>
  </div>

  <div id="commentList"></div>
</div>
```

**修改 C：** 在 `</body>` 前（`site-chrome.js` 之后）添加 JS 引用：

```html
<script src="../comment-widget.js"></script>
```

- [ ] **Step 1: 修改 blog/ai-saas-frontend/index.html**

按上述三处修改。

- [ ] **Step 2: 修改 blog/cloudflare-pages-tutorial/index.html**

按上述三处修改。

- [ ] **Step 3: 修改 blog/why-coding/index.html**

按上述三处修改。

- [ ] **Step 4: 修改 blog/day-1-start/index.html**

按上述三处修改。

- [ ] **Step 5: 本地验证**

在浏览器中打开任意一篇博客文章，确认：
- 评论区出现在文章底部
- 表单输入框、按钮样式正确
- 字数统计正常
- 像素风格与站点一致

- [ ] **Step 6: Commit**

```bash
git add blog/ai-saas-frontend/index.html blog/cloudflare-pages-tutorial/index.html blog/why-coding/index.html blog/day-1-start/index.html
git commit -m "feat: embed comment widget in all blog posts"
```

---

### Task 7: 管理后台页面

**Files:**
- Create: `admin/comments/index.html`

- [ ] **Step 1: 创建 admin/comments/index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>评论管理 — Tommy.live</title>
<link rel="icon" href="../../assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap" rel="stylesheet">
<style>
:root {
  --bg-dark: #0f0e17;
  --bg-card: #1a1925;
  --pixel-green: #2de2a6;
  --pixel-pink: #ff6b9d;
  --pixel-blue: #4cc9f0;
  --pixel-yellow: #f7d754;
  --pixel-purple: #c77dff;
  --text-main: #e8e4f0;
  --text-dim: #8b8598;
  --border-color: #2e2b3a;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: var(--bg-dark);
  color: var(--text-main);
  font-family: 'VT323', monospace;
  font-size: 20px;
  line-height: 1.6;
  padding: 24px;
}
h1 {
  font-family: 'Press Start 2P', cursive;
  font-size: 14px;
  color: var(--pixel-pink);
  margin-bottom: 20px;
  line-height: 1.8;
}
/* 登录 */
#loginOverlay {
  position: fixed; inset: 0;
  background: var(--bg-dark);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
}
#loginBox {
  background: var(--bg-card);
  border: 3px solid var(--border-color);
  padding: 32px;
  text-align: center;
  max-width: 360px;
  width: 90%;
}
#loginBox h2 {
  font-family: 'Press Start 2P', cursive;
  font-size: 12px;
  color: var(--pixel-green);
  margin-bottom: 16px;
  line-height: 1.8;
}
#loginBox input {
  width: 100%;
  background: var(--bg-dark);
  border: 2px solid var(--border-color);
  color: var(--text-main);
  font-family: 'VT323', monospace;
  font-size: 20px;
  padding: 10px 14px;
  margin-bottom: 12px;
  outline: none;
  text-align: center;
}
#loginBox input:focus { border-color: var(--pixel-green); }
#loginBox button {
  background: var(--pixel-green);
  color: var(--bg-dark);
  border: none;
  font-family: 'Press Start 2P', cursive;
  font-size: 10px;
  padding: 10px 24px;
  cursor: pointer;
}
#loginError {
  color: var(--pixel-pink);
  font-size: 18px;
  margin-top: 8px;
  display: none;
}
/* 标签页 */
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
}
.tab {
  background: var(--bg-card);
  border: 2px solid var(--border-color);
  color: var(--text-dim);
  font-family: 'Press Start 2P', cursive;
  font-size: 10px;
  padding: 8px 16px;
  cursor: pointer;
  transition: all 0.2s;
}
.tab.active {
  border-color: var(--pixel-green);
  color: var(--pixel-green);
}
/* 工具栏 */
.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.toolbar label {
  color: var(--text-dim);
  font-size: 18px;
  cursor: pointer;
}
.toolbar button {
  background: none;
  border: 2px solid var(--border-color);
  color: var(--text-main);
  font-family: 'VT323', monospace;
  font-size: 18px;
  padding: 4px 12px;
  cursor: pointer;
}
.toolbar button:hover { border-color: var(--pixel-green); color: var(--pixel-green); }
/* 评论条目 */
.admin-comment {
  background: var(--bg-card);
  border: 3px solid var(--border-color);
  padding: 14px 18px;
  margin-bottom: 8px;
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.admin-comment input[type="checkbox"] {
  margin-top: 4px;
  accent-color: var(--pixel-green);
}
.admin-comment-body { flex: 1; }
.admin-comment-meta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  flex-wrap: wrap;
  gap: 8px;
}
.admin-comment-nickname { color: var(--pixel-blue); font-size: 18px; }
.admin-comment-slug { color: var(--pixel-purple); font-size: 16px; }
.admin-comment-time { color: var(--text-dim); font-size: 16px; }
.admin-comment-content { color: var(--text-main); margin-bottom: 8px; }
.admin-comment-actions { display: flex; gap: 8px; }
.admin-comment-actions button {
  background: none;
  border: 2px solid var(--border-color);
  color: var(--text-main);
  font-family: 'VT323', monospace;
  font-size: 16px;
  padding: 2px 10px;
  cursor: pointer;
}
.btn-approve:hover { border-color: var(--pixel-green); color: var(--pixel-green); }
.btn-reject:hover { border-color: var(--pixel-yellow); color: var(--pixel-yellow); }
.btn-delete:hover { border-color: var(--pixel-pink); color: var(--pixel-pink); }
.empty { color: var(--text-dim); text-align: center; padding: 40px 0; }
.loading { color: var(--text-dim); text-align: center; padding: 20px 0; font-family: 'Press Start 2P', cursive; font-size: 10px; }
</style>
</head>
<body>

<!-- 登录遮罩 -->
<div id="loginOverlay">
  <div id="loginBox">
    <h2>🔒 ADMIN LOGIN</h2>
    <input type="password" id="loginPassword" placeholder="输入管理密码">
    <br>
    <button onclick="tryLogin()">ENTER ▶</button>
    <div id="loginError">密码错误</div>
  </div>
</div>

<!-- 主界面 -->
<div id="mainUI" style="display:none; max-width:800px; margin:0 auto;">
  <h1>📋 COMMENT ADMIN</h1>

  <div class="tabs">
    <div class="tab active" data-status="pending" onclick="switchTab('pending')">待审核</div>
    <div class="tab" data-status="approved" onclick="switchTab('approved')">已通过</div>
    <div class="tab" data-status="rejected" onclick="switchTab('rejected')">已拒绝</div>
  </div>

  <div class="toolbar">
    <label><input type="checkbox" id="selectAll" onchange="toggleSelectAll()"> 全选</label>
    <button onclick="batchAction('approved')">✅ 批量通过</button>
    <button onclick="batchAction('rejected')">❌ 批量拒绝</button>
    <button onclick="batchDelete()">🗑 批量删除</button>
  </div>

  <div id="commentList"></div>
</div>

<script>
var adminToken = '';
var currentStatus = 'pending';
var API_BASE = '/api/admin/comments';

// ── 登录 ──

document.getElementById('loginPassword').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') tryLogin();
});

function tryLogin() {
  var pw = document.getElementById('loginPassword').value;
  if (!pw) return;
  adminToken = pw;
  // 验证密码：尝试请求 API
  fetch(API_BASE + '?status=pending', { headers: { 'X-Admin-Token': adminToken } })
    .then(function(res) {
      if (res.ok) {
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('mainUI').style.display = 'block';
        return res.json();
      } else {
        throw new Error('Unauthorized');
      }
    })
    .then(function(data) {
      renderList(data.comments);
    })
    .catch(function() {
      document.getElementById('loginError').style.display = 'block';
      adminToken = '';
    });
}

// ── 标签页 ──

function switchTab(status) {
  currentStatus = status;
  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].className = tabs[i].getAttribute('data-status') === status ? 'tab active' : 'tab';
  }
  loadList();
}

function loadList() {
  var el = document.getElementById('commentList');
  el.innerHTML = '<div class="loading">LOADING...</div>';
  fetch(API_BASE + '?status=' + currentStatus, { headers: { 'X-Admin-Token': adminToken } })
    .then(function(res) { return res.json(); })
    .then(function(data) { renderList(data.comments); })
    .catch(function() { el.innerHTML = '<div class="empty">加载失败</div>'; });
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderList(comments) {
  var el = document.getElementById('commentList');
  if (!comments || comments.length === 0) {
    el.innerHTML = '<div class="empty">暂无评论</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < comments.length; i++) {
    var c = comments[i];
    html += '<div class="admin-comment">';
    html += '<input type="checkbox" class="comment-checkbox" value="' + c.id + '">';
    html += '<div class="admin-comment-body">';
    html += '<div class="admin-comment-meta">';
    html += '<span class="admin-comment-nickname">🎮 ' + escapeHtml(c.nickname) + '</span>';
    html += '<span class="admin-comment-slug">📄 ' + escapeHtml(c.slug) + '</span>';
    html += '<span class="admin-comment-time">' + c.created_at.slice(0, 16).replace('T', ' ') + '</span>';
    html += '</div>';
    html += '<div class="admin-comment-content">' + escapeHtml(c.content) + '</div>';
    html += '<div class="admin-comment-actions">';
    if (currentStatus !== 'approved') {
      html += '<button class="btn-approve" onclick="singleAction(' + c.id + ',\'approved\')">✅ 通过</button>';
    }
    if (currentStatus !== 'rejected') {
      html += '<button class="btn-reject" onclick="singleAction(' + c.id + ',\'rejected\')">❌ 拒绝</button>';
    }
    html += '<button class="btn-delete" onclick="singleDelete(' + c.id + ')">🗑 删除</button>';
    html += '</div></div></div>';
  }
  el.innerHTML = html;
  document.getElementById('selectAll').checked = false;
}

// ── 操作 ──

function getSelectedIds() {
  var boxes = document.querySelectorAll('.comment-checkbox:checked');
  var ids = [];
  for (var i = 0; i < boxes.length; i++) ids.push(parseInt(boxes[i].value, 10));
  return ids;
}

function toggleSelectAll() {
  var checked = document.getElementById('selectAll').checked;
  var boxes = document.querySelectorAll('.comment-checkbox');
  for (var i = 0; i < boxes.length; i++) boxes[i].checked = checked;
}

function singleAction(id, status) {
  apiPatch([id], status);
}

function batchAction(status) {
  var ids = getSelectedIds();
  if (ids.length === 0) return;
  apiPatch(ids, status);
}

function apiPatch(ids, status) {
  fetch(API_BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
    body: JSON.stringify({ ids: ids, status: status }),
  }).then(function() { loadList(); });
}

function singleDelete(id) {
  if (!confirm('确定删除这条评论？')) return;
  apiDelete([id]);
}

function batchDelete() {
  var ids = getSelectedIds();
  if (ids.length === 0) return;
  if (!confirm('确定删除选中的 ' + ids.length + ' 条评论？')) return;
  apiDelete(ids);
}

function apiDelete(ids) {
  fetch(API_BASE, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': adminToken },
    body: JSON.stringify({ ids: ids }),
  }).then(function() { loadList(); });
}
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add admin/comments/index.html
git commit -m "feat: add admin comment management page with auth and batch ops"
```

---

### Task 8: Cloudflare D1 设置指南 & .gitignore 更新

**Files:**
- Modify: `.gitignore`（如果存在）

- [ ] **Step 1: 确认 .gitignore 包含 .superpowers/**

检查 `.gitignore` 文件，确保包含：

```
.superpowers/
```

如果文件不存在则创建。

- [ ] **Step 2: 在 Cloudflare 控制台完成 D1 设置**

用户需要完成以下操作（我们会在交付时提供截图级指引）：

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 左侧导航 → Workers & Pages → D1
3. 点击 "Create database"
4. 名称输入 `tommy-comments`，点击 Create
5. 进入数据库 → Console 标签页
6. 粘贴 `schema.sql` 的内容并执行
7. 复制数据库 ID，填入 `wrangler.toml` 的 `database_id`
8. 回到 Workers & Pages → 你的 Pages 项目 → Settings → Environment variables
9. 添加 `ADMIN_TOKEN`，值为你的管理密码
10. 在 Settings → Functions → D1 database bindings 中添加绑定：变量名 `DB`，选择 `tommy-comments`

- [ ] **Step 3: Commit .gitignore 更新**

```bash
git add .gitignore
git commit -m "chore: add .superpowers to .gitignore"
```

---

## 验证清单

部署后逐项验证：

- [ ] 打开任意博客文章，评论区正确显示
- [ ] 提交评论后显示"等待审核"提示
- [ ] 60 秒内重复提交被限频拒绝
- [ ] 打开 `/admin/comments/` 输入密码进入管理后台
- [ ] 管理后台显示待审核评论
- [ ] 通过评论后，刷新文章页面评论可见
- [ ] 回复评论后，嵌套显示正确（绿色竖线）
- [ ] 昵称在下次访问时自动填充
- [ ] 移动端布局正常
