# Emoji 猜猜猜 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Emoji quiz game with 10 multiple-choice questions per round, mixed categories, and a leaderboard ranked by correct answers + speed.

**Architecture:** Single HTML page (`games/emoji/index.html`) with inline CSS/JS and a 70-question bank. Backend only needs `'emoji'` added to `DESC_GAMES` in `scores.js`. Homepage card updated from COMING SOON to PLAY.

**Tech Stack:** HTML/CSS/JS (no framework), Cloudflare Pages Functions, D1 SQLite

---

### Task 1: Backend — Add emoji to DESC_GAMES in scores.js

**Files:**
- Modify: `functions/api/scores.js:8`

**Assigned to: Codex**

**Context:** The `DESC_GAMES` set currently contains `['typing']`. We need to add `'emoji'` so the emoji game gets DESC sorting and `Math.max` best-score logic. We also need to expand the validation range to accept emoji composite scores (1-100000).

- [ ] **Step 1: Update DESC_GAMES set**

Change line 8 from:
```javascript
const DESC_GAMES = new Set(['typing']);
```
to:
```javascript
const DESC_GAMES = new Set(['typing', 'emoji']);
```

- [ ] **Step 2: Update POST validation to support emoji score range**

The current validation (lines 118-119) sets `minVal = isDesc ? 1 : 50` and `maxVal = isDesc ? 300 : 5000`. This won't work for emoji (scores up to 100000). We need per-game validation ranges.

Replace lines 117-119:
```javascript
    const isDesc = DESC_GAMES.has(game);
    const minVal = isDesc ? 1 : 50;
    const maxVal = isDesc ? 300 : 5000;
```
with:
```javascript
    const isDesc = DESC_GAMES.has(game);
    const GAME_RANGES = { typing: [1, 300], emoji: [1, 100000] };
    const [minVal, maxVal] = GAME_RANGES[game] || (isDesc ? [1, 100000] : [50, 5000]);
```

- [ ] **Step 3: Commit**

```bash
git add functions/api/scores.js
git commit -m "feat: scores API 支持 emoji 游戏排行榜"
```

---

### Task 2: Frontend — Create `games/emoji/index.html`

**Files:**
- Create: `games/emoji/index.html`

**Assigned to: Gemini**

**Context:** Build the complete Emoji quiz game page. Follow the exact same structure as `games/typing/index.html` and `games/reaction/index.html`: single HTML file with inline `<style>` and `<script>`, same CSS variables, same star background, same leaderboard/player-card pattern.

**Reference files to study before coding:**
- `games/typing/index.html` — most recent game page, use as primary template for structure, CSS, leaderboard, player card, auth UI
- `assets/auth.js` — `TommyAuth.isLoggedIn()`, `TommyAuth.getUser()`, `TommyAuth.fetchWithAuth()`
- `assets/avatars.js` — `TommyAvatars.create(avatarId, size)`
- `assets/site-chrome.js` / `assets/site-chrome.css` — navigation bar
- `docs/superpowers/specs/2026-04-08-emoji-quiz-design.md` — full design spec

- [ ] **Step 1: Create HTML skeleton with CSS**

File: `games/emoji/index.html`

HTML structure:
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Emoji 猜猜猜 — Tommy.live</title>
<link rel="icon" href="../../assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../assets/site-chrome.css">
<style>
/* Copy base styles from typing game: :root variables, *, body, body::after (scanline), 
   .stars, .star, @keyframes twinkle, main, h1, .subtitle, #userBar, .btn-logout */

/* Game-specific styles: */
.game-container {
  background: var(--bg-card);
  border: 3px solid var(--border-color);
  padding: 32px 24px;
  margin-bottom: 32px;
  text-align: center;
}

.question-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  font-family: 'Press Start 2P', cursive;
  font-size: 12px;
}

.question-num { color: var(--pixel-blue); }
.question-timer { color: var(--pixel-yellow); }
.question-timer.urgent { color: var(--pixel-pink); animation: flash 0.5s infinite alternate; }

.emoji-display {
  font-size: clamp(48px, 12vw, 80px);
  margin: 24px 0;
  line-height: 1.4;
  min-height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.category-tag {
  display: inline-block;
  background: var(--bg-dark);
  border: 1px solid var(--border-color);
  color: var(--text-dim);
  font-size: 14px;
  padding: 4px 12px;
  margin-bottom: 20px;
}

.options-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  max-width: 480px;
  margin: 0 auto;
}

