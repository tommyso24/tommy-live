# 打字大挑战 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 30-second English typing speed test game with strict mode and WPM leaderboard.

**Architecture:** Single HTML page (`games/typing/index.html`) with inline CSS/JS, reusing the existing auth/avatar/site-chrome system. Backend `scores.js` modified to support both ASC (reaction) and DESC (typing) leaderboard sorting. Homepage updated to link the new game.

**Tech Stack:** HTML/CSS/JS (no framework), Cloudflare Pages Functions, D1 SQLite

---

### Task 1: Backend — Modify `scores.js` to support DESC sorting for typing game

**Files:**
- Modify: `functions/api/scores.js`

**Assigned to: Codex**

**Context:** Currently `scores.js` hardcodes `ORDER BY s.best_time ASC` and uses `Math.min` for best score comparison. The typing game needs DESC (higher WPM = better) and `Math.max`. We need to branch on game type.

- [ ] **Step 1: Define game config at top of file**

Add after the imports (line 6):

```javascript
// Games where higher score = better (DESC sort)
const DESC_GAMES = new Set(['typing']);
```

- [ ] **Step 2: Update GET handler — dynamic sort order**

Replace the leaderboard query (lines 25-34) with:

```javascript
    const isDesc = DESC_GAMES.has(game);
    const orderDir = isDesc ? 'DESC' : 'ASC';

    const { results } = await env.DB.prepare(
      `SELECT s.best_time, s.play_count, u.nickname, u.avatar_id, u.bio
       FROM scores s
       JOIN users u ON s.user_id = u.id
       WHERE s.game = ?
       ORDER BY s.best_time ${orderDir}
       LIMIT 10`
    )
      .bind(game)
      .all();
```

- [ ] **Step 3: Update GET handler — dynamic rank comparison**

Replace the rank query (lines 58-64) with:

```javascript
        const rankOp = isDesc ? '>' : '<';
        const rankRow = await env.DB.prepare(
          `SELECT COUNT(*) AS count
           FROM scores
           WHERE game = ? AND best_time ${rankOp} ?`
        )
          .bind(game, meScore.best_time)
          .first();
```

- [ ] **Step 4: Update POST handler — validation range**

Replace the validation (line 117) with:

```javascript
    const isDesc = DESC_GAMES.has(game);
    const minVal = isDesc ? 1 : 50;
    const maxVal = isDesc ? 300 : 5000;

    if (!Number.isFinite(parsedTime) || parsedTime < minVal || parsedTime > maxVal) {
      return jsonResponse({ error: `time 必须是 ${minVal} 到 ${maxVal} 之间的数字` }, 400);
    }
```

- [ ] **Step 5: Update POST handler — best score comparison**

Replace `bestTime = Math.min(...)` (line 137) with:

```javascript
      bestTime = isDesc
        ? Math.max(Number(existing.best_time), time)
        : Math.min(Number(existing.best_time), time);
```

- [ ] **Step 6: Update POST handler — rank comparison**

Replace the rank query (lines 159-165) with:

```javascript
    const rankOp = isDesc ? '>' : '<';
    const rankRow = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM scores
       WHERE game = ? AND best_time ${rankOp} ?`
    )
      .bind(game, bestTime)
      .first();
