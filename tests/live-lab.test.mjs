import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Script } from 'node:vm';
import worker from '../live-lab/worker.mjs';
import closedStage1b from '../stage1b/closed.mjs';
import { page } from '../live-lab/ui.mjs';

class TestDB {
  constructor() {
    this.raw = new DatabaseSync(':memory:');
    this.raw.exec(fs.readFileSync(new URL('../live-lab/migrations/0001_init.sql', import.meta.url), 'utf8'));
    for (const file of ['0002_turn_operations.sql', '0003_stage1b_identity_meal.sql',
      '0004_stage1b_images.sql', '0005_stage1b_context_snapshot.sql',
      '0006_stage1b_voice.sql', '0007_stage1b_return.sql'])
      this.raw.exec(fs.readFileSync(new URL('../stage1b/migrations/' + file, import.meta.url), 'utf8'));
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

test('Stage 1B closed rollback exposes no application routes', async () => {
  for (const path of ['/', '/health', '/review', '/api/sessions']) {
    const response = await closedStage1b.fetch(req(path));
    assert.equal(response.status, 503);
    assert.match(await response.text(), /Stage 1B staging is paused/);
  }
});

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

test('a disconnected stream finishes once and replay returns the accepted turn', async () => {
  const e = env(), ctx = context();
  const { id, cookie } = await createVisitorSession(e, 'One skillet.');
  const turnId = crypto.randomUUID();
  let release, providerCalls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    providerCalls++;
    await gate;
    return providerStream('Try Peruvian chicken with a bright green sauce and crisp potatoes.');
  };
  try {
    const first = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text: 'Chicken tonight', turnId, expectedRevision: 0 }, cookie), e, ctx);
    await first.body.cancel();
    const pending = await worker.fetch(req(`/api/sessions/${id}/turns/${turnId}`, 'GET', undefined, cookie), e, context());
    assert.equal((await pending.json()).status, 'pending');
    release();
    await ctx.settle();
    const outcome = await (await worker.fetch(req(`/api/sessions/${id}/turns/${turnId}`, 'GET', undefined, cookie), e, context())).json();
    assert.equal(outcome.status, 'accepted');
    assert.match(outcome.assistant.text, /Peruvian chicken/);
    const replay = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text: 'Chicken tonight', turnId, expectedRevision: 0 }, cookie), e, context());
    assert.equal((await replay.json()).status, 'accepted');
    assert.equal(providerCalls, 1);
    assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM turns WHERE role='user'").get().n, 1);
    assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM turns WHERE role='assistant'").get().n, 1);
    assert.equal(e.DB.raw.prepare("SELECT status FROM turn_operations WHERE user_turn_id=?").get(turnId).status, 'accepted');
  } finally { release(); globalThis.fetch = original; }
});

test('failed model attempt can retry the same accepted user turn without duplication', async () => {
  const e = env(), ctx = context();
  const { id, cookie } = await createVisitorSession(e, 'A grill.');
  const turnId = crypto.randomUUID();
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) throw new Error('network failed');
    return providerStream('Grill chicken thighs and serve with corn and cucumber salad.');
  };
  try {
    const input = { text: 'Chicken thighs', turnId, expectedRevision: 0 };
    const first = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST', input, cookie), e, ctx);
    assert.match(await first.text(), /"type":"error"/);
    assert.equal((await (await worker.fetch(req(`/api/sessions/${id}/turns/${turnId}`, 'GET', undefined, cookie), e, context())).json()).status, 'error');
    const second = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST', input, cookie), e, ctx);
    assert.match(await second.text(), /"type":"complete"/);
    assert.equal(calls, 2);
    assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM turns WHERE role='user'").get().n, 1);
    assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM turns WHERE role='assistant'").get().n, 1);
    assert.deepEqual(e.DB.raw.prepare('SELECT status FROM model_calls ORDER BY requested_at,id').all().map(x => x.status).sort(), ['accepted', 'error']);
  } finally { globalThis.fetch = original; }
});