.option-btn {
  background: var(--bg-dark);
  border: 3px solid var(--border-color);
  color: var(--text-main);
  font-family: 'VT323', monospace;
  font-size: 22px;
  padding: 16px 12px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.1s;
  text-align: center;
  word-break: break-all;
}

.option-btn:hover:not(:disabled) { border-color: var(--pixel-blue); transform: translateY(-2px); }
.option-btn:disabled { cursor: default; opacity: 0.7; }
.option-btn.correct { border-color: var(--pixel-green); background: rgba(45,226,166,0.15); color: var(--pixel-green); }
.option-btn.wrong { border-color: var(--pixel-pink); background: rgba(255,107,157,0.15); color: var(--pixel-pink); }

/* Start screen */
.start-screen { text-align: center; padding: 40px 20px; }
.btn-start {
  font-family: 'Press Start 2P', cursive;
  font-size: 14px;
  padding: 20px 32px;
  background: var(--pixel-green);
  color: var(--bg-dark);
  border: none;
  border-bottom: 4px solid #1a9d6e;
  cursor: pointer;
  transition: transform 0.1s;
}
.btn-start:active { transform: translateY(2px); }

/* Results panel, leaderboard, player card — copy from typing game */
/* Leaderboard table headers: 排名 / 玩家 / 答对 / 用时 / 挑战次数 */
</style>
</head>
<body class="has-site-chrome">
<!-- Stars, nav (same as typing game) -->
<div class="stars" id="stars"></div>
<nav><!-- Same nav as typing game --></nav>

<main>
  <h1>🎬 Emoji 猜猜猜</h1>
  <p class="subtitle">看 Emoji 猜答案，10 题挑战</p>

  <div id="userBar" style="display: none;">
    <span>玩家：<b id="userName"></b></span>
    <button class="btn-logout" id="btnLogout">退出</button>
  </div>

  <!-- Start screen -->
  <div class="game-container" id="startScreen">
    <div class="start-screen">
      <p style="font-size: 48px; margin-bottom: 16px;">🎬🎵🍔🌍</p>
      <p style="color: var(--text-dim); margin-bottom: 24px;">从 Emoji 组合猜出电影、歌曲、食物...<br>10 题选择题，比谁答得又快又准！</p>
      <button class="btn-start" id="btnStart">开始挑战</button>
    </div>
  </div>

  <!-- Game area (hidden initially) -->
  <div class="game-container" id="gameArea" style="display: none;">
    <div class="question-header">
      <span class="question-num" id="questionNum">1 / 10</span>
      <span class="question-timer" id="questionTimer">15s</span>
    </div>
    <div class="emoji-display" id="emojiDisplay"></div>
    <div class="category-tag" id="categoryTag"></div>
    <div class="options-grid" id="optionsGrid"></div>
  </div>

  <!-- Results panel (hidden) -->
  <div class="results-panel" id="resultsPanel" style="display: none;">
    <h2>挑战结束！</h2>
    <div class="result-big" id="resultScore">0</div>
    <p class="result-label">答对题数 / 10</p>
    <div class="result-details">
      <div class="detail-item">
        <span class="detail-value" id="resultTime">0s</span>
        <span class="detail-label">总用时</span>
      </div>
      <div class="detail-item">
        <span class="detail-value" id="resultAccuracy">0%</span>
        <span class="detail-label">正确率</span>
      </div>
    </div>
    <div class="result-actions">
      <button class="btn-game btn-primary" id="btnRestart">再来一局</button>
      <button class="btn-game btn-secondary" id="btnSubmit">提交成绩</button>
      <a href="../../auth/login.html?return=../games/emoji/index.html" class="btn-game btn-secondary" id="btnLoginToSubmit" style="display: none;">登录后提交</a>
    </div>
    <p id="submitMsg"></p>
  </div>

  <!-- Leaderboard -->
  <div class="leaderboard">
    <h2>TOP 10 排行榜</h2>
    <table class="score-table">
      <thead>
        <tr>
          <th style="width: 50px;">排名</th>
          <th>玩家</th>
          <th style="text-align: right;">答对</th>
          <th style="text-align: right;">用时</th>
          <th style="text-align: right;">挑战次数</th>
        </tr>
      </thead>
      <tbody id="leaderboardBody">
        <tr><td colspan="5" style="text-align: center; color: var(--text-dim);">加载中...</td></tr>
      </tbody>
    </table>
    <div id="myRankInfo" class="my-rank-info"></div>
  </div>
