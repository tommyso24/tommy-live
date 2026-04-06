import {
  optionsResponse,
  jsonResponse,
  verifyPassword,
  signJWT,
} from './_helpers.js';

const INVALID_CREDENTIALS_MSG = '邮箱或密码不正确';

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
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!email || !password) {
    return jsonResponse({ error: INVALID_CREDENTIALS_MSG }, 401);
  }

  try {
    const user = await env.DB.prepare(
      `SELECT id, nickname, email, password_hash, verified, is_admin
       FROM users
       WHERE email = ?
       LIMIT 1`
    )
      .bind(email)
      .first();

    if (!user || Number(user.verified) !== 1) {
      return jsonResponse({ error: INVALID_CREDENTIALS_MSG }, 401);
    }

    const matched = await verifyPassword(password, user.password_hash);
    if (!matched) {
      return jsonResponse({ error: INVALID_CREDENTIALS_MSG }, 401);
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
    console.error('Login API error:', err);
    return jsonResponse({ error: '登录失败，请稍后再试' }, 500);
  }
}