test('accepting a meal supersedes an in-flight reply from the older plan', async () => {
  const e = env(), ctx = context();
  e.STAGE1B_ENABLED = 'true';
  const { id, cookie } = await createVisitorSession(e, 'Two people.');
  const priorAssistant = crypto.randomUUID();
  e.DB.raw.prepare('INSERT INTO turns (id,session_id,revision,role,text,created_at) VALUES (?,?,?,?,?,?)')
    .run(priorAssistant, id, 1, 'assistant', 'Make lemon chicken with potatoes.', new Date().toISOString());
  e.DB.raw.prepare('UPDATE sessions SET revision=1 WHERE id=?').run(id);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const original = globalThis.fetch;
  globalThis.fetch = async () => { await gate; return providerStream('Make a different meal from the old context.'); };
  try {
    const stream = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text: 'Maybe another direction?', turnId: crypto.randomUUID(), expectedRevision: 1 }, cookie), e, ctx);
    const chosen = await worker.fetch(req(`/api/sessions/${id}/meal`, 'POST',
      { assistantTurnId: priorAssistant, expectedMealRevision: 0, expectedRevision: 2 }, cookie), e, context());
    assert.equal(chosen.status, 200);
    assert.equal((await chosen.json()).revision, 3);
    release();
    assert.match(await stream.text(), /"type":"stale"/);
    await ctx.settle();
  } finally { globalThis.fetch = original; }
  assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM turns WHERE role='assistant'").get().n, 1);
  assert.equal(e.DB.raw.prepare('SELECT status FROM model_calls').get().status, 'stale_rejected');
});

test('Stage 1B pairing carries one conversation and accepted meal to another browser', async () => {
  const e = env(), ctx = context();
  e.STAGE1B_ENABLED = 'true';
  const created = await worker.fetch(req('/api/sessions', 'POST', { context: 'Two people, a skillet.' }), e, ctx);
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const cookies = created.headers.getSetCookie();
  const firstCookie = cookies.map(x => x.split(';')[0]).join('; ');
  assert.match(firstCookie, /__Host-sndlab-customer=/);
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.match(body.instructions, /Two people, a skillet/);
    return providerStream('Make bright Peruvian chicken with a green sauce and crisp potatoes.');
  };
  try {
    const first = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text: 'Chicken tonight', turnId: crypto.randomUUID(), expectedRevision: 0 }, firstCookie), e, ctx);
    assert.match(await first.text(), /"type":"complete"/);
  } finally { globalThis.fetch = original; }
  const saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, firstCookie), e, context())).json();
  const assistant = saved.turns.find(x => x.role === 'assistant');
  const meal = await worker.fetch(req(`/api/sessions/${id}/meal`, 'POST',
    { assistantTurnId: assistant.id, expectedMealRevision: 0, expectedRevision: 1 }, firstCookie), e, context());
  assert.deepEqual(await meal.json(), { revision: 2, mealRevision: 1, sourceTurnId: assistant.id });
  assert.equal((await worker.fetch(req(`/api/sessions/${id}/meal`, 'POST',
    { assistantTurnId: assistant.id, expectedMealRevision: 0, expectedRevision: 1 }, firstCookie), e, context())).status, 409);

  const pair = await worker.fetch(req('/api/pair/start', 'POST', { sessionId: id }, firstCookie), e, context());
  const { code } = await pair.json();
  assert.equal(code.length, 32);
  assert.equal((await worker.fetch(req(`/api/sessions/${id}`), e, context())).status, 404);
  const claimed = await worker.fetch(req('/api/pair/claim', 'POST', { code }), e, context());
  assert.equal(claimed.status, 200);
  assert.equal((await claimed.json()).sessionId, id);
  const secondCookie = claimed.headers.getSetCookie()[0].split(';')[0];
  assert.equal((await worker.fetch(req('/api/pair/claim', 'POST', { code }), e, context())).status, 404);
  const continued = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, secondCookie), e, context())).json();
  assert.equal(continued.meal_revision, 1);
  assert.equal(continued.revision, 2);
  assert.equal(continued.meal_source_turn_id, assistant.id);
  assert.deepEqual(continued.turns.map(x => x.role), ['user', 'assistant']);
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.match(body.instructions, /Accepted meal reference \(revision 1\)/);
    assert.match(body.instructions, /Peruvian chicken/);
    assert.deepEqual(body.input.map(x => x.role), ['user', 'assistant', 'user']);
    return providerStream('Start the potatoes first, then cook the chicken and make the sauce.');
  };
  try {
    const next = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text: 'What should I start first?', turnId: crypto.randomUUID(), expectedRevision: 2 }, secondCookie), e, ctx);
    assert.match(await next.text(), /"type":"complete"/);
  } finally { globalThis.fetch = original; }
  assert.equal(e.DB.raw.prepare('SELECT context_version FROM model_calls ORDER BY requested_at DESC LIMIT 1').get().context_version,
    'stage1b-context-v1');
  const listed = await (await worker.fetch(req('/api/customer/sessions', 'GET', undefined, secondCookie), e, context())).json();
  assert.equal(listed.sessions[0].id, id);
  assert.equal((await worker.fetch(req(`/api/sessions/${id}/turns/${assistant.id}/feedback`, 'POST',
    { rating: 'good' }, secondCookie), e, context())).status, 200);
  assert.equal((await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, firstCookie), e, context())).status, 200);
});