```

- [ ] **Step 7: Commit**

```bash
git add functions/api/scores.js
git commit -m "feat: scores API 支持 typing 游戏降序排行榜"
```

---

### Task 2: Frontend — Create `games/typing/index.html`

**Files:**
- Create: `games/typing/index.html`

**Assigned to: Gemini**

**Context:** Build the complete typing game page. Follow the exact same structure as `games/reaction/index.html`: single HTML file with inline `<style>` and `<script>`, same CSS variables, same star background, same leaderboard/player-card pattern. Use `game = 'typing'` when calling the scores API. The page should be ~600-800 lines.

**Reference files to study before coding:**
- `games/reaction/index.html` — page structure, CSS variables, leaderboard rendering, player card modal, auth UI pattern
- `assets/auth.js` — `TommyAuth.isLoggedIn()`, `TommyAuth.getUser()`, `TommyAuth.fetchWithAuth()`
- `assets/avatars.js` — `TommyAvatars.create(avatarId, size)`
- `assets/site-chrome.js` / `assets/site-chrome.css` — navigation bar

- [ ] **Step 1: Create HTML skeleton**

File: `games/typing/index.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>打字大挑战 — Tommy.live</title>
<link rel="icon" href="../../assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../assets/site-chrome.css">
<style>
/* CSS goes here — see Step 2 */
</style>
</head>
<body>
<div class="stars" id="stars"></div>
<main>
  <h1>⌨️ 打字大挑战</h1>
  <p class="subtitle">30 秒英文打字速度测试</p>

  <!-- Game area -->
  <div class="game-container" id="gameContainer">
    <div class="timer-bar">
      <span id="timerDisplay">30.0s</span>
      <span id="wpmLive">0 WPM</span>
    </div>
    <div class="text-display" id="textDisplay"></div>
    <input type="text" id="typingInput" class="typing-input" placeholder="点击这里开始打字..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
    <p class="game-hint" id="gameHint">点击输入框，开始打字即计时</p>
  </div>

  <!-- Results panel (hidden initially) -->
  <div class="results-panel" id="resultsPanel" style="display: none;">
    <h2>挑战结束！</h2>
    <div class="result-big" id="resultWPM">0</div>
    <p class="result-label">WPM (每分钟字数)</p>
    <div class="result-details">
      <div class="detail-item">
        <span class="detail-value" id="resultChars">0</span>
        <span class="detail-label">正确字符</span>
      </div>
      <div class="detail-item">
        <span class="detail-value" id="resultAccuracy">0%</span>
        <span class="detail-label">完成度</span>
      </div>
    </div>
    <div class="result-actions">
      <button class="btn-game btn-primary" id="btnRestart">再来一局</button>
      <button class="btn-game btn-secondary" id="btnSubmit">提交成绩</button>
      <a href="../../auth/login.html?return=../games/typing/index.html" class="btn-game btn-secondary" id="btnLoginToSubmit" style="text-decoration: none; display: none;">登录后提交</a>
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
          <th style="text-align: right;">最佳 WPM</th>
          <th style="text-align: right;">挑战次数</th>
        </tr>
      </thead>
      <tbody id="leaderboardBody">
        <tr><td colspan="4" style="text-align: center; color: var(--text-dim);">加载中...</td></tr>
      </tbody>
    </table>
    <div id="myRankInfo" class="my-rank-info"></div>
  </div>
</main>

<script src="../../assets/auth.js"></script>
<script src="../../assets/avatars.js"></script>
<script>
/* JS goes here — see Steps 3-7 */
</script>
<script src="../../assets/site-chrome.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write CSS styles**

Use the same CSS variables as reaction game. Key styles needed:

