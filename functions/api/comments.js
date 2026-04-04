const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');

  if (!slug) {
    return Response.json(
      { error: 'Missing required parameter: slug' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, slug, nickname, content, parent_id, created_at
       FROM comments
       WHERE slug = ? AND status = 'approved'
       ORDER BY created_at ASC`
    )
      .bind(slug)
      .all();

    return Response.json(
      { comments: results },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    return Response.json(
      { error: 'Database error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { slug, nickname, content, parent_id } = body;

  // Validate required fields
  if (!slug || !nickname || !content) {
    return Response.json(
      { error: 'Missing required fields: slug, nickname, content' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Validate nickname length (1-20 chars)
  if (typeof nickname !== 'string' || nickname.trim().length < 1 || nickname.trim().length > 20) {
    return Response.json(
      { error: 'nickname must be between 1 and 20 characters' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Validate content length (1-500 chars)
  if (typeof content !== 'string' || content.trim().length < 1 || content.trim().length > 500) {
    return Response.json(
      { error: 'content must be between 1 and 500 characters' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Verify parent comment exists if parent_id is provided
  if (parent_id !== undefined && parent_id !== null) {
    try {
      const parent = await env.DB.prepare(
        `SELECT id FROM comments WHERE id = ?`
      )
        .bind(parent_id)
        .first();

      if (!parent) {
        return Response.json(
          { error: 'Parent comment not found' },
          { status: 400, headers: CORS_HEADERS }
        );
      }
    } catch {
      return Response.json(
        { error: 'Database error while verifying parent comment' },
        { status: 500, headers: CORS_HEADERS }
      );
    }
  }

  // Rate limiting: hash the client IP with SHA-256 and check last submission time
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipHashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(clientIp)
  );
  const ipHash = Array.from(new Uint8Array(ipHashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  try {
    const recent = await env.DB.prepare(
      `SELECT created_at FROM comments
       WHERE ip_hash = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
      .bind(ipHash)
      .first();

    if (recent) {
      const lastPostTime = new Date(recent.created_at).getTime();
      const now = Date.now();
      const secondsElapsed = (now - lastPostTime) / 1000;

      if (secondsElapsed < 60) {
        const waitSeconds = Math.ceil(60 - secondsElapsed);
        return Response.json(
          { error: `Rate limit exceeded. Please wait ${waitSeconds} seconds before posting again.` },
          { status: 429, headers: CORS_HEADERS }
        );
      }
    }
  } catch {
    return Response.json(
      { error: 'Database error during rate limit check' },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  // Insert the new comment with status='pending'
  const createdAt = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO comments (slug, nickname, content, status, parent_id, created_at, ip_hash)
       VALUES (?, ?, ?, 'pending', ?, ?, ?)`
    )
      .bind(
        slug.trim(),
        nickname.trim(),
        content.trim(),
        parent_id ?? null,
        createdAt,
        ipHash
      )
      .run();

    return Response.json(
      { message: 'Comment submitted successfully and is pending review.' },
      { status: 201, headers: CORS_HEADERS }
    );
  } catch {
    return Response.json(
      { error: 'Failed to save comment' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
