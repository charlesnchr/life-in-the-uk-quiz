const DATA_KEY = 'single-user-progress';

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
  if (!env.PROGRESS_KV) {
    return json({ message: 'Missing KV binding' }, 500);
  }

  if (request.method === 'GET') {
    const value = await env.PROGRESS_KV.get(DATA_KEY);
    if (!value) {
      return json({ message: 'No progress saved yet' }, 404);
    }
    return new Response(value, {
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
    await env.PROGRESS_KV.put(DATA_KEY, JSON.stringify(payload));
    return json({ ok: true, updatedAt: payload.updatedAt }, 200);
  }

  if (request.method === 'DELETE') {
    await env.PROGRESS_KV.delete(DATA_KEY);
    return json({ ok: true }, 200);
  }

  return json({ message: 'Method not allowed' }, 405);
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
