import { optionsResponse, jsonResponse, hashPassword } from './_helpers.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateVerificationCode() {
  const random = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(random).padStart(6, '0');
}

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

  const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (nickname.length < 1 || nickname.length > 20) {
    return jsonResponse({ error: '昵称长度必须在 1 到 20 个字符之间' }, 400);
  }

  if (!EMAIL_REGEX.test(email)) {
    return jsonResponse({ error: '邮箱格式不正确' }, 400);
  }

  if (password.length < 6 || password.length > 100) {
    return jsonResponse({ error: '密码长度必须在 6 到 100 个字符之间' }, 400);
  }

  try {
    const existingUser = await env.DB.prepare(
      `SELECT id, verified
       FROM users
       WHERE email = ?
       LIMIT 1`
    )
      .bind(email)
      .first();

    if (existingUser && Number(existingUser.verified) === 1) {
      return jsonResponse({ error: '该邮箱已被注册' }, 409);
    }

    if (existingUser) {
      await env.DB.prepare(
        `DELETE FROM users
         WHERE id = ?`
      )
        .bind(existingUser.id)
        .run();
    }

    const passwordHash = await hashPassword(password);
    const createdAt = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO users (nickname, email, password_hash, verified, created_at)
       VALUES (?, ?, ?, 0, ?)`
    )
      .bind(nickname, email, passwordHash, createdAt)
      .run();

    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await env.DB.prepare(
      `UPDATE verification_codes
       SET used = 1
       WHERE email = ? AND used = 0`
    )
      .bind(email)
      .run();

    await env.DB.prepare(
      `INSERT INTO verification_codes (email, code, expires_at, used)
       VALUES (?, ?, ?, 0)`
    )
      .bind(email, code, expiresAt)
      .run();

    if (!env.RESEND_API_KEY) {
      return jsonResponse({ error: '邮件服务未配置，请稍后再试' }, 500);
    }

    const mailFrom = env.MAIL_FROM || 'onboarding@resend.dev';
    const sendResult = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: mailFrom,
        to: [email],
        subject: 'Tommy.live 邮箱验证码',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #1f2937;">
            <h2 style="margin: 0 0 12px;">Tommy.live 邮箱验证</h2>
            <p style="margin: 0 0 8px;">你的验证码是：</p>
            <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 8px 0 16px;">${code}</p>
            <p style="margin: 0;">验证码 10 分钟内有效，请尽快完成验证。</p>
          </div>
        `,
      }),
    });

    if (!sendResult.ok) {
      const errorText = await sendResult.text();
      console.error('Resend API error:', sendResult.status, errorText);
      return jsonResponse({ error: '验证码发送失败，请稍后重试' }, 500);
    }

    return jsonResponse({ ok: true, message: '验证码已发送到你的邮箱' }, 200);
  } catch (err) {
    console.error('Register API error:', err);
    return jsonResponse({ error: '注册失败，请稍后再试' }, 500);
  }
}