test('Stage 1B food image stays private, loses metadata, and enters the same model conversation', async () => {
  const e = env(), ctx = context();
  e.STAGE1B_ENABLED = 'true';
  const objects = new Map();
  e.IMAGES = {
    async put(key, bytes) { objects.set(key, new Uint8Array(bytes)); },
    async get(key) { const bytes = objects.get(key); return bytes ? { body: new Response(bytes).body,
      async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } } : null; },
    async delete(key) { objects.delete(key); },
  };
  const { id, cookie } = await createVisitorSession(e, 'Likes bold food.');
  const foreign = await createVisitorSession(e, 'Another visitor.');
  const jpeg = Uint8Array.from([0xff,0xd8, 0xff,0xe1,0x00,0x06, 0x47,0x50,0x53,0x21,
    0xff,0xda,0x00,0x02, 0x11,0x22,0xff,0xd9]);
  const upload = await worker.fetch(new Request(`${origin}/api/sessions/${id}/images`, {
    method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'image/jpeg' }, body: jpeg,
  }), e, ctx);
  assert.equal(upload.status, 201);
  const { imageId } = await upload.json();
  const stored = objects.get(`${id}/${imageId}`);
  assert.ok(stored.length < jpeg.length);
  assert.equal(Buffer.from(stored).includes(Buffer.from('GPS!')), false);
  assert.equal((await worker.fetch(req(`/api/sessions/${id}/images/${imageId}`, 'GET', undefined, foreign.cookie), e, ctx)).status, 404);
  const imageResponse = await worker.fetch(req(`/api/sessions/${id}/images/${imageId}`, 'GET', undefined, cookie), e, ctx);
  assert.deepEqual(new Uint8Array(await imageResponse.arrayBuffer()), stored);
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const imagePart = body.input.find(m => Array.isArray(m.content))?.content.find(p => p.type === 'input_image');
    assert.ok(imagePart);
    assert.deepEqual(new Uint8Array(Buffer.from(imagePart.image_url.split(',')[1], 'base64')), stored);
    assert.match(body.instructions, /visible details from likely interpretation/);
    call++;
    return providerStream(call === 1
      ? 'It looks like a grilled chicken dish with a bright herb sauce; I would ask about the sauce before recreating it.'
      : 'We can recreate the grilled chicken and sauce, then adapt the sides to your taste.');
  };
  try {
    const first = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text: 'What might this restaurant dish be?', imageId, turnId: crypto.randomUUID(), expectedRevision: 0 }, cookie), e, ctx);
    assert.match(await first.text(), /"type":"complete"/);
    const next = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text: 'How would you recreate it?', turnId: crypto.randomUUID(), expectedRevision: 1 }, cookie), e, ctx);
    assert.match(await next.text(), /"type":"complete"/);
  } finally { globalThis.fetch = original; }
  assert.equal(call, 2);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM images WHERE turn_id IS NOT NULL').get().n, 1);
  assert.deepEqual(e.DB.raw.prepare('SELECT image_ids_json FROM model_calls').all().map(x => JSON.parse(x.image_ids_json)),
    [[imageId], [imageId]]);
});