</main>

<script src="../../assets/auth.js"></script>
<script src="../../assets/avatars.js"></script>
<script>
/* JS goes here — see Steps 2-6 */
</script>
<script src="../../assets/site-chrome.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write the question bank (JS)**

Inside the IIFE, define the QUESTIONS array. Here are 70 questions across all categories. Each has `emoji`, `answer`, `options` (4 items, answer included), and `category`.

```javascript
const QUESTIONS = [
  // === 电影 (20) ===
  { emoji: "🧊🚢💑", answer: "泰坦尼克号", options: ["泰坦尼克号", "海上钢琴师", "加勒比海盗", "海底总动员"], category: "电影" },
  { emoji: "🦁👑🌅", answer: "狮子王", options: ["狮子王", "疯狂动物城", "马达加斯加", "丛林大冒险"], category: "电影" },
  { emoji: "🕷️🧑‍🦱🏙️", answer: "蜘蛛侠", options: ["蜘蛛侠", "蝙蝠侠", "超人", "钢铁侠"], category: "电影" },
  { emoji: "🧙‍♂️💍🌋", answer: "指环王", options: ["指环王", "哈利波特", "霍比特人", "纳尼亚传奇"], category: "电影" },
  { emoji: "👻👻👻🔫", answer: "捉鬼敢死队", options: ["捉鬼敢死队", "驱魔人", "鬼影实录", "招魂"], category: "电影" },
  { emoji: "🦖🏝️🔬", answer: "侏罗纪公园", options: ["侏罗纪公园", "金刚", "哥斯拉", "史前巨鳄"], category: "电影" },
  { emoji: "🤖👦❤️", answer: "机器人总动员", options: ["机器人总动员", "超能陆战队", "铁甲钢拳", "终结者"], category: "电影" },
  { emoji: "🧊❄️👸", answer: "冰雪奇缘", options: ["冰雪奇缘", "白雪公主", "灰姑娘", "魔发奇缘"], category: "电影" },
  { emoji: "🏎️⚡🏆", answer: "速度与激情", options: ["速度与激情", "极品飞车", "赛车总动员", "头文字D"], category: "电影" },
  { emoji: "🐼🥋🍜", answer: "功夫熊猫", options: ["功夫熊猫", "花木兰", "疯狂动物城", "马达加斯加"], category: "电影" },
  { emoji: "👨‍🚀🪐🌽", answer: "星际穿越", options: ["星际穿越", "地心引力", "火星救援", "星球大战"], category: "电影" },
  { emoji: "🃏😈🦇", answer: "蝙蝠侠：黑暗骑士", options: ["蝙蝠侠：黑暗骑士", "蜘蛛侠", "小丑", "自杀小队"], category: "电影" },
  { emoji: "🐟🔍🌊", answer: "海底总动员", options: ["海底总动员", "鲨鱼故事", "海洋奇缘", "小美人鱼"], category: "电影" },
  { emoji: "👨‍🍳🐀🇫🇷", answer: "料理鼠王", options: ["料理鼠王", "美食总动员", "朱莉与朱莉娅", "小鼠大厨"], category: "电影" },
  { emoji: "💀🎸🇲🇽", answer: "寻梦环游记", options: ["寻梦环游记", "僵尸新娘", "鬼妈妈", "养鬼吃人"], category: "电影" },
  { emoji: "🧹✨🏰", answer: "哈利波特", options: ["哈利波特", "指环王", "纳尼亚传奇", "奇异博士"], category: "电影" },
  { emoji: "🐒🍌👑", answer: "金刚", options: ["金刚", "猩球崛起", "人猿泰山", "丛林之书"], category: "电影" },
  { emoji: "👩‍🦰🏹🏔️", answer: "勇敢传说", options: ["勇敢传说", "花木兰", "冰雪奇缘", "魔发奇缘"], category: "电影" },
  { emoji: "🌹🐻🏰", answer: "美女与野兽", options: ["美女与野兽", "睡美人", "灰姑娘", "白雪公主"], category: "电影" },
  { emoji: "👴🎈🏠", answer: "飞屋环游记", options: ["飞屋环游记", "机器人总动员", "超人总动员", "心灵奇旅"], category: "电影" },

  // === 歌曲 (15) ===
  { emoji: "🌟🌟✨🌙", answer: "小星星", options: ["小星星", "月亮代表我的心", "夜空中最亮的星", "星晴"], category: "歌曲" },
  { emoji: "🌈🌧️☀️", answer: "彩虹", options: ["彩虹", "晴天", "雨中旋律", "阳光总在风雨后"], category: "歌曲" },
  { emoji: "🌊🐚👧", answer: "听海", options: ["听海", "海阔天空", "大海", "浪花一朵朵"], category: "歌曲" },
  { emoji: "🌙💌❤️", answer: "月亮代表我的心", options: ["月亮代表我的心", "甜蜜蜜", "小城故事", "我只在乎你"], category: "歌曲" },
  { emoji: "🏠🔙🛤️", answer: "回家的路", options: ["回家的路", "故乡的云", "乡间小路", "回到过去"], category: "歌曲" },
  { emoji: "🦋🌸💃", answer: "蝴蝶", options: ["蝴蝶", "花蝴蝶", "春天里", "兰花草"], category: "歌曲" },
  { emoji: "☀️⛅😊", answer: "晴天", options: ["晴天", "彩虹", "七里香", "稻香"], category: "歌曲" },
  { emoji: "🌾🏡🎶", answer: "稻香", options: ["稻香", "晴天", "七里香", "听妈妈的话"], category: "歌曲" },
  { emoji: "🕐⏪💭", answer: "回到过去", options: ["回到过去", "时间煮雨", "时光机", "倒带"], category: "歌曲" },
  { emoji: "🌹🥀💔", answer: "玫瑰花的葬礼", options: ["玫瑰花的葬礼", "枯萎", "离歌", "红玫瑰"], category: "歌曲" },
  { emoji: "🐟🫧🌊", answer: "小幸运", options: ["小幸运", "鱼", "海底", "泡沫"], category: "歌曲" },
  { emoji: "🌍🎵🤝", answer: "We Are The World", options: ["We Are The World", "Imagine", "Heal The World", "Let It Be"], category: "歌曲" },
  { emoji: "👸💎🎤", answer: "Diamonds", options: ["Diamonds", "Umbrella", "Firework", "Royals"], category: "歌曲" },
  { emoji: "🔥👧🎵", answer: "Girl On Fire", options: ["Girl On Fire", "Firework", "Hot N Cold", "Burning"], category: "歌曲" },
  { emoji: "☂️☂️☂️🎶", answer: "Umbrella", options: ["Umbrella", "Rain On Me", "Singing In The Rain", "Diamonds"], category: "歌曲" },

  // === 动漫 (10) ===
  { emoji: "🍊👒🏴‍☠️", answer: "海贼王", options: ["海贼王", "龙珠", "火影忍者", "进击的巨人"], category: "动漫" },
  { emoji: "🦊🍥🥷", answer: "火影忍者", options: ["火影忍者", "海贼王", "死神", "银魂"], category: "动漫" },
  { emoji: "🐉🟠⭐", answer: "龙珠", options: ["龙珠", "海贼王", "火影忍者", "圣斗士星矢"], category: "动漫" },
  { emoji: "👧🌊🐟", answer: "悬崖上的波妞", options: ["悬崖上的波妞", "千与千寻", "小美人鱼", "龙猫"], category: "动漫" },
  { emoji: "🏰✈️👧", answer: "天空之城", options: ["天空之城", "千与千寻", "哈尔的移动城堡", "龙猫"], category: "动漫" },
  { emoji: "👻🛁🏚️", answer: "千与千寻", options: ["千与千寻", "龙猫", "幽灵公主", "天空之城"], category: "动漫" },
  { emoji: "🤖👦🔧", answer: "铁臂阿童木", options: ["铁臂阿童木", "机动战士高达", "新世纪福音战士", "哆啦A梦"], category: "动漫" },
  { emoji: "🐱🔵🚪", answer: "哆啦A梦", options: ["哆啦A梦", "龙猫", "蜡笔小新", "樱桃小丸子"], category: "动漫" },
  { emoji: "⚽👦🔥", answer: "足球小将", options: ["足球小将", "灌篮高手", "棒球英豪", "网球王子"], category: "动漫" },
  { emoji: "🏀🔥💪", answer: "灌篮高手", options: ["灌篮高手", "黑子的篮球", "足球小将", "排球少年"], category: "动漫" },

  // === 食物/饮品 (10) ===
  { emoji: "🍕🧀🇮🇹", answer: "披萨", options: ["披萨", "意大利面", "千层面", "焗饭"], category: "食物" },
  { emoji: "🍣🐟🇯🇵", answer: "寿司", options: ["寿司", "刺身", "天妇罗", "拉面"], category: "食物" },
  { emoji: "🌶️🐔🥜", answer: "宫保鸡丁", options: ["宫保鸡丁", "辣子鸡", "麻婆豆腐", "水煮鱼"], category: "食物" },
  { emoji: "🥟💧🔥", answer: "饺子", options: ["饺子", "馄饨", "包子", "小笼包"], category: "食物" },
  { emoji: "🍜🐄🌿", answer: "牛肉面", options: ["牛肉面", "兰州拉面", "担担面", "阳春面"], category: "食物" },
  { emoji: "🫖🍃☕", answer: "绿茶", options: ["绿茶", "红茶", "乌龙茶", "普洱茶"], category: "食物" },
  { emoji: "🥐🧈☕", answer: "羊角面包", options: ["羊角面包", "法棍", "吐司", "贝果"], category: "食物" },
  { emoji: "🌯🥩🌮", answer: "墨西哥卷饼", options: ["墨西哥卷饼", "沙瓦尔玛", "春卷", "肉夹馍"], category: "食物" },
  { emoji: "🧋🥤🫧", answer: "珍珠奶茶", options: ["珍珠奶茶", "椰奶", "酸奶", "豆浆"], category: "食物" },
  { emoji: "🍦🍫🍰", answer: "巧克力蛋糕", options: ["巧克力蛋糕", "提拉米苏", "布朗尼", "冰淇淋"], category: "食物" },

  // === 地名/国家 (10) ===
  { emoji: "🗼🥐🇫🇷", answer: "巴黎", options: ["巴黎", "伦敦", "罗马", "马德里"], category: "地名" },
  { emoji: "🗽🏙️🇺🇸", answer: "纽约", options: ["纽约", "洛杉矶", "芝加哥", "旧金山"], category: "地名" },
  { emoji: "🏯🌸🇯🇵", answer: "东京", options: ["东京", "京都", "大阪", "首尔"], category: "地名" },
  { emoji: "🐨🦘🏖️", answer: "澳大利亚", options: ["澳大利亚", "新西兰", "南非", "巴西"], category: "地名" },
  { emoji: "🏰🎡🇬🇧", answer: "伦敦", options: ["伦敦", "巴黎", "柏林", "阿姆斯特丹"], category: "地名" },
  { emoji: "🐫🏜️🔺", answer: "埃及", options: ["埃及", "摩洛哥", "迪拜", "土耳其"], category: "地名" },
  { emoji: "🐉🏮🧧", answer: "中国", options: ["中国", "日本", "越南", "泰国"], category: "地名" },
  { emoji: "🍝🏟️🇮🇹", answer: "罗马", options: ["罗马", "米兰", "巴黎", "巴塞罗那"], category: "地名" },
  { emoji: "🎰🌃💰", answer: "拉斯维加斯", options: ["拉斯维加斯", "澳门", "摩纳哥", "迪拜"], category: "地名" },
  { emoji: "🎭🗽🌉", answer: "旧金山", options: ["旧金山", "纽约", "西雅图", "波特兰"], category: "地名" },

  // === 其他 (5) ===
  { emoji: "🎅🎄🎁", answer: "圣诞节", options: ["圣诞节", "新年", "感恩节", "万圣节"], category: "节日" },
  { emoji: "🎃👻🍬", answer: "万圣节", options: ["万圣节", "圣诞节", "鬼节", "愚人节"], category: "节日" },
  { emoji: "⚽🏆🌍", answer: "世界杯", options: ["世界杯", "奥运会", "欧洲杯", "亚洲杯"], category: "运动" },
  { emoji: "🏀🦅🇺🇸", answer: "NBA", options: ["NBA", "CBA", "世锦赛", "奥运会"], category: "运动" },
  { emoji: "🎮👾🕹️", answer: "电子游戏", options: ["电子游戏", "桌游", "VR", "电竞"], category: "其他" },
];
```

