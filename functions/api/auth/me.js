import { optionsResponse, jsonResponse, extractUser } from './_helpers.js';

export async function onRequestOptions() {
  return optionsResponse();
}

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const payload = await extractUser(request, env);
    if (!payload || !payload.userId) {
      return jsonResponse({ error: '未登录或登录已过期' }, 401);
    }

    const user = await env.DB.prepare(
      `SELECT id, nickname, email, avatar_id, bio, created_at
       FROM users
       WHERE id = ? AND verified = 1
       LIMIT 1`
    )
      .bind(payload.userId)
      .first();

    if (!user) {
      return jsonResponse({ error: '用户不存在或未激活' }, 401);
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
    console.error('Me API error:', err);
    return jsonResponse({ error: '获取用户信息失败，请稍后再试' }, 500);
  }
}
