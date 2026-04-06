import { optionsResponse, jsonResponse, extractUser } from './_helpers.js';

export async function onRequestOptions() {
  return optionsResponse();
}

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const userIdParam = (url.searchParams.get('userId') || '').trim();

    if (userIdParam) {
      const userId = Number(userIdParam);
      if (!Number.isInteger(userId) || userId <= 0) {
        return jsonResponse({ error: 'userId 参数无效' }, 400);
      }

      const user = await env.DB.prepare(
        `SELECT id, nickname, avatar_id, bio, created_at
         FROM users
         WHERE id = ?
         LIMIT 1`
      )
        .bind(userId)
        .first();

      if (!user) {
        return jsonResponse({ error: '用户不存在' }, 404);
      }

      return jsonResponse(
        {
          ok: true,
          user: {
            id: user.id,
            nickname: user.nickname,
            avatar_id: user.avatar_id,
            bio: user.bio,
            created_at: user.created_at,
          },
        },
        200
      );
    }

    const payload = await extractUser(request, env);
    if (!payload || !payload.userId) {
      return jsonResponse({ error: '未登录或登录已过期' }, 401);
    }

    const user = await env.DB.prepare(
      `SELECT id, nickname, email, avatar_id, bio, created_at
       FROM users
       WHERE id = ?
       LIMIT 1`
    )
      .bind(payload.userId)
      .first();

    if (!user) {
      return jsonResponse({ error: '用户不存在' }, 404);
    }

    return jsonResponse(
      {
        ok: true,
        user: {
          id: user.id,
          nickname: user.nickname,
          email: user.email,
          avatar_id: user.avatar_id,
          bio: user.bio,
          created_at: user.created_at,
        },
      },
      200
    );
  } catch (err) {
    console.error('Profile GET API error:', err);
    return jsonResponse({ error: '获取用户资料失败，请稍后再试' }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await extractUser(request, env);
    if (!payload || !payload.userId) {
      return jsonResponse({ error: '未登录或登录已过期' }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: '请求体必须是合法的 JSON' }, 400);
    }

    const updates = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(body, 'nickname')) {
      if (typeof body.nickname !== 'string') {
        return jsonResponse({ error: 'nickname 必须是字符串' }, 400);
      }

      const nickname = body.nickname.trim();
      if (nickname.length < 1 || nickname.length > 20) {
        return jsonResponse({ error: 'nickname 长度必须在 1 到 20 个字符之间' }, 400);
      }

      updates.push('nickname = ?');
      values.push(nickname);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'avatar_id')) {
      const avatarId = Number(body.avatar_id);
      if (!Number.isInteger(avatarId) || avatarId < 0 || avatarId > 47) {
        return jsonResponse({ error: 'avatar_id 必须是 0 到 47 的整数' }, 400);
      }

      updates.push('avatar_id = ?');
      values.push(avatarId);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'bio')) {
      if (typeof body.bio !== 'string') {
        return jsonResponse({ error: 'bio 必须是字符串' }, 400);
      }

      if (body.bio.length > 100) {
        return jsonResponse({ error: 'bio 长度不能超过 100 个字符' }, 400);
      }

      updates.push('bio = ?');
      values.push(body.bio);
    }

    if (updates.length > 0) {
      await env.DB.prepare(
        `UPDATE users
         SET ${updates.join(', ')}
         WHERE id = ?`
      )
        .bind(...values, payload.userId)
        .run();
    }

    const user = await env.DB.prepare(
      `SELECT id, nickname, email, avatar_id, bio
       FROM users
       WHERE id = ?
       LIMIT 1`
    )
      .bind(payload.userId)
      .first();

    if (!user) {
      return jsonResponse({ error: '用户不存在' }, 404);
    }

    return jsonResponse(
      {
        ok: true,
        user: {
          id: user.id,
          nickname: user.nickname,
          email: user.email,
          avatar_id: user.avatar_id,
          bio: user.bio,
        },
      },
      200
    );
  } catch (err) {
    console.error('Profile POST API error:', err);
    return jsonResponse({ error: '更新用户资料失败，请稍后再试' }, 500);
  }
}
