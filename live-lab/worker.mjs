import { instructionsFor, instructionsForCandidate, estimateUsd, BEHAVIOR_VERSION, CANDIDATE_BEHAVIOR_VERSION, CONTEXT_VERSION, SCENARIO_VERSION } from '../src/config.ts';
import { page } from './ui.mjs';

const DAY = 86_400_000;
const REVIEW_COOKIE = '__Host-sndlab';
const SESSION_COOKIE = '__Host-sndlab-session';
const encoder = new TextEncoder();
const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function now() { return new Date().toISOString(); }
function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
function randomToken(bytes = 18) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function mac(secret, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function cookieValue(request, name) {
  const raw = request.headers.get('Cookie') ?? '';
  return raw.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1);
}
async function makeReviewCookie(secret) {
  const payload = `${Date.now() + 12 * 60 * 60 * 1000}.${randomToken()}`;
  return `${payload}.${await mac(secret, payload)}`;
}
async function authorizedReview(request, secret) {
  const token = cookieValue(request, REVIEW_COOKIE);
  if (!token) return false;
  const pieces = token.split('.');
  if (pieces.length !== 3 || !Number.isFinite(Number(pieces[0])) || Number(pieces[0]) < Date.now()) return false;
  return equal(pieces[2], await mac(secret, `${pieces[0]}.${pieces[1]}`));
}
async function makeSessionCookie(secret, id, expiresAt) {
  const payload = `${id}.${Date.parse(expiresAt)}`;
  return `${payload}.${await mac(secret, payload)}`;
}
async function authorizedSession(request, secret, id) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return false;
  const pieces = token.split('.');
  if (pieces.length !== 3 || pieces[0] !== id || !Number.isFinite(Number(pieces[1])) || Number(pieces[1]) < Date.now()) return false;
  return equal(pieces[2], await mac(secret, `${pieces[0]}.${pieces[1]}`));
}
function html(kind) {
  const nonce = randomToken(15);
  return new Response(page(kind, nonce), { headers: {
    ...BASE_HEADERS,
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  } });
}
async function bodyJson(request) {
  const raw = await request.text();
  if (raw.length > 16_000) throw new Error('REQUEST_TOO_LARGE');
  try { return JSON.parse(raw); }
  catch { throw new Error('INVALID_JSON'); }
}
function sameOrigin(request) {
  return request.headers.get('Origin') === new URL(request.url).origin;
}
function event(db, sessionId, turnId, revision, kind, details = {}) {
  return db.prepare('INSERT INTO state_events (id,session_id,turn_id,revision,kind,at,details_json) VALUES (?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), sessionId, turnId, revision, kind, now(), JSON.stringify(details)).run();
}
async function getSession(db, id) {
  return db.prepare('SELECT * FROM sessions WHERE id=? AND expires_at>?').bind(id, now()).first();
}
function publicSession(s) {
  return { id: s.id, created_at: s.created_at, updated_at: s.updated_at, revision: s.revision, customer_context: s.customer_context };
}

async function createSession(request, env) {
  const input = await bodyJson(request);
  const context = typeof input.context === 'string' ? input.context.trim() : '';
  if (context.length > 2000) return json({ error: 'CONTEXT_TOO_LONG' }, 400);
  const id = crypto.randomUUID();
  const at = now();
  const expires = new Date(Date.now() + 30 * DAY).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id,created_at,updated_at,revision,customer_context,expires_at) VALUES (?,?,?,?,?,?)')
    .bind(id, at, at, 0, context, expires).run();
  await event(env.DB, id, null, 0, 'session_created', { context_supplied: Boolean(context) });
  return json({ id, revision: 0 }, 201, { 'Set-Cookie': `${SESSION_COOKIE}=${await makeSessionCookie(env.COOKIE_SIGNING_KEY, id, expires)}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict` });
}

async function showSession(env, id) {
  const session = await getSession(env.DB, id);
  if (!session) return json({ error: 'NOT_FOUND' }, 404);
  const [turns, feedback] = await Promise.all([
    env.DB.prepare("SELECT id,role,text,created_at,revision FROM turns WHERE session_id=? ORDER BY revision,CASE role WHEN 'user' THEN 0 ELSE 1 END,created_at,id").bind(id).all(),
    env.DB.prepare("SELECT turn_id,details_json FROM state_events WHERE session_id=? AND kind='turn_feedback' ORDER BY rowid").bind(id).all(),
  ]);
  const latest = new Map();
  for (const f of feedback.results ?? []) latest.set(f.turn_id, JSON.parse(f.details_json).rating);
  return json({ ...publicSession(session), turns: (turns.results ?? []).map(t => t.role === 'assistant'
    ? { ...t, feedback: latest.get(t.id) ?? null } : t) });
}