```css
:root {
  --bg-dark: #0f0e17;
  --bg-card: #1a1925;
  --bg-card-hover: #232136;
  --pixel-green: #2de2a6;
  --pixel-pink: #ff6b9d;
  --pixel-blue: #4cc9f0;
  --pixel-yellow: #f7d754;
  --pixel-orange: #ff9e64;
  --pixel-purple: #c77dff;
  --text-main: #e8e4f0;
  --text-dim: #8b8598;
  --border-color: #2e2b3a;
  --pixel-size: 4px;
}

/* Copy base styles from reaction game: *, body, body::after (scanline), .stars, .star, @keyframes twinkle, main, h1, .subtitle */

/* Game-specific styles: */
.game-container {
  background: var(--bg-card);
  border: 3px solid var(--border-color);
  padding: 24px;
  margin-bottom: 32px;
}

.timer-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  font-family: 'Press Start 2P', cursive;
  font-size: 14px;
}

#timerDisplay { color: var(--pixel-yellow); }
#wpmLive { color: var(--pixel-green); }

.text-display {
  background: rgba(0,0,0,0.3);
  border: 2px solid var(--border-color);
  padding: 20px;
  margin-bottom: 16px;
  font-family: 'VT323', monospace;
  font-size: 24px;
  line-height: 1.8;
  min-height: 120px;
  user-select: none;
}

.text-display .char { /* individual character span */ }
.text-display .char.correct { color: var(--pixel-green); }
.text-display .char.current { background: rgba(76, 201, 240, 0.3); border-bottom: 2px solid var(--pixel-blue); }
.text-display .char.wrong { color: var(--pixel-pink); background: rgba(255, 107, 157, 0.2); }
.text-display .char.upcoming { color: var(--text-dim); }

.typing-input {
  width: 100%;
  background: rgba(0,0,0,0.4);
  border: 2px solid var(--border-color);
  color: var(--text-main);
  font-family: 'VT323', monospace;
  font-size: 24px;
  padding: 12px 16px;
  outline: none;
}

.typing-input:focus { border-color: var(--pixel-blue); }

.game-hint {
  text-align: center;
  color: var(--text-dim);
  margin-top: 8px;
}

/* Results panel: result-big (large WPM number), result-details grid, btn-game styles */
/* Copy from reaction: .results-panel, .btn-game, .btn-primary, .btn-secondary */

.result-big {
  font-family: 'Press Start 2P', cursive;
  font-size: clamp(36px, 8vw, 56px);
  color: var(--pixel-green);
  text-align: center;
  margin: 16px 0 4px;
}

.result-label {
  text-align: center;
  color: var(--text-dim);
  margin-bottom: 16px;
}

.result-details {
  display: flex;
  justify-content: center;
  gap: 32px;
  margin-bottom: 24px;
}

.detail-item { text-align: center; }
.detail-value { font-size: 28px; color: var(--pixel-yellow); display: block; }
.detail-label { color: var(--text-dim); font-size: 16px; }

/* Leaderboard: copy EXACTLY from reaction game — .leaderboard, .score-table, .rank-1/2/3, .my-rank-info, .player-card-overlay, .player-card, .btn-close-card */
```

- [ ] **Step 3: Write sentence bank (JS)**

```javascript
const SENTENCES = [
  "The quick brown fox jumps over the lazy dog near the river bank.",
  "Programming is the art of telling another human what one wants the computer to do.",
  "A journey of a thousand miles begins with a single step forward.",
  "To be yourself in a world that is constantly trying to make you something else is the greatest accomplishment.",
  "The only way to do great work is to love what you do every single day.",
  "In the middle of difficulty lies opportunity waiting to be discovered.",
  "Life is what happens when you are busy making other plans for the future.",
  "The best time to plant a tree was twenty years ago and the second best time is now.",
  "Success is not final and failure is not fatal it is the courage to continue that counts.",
  "Do not go where the path may lead but go instead where there is no path and leave a trail.",
  "It does not matter how slowly you go as long as you do not stop moving forward.",
  "The greatest glory in living lies not in never falling but in rising every time we fall.",
  "Tell me and I forget teach me and I remember involve me and I learn something new.",
  "You must be the change you wish to see in the world around you today.",
  "The future belongs to those who believe in the beauty of their dreams and aspirations.",
  "It is during our darkest moments that we must focus to see the light ahead.",
  "Whoever is happy will make others happy too and spread joy everywhere they go.",
  "The purpose of our lives is to be happy and to make the world a better place.",
  "Many of life great failures are people who did not realize how close they were to success.",
  "If you look at what you have in life you will always have more to be grateful for.",
  "The mind is everything and what you think is what you become in the end.",
  "Strive not to be a success but rather to be of value to those around you.",
  "I have not failed I have just found ten thousand ways that will not work yet.",
  "The only impossible journey is the one you never begin to take in your life.",
  "Believe you can and you are already halfway there on the road to success.",
  "Everything you have ever wanted is on the other side of fear and doubt.",
  "We are what we repeatedly do therefore excellence is not an act but a habit.",
  "The secret of getting ahead is simply getting started with small steps today.",
  "Quality is not an act it is a habit that we develop through practice each day.",
  "Innovation distinguishes between a leader and a follower in every field of work.",
  "Stay hungry stay foolish and never stop learning new things about the world.",
  "Your time is limited so do not waste it living someone else dream or vision.",
  "What lies behind us and what lies before us are tiny matters compared to what lies within us.",
  "Creativity is intelligence having fun and exploring new possibilities every day.",
  "The best revenge is massive success in everything you set your mind to achieve.",
  "If you want to lift yourself up try lifting up someone else who needs help today.",
  "The only person you are destined to become is the person you decide to be right now.",
  "Go confidently in the direction of your dreams and live the life you have imagined.",
  "Act as if what you do makes a difference because it really does matter in the end.",
  "What we achieve inwardly will change our outer reality and transform our world.",
];
```

