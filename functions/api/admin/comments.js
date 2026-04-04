const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
};

function checkAuth(request, env) {
  const token = request.headers.get('X-Admin-Token');
  return token && token === env.ADMIN_TOKEN;
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!checkAuth(request, env)) {
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401, headers: CORS_HEADERS }
    );
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, slug, nickname, content, status, parent_id, created_at
       FROM comments
       WHERE status = ?
       ORDER BY created_at DESC`
    )
      .bind(status)
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

export async function onRequestPatch(context) {
  const { request, env } = context;

  if (!checkAuth(request, env)) {
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401, headers: CORS_HEADERS }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { ids, status } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return Response.json(
      { error: 'ids must be a non-empty array' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (!['approved', 'rejected'].includes(status)) {
    return Response.json(
      { error: 'status must be one of: approved, rejected' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const placeholders = ids.map(() => '?').join(', ');
    await env.DB.prepare(
      `UPDATE comments SET status = ? WHERE id IN (${placeholders})`
    )
      .bind(status, ...ids)
      .run();

    return Response.json(
      { message: `Comments updated to status: ${status}` },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    return Response.json(
      { error: 'Database error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;

  if (!checkAuth(request, env)) {
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401, headers: CORS_HEADERS }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { ids } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return Response.json(
      { error: 'ids must be a non-empty array' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const placeholders = ids.map(() => '?').join(', ');
    await env.DB.prepare(
      `DELETE FROM comments WHERE id IN (${placeholders})`
    )
      .bind(...ids)
      .run();

    return Response.json(
      { message: 'Comments deleted successfully' },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err) {
    return Response.json(
      { error: 'Database error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
