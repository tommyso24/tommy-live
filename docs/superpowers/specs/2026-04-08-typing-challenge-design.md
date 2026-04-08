# 打字大挑战 — 设计规格

## 概述
30 秒英文打字速度测试游戏，严格模式（打错必须退格修正），按 WPM 排名的排行榜。

## 核心玩法

### 游戏规则
- 倒计时 **30 秒**
- 英文句子，随机从内置题库拼接
- **严格模式**：打错字符高亮红色，必须退格修正才能继续
- 首次按键触发倒计时
- WPM 计算：`(正确字符数 / 5) / (30 / 60)`

### 游戏状态
1. `idle` — 显示文本 + "点击输入框开始"提示
2. `playing` — 倒计时中，实时高亮反馈
3. `finished` — 显示结果（WPM、字符数），可提交成绩

### UI 反馈
- 已正确输入的字符：绿色
- 当前光标位置：高亮底色
- 打错的字符：红色背景闪烁
- 未输入的字符：灰色

## 题库
- 前端硬编码 40-50 段英文短句
- 常见词汇，难度均匀（不含生僻词）
- 每局随机抽取并拼接，确保 30 秒内打不完（约 200+ 字符）
- 示例：`"The quick brown fox jumps over the lazy dog."`

## 排行榜

### 数据复用
- 复用现有 `scores` 表，`game = 'typing'`
- `best_time` 字段存储 WPM 值（整数，越大越好）
- 验证范围：1-300 WPM

### API 修改
- `GET /api/scores?game=typing` — 需按 **降序** 排列（WPM 越高越好）
- `POST /api/scores` — 提交 `{ game: 'typing', time: wpm }`
- 后端 `scores.js` 需根据 game 类型决定排序方向和比较逻辑：
  - `reaction`：ASC（越小越好），新成绩 < 旧成绩时更新
  - `typing`：DESC（越大越好），新成绩 > 旧成绩时更新

### 排行榜 UI
- Top 10 表格：排名 / 昵称 / WPM / 游戏次数
- 点击玩家弹出卡片（头像 + 签名）
- 当前用户排名高亮
- 复用反应力游戏的排行榜 + 玩家卡片模式

## 文件结构

### 新增
- `games/typing/index.html` — 单文件，内联 CSS + JS

### 修改
- `functions/api/scores.js` — 支持按 game 类型切换排序方向
- `index.html` — 首页游戏区添加打字大挑战入口卡片

## 技术约束
- 纯 HTML / CSS / JavaScript，无框架
- 复用：`site-chrome.js`、`site-chrome.css`、`auth.js`、`avatars.js`
- 像素风格：Press Start 2P（标题）、VT323（正文）
- 配色沿用现有 CSS 变量

## 分工
- **后端（Codex）**：修改 `functions/api/scores.js` 支持双向排序
- **前端（Gemini）**：实现 `games/typing/index.html` 完整页面
- **审核（Claude）**：代码审查、集成测试