test('Stage 1B spoken transcript uses the same context, stores usage, and rejects late voice replies', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  const { id, cookie } = await createVisitorSession(e, 'Two people who love bold flavors.');
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/realtime/calls');
    const setup = JSON.parse(options.body.get('session'));
    assert.equal(setup.model, 'gpt-realtime-2.1');
    assert.match(setup.instructions, /next decision or action/);
    assert.match(setup.instructions, /bold flavors/);
    assert.equal(setup.audio.input.transcription.model, 'gpt-live-transcribe');
    return new Response('v=0\r\nanswer', { status: 201, headers: { Location: '/v1/realtime/calls/rtc_test' } });
  };
  let voiceId;
  try {
    const started = await worker.fetch(req(`/api/sessions/${id}/voice/start`, 'POST',
      { sdp: 'v=0\r\noffer', expectedRevision: 0 }, cookie), e, context());
    assert.equal(started.status, 201);
    voiceId = (await started.json()).voiceSessionId;
  } finally { globalThis.fetch = original; }
  const active = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
  assert.equal(active.active_voice_id, voiceId);
  assert.equal((await worker.fetch(req(`/api/sessions/${id}/meal`, 'POST',
    { assistantTurnId: crypto.randomUUID(), expectedMealRevision: 0, expectedRevision: 0 }, cookie), e, context())).status, 409);
  assert.equal((await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
    { text: 'Text while voice active', turnId: crypto.randomUUID(), expectedRevision: 0 }, cookie), e, context())).status, 409);
  const user = await worker.fetch(req(`/api/sessions/${id}/voice/events`, 'POST',
    { voiceSessionId: voiceId, type: 'user', itemId: 'item_voice_1', transcript: 'What should I make with chicken thighs?' }, cookie), e, context());
  assert.deepEqual((await user.json()).status, 'accepted');
  const repeated = await worker.fetch(req(`/api/sessions/${id}/voice/events`, 'POST',
    { voiceSessionId: voiceId, type: 'user', itemId: 'item_voice_1', transcript: 'What should I make with chicken thighs?' }, cookie), e, context());
  assert.equal((await repeated.json()).revision, 1);
  const usage = { input_tokens: 130, output_tokens: 120,
    input_token_details: { text_tokens: 115, audio_tokens: 15, cached_tokens: 0 },
    output_token_details: { text_tokens: 30, audio_tokens: 90 } };
  const replyInput = { voiceSessionId: voiceId, type: 'assistant', responseId: 'resp_voice_1', userItemId: 'item_voice_1',
    transcript: 'Try smoky gochujang chicken with cucumbers and rice, or lemony Greek chicken with potatoes.',
    firstUsefulMs: 410, fullMs: 1600, usage };
  const reply = await worker.fetch(req(`/api/sessions/${id}/voice/events`, 'POST', replyInput, cookie), e, context());
  assert.equal((await reply.json()).status, 'accepted');
  assert.equal((await (await worker.fetch(req(`/api/sessions/${id}/voice/events`, 'POST', replyInput, cookie), e, context())).json()).status, 'accepted');
  const saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
  assert.deepEqual(saved.turns.map(t => t.source), ['talk', 'talk']);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM model_calls').get().n, 1);
  assert.ok(e.DB.raw.prepare('SELECT estimated_usd FROM model_calls').get().estimated_usd > 0);
  await worker.fetch(req(`/api/sessions/${id}/voice/events`, 'POST',
    { voiceSessionId: voiceId, type: 'user', itemId: 'item_voice_2', transcript: 'Actually, something else.' }, cookie), e, context());
  const late = await worker.fetch(req(`/api/sessions/${id}/voice/events`, 'POST',
    { ...replyInput, responseId: 'resp_voice_late' }, cookie), e, context());
  assert.equal((await late.json()).status, 'stale_rejected');
  assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM turns WHERE role='assistant'").get().n, 1);
  assert.equal((await worker.fetch(req(`/api/sessions/${id}/voice/stop`, 'POST',
    { voiceSessionId: voiceId, failureCode: 'raw customer speech' }, cookie), e, context())).status, 400);
  await worker.fetch(req(`/api/sessions/${id}/voice/stop`, 'POST',
    { voiceSessionId: voiceId, failureCode: 'EMPTY_TRANSCRIPT' }, cookie), e, context());
  assert.equal(e.DB.raw.prepare('SELECT error_code FROM voice_sessions WHERE id=?').get(voiceId).error_code,
    'EMPTY_TRANSCRIPT');
  const stopped = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
  assert.equal(stopped.active_voice_id, null);
  assert.equal((await worker.fetch(req(`/api/sessions/${id}/voice/events`, 'POST',
    { voiceSessionId: voiceId, type: 'user', itemId: 'item_voice_3', transcript: 'Late' }, cookie), e, context())).status, 409);
});

