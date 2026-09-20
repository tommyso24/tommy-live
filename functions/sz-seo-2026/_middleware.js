// HTTP Basic Auth for /sz-seo-2026/* （深圳 SEO 大会 2026 听会笔记，慢慢来内部）
// 密码不进仓库：存在 Cloudflare Pages 的加密环境变量 SZ_SEO_PASSWORD 里。
// 用户名默认 mml，可用环境变量 SZ_SEO_USER 覆盖。
// 整个目录（含 ppt/ 下所有图片）都要经过这里，配合根目录 _routes.json 保证图片不被直接访问。

const REALM = 'SZ SEO 2026 (MML internal)';
const DEFAULT_USER = 'mml';

function safeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  return crypto.subtle.timingSafeEqual(ab, bb);
}

function challenge(message) {
  return new Response(message, {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

export const onRequest = async ({ request, env, next }) => {
  const expectedPass = env.SZ_SEO_PASSWORD;
  const expectedUser = env.SZ_SEO_USER || DEFAULT_USER;

  if (!expectedPass) {
    return new Response('sz-seo-2026: SZ_SEO_PASSWORD 未配置。', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const header = request.headers.get('Authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return challenge('需要密码访问。');

  let decoded;
  try {
    decoded = atob(encoded);
  } catch {
    return challenge('认证信息格式错误。');
  }

  const sep = decoded.indexOf(':');
  if (sep < 0) return challenge('认证信息格式错误。');

  const okUser = safeEqual(decoded.slice(0, sep), expectedUser);
  const okPass = safeEqual(decoded.slice(sep + 1), expectedPass);
  if (!(okUser && okPass)) return challenge('用户名或密码不正确。');

  const response = await next();
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  // private：绝不让 CDN / 中间代理缓存需要鉴权的响应
  headers.set(
    'Cache-Control',
    /\.(webp|jpe?g|png|gif|svg|avif|ico)$/i.test(new URL(request.url).pathname)
      ? 'private, max-age=604800'
      : 'private, no-cache'
  );
  headers.set('Vary', 'Authorization');
  headers.delete('Access-Control-Allow-Origin');

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