40 sentences, all common English words, no punctuation complexity beyond periods and commas.

- [ ] **Step 4: Write game logic (JS)**

```javascript
(function() {
  // Stars
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

  const GAME_DURATION = 30; // seconds
  const textDisplay = document.getElementById('textDisplay');
  const typingInput = document.getElementById('typingInput');
  const timerDisplay = document.getElementById('timerDisplay');
  const wpmLive = document.getElementById('wpmLive');
  const gameHint = document.getElementById('gameHint');
  const gameContainer = document.getElementById('gameContainer');
  const resultsPanel = document.getElementById('resultsPanel');
  const resultWPM = document.getElementById('resultWPM');
  const resultChars = document.getElementById('resultChars');
  const resultAccuracy = document.getElementById('resultAccuracy');
  const btnRestart = document.getElementById('btnRestart');
  const btnSubmit = document.getElementById('btnSubmit');
  const btnLoginToSubmit = document.getElementById('btnLoginToSubmit');
  const submitMsg = document.getElementById('submitMsg');

  let gameText = '';       // The full text to type
  let charIndex = 0;       // Current position in gameText
  let startTime = 0;       // When typing started
  let timerInterval = null;
  let gameActive = false;
  let gameStarted = false;  // First key pressed?

  function generateText() {
    // Shuffle and pick enough sentences to fill ~300+ chars
    const shuffled = [...SENTENCES].sort(() => Math.random() - 0.5);
    let text = '';
    for (const s of shuffled) {
      text += (text ? ' ' : '') + s;
      if (text.length > 300) break;
    }
    return text;
  }

  function renderText() {
    textDisplay.innerHTML = '';
    for (let i = 0; i < gameText.length; i++) {
      const span = document.createElement('span');
      span.className = 'char';
      span.textContent = gameText[i];
      if (i < charIndex) {
        span.classList.add('correct');
      } else if (i === charIndex) {
        span.classList.add('current');
      } else {
        span.classList.add('upcoming');
      }
      textDisplay.appendChild(span);
    }
    // Auto-scroll: keep current char visible
    const currentEl = textDisplay.querySelector('.char.current');
    if (currentEl) {
      currentEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function initGame() {
    gameText = generateText();
    charIndex = 0;
    startTime = 0;
    gameActive = true;
    gameStarted = false;
    typingInput.value = '';
    typingInput.disabled = false;
    timerDisplay.textContent = GAME_DURATION.toFixed(1) + 's';
    wpmLive.textContent = '0 WPM';
    gameHint.textContent = '点击输入框，开始打字即计时';
    gameContainer.style.display = 'block';
    resultsPanel.style.display = 'none';
    renderText();
    typingInput.focus();
  }

  function startTimer() {
    startTime = performance.now();
    gameStarted = true;
    gameHint.textContent = '加油！打完尽可能多的文字';

    timerInterval = setInterval(() => {
      const elapsed = (performance.now() - startTime) / 1000;
      const remaining = Math.max(0, GAME_DURATION - elapsed);
      timerDisplay.textContent = remaining.toFixed(1) + 's';

      // Live WPM
      if (elapsed > 0) {
        const wpm = Math.round((charIndex / 5) / (elapsed / 60));
        wpmLive.textContent = wpm + ' WPM';
      }

      if (remaining <= 0) {
        endGame();
      }
    }, 100);
  }

  function endGame() {
    gameActive = false;
    clearInterval(timerInterval);
    typingInput.disabled = true;

    const elapsed = (performance.now() - startTime) / 1000;
    const wpm = Math.round((charIndex / 5) / (elapsed / 60));
    const accuracy = gameText.length > 0
      ? Math.round((charIndex / gameText.length) * 100)
      : 0;

    resultWPM.textContent = wpm;
    resultWPM.dataset.value = wpm;
    resultChars.textContent = charIndex;
    resultAccuracy.textContent = accuracy + '%';

    gameContainer.style.display = 'none';
    resultsPanel.style.display = 'block';

    // Auth-dependent buttons
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

  // Handle input
  typingInput.addEventListener('input', () => {
    if (!gameActive) return;

    // Start timer on first input
    if (!gameStarted) {
      startTimer();
    }

    const inputVal = typingInput.value;
    const lastChar = inputVal[inputVal.length - 1];
    const expectedChar = gameText[charIndex];

    if (lastChar === expectedChar) {
      charIndex++;
      typingInput.value = '';  // Clear input after correct char
      renderText();

      // Check if all text is typed
      if (charIndex >= gameText.length) {
        endGame();
      }
    } else {
      // Wrong character — mark current as wrong, don't advance
      const chars = textDisplay.querySelectorAll('.char');
      if (chars[charIndex]) {
        chars[charIndex].classList.remove('current');
        chars[charIndex].classList.add('wrong');
      }
      // Clear input so user must re-type
      typingInput.value = '';
      // Flash back to current after brief delay
      setTimeout(() => {
        if (chars[charIndex]) {
          chars[charIndex].classList.remove('wrong');
          chars[charIndex].classList.add('current');
        }
      }, 300);
    }
  });

  // Prevent pasting
  typingInput.addEventListener('paste', (e) => e.preventDefault());

  // Restart
  btnRestart.addEventListener('click', initGame);

  // Init on load
  initGame();
})();
```