- [ ] **Step 3: Write game logic (JS)**

```javascript
(function() {
  // Stars animation (same as typing game)
  const starsEl = document.getElementById('stars');
  for (let i = 0; i < 45; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 100 + '%';
    s.style.setProperty('--dur', (1.5 + Math.random() * 2.5) + 's');
    s.style.animationDelay = Math.random() * 2 + 's';
    starsEl.appendChild(s);
  }

  // QUESTIONS array defined here (see Step 2)

  const TOTAL_QUESTIONS = 10;
  const TIME_PER_QUESTION = 15; // seconds

  const startScreen = document.getElementById('startScreen');
  const gameArea = document.getElementById('gameArea');
  const resultsPanel = document.getElementById('resultsPanel');
  const btnStart = document.getElementById('btnStart');
  const btnRestart = document.getElementById('btnRestart');
  const btnSubmit = document.getElementById('btnSubmit');
  const btnLoginToSubmit = document.getElementById('btnLoginToSubmit');
  const submitMsg = document.getElementById('submitMsg');
  const questionNum = document.getElementById('questionNum');
  const questionTimer = document.getElementById('questionTimer');
  const emojiDisplay = document.getElementById('emojiDisplay');
  const categoryTag = document.getElementById('categoryTag');
  const optionsGrid = document.getElementById('optionsGrid');
  const resultScore = document.getElementById('resultScore');
  const resultTime = document.getElementById('resultTime');
  const resultAccuracy = document.getElementById('resultAccuracy');
  const userBar = document.getElementById('userBar');
  const userNameEl = document.getElementById('userName');
  const btnLogout = document.getElementById('btnLogout');
  const leaderboardBody = document.getElementById('leaderboardBody');
  const myRankInfo = document.getElementById('myRankInfo');

  let currentQuestions = [];  // 10 questions for this round
  let currentIndex = 0;
  let correctCount = 0;
  let gameStartTime = 0;     // When game started (for total time)
  let questionTimerId = null;
  let questionStartTime = 0;

  function updateAuthUI() {
    if (window.TommyAuth.isLoggedIn()) {
      const user = window.TommyAuth.getUser();
      userBar.style.display = 'flex';
      userNameEl.textContent = user ? user.nickname : 'Unknown';
    } else {
      userBar.style.display = 'none';
    }
  }

  btnLogout.addEventListener('click', () => {
    window.TommyAuth.clear();
    updateAuthUI();
    fetchLeaderboard();
  });

  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startGame() {
    currentQuestions = shuffleArray(QUESTIONS).slice(0, TOTAL_QUESTIONS);
    currentIndex = 0;
    correctCount = 0;
    gameStartTime = performance.now();

    startScreen.style.display = 'none';
    resultsPanel.style.display = 'none';
    gameArea.style.display = 'block';

    showQuestion();
  }

  function showQuestion() {
    const q = currentQuestions[currentIndex];
    questionNum.textContent = `${currentIndex + 1} / ${TOTAL_QUESTIONS}`;
    emojiDisplay.textContent = q.emoji;
    categoryTag.textContent = q.category;

    // Shuffle options
    const shuffledOptions = shuffleArray(q.options);
    optionsGrid.innerHTML = '';
    shuffledOptions.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.textContent = opt;
      btn.addEventListener('click', () => handleAnswer(btn, opt, q.answer));
      optionsGrid.appendChild(btn);
    });

    // Start per-question timer
    let timeLeft = TIME_PER_QUESTION;
    questionTimer.textContent = timeLeft + 's';
    questionTimer.classList.remove('urgent');

    clearInterval(questionTimerId);
    questionTimerId = setInterval(() => {
      timeLeft--;
      questionTimer.textContent = timeLeft + 's';
      if (timeLeft <= 5) questionTimer.classList.add('urgent');
      if (timeLeft <= 0) {
        clearInterval(questionTimerId);
        handleTimeout();
      }
    }, 1000);
  }

  function handleAnswer(selectedBtn, selected, correct) {
    clearInterval(questionTimerId);

    // Disable all buttons
    const buttons = optionsGrid.querySelectorAll('.option-btn');
    buttons.forEach(b => b.disabled = true);

    if (selected === correct) {
      selectedBtn.classList.add('correct');
      correctCount++;
      setTimeout(nextQuestion, 800);
    } else {
      selectedBtn.classList.add('wrong');
      // Highlight correct answer
      buttons.forEach(b => {
        if (b.textContent === correct) b.classList.add('correct');
      });
      setTimeout(nextQuestion, 1500);
    }
  }

  function handleTimeout() {
    const buttons = optionsGrid.querySelectorAll('.option-btn');
    buttons.forEach(b => {
      b.disabled = true;
      const q = currentQuestions[currentIndex];
      if (b.textContent === q.answer) b.classList.add('correct');
    });
    setTimeout(nextQuestion, 1500);
  }

  function nextQuestion() {
    currentIndex++;
    if (currentIndex < TOTAL_QUESTIONS) {
      showQuestion();
    } else {
      endGame();
    }
  }

  function endGame() {
    clearInterval(questionTimerId);
    const totalTimeMs = Math.round(performance.now() - gameStartTime);
    const totalTimeSec = (totalTimeMs / 1000).toFixed(1);
    const compositeScore = correctCount * 10000 - totalTimeMs;

    gameArea.style.display = 'none';
    resultsPanel.style.display = 'block';

    resultScore.textContent = correctCount;
    resultScore.dataset.value = Math.max(1, compositeScore); // min 1 for API
    resultTime.textContent = totalTimeSec + 's';
    resultAccuracy.textContent = Math.round((correctCount / TOTAL_QUESTIONS) * 100) + '%';

    if (window.TommyAuth.isLoggedIn()) {
      btnSubmit.style.display = 'block';
      btnLoginToSubmit.style.display = 'none';
    } else {
      btnSubmit.style.display = 'none';
      btnLoginToSubmit.style.display = 'block';
    }
    submitMsg.textContent = '';
    btnSubmit.disabled = false;
  }

  btnStart.addEventListener('click', startGame);
  btnRestart.addEventListener('click', () => {
    resultsPanel.style.display = 'none';
    startScreen.style.display = 'block';
    // Or directly startGame() — designer's choice. Using start screen for cleaner UX.
    startGame();
  });
```

