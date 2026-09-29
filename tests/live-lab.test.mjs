import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Script } from 'node:vm';
import worker from '../live-lab/worker.mjs';
import { page } from '../live-lab/ui.mjs';

class TestDB {
  constructor() {
    this.raw = new DatabaseSync(':memory:');
    this.raw.exec(fs.readFileSync(new URL('../live-lab/migrations/0001_init.sql', import.meta.url), 'utf8'));
  }
  prepare(sql) {
    const db = this.raw;
    return {
      bind(...params) {
        return {
          async run() { return { meta: { changes: db.prepare(sql).run(...params).changes } }; },
          async first() { return db.prepare(sql).get(...params) ?? null; },
          async all() { return { results: db.prepare(sql).all(...params) }; },
        };
      },
    };
  }
  async batch(statements) {
    this.raw.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.raw.exec('COMMIT');
      return results;
    } catch (e) { this.raw.exec('ROLLBACK'); throw e; }
  }
}

const origin = 'https://lab.test';
const accessCode = 'test-owner-access-code-with-sufficient-length';
const env = () => ({ DB: new TestDB(), LAB_ACCESS_CODE: accessCode, COOKIE_SIGNING_KEY: 'test-signing-key-with-sufficient-length',
  OPENAI_API_KEY: 'test-api-key', MODEL: 'gpt-6-astra', REASONING_EFFORT: 'medium', BEHAVIOR_VERSION: 'stage1a-snap-v2', ARM: 'C' });