- [ ] **Step 5: Write score submission logic (JS)**

```javascript
  btnSubmit.addEventListener('click', async () => {
    if (!window.TommyAuth.isLoggedIn()) return;

    btnSubmit.disabled = true;
    submitMsg.textContent = '提交中...';
    submitMsg.style.color = 'var(--text-main)';

    try {
      const wpm = parseInt(resultWPM.dataset.value);
      const resp = await window.TommyAuth.fetchWithAuth('/api/scores', {
        method: 'POST',
        body: JSON.stringify({
          game: 'typing',
          time: wpm
        })
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

- [ ] **Step 6: Write leaderboard + player card (JS)**

Copy the leaderboard pattern from reaction game, with these changes:
- API call: `/api/scores?game=typing`
- Column header: "最佳 WPM" instead of "最佳成绩"
- Display: `item.best_time + ' WPM'` instead of `item.best_time + 'ms'`
- My rank info: `你在排行榜中位列第 ${me.rank} 名 (最佳: ${me.best_time} WPM)`

```javascript
  function escapeHTML(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
  }

  async function fetchLeaderboard() {
    try {
      const resp = await window.TommyAuth.fetchWithAuth('/api/scores?game=typing');
      if (resp.ok) {
        const data = await resp.json();
        renderLeaderboard(data.leaderboard, data.me);
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard', err);
    }
  }

  function renderLeaderboard(leaderboard, me) {
    const leaderboardBody = document.getElementById('leaderboardBody');
    const myRankInfo = document.getElementById('myRankInfo');

    if (!leaderboard || leaderboard.length === 0) {
      leaderboardBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-dim);">暂无数据，成为第一个挑战者吧！</td></tr>';
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

      const rankTd = document.createElement('td');
      rankTd.className = rankClass;
      rankTd.textContent = rank;

      const nameTd = document.createElement('td');
      nameTd.style.cursor = 'pointer';
      nameTd.style.display = 'flex';
      nameTd.style.alignItems = 'center';
      nameTd.style.gap = '8px';
      if (window.TommyAvatars) {
        const avatarCanvas = window.TommyAvatars.create(avatarId, 24);
        nameTd.appendChild(avatarCanvas);
      }
      const nameSpan = document.createElement('span');
      nameSpan.textContent = item.nickname;
      nameTd.appendChild(nameSpan);
      nameTd.onclick = () => showPlayerCard(item);

      const wpmTd = document.createElement('td');
      wpmTd.style.textAlign = 'right';
      wpmTd.textContent = item.best_time + ' WPM';

      const countTd = document.createElement('td');
      countTd.style.textAlign = 'right';
      countTd.textContent = item.play_count;

      tr.appendChild(rankTd);
      tr.appendChild(nameTd);
      tr.appendChild(wpmTd);
      tr.appendChild(countTd);
      leaderboardBody.appendChild(tr);
    });

    if (me && me.rank > 10) {
      myRankInfo.innerHTML = `你在排行榜中位列第 <b>${me.rank}</b> 名 (最佳: ${me.best_time} WPM)`;
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
    card.innerHTML = `
      <h3>${escapeHTML(item.nickname)}</h3>
      <div class="player-bio">${escapeHTML(item.bio || '这个人很懒，什么都没写')}</div>
      <button class="btn-close-card">关闭</button>
    `;
    card.prepend(avatarCanvas);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    const close = () => document.body.removeChild(overlay);
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    card.querySelector('.btn-close-card').onclick = close;
  }

  // Init leaderboard on load
  fetchLeaderboard();
