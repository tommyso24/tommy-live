import { optionsResponse, jsonResponse, signJWT } from './_helpers.js';

export async function onRequestOptions() {
  return optionsResponse();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求体必须是合法的 JSON' }, 400);
  }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const code = typeof body?.code === 'string' ? body.code.trim() : '';

  if (!email || !code) {
    return jsonResponse({ error: '邮箱和验证码不能为空' }, 400);
  }

  try {
    const verification = await env.DB.prepare(
      `SELECT id, email, code, expires_at, used
       FROM verification_codes
       WHERE email = ? AND code = ? AND used = 0
       ORDER BY id DESC
       LIMIT 1`
    )
      .bind(email, code)
      .first();

    if (!verification) {
      return jsonResponse({ error: '验证码无效或已使用' }, 400);
    }

    const expiresAtMs = new Date(verification.expires_at).getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      await env.DB.prepare(
        `UPDATE verification_codes
         SET used = 1
         WHERE id = ?`
      )
        .bind(verification.id)
        .run();

      return jsonResponse({ error: '验证码已过期，请重新获取' }, 400);
    }

    await env.DB.prepare(
      `UPDATE verification_codes
       SET used = 1
       WHERE id = ?`
    )
      .bind(verification.id)
      .run();

    await env.DB.prepare(
      `UPDATE users
       SET verified = 1
       WHERE email = ?`
    )
      .bind(email)
      .run();

    const user = await env.DB.prepare(
      `SELECT id, nickname, email, is_admin
       FROM users
       WHERE email = ?
       LIMIT 1`
    )
      .bind(email)
      .first();

    if (!user) {
      return jsonResponse({ error: '用户不存在' }, 404);
    }

    if (!env.JWT_SECRET) {
      return jsonResponse({ error: '服务配置错误，请稍后再试' }, 500);
    }

    const token = await signJWT(
      { userId: user.id, nickname: user.nickname },
      env.JWT_SECRET
    );

    return jsonResponse(
      {
        ok: true,
        token,
        user: {
          id: user.id,
          nickname: user.nickname,
          email: user.email,
          is_admin: user.is_admin,
        },
      },
      200
    );
  } catch (err) {
    console.error('Verify API error:', err);
    return jsonResponse({ error: '验证失败，请稍后再试' }, 500);
  }
}
