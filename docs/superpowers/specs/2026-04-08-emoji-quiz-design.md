# Emoji 猜猜猜 — 设计规格

## 概述
选择题模式的 Emoji 猜谜游戏，固定 10 题，混合类别（电影、歌曲、动漫、食物等），按答对数+用时排名。

## 核心玩法

### 游戏规则
- 每局 **10 题**，从 70 道题库中随机抽取
- 每题展示一组 Emoji，从 **4 个选项**中选正确答案
- 每题 **15 秒**倒计时，超时算答错
- 选对：绿色反馈，0.8 秒后进入下题
- 选错/超时：红色标记错误选项，绿色高亮正确答案，1.5 秒后进入下题
- 总计时从第 1 题开始到第 10 题作答完毕

### 游戏状态
1. `idle` — 显示"开始挑战"按钮 + 排行榜
2. `playing` — 答题中，显示题号、Emoji、选项、倒计时
3. `feedback` — 显示答对/答错反馈，短暂停留
4. `finished` — 显示成绩（答对数/10、总用时），可提交

## 题库

### 格式
```javascript
{ emoji: "🧊🚢💑", answer: "泰坦尼克号", options: ["泰坦尼克号", "海上钢琴师", "加勒比海盗", "海底总动员"], category: "电影" }
```

### 类别分布（约 70 题）
- 电影（中外）：~20 题
- 歌曲：~15 题
- 动漫：~10 题
- 食物/饮品：~10 题
- 地名/国家：~10 题
- 其他（节日、运动等）：~5 题

### 出题规则
- 每局随机抽 10 题，选项顺序随机打乱
- 不重复抽取同一题

## 排行榜

### 复合分数设计
`best_time` 存储复合分数 = `答对数 * 10000 - 用时毫秒`

示例：
- 答对 8 题，用时 45000ms → 分数 = 80000 - 45000 = 35000
- 答对 10 题，用时 30000ms → 分数 = 100000 - 30000 = 70000

排行榜显示时反算：
- `答对数 = Math.ceil(score / 10000)`
- `用时ms = 答对数 * 10000 - score`

### API 复用
- `GET /api/scores?game=emoji` — DESC 排序（分数越高越好）
- `POST /api/scores` — 提交 `{ game: 'emoji', time: compositeScore }`
- 验证范围：1-100000
- 后端修改：仅在 `DESC_GAMES` 集合中添加 `'emoji'`

### 排行榜 UI
- Top 10 表格：排名 / 玩家 / 答对数 / 用时 / 挑战次数
- 玩家卡片弹窗（头像 + 签名）
- 当前用户排名高亮

## 文件结构

### 新增
- `games/emoji/index.html` — 单文件，内联 CSS + JS + 题库

### 修改
- `functions/api/scores.js` — `DESC_GAMES` 添加 `'emoji'`
- `index.html` — Emoji 猜猜猜卡片改为 PLAY 链接

## 技术约束
- 纯 HTML / CSS / JavaScript，无框架
- 复用：`site-chrome.js`、`site-chrome.css`、`auth.js`、`avatars.js`
- 像素风格：Press Start 2P（标题）、VT323（正文）
- 配色沿用现有 CSS 变量

## 分工
- **后端（Codex）**：`scores.js` 添加 emoji 到 DESC_GAMES + 调整验证范围
- **前端（Gemini）**：`games/emoji/index.html` + 首页卡片更新
- **审核（Claude）**：代码审查