- [ ] **Step 4: Write score submission logic (JS)**

```javascript
  btnSubmit.addEventListener('click', async () => {
    if (!window.TommyAuth.isLoggedIn()) return;
    btnSubmit.disabled = true;
    submitMsg.textContent = '提交中...';
    submitMsg.style.color = 'var(--text-main)';

    try {
      const score = parseInt(resultScore.dataset.value);
      const resp = await window.TommyAuth.fetchWithAuth('/api/scores', {
        method: 'POST',
        body: JSON.stringify({ game: 'emoji', time: score })
      });
      const data = await resp.json();
      if (resp.ok && data.ok) {
        submitMsg.textContent = '提交成功！排行榜已更新';
        submitMsg.style.color = 'var(--pixel-green)';
        fetchLeaderboard();
      } else {
        submitMsg.textContent = '错误: ' + (data.error || '提交失败');
        submitMsg.style.color = 'var(--pixel-pink)';
        btnSubmit.disabled = false;
      }
    } catch (err) {
      submitMsg.textContent = '网络错误';
      submitMsg.style.color = 'var(--pixel-pink)';
      btnSubmit.disabled = false;
    }
  });
```

- [ ] **Step 5: Write leaderboard + player card (JS)**

Leaderboard renders differently from typing: display decoded score (答对数 + 用时) instead of raw number.