```

- [ ] **Step 7: Commit**

```bash
git add games/typing/index.html
git commit -m "feat: 打字大挑战游戏页面"
```

---

### Task 3: Homepage — Update game card link

**Files:**
- Modify: `index.html` (lines 640-657)

**Assigned to: Gemini**

**Context:** The "打字大挑战" game card on the homepage currently shows "COMING SOON" and links to `#`. Update it to link to the actual game page.

- [ ] **Step 1: Update the game card**

Replace the typing card (lines 640-657):

```html
    <a href="games/typing/index.html" class="game-card fade-in">
      <div class="game-card-preview g4">⌨️</div>
      <div class="game-card-info">
        <h3>打字大挑战</h3>
        <p>测试你的打字速度和准确率，晒出你的成绩</p>
        <div class="difficulty">
          <span class="filled"></span>
          <span class="filled"></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
      <span class="play-btn">PLAY →</span>
    </a>
```

Changes: `href="#"` → `href="games/typing/index.html"`, remove `<span class="coming">COMING SOON</span>`, change `SOON ⏳` → `PLAY →`.

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: 首页打字大挑战入口上线"
```

---

### Task 4: Integration testing

**Assigned to: Claude (review)**

- [ ] **Step 1: Verify backend changes**

Check `functions/api/scores.js` compiles and the logic is correct:
- `DESC_GAMES` set contains 'typing'
- GET: typing leaderboard sorts DESC
- GET: typing rank counts scores `>` current
- POST: typing validation range 1-300
- POST: typing uses `Math.max` for best score
- POST: typing rank counts scores `>` current
- Existing reaction game behavior unchanged (ASC, Math.min, 50-5000 range)

- [ ] **Step 2: Verify frontend page**

Open `games/typing/index.html` in browser:
- Page loads with pixel art theme, stars background, navigation
- Text display shows random English sentences
- Clicking input and typing starts the timer
- Correct characters turn green, cursor advances
- Wrong characters flash red, must re-type
- Timer counts down from 30.0s
- Live WPM updates during typing
- Game ends at 0.0s, shows results panel
- WPM, character count, completion % displayed
- Restart button works
- Login/submit button shows correctly based on auth state
- Leaderboard loads (empty initially, shows "暂无数据")

- [ ] **Step 3: Verify homepage**

Check index.html:
- 打字大挑战 card no longer shows "COMING SOON"
- Card links to `games/typing/index.html`
- Card shows "PLAY →"

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: 打字大挑战集成修复"
```