function context() {
  const tasks = [];
  return { waitUntil(p) { tasks.push(p); }, async settle() { await Promise.all(tasks); } };
}
function req(path, method = 'GET', body, cookie) {
  return new Request(origin + path, { method, headers: { ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json' } : {}),
    ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function reviewLogin(e) {
  const r = await worker.fetch(req('/api/review/login', 'POST', { code: accessCode }), e, context());
  assert.equal(r.status, 200);
  return r.headers.get('Set-Cookie').split(';')[0];
}
async function createVisitorSession(e, customerContext, ctx = context()) {
  const r = await worker.fetch(req('/api/sessions', 'POST', { context: customerContext }), e, ctx);
  assert.equal(r.status, 201);
  assert.match(r.headers.get('Set-Cookie'), /__Host-sndlab-session=.*HttpOnly; Secure; SameSite=Strict/);
  return { ...(await r.json()), cookie: r.headers.get('Set-Cookie').split(';')[0] };
}
function providerStream(text) {
  const frames = [
    { type: 'response.output_text.delta', delta: text.slice(0, 30) },
    { type: 'response.output_text.delta', delta: text.slice(30) },
    { type: 'response.completed', response: { id: 'resp_test', model: 'gpt-6-astra',
      usage: { input_tokens: 100, output_tokens: 80, input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 10 } } } },
  ];
  return new Response(new ReadableStream({ start(c) {
    for (const frame of frames) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(frame)}\n\n`));
    c.close();
  } }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

test('public chat, isolated visitor sessions, and protected owner review', async () => {
  const e = env();
  const home = await worker.fetch(req('/'), e, context());
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /What are we making\?/);
  assert.match(html, /Missed It/);
  assert.equal((await (await worker.fetch(req('/health'), e, context())).json()).behavior_version, 'stage1a-snap-v2');
  assert.doesNotMatch(html, /Review sessions|Owner sign in/);
  assert.equal((await worker.fetch(req('/api/sessions'), e, context())).status, 404);
  assert.equal((await worker.fetch(req('/api/review/sessions'), e, context())).status, 401);
  assert.equal((await worker.fetch(req('/api/review/sessions/' + crypto.randomUUID()), e, context())).status, 401);
  assert.match(await (await worker.fetch(req('/review'), e, context())).text(), /Review access/);
  const wrongOrigin = new Request(origin + '/api/review/login', { method: 'POST', headers: { Origin: 'https://attacker.test' },
    body: JSON.stringify({ code: accessCode }) });
  assert.equal((await worker.fetch(wrongOrigin, e, context())).status, 403);
  const first = await createVisitorSession(e, 'First visitor context');
  const second = await createVisitorSession(e, 'Second visitor context');
  assert.equal((await worker.fetch(req(`/api/sessions/${first.id}`), e, context())).status, 404);
  assert.equal((await worker.fetch(req(`/api/sessions/${first.id}`, 'GET', undefined, second.cookie), e, context())).status, 404);
  assert.equal((await worker.fetch(req(`/api/sessions/${first.id}`, 'GET', undefined, first.cookie), e, context())).status, 200);
  assert.equal((await worker.fetch(req(`/api/sessions/${first.id}/turns`, 'POST',
    { text: 'Dinner?', turnId: crypto.randomUUID(), expectedRevision: 0 }, second.cookie), e, context())).status, 404);
  const reviewCookie = await reviewLogin(e);
  assert.equal((await worker.fetch(req('/review', 'GET', undefined, reviewCookie), e, context())).status, 200);
  assert.equal((await worker.fetch(req('/api/review/sessions', 'GET', undefined, reviewCookie), e, context())).status, 200);
  assert.equal((await worker.fetch(req(`/api/review/sessions/${first.id}`, 'GET', undefined, reviewCookie), e, context())).status, 200);
});

test('all rendered pages contain parseable client scripts', () => {
  for (const kind of ['login', 'chat', 'review']) {
    const html = page(kind, 'testnonce');
    const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script, `${kind} script exists`);
    assert.doesNotThrow(() => new Script(script), `${kind} script parses`);
  }
});

test('behavior selection keeps v1 available and rejects invalid config before accepting a turn', async () => {
  const e = env();
  const { id, cookie } = await createVisitorSession(e, 'A skillet.');
  e.BEHAVIOR_VERSION = 'unknown';
  const invalid = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
    { text: 'Dinner?', turnId: crypto.randomUUID(), expectedRevision: 0 }, cookie), e, context());
  assert.equal(invalid.status, 503);
  assert.equal(e.DB.raw.prepare('SELECT revision FROM sessions WHERE id=?').get(id).revision, 0);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM turns').get().n, 0);
  e.BEHAVIOR_VERSION = 'stage1a-snap-v1';
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    assert.doesNotMatch(JSON.parse(init.body).instructions, /next decision or action/);
    return providerStream('Try chicken thighs with crisp potatoes and a bright salad.');
  };
  try {
    const response = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text: 'Dinner?', turnId: crypto.randomUUID(), expectedRevision: 0 }, cookie), e, context());
    assert.match(await response.text(), /"type":"complete"/);
  } finally { globalThis.fetch = original; }
  assert.equal(e.DB.raw.prepare('SELECT behavior_version FROM model_calls').get().behavior_version, 'stage1a-snap-v1');
});

test('same-millisecond turns retain conversation order in display and model context', async () => {
  const e = env();
  const { id, cookie } = await createVisitorSession(e, 'A skillet.');
  const at = '2026-09-29T12:00:00.000Z';
  e.DB.raw.prepare('INSERT INTO turns (id,session_id,revision,role,text,created_at) VALUES (?,?,?,?,?,?)')
    .run('ffffffff-ffff-4fff-8fff-ffffffffffff', id, 1, 'user', 'Chicken thighs.', at);
  e.DB.raw.prepare('INSERT INTO turns (id,session_id,revision,role,text,created_at) VALUES (?,?,?,?,?,?)')
    .run('00000000-0000-4000-8000-000000000000', id, 1, 'assistant', 'Try lemon chicken.', at);
  e.DB.raw.prepare('UPDATE sessions SET revision=1,last_turn_id=? WHERE id=?')
    .run('ffffffff-ffff-4fff-8fff-ffffffffffff', id);
  const saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
  assert.deepEqual(saved.turns.map(t => t.role), ['user', 'assistant']);
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body).input.map(m => m.role), ['user', 'assistant', 'user']);
    return providerStream('Use a skillet for crispy chicken thighs.');
  };
  try {
    const response = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text: 'How should I cook them?', turnId: crypto.randomUUID(), expectedRevision: 1 }, cookie), e, context());
    assert.match(await response.text(), /"type":"complete"/);
  } finally { globalThis.fetch = original; }
});

test('streamed reply records model output separately from accepted conversation state', async () => {
  const e = env(), ctx = context();
  const { id, cookie } = await createVisitorSession(e, 'Two people, skillet, loves surprising flavors.', ctx);
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.method, 'POST');
    const input = JSON.parse(options.body);
    assert.equal(input.stream, true);
    assert.equal(input.store, false);
    assert.match(input.instructions, /Two people, skillet/);
    assert.match(input.instructions, /next decision or action/);
    return providerStream('Let us make smoky fish tacos with bright cabbage slaw tonight. Start with the slaw.');
  };
  try {
    const response = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text: 'What should we make?', turnId: crypto.randomUUID(), expectedRevision: 0 }, cookie), e, ctx);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /"type":"complete"/);
    await ctx.settle();
  } finally { globalThis.fetch = original; }
  const saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.turns.map(t => t.role), ['user', 'assistant']);
  const call = e.DB.raw.prepare('SELECT * FROM model_calls').get();
  assert.equal(call.status, 'accepted');
  assert.equal(call.behavior_version, 'stage1a-snap-v2');
  assert.equal(call.customer_context_snapshot, 'Two people, skillet, loves surprising flavors.');
  assert.equal(call.output_tokens, 80);
  assert.ok(call.first_text_ms !== null);
  assert.ok(call.first_useful_ms !== null);
  assert.match(call.first_useful_excerpt, /smoky fish tacos/);
  assert.ok(call.estimated_usd > 0);
  assert.deepEqual(e.DB.raw.prepare('SELECT kind FROM state_events ORDER BY at,id').all().map(x => x.kind).sort(),
    ['assistant_turn_accepted', 'session_created', 'user_turn_accepted']);
});

test('one-tap feedback belongs to an accepted reply and the visitor session', async () => {
  const e = env(), ctx = context();
  const first = await createVisitorSession(e, 'A skillet.', ctx);
  const second = await createVisitorSession(e, 'A wok.', ctx);
  const original = globalThis.fetch;
  globalThis.fetch = async () => providerStream('Try crispy shrimp with a lemony rice and cucumber salad.');
  try {
    const response = await worker.fetch(req(`/api/sessions/${first.id}/turns`, 'POST',
      { text: 'Dinner?', turnId: crypto.randomUUID(), expectedRevision: 0 }, first.cookie), e, ctx);
    assert.match(await response.text(), /"type":"complete"/);
    await ctx.settle();
  } finally { globalThis.fetch = original; }
  const saved = await (await worker.fetch(req(`/api/sessions/${first.id}`, 'GET', undefined, first.cookie), e, context())).json();
  const assistant = saved.turns.find(t => t.role === 'assistant');
  const user = saved.turns.find(t => t.role === 'user');
  const path = `/api/sessions/${first.id}/turns/${assistant.id}/feedback`;
  assert.equal((await worker.fetch(req(path, 'POST', { rating: 'good' }), e, context())).status, 404);
  assert.equal((await worker.fetch(req(path, 'POST', { rating: 'good' }, second.cookie), e, context())).status, 404);
  assert.equal((await worker.fetch(req(`/api/sessions/${first.id}/turns/${user.id}/feedback`, 'POST',
    { rating: 'good' }, first.cookie), e, context())).status, 404);
  assert.equal((await worker.fetch(req(path, 'POST', { rating: 'stars' }, first.cookie), e, context())).status, 400);
  assert.equal((await worker.fetch(req(path, 'POST', { rating: 'good' }, first.cookie), e, context())).status, 200);
  assert.equal((await worker.fetch(req(path, 'POST', { rating: 'good' }, first.cookie), e, context())).status, 200);
  assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM state_events WHERE kind='turn_feedback'").get().n, 1);
  assert.equal((await worker.fetch(req(path, 'POST', { rating: 'missed_it' }, first.cookie), e, context())).status, 200);
  const updated = await (await worker.fetch(req(`/api/sessions/${first.id}`, 'GET', undefined, first.cookie), e, context())).json();
  assert.equal(updated.turns.find(t => t.id === assistant.id).feedback, 'missed_it');
  assert.equal(updated.revision, 1);
  const reviewCookie = await reviewLogin(e);
  const reviewed = await (await worker.fetch(req(`/api/review/sessions/${first.id}`, 'GET', undefined, reviewCookie), e, context())).json();
  assert.equal(reviewed.timeline.filter(t => t.kind === 'state_turn_feedback').length, 2);
  assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM state_events WHERE kind='turn_feedback'").get().n, 2);
});

test('newer revision rejects a late model result while retaining its audit record', async () => {
  const e = env(), ctx = context();
  const { id, cookie } = await createVisitorSession(e, 'One skillet.', ctx);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const original = globalThis.fetch;
  globalThis.fetch = async () => { await gate; return providerStream('Make a skillet dinner with peppers and chicken. Start the chicken now.'); };
  try {
    const response = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text: 'Dinner idea?', turnId: crypto.randomUUID(), expectedRevision: 0 }, cookie), e, ctx);
    e.DB.raw.prepare('UPDATE sessions SET revision=2 WHERE id=?').run(id);
    release();
    assert.match(await response.text(), /"type":"stale"/);
    await ctx.settle();
  } finally { globalThis.fetch = original; }
  assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM turns WHERE role='assistant'").get().n, 0);
  assert.equal(e.DB.raw.prepare('SELECT status FROM model_calls').get().status, 'stale_rejected');
  assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM state_events WHERE kind='stale_result_rejected'").get().n, 1);
});

test('scheduled retention removes expired sessions and dependent records', async () => {
  const e = env();
  const { id } = await createVisitorSession(e, '');
  e.DB.raw.prepare('UPDATE sessions SET expires_at=? WHERE id=?').run('2020-01-01T00:00:00.000Z', id);
  await worker.scheduled({}, e);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM state_events').get().n, 0);
});