async function recordFeedback(request, env, sessionId, assistantTurnId) {
  const input = await bodyJson(request);
  if (!['good', 'missed_it'].includes(input?.rating)) return json({ error: 'INVALID_FEEDBACK' }, 400);
  const session = await getSession(env.DB, sessionId);
  if (!session) return json({ error: 'NOT_FOUND' }, 404);
  const turn = await env.DB.prepare("SELECT id,revision FROM turns WHERE id=? AND session_id=? AND role='assistant'")
    .bind(assistantTurnId, sessionId).first();
  if (!turn) return json({ error: 'NOT_FOUND' }, 404);
  const prior = await env.DB.prepare("SELECT details_json FROM state_events WHERE session_id=? AND turn_id=? AND kind='turn_feedback' ORDER BY rowid DESC LIMIT 1")
    .bind(sessionId, assistantTurnId).first();
  if (prior && JSON.parse(prior.details_json).rating === input.rating)
    return json({ turnId: assistantTurnId, rating: input.rating });
  await event(env.DB, sessionId, assistantTurnId, turn.revision, 'turn_feedback', { rating: input.rating });
  return json({ turnId: assistantTurnId, rating: input.rating });
}

async function listSessions(env) {
  const q = await env.DB.prepare(`SELECT s.id,s.created_at,s.updated_at,s.revision,
      (SELECT COUNT(*) FROM turns t WHERE t.session_id=s.id) AS turn_count,
      (SELECT COALESCE(SUM(estimated_usd),0) FROM model_calls m WHERE m.session_id=s.id) AS estimated_usd
      FROM sessions s WHERE s.expires_at>? ORDER BY s.created_at DESC LIMIT 100`).bind(now()).all();
  return json({ sessions: q.results ?? [] });
}