```javascript
  function escapeHTML(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
  }

  async function fetchLeaderboard() {
    try {
      const resp = await window.TommyAuth.fetchWithAuth('/api/scores?game=emoji');
      if (resp.ok) {
        const data = await resp.json();
        renderLeaderboard(data.leaderboard, data.me);
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard', err);
    }
  }

  function decodeScore(compositeScore) {
    const correct = Math.ceil(compositeScore / 10000);
    const timeMs = correct * 10000 - compositeScore;
    return { correct, timeMs };
  }

  function renderLeaderboard(leaderboard, me) {
    if (!leaderboard || leaderboard.length === 0) {
      leaderboardBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-dim);">暂无数据</td></tr>';
      return;
    }

    leaderboardBody.innerHTML = '';

    leaderboard.forEach((item, idx) => {
      const tr = document.createElement('tr');
      const rank = item.rank || (idx + 1);
      let rankClass = '';
      if (rank === 1) rankClass = 'rank-1';
      else if (rank === 2) rankClass = 'rank-2';
      else if (rank === 3) rankClass = 'rank-3';

      const avatarId = typeof item.avatar_id !== 'undefined' ? item.avatar_id : 0;
      const { correct, timeMs } = decodeScore(item.best_time);

      const rankTd = document.createElement('td');
      rankTd.className = rankClass;
      rankTd.textContent = rank;

      const nameTd = document.createElement('td');
      nameTd.style.cursor = 'pointer';
      nameTd.style.display = 'flex';
      nameTd.style.alignItems = 'center';
      nameTd.style.gap = '8px';
      if (window.TommyAvatars) {
        nameTd.appendChild(window.TommyAvatars.create(avatarId, 24));
      }
      const nameSpan = document.createElement('span');
      nameSpan.textContent = item.nickname;
      nameTd.appendChild(nameSpan);
      nameTd.onclick = () => showPlayerCard(item);

      const correctTd = document.createElement('td');
      correctTd.style.textAlign = 'right';
      correctTd.textContent = correct + '/10';

      const timeTd = document.createElement('td');
      timeTd.style.textAlign = 'right';
      timeTd.textContent = (timeMs / 1000).toFixed(1) + 's';

      const countTd = document.createElement('td');
      countTd.style.textAlign = 'right';
      countTd.textContent = item.play_count;

      tr.appendChild(rankTd);
      tr.appendChild(nameTd);
      tr.appendChild(correctTd);
      tr.appendChild(timeTd);
      tr.appendChild(countTd);
      leaderboardBody.appendChild(tr);
    });

    if (me && me.rank > 10) {
      const { correct, timeMs } = decodeScore(me.best_time);
      myRankInfo.innerHTML = `你在排行榜中位列第 <b>${me.rank}</b> 名 (${correct}/10, ${(timeMs/1000).toFixed(1)}s)`;
    } else if (!me && window.TommyAuth.isLoggedIn()) {
      myRankInfo.textContent = '你还没有提交过成绩，快来挑战吧！';
    } else {
      myRankInfo.textContent = '';
    }
  }

  function showPlayerCard(item) {
    const overlay = document.createElement('div');
    overlay.className = 'player-card-overlay';
    const card = document.createElement('div');
    card.className = 'player-card';
    const avatarId = typeof item.avatar_id !== 'undefined' ? item.avatar_id : 0;
    const avatarCanvas = window.TommyAvatars ? window.TommyAvatars.create(avatarId, 64) : document.createElement('canvas');
    const p = document.createElement('p');
    p.textContent = item.nickname;
    const nickname = p.innerHTML;
    p.textContent = item.bio || '这个人很懒，什么都没写';
    const bio = p.innerHTML;
    card.innerHTML = `
      <h3>${nickname}</h3>
      <div class="player-bio">${bio}</div>
      <button class="btn-close-card">关闭</button>
    `;
    card.prepend(avatarCanvas);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    const close = () => document.body.removeChild(overlay);
    overlay.onclick = e => { if (e.target === overlay) close(); };
    card.querySelector('.btn-close-card').onclick = close;
  }

  // Init
  updateAuthUI();
  fetchLeaderboard();
})();
```

