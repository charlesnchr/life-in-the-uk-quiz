const DATA_KEY = 'single-user-progress';
const DEFAULT_USER = 'single-user';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/progress') {
      return handleProgress(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleProgress(request, env) {
  if (!env.DB) {
    return json({ message: 'Missing D1 binding' }, 500);
  }

  const userId = resolveUserId(request);

  if (request.method === 'GET') {
    await ensureSchema(env);
    const row = await env.DB.prepare(
      'SELECT payload FROM progress WHERE user_id = ?1'
    ).bind(userId).first();

    if (!row || !row.payload) {
      await migrateFromKvIfPresent(env);
      const migrated = await env.DB.prepare(
        'SELECT payload FROM progress WHERE user_id = ?1'
      ).bind(userId).first();
      if (!migrated || !migrated.payload) {
        return json({ message: 'No progress saved yet' }, 404);
      }
      return new Response(migrated.payload, {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(row.payload, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'PUT') {
    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ message: 'Invalid JSON payload' }, 400);
    }

    payload.updatedAt = payload.updatedAt || new Date().toISOString();
    await ensureSchema(env);
    const body = JSON.stringify(payload);
    await env.DB.prepare(
      `INSERT INTO progress (user_id, payload, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(user_id)
       DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
    ).bind(userId, body, payload.updatedAt).run();
    return json({ ok: true, updatedAt: payload.updatedAt }, 200);
  }

  if (request.method === 'DELETE') {
    await ensureSchema(env);
    await env.DB.prepare('DELETE FROM progress WHERE user_id = ?1').bind(userId).run();
    return json({ ok: true }, 200);
  }

  return json({ message: 'Method not allowed' }, 405);
}

async function ensureSchema(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS progress (
      user_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  ).run();
}

async function migrateFromKvIfPresent(env) {
  if (!env.PROGRESS_KV) {
    return;
  }

  const value = await env.PROGRESS_KV.get(DATA_KEY);
  if (!value) {
    return;
  }

  let updatedAt = new Date().toISOString();
  try {
    const parsed = JSON.parse(value);
    if (parsed && parsed.updatedAt) {
      updatedAt = parsed.updatedAt;
    }
  } catch {
    // Ignore parse errors and use current timestamp.
  }

  await env.DB.prepare(
    `INSERT INTO progress (user_id, payload, updated_at)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(user_id)
     DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
  ).bind(DEFAULT_USER, value, updatedAt).run();
}

function resolveUserId(request) {
  const headerValue = request.headers.get('x-user-id');
  if (headerValue && headerValue.trim()) {
    return headerValue.trim();
  }
  return DEFAULT_USER;
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