async function reviewSession(env, id) {
  const session = await getSession(env.DB, id);
  if (!session) return json({ error: 'NOT_FOUND' }, 404);
  const [turns, calls, events] = await Promise.all([
    env.DB.prepare("SELECT * FROM turns WHERE session_id=? ORDER BY revision,CASE role WHEN 'user' THEN 0 ELSE 1 END,created_at,id").bind(id).all(),
    env.DB.prepare('SELECT * FROM model_calls WHERE session_id=? ORDER BY requested_at,id').bind(id).all(),
    env.DB.prepare('SELECT * FROM state_events WHERE session_id=? ORDER BY at,id').bind(id).all(),
  ]);
  const timeline = [
    ...(turns.results ?? []).map(t => ({ at: t.created_at, revision: t.revision, kind: `conversation_${t.role}`, text: t.text })),
    ...(calls.results ?? []).map(c => ({ at: c.requested_at, revision: c.revision, kind: `model_call_${c.status}`,
      details: JSON.stringify({ id: c.id, requested_model: c.requested_model, response_model: c.response_model,
        provider_response_id: c.provider_response_id, behavior_version: c.behavior_version,
        context_version: c.context_version, reasoning_effort: c.reasoning_effort,
        customer_context_supplied: c.customer_context_snapshot, memory_retrieved: c.memory_retrieved,
        tool_calls: JSON.parse(c.tool_calls_json), first_text_ms: c.first_text_ms,
        first_useful_ms: c.first_useful_ms, first_useful_excerpt: c.first_useful_excerpt,
        first_useful_method: 'first >=50-character streamed prefix with sentence end or list item',
        full_ms: c.full_ms, input_tokens: c.input_tokens,
        cached_input_tokens: c.cached_input_tokens, output_tokens: c.output_tokens,
        reasoning_tokens: c.reasoning_tokens, estimated_usd: c.estimated_usd,
        retry_count: c.retry_count, error_code: c.error_code, completed_at: c.completed_at,
        model_said: c.assistant_text }, null, 2) })),
    ...(events.results ?? []).map(e => ({ at: e.at, revision: e.revision, kind: `state_${e.kind}`,
      details: JSON.stringify({ turn_id: e.turn_id, ...JSON.parse(e.details_json) }) })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return json({ session: publicSession(session), timeline });
}

function sendSse(controller, value) {
  try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`)); }
  catch { /* Browser disconnected; the model call still gets an outcome record. */ }
}
function firstUsefulProxy(text) {
  return text.length >= 50 && (/[.!?](?:\s|$)/.test(text) || /\n\s*[-*]/.test(text));
}

function behaviorFor(env, context) {
  const version = env.BEHAVIOR_VERSION || BEHAVIOR_VERSION;
  if (version === CANDIDATE_BEHAVIOR_VERSION && (!env.ARM || env.ARM === 'C'))
    return { version, instructions: instructionsForCandidate(context) };
  if (version === BEHAVIOR_VERSION)
    return { version, instructions: instructionsFor(env.ARM || 'C', context) };
  throw new Error('INVALID_BEHAVIOR_CONFIGURATION');
}

async function acceptTurn(env, id, input) {
  const session = await getSession(env.DB, id);
  if (!session) return { response: json({ error: 'NOT_FOUND' }, 404) };
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  const turnId = input.turnId;
  if (!text || text.length > 4000 || typeof turnId !== 'string' || !/^[0-9a-f-]{36}$/i.test(turnId))
    return { response: json({ error: 'INVALID_TURN' }, 400) };
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== session.revision)
    return { response: json({ error: 'STALE_REVISION', revision: session.revision }, 409) };
  const prior = await env.DB.prepare("SELECT role,text FROM turns WHERE session_id=? ORDER BY revision,CASE role WHEN 'user' THEN 0 ELSE 1 END,created_at,id").bind(id).all();
  const userCount = (prior.results ?? []).filter(t => t.role === 'user').length;
  if (userCount >= 50) return { response: json({ error: 'SESSION_LIMIT' }, 429) };
  const today = now().slice(0, 10);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM model_calls WHERE requested_at>=?')
    .bind(`${today}T00:00:00.000Z`).first();
  if ((count?.n ?? 0) >= 100) return { response: json({ error: 'DAILY_LAB_LIMIT' }, 429) };

  const revision = session.revision + 1;
  const at = now();
  const accepted = await env.DB.batch([
    env.DB.prepare('UPDATE sessions SET revision=?,last_turn_id=?,updated_at=? WHERE id=? AND revision=?')
      .bind(revision, turnId, at, id, session.revision),
    env.DB.prepare(`INSERT INTO turns (id,session_id,revision,role,text,created_at)
      SELECT ?,id,?,'user',?,? FROM sessions WHERE id=? AND revision=? AND last_turn_id=?`)
      .bind(turnId, revision, text, at, id, revision, turnId),
    env.DB.prepare(`INSERT INTO state_events (id,session_id,turn_id,revision,kind,at,details_json)
      SELECT ?,id,? ,?,'user_turn_accepted',?,? FROM sessions WHERE id=? AND revision=? AND last_turn_id=?`)
      .bind(crypto.randomUUID(), turnId, revision, at, '{"text_stored_in":"turns"}', id, revision, turnId),
  ]);
  if (accepted[0].meta.changes !== 1) return { response: json({ error: 'STALE_REVISION' }, 409) };
  const messages = (prior.results ?? []).map(t => ({ role: t.role, content: t.text }));
  messages.push({ role: 'user', content: text });
  return { session, text, turnId, revision, messages };
}

async function streamTurn(request, env, ctx, id) {
  if (!env.OPENAI_API_KEY) return json({ error: 'MODEL_UNAVAILABLE' }, 503);
  if (![BEHAVIOR_VERSION, CANDIDATE_BEHAVIOR_VERSION].includes(env.BEHAVIOR_VERSION || BEHAVIOR_VERSION)
    || (env.BEHAVIOR_VERSION === CANDIDATE_BEHAVIOR_VERSION && env.ARM && env.ARM !== 'C'))
    return json({ error: 'INVALID_BEHAVIOR_CONFIGURATION' }, 503);
  const input = await bodyJson(request);
  const accepted = await acceptTurn(env, id, input);
  if (accepted.response) return accepted.response;
  const { session, turnId, revision, messages } = accepted;
  const model = env.MODEL || 'gpt-6-astra';
  const effort = env.REASONING_EFFORT || 'medium';
  const contextText = session.customer_context || 'No saved customer facts provided yet.';
  const behavior = behaviorFor(env, contextText);
  const prompt = behavior.instructions;
  const callId = crypto.randomUUID();
  const requestedAt = now();
  await env.DB.prepare(`INSERT INTO model_calls
    (id,session_id,user_turn_id,revision,requested_at,status,requested_model,behavior_version,context_version,
     reasoning_effort,customer_context_snapshot,memory_retrieved,tool_calls_json)
     VALUES (?,?,?,?,?,'pending',?,?,?,?,?,?,?)`)
    .bind(callId, id, turnId, revision, requestedAt, model, behavior.version, CONTEXT_VERSION,
      effort, session.customer_context, 'none — no memory store in Stage 1A', '[]').run();

  const abort = new AbortController();
  let canceled = false;
  const stream = new ReadableStream({
    start(controller) {
      const task = (async () => {
        const started = performance.now();
        let text = '', firstTextMs = null, firstUsefulMs = null, firstUsefulExcerpt = null, retryCount = 0, completed = null;
        try {
          sendSse(controller, { type: 'accepted', turnId, revision });
          let provider;
          for (let attempt = 0; attempt < 3; attempt++) {
            provider = await fetch('https://api.openai.com/v1/responses', {
              method: 'POST',
              headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ model, instructions: prompt, input: messages, reasoning: { effort },
                max_output_tokens: 4096, store: false, stream: true }),
              signal: abort.signal,
            });
            if (provider.ok) break;
            if (![429, 500, 502, 503, 504].includes(provider.status) || attempt === 2)
              throw new Error(`HTTP_${provider.status}`);
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 600 * 2 ** attempt));
          }
          if (!provider?.body) throw new Error('NO_STREAM');
          const reader = provider.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          function frame(raw) {
            const line = raw.split('\n').find(x => x.startsWith('data: '));
            if (!line || line.slice(6) === '[DONE]') return;
            let e;
            try { e = JSON.parse(line.slice(6)); } catch { throw new Error('BAD_STREAM_EVENT'); }
            if (e.type === 'response.output_text.delta' && typeof e.delta === 'string') {
              text += e.delta;
              const elapsed = Math.round(performance.now() - started);
              if (firstTextMs === null && /\S/.test(e.delta)) firstTextMs = elapsed;
              if (firstUsefulMs === null && firstUsefulProxy(text)) {
                firstUsefulMs = elapsed;
                firstUsefulExcerpt = text.slice(0, 400);
              }
              sendSse(controller, { type: 'delta', text: e.delta });
            } else if (e.type === 'response.completed') completed = e.response;
            else if (e.type === 'error' || e.type === 'response.failed') throw new Error('PROVIDER_STREAM_FAILED');
          }
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            buffer += decoder.decode(next.value, { stream: true });
            buffer = buffer.replace(/\r\n/g, '\n');
            let i;
            while ((i = buffer.indexOf('\n\n')) >= 0) { frame(buffer.slice(0, i)); buffer = buffer.slice(i + 2); }
          }
          if (buffer.trim()) frame(buffer);
          if (!completed || !text) throw new Error('INCOMPLETE_STREAM');
          const fullMs = Math.round(performance.now() - started);
          const usage = completed.usage ?? {};
          const inputTokens = usage.input_tokens ?? null;
          const outputTokens = usage.output_tokens ?? null;
          const cached = usage.input_tokens_details?.cached_tokens ?? 0;
          const reasoning = usage.output_tokens_details?.reasoning_tokens ?? 0;
          const cost = Number.isFinite(inputTokens) && Number.isFinite(outputTokens)
            ? estimateUsd(completed.model ?? model, inputTokens, cached, outputTokens) : null;
          const assistantId = crypto.randomUUID();
          const assistantAt = now();
          const write = await env.DB.prepare(`INSERT INTO turns (id,session_id,revision,role,text,created_at,model_call_id)
            SELECT ?,id,?,'assistant',?,?,? FROM sessions WHERE id=? AND revision=?`)
            .bind(assistantId, revision, text, assistantAt, callId, id, revision).run();
          const wasAccepted = write.meta.changes === 1;
          await env.DB.prepare(`UPDATE model_calls SET completed_at=?,status=?,response_model=?,provider_response_id=?,
            first_text_ms=?,first_useful_ms=?,first_useful_excerpt=?,full_ms=?,input_tokens=?,cached_input_tokens=?,output_tokens=?,
            reasoning_tokens=?,estimated_usd=?,retry_count=?,assistant_text=? WHERE id=?`)
            .bind(assistantAt, wasAccepted ? 'accepted' : 'stale_rejected', completed.model ?? model,
              completed.id ?? null, firstTextMs, firstUsefulMs, firstUsefulExcerpt, fullMs, inputTokens, cached, outputTokens,
              reasoning, cost, retryCount, text, callId).run();
          await event(env.DB, id, turnId, revision, wasAccepted ? 'assistant_turn_accepted' : 'stale_result_rejected',
            { model_call_id: callId, assistant_turn_id: wasAccepted ? assistantId : null });
          sendSse(controller, { type: wasAccepted ? 'complete' : 'stale', turnId, revision,
            firstTextMs, firstUsefulMs, fullMs });
        } catch (error) {
          const code = canceled ? 'CLIENT_DISCONNECTED' : error instanceof Error && /^[A-Z_0-9]+$/.test(error.message)
            ? error.message : 'MODEL_ERROR';
          await env.DB.prepare(`UPDATE model_calls SET completed_at=?,status='error',first_text_ms=?,
            first_useful_ms=?,first_useful_excerpt=?,full_ms=?,retry_count=?,error_code=?,assistant_text=? WHERE id=?`)
            .bind(now(), firstTextMs, firstUsefulMs, firstUsefulExcerpt, Math.round(performance.now() - started), retryCount, code, text, callId).run();
          await event(env.DB, id, turnId, revision, 'model_call_failed', { model_call_id: callId, code });
          sendSse(controller, { type: 'error', code });
        } finally {
          try { controller.close(); } catch { /* Disconnected browser. */ }
        }
      })();
      ctx.waitUntil(task);
    },
    cancel() { canceled = true; abort.abort(); },
  });
  return new Response(stream, { headers: { ...BASE_HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8',
    'Connection': 'keep-alive' } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ status: 'ok', stage: '1A-live-lab', model: env.MODEL || 'gpt-6-astra',
      behavior_version: env.BEHAVIOR_VERSION || BEHAVIOR_VERSION, context_version: CONTEXT_VERSION, scenario_version: SCENARIO_VERSION });
    if (!env.DB || !env.LAB_ACCESS_CODE || !env.COOKIE_SIGNING_KEY) return json({ error: 'LAB_NOT_CONFIGURED' }, 503);
    if (request.method !== 'GET' && !sameOrigin(request)) return json({ error: 'ORIGIN_REQUIRED' }, 403);
    if (url.pathname === '/' && request.method === 'GET') return html('chat');
    if (url.pathname === '/api/review/login' && request.method === 'POST') {
      const input = await bodyJson(request);
      if (!equal(String(input.code ?? ''), env.LAB_ACCESS_CODE)) return json({ error: 'UNAUTHORIZED' }, 401);
      return json({ ok: true }, 200, { 'Set-Cookie': `${REVIEW_COOKIE}=${await makeReviewCookie(env.COOKIE_SIGNING_KEY)}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict` });
    }
    if (url.pathname === '/review' && request.method === 'GET')
      return html(await authorizedReview(request, env.COOKIE_SIGNING_KEY) ? 'review' : 'login');
    if (url.pathname === '/api/review/logout' && request.method === 'POST')
      return json({ ok: true }, 200, { 'Set-Cookie': `${REVIEW_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict` });
    if (url.pathname.startsWith('/api/review/')) {
      if (!await authorizedReview(request, env.COOKIE_SIGNING_KEY)) return json({ error: 'UNAUTHORIZED' }, 401);
      if (url.pathname === '/api/review/sessions' && request.method === 'GET') return listSessions(env);
      const review = url.pathname.match(/^\/api\/review\/sessions\/([0-9a-f-]{36})$/i);
      if (review && request.method === 'GET') return reviewSession(env, review[1]);
      return json({ error: 'NOT_FOUND' }, 404);
    }
    if (url.pathname === '/api/sessions' && request.method === 'POST') return createSession(request, env);
    const session = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})$/i);
    if (session && request.method === 'GET')
      return await authorizedSession(request, env.COOKIE_SIGNING_KEY, session[1]) ? showSession(env, session[1]) : json({ error: 'NOT_FOUND' }, 404);
    const turn = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/turns$/i);
    if (turn && request.method === 'POST')
      return await authorizedSession(request, env.COOKIE_SIGNING_KEY, turn[1]) ? streamTurn(request, env, ctx, turn[1]) : json({ error: 'NOT_FOUND' }, 404);
    const feedback = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/turns\/([0-9a-f-]{36})\/feedback$/i);
    if (feedback && request.method === 'POST')
      return await authorizedSession(request, env.COOKIE_SIGNING_KEY, feedback[1])
        ? recordFeedback(request, env, feedback[1], feedback[2]) : json({ error: 'NOT_FOUND' }, 404);
    return json({ error: 'NOT_FOUND' }, 404);
  },
  async scheduled(_event, env) {
    const at = now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM model_calls WHERE session_id IN (SELECT id FROM sessions WHERE expires_at<=?)').bind(at),
      env.DB.prepare('DELETE FROM turns WHERE session_id IN (SELECT id FROM sessions WHERE expires_at<=?)').bind(at),
      env.DB.prepare('DELETE FROM state_events WHERE session_id IN (SELECT id FROM sessions WHERE expires_at<=?)').bind(at),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(at),
    ]);
  },
};