- [ ] **Step 6: Commit**

```bash
git add games/emoji/index.html
git commit -m "feat: Emoji 猜猜猜游戏页面"
```

---

### Task 3: Homepage — Update Emoji game card link

**Files:**
- Modify: `index.html` (lines 621-638)

**Assigned to: Gemini**

- [ ] **Step 1: Update the game card**

Replace lines 621-638:

```html
    <a href="games/emoji/index.html" class="game-card fade-in">
      <div class="game-card-preview g3">🎬</div>
      <div class="game-card-info">
        <h3>Emoji 猜猜猜</h3>
        <p>用 Emoji 组合描述电影/歌曲，考验你的脑洞</p>
        <div class="difficulty">
          <span class="filled"></span>
          <span class="filled"></span>
          <span class="filled"></span>
          <span></span>
          <span></span>
        </div>
      </div>
      <span class="play-btn">PLAY →</span>
    </a>
```

Changes: `href="#"` → `href="games/emoji/index.html"`, remove `<span class="coming">COMING SOON</span>`, change `SOON ⏳` → `PLAY →`.

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: 首页 Emoji 猜猜猜入口上线"
```

---

### Task 4: Integration review

**Assigned to: Claude (review)**

- [ ] **Step 1: Verify backend**
- `DESC_GAMES` contains both 'typing' and 'emoji'
- GAME_RANGES has per-game validation (emoji: 1-100000)
- Existing typing and reaction behavior unchanged

- [ ] **Step 2: Verify frontend**
- Page loads with pixel art theme
- 10 questions, random selection, shuffled options
- 15s timer per question, urgent flash at 5s
- Correct/wrong feedback with colors
- Timeout shows correct answer
- Results: correct count, time, accuracy
- Composite score calculation correct
- Leaderboard decodes score properly (答对数 + 用时)
- Player card modal works
- Auth flow works (login prompt / submit)

- [ ] **Step 3: Verify homepage**
- Emoji 猜猜猜 card links to game, shows PLAY →

- [ ] **Step 4: Fix any issues found**