test('Stage 1B closed-app return records push acceptance and opens only the owned conversation', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign','verify']);
  e.VAPID_PRIVATE_JWK = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));
  e.VAPID_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
  e.VAPID_SUBJECT = 'mailto:stage1b@example.test';
  const created = await worker.fetch(req('/api/sessions', 'POST', { context: '' }), e, context());
  const { id } = await created.json();
  const cookie = created.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
  const other = await createVisitorSession(e, 'Other customer');
  assert.equal((await worker.fetch(req('/api/push/pending', 'GET', undefined, other.cookie), e, context())).status, 404);
  assert.match(await (await worker.fetch(req('/sw.js'), e, context())).text(), /showNotification/);
  const subscribe = await worker.fetch(req('/api/push/subscribe', 'POST',
    { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/test-token' } }, cookie), e, context());
  assert.equal(subscribe.status, 200);
  assert.equal((await worker.fetch(req('/api/push/subscribe', 'POST',
    { subscription: { endpoint: 'https://internal.example/private' } }, cookie), e, context())).status, 400);
  const scheduled = await worker.fetch(req(`/api/sessions/${id}/return`, 'POST', { minutes: 1 }, cookie), e, context());
  assert.equal(scheduled.status, 201);
  const reminderId = (await scheduled.json()).reminderId;
  assert.equal((await (await worker.fetch(req('/api/push/pending', 'GET', undefined, cookie), e, context())).json()).reminder, null);
  e.DB.raw.prepare('UPDATE return_reminders SET due_at=? WHERE id=?').run('2020-01-01T00:00:00.000Z', reminderId);
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://fcm.googleapis.com/fcm/send/test-token');
    assert.match(options.headers.Authorization, /^vapid t=[\w.-]+, k=/);
    return new Response(null, { status: 201 });
  };
  try { await worker.scheduled({}, e); } finally { globalThis.fetch = original; }
  const pending = (await (await worker.fetch(req('/api/push/pending', 'GET', undefined, cookie), e, context())).json()).reminder;
  assert.equal(pending.id, reminderId);
  assert.equal(pending.sessionId, id);
  assert.equal((await worker.fetch(req('/api/push/ack', 'POST',
    { reminderId, kind: 'displayed' }, other.cookie), e, context())).status, 404);
  assert.equal((await worker.fetch(req('/api/push/ack', 'POST',
    { reminderId, kind: 'displayed' }, cookie), e, context())).status, 200);
  assert.equal((await worker.fetch(req('/api/push/ack', 'POST',
    { reminderId, kind: 'clicked' }, cookie), e, context())).status, 200);
  const result = e.DB.raw.prepare('SELECT status,attempt_count,push_accepted_at,displayed_at,clicked_at FROM return_reminders WHERE id=?')
    .get(reminderId);
  assert.equal(result.status, 'push_accepted');
  assert.equal(result.attempt_count, 1);
  assert.ok(result.push_accepted_at && result.displayed_at && result.clicked_at);
});

test('scheduled retention removes expired sessions and dependent records', async () => {
  const e = env();
  const { id } = await createVisitorSession(e, '');
  e.DB.raw.prepare('UPDATE sessions SET expires_at=? WHERE id=?').run('2020-01-01T00:00:00.000Z', id);
  await worker.scheduled({}, e);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM state_events').get().n, 0);
});
