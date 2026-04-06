import {
  CORS_HEADERS,
  optionsResponse,
  jsonResponse,
  extractUser,
} from './auth/_helpers.js';

void CORS_HEADERS;

export async function onRequestOptions() {
  return optionsResponse();
}

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const game = (url.searchParams.get('game') || '').trim();

    if (!game) {
      return jsonResponse({ error: '缺少必填参数 game' }, 400);
    }

    const { results } = await env.DB.prepare(
      `SELECT s.best_time, s.play_count, u.nickname, u.avatar_id, u.bio
       FROM scores s
       JOIN users u ON s.user_id = u.id
       WHERE s.game = ?
       ORDER BY s.best_time ASC
       LIMIT 10`
    )
      .bind(game)
      .all();

    const leaderboard = (results || []).map((item, index) => ({
      rank: index + 1,
      best_time: item.best_time,
      play_count: item.play_count,
      nickname: item.nickname,
      avatar_id: item.avatar_id,
      bio: item.bio,
    }));

    let me = null;
    const payload = await extractUser(request, env);
    if (payload && payload.userId) {
      const meScore = await env.DB.prepare(
        `SELECT best_time, play_count
         FROM scores
         WHERE user_id = ? AND game = ?
         LIMIT 1`
      )
        .bind(payload.userId, game)
        .first();

      if (meScore) {
        const rankRow = await env.DB.prepare(
          `SELECT COUNT(*) AS count
           FROM scores
           WHERE game = ? AND best_time < ?`
        )
          .bind(game, meScore.best_time)
          .first();

        me = {
          best_time: meScore.best_time,
          play_count: meScore.play_count,
          rank: Number(rankRow?.count || 0) + 1,
        };
      }
    }

    return jsonResponse({ leaderboard, me }, 200);
  } catch (err) {
    console.error('Scores GET API error:', err);
    return jsonResponse({ error: '获取排行榜失败，请稍后再试' }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await extractUser(request, env);
    if (!payload || !payload.userId) {
      return jsonResponse({ error: '未登录或登录已过期' }, 401);
    }

    const verifiedUser = await env.DB.prepare(
      `SELECT id
       FROM users
       WHERE id = ? AND verified = 1
       LIMIT 1`
    )
      .bind(payload.userId)
      .first();

    if (!verifiedUser) {
      return jsonResponse({ error: '用户不存在或未激活' }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: '请求体必须是合法的 JSON' }, 400);
    }

    const game = typeof body?.game === 'string' ? body.game.trim() : '';
    const parsedTime = Number(body?.time);

    if (!game) {
      return jsonResponse({ error: '缺少必填字段 game' }, 400);
    }

    if (!Number.isFinite(parsedTime) || parsedTime < 50 || parsedTime > 5000) {
      return jsonResponse({ error: 'time 必须是 50 到 5000 之间的数字' }, 400);
    }

    const time = Math.round(parsedTime);
    const now = new Date().toISOString();

    const existing = await env.DB.prepare(
      `SELECT id, best_time, play_count
       FROM scores
       WHERE user_id = ? AND game = ?
       LIMIT 1`
    )
      .bind(payload.userId, game)
      .first();

    let bestTime;
    let playCount;

    if (existing) {
      bestTime = Math.min(Number(existing.best_time), time);
      playCount = Number(existing.play_count) + 1;

      await env.DB.prepare(
        `UPDATE scores
         SET best_time = ?, play_count = ?, updated_at = ?
         WHERE id = ?`
      )
        .bind(bestTime, playCount, now, existing.id)
        .run();
    } else {
      bestTime = time;
      playCount = 1;

      await env.DB.prepare(
        `INSERT INTO scores (user_id, game, best_time, play_count, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(payload.userId, game, bestTime, playCount, now)
        .run();
    }

    const rankRow = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM scores
       WHERE game = ? AND best_time < ?`
    )
      .bind(game, bestTime)
      .first();

    const rank = Number(rankRow?.count || 0) + 1;

    return jsonResponse(
      {
        ok: true,
        best_time: bestTime,
        play_count: playCount,
        rank,
      },
      200
    );
  } catch (err) {
    console.error('Scores POST API error:', err);
    return jsonResponse({ error: '提交成绩失败，请稍后再试' }, 500);
  }
}
