export default {
  fetch() {
    return new Response('Snap n Dish Live Lab is paused.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  },
  async scheduled(_event, env) {
    const at = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM model_calls WHERE session_id IN (SELECT id FROM sessions WHERE expires_at<=?)').bind(at),
      env.DB.prepare('DELETE FROM turns WHERE session_id IN (SELECT id FROM sessions WHERE expires_at<=?)').bind(at),
      env.DB.prepare('DELETE FROM state_events WHERE session_id IN (SELECT id FROM sessions WHERE expires_at<=?)').bind(at),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(at),
    ]);
  },
};
