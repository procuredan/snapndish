import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Script } from 'node:vm';
import worker from '../live-lab/worker.mjs';
import closedStage1b from '../stage1b/closed.mjs';
import { page } from '../live-lab/ui.mjs';
import { MEAL_PACKAGE_TOOL, RETAIL_MEAL_PACKAGE_TOOL, COOKING_QUALITY_MEAL_PACKAGE_TOOL, normalizeMealPlan } from '../live-lab/meal-plan.mjs';
import { COOKING_PROGRESS_TOOL_V2 } from '../live-lab/cooking-progress.mjs';
import { safeRealtimeMessage } from '../live-lab/realtime-diagnostics.mjs';
import { instructionsForCookingContent, instructionsForCookingVoice, instructionsForRetailShopping, instructionsForCookingQuality } from '../src/config.ts';

class TestDB {
  constructor() {
    this.raw = new DatabaseSync(':memory:');
    this.raw.exec(fs.readFileSync(new URL('../live-lab/migrations/0001_init.sql', import.meta.url), 'utf8'));
    for (const file of ['0002_turn_operations.sql', '0003_stage1b_identity_meal.sql',
      '0004_stage1b_images.sql', '0005_stage1b_context_snapshot.sql',
       '0006_stage1b_voice.sql', '0007_stage1b_return.sql', '0008_next_flow_shopping.sql',
       '0009_cooking_progress.sql', '0010_bridge_currentness_metrics.sql'])
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
function providerStream(text, output = []) {
  const frames = [
    { type: 'response.output_text.delta', delta: text.slice(0, 30) },
    { type: 'response.output_text.delta', delta: text.slice(30) },
     { type: 'response.completed', response: { id: 'resp_test', model: 'gpt-6-astra', output,
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
  const html = page('chat', 'testnonce', true, true);
  assert.match(html, /data-next-flow="true"/);
  assert.match(html, /Shopping list/);
  assert.doesNotThrow(() => new Script(html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]));
});

test('production presentation omits staging and test labels without changing Stage 1B behavior', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.RELEASE_ENV = 'production';
  e.BEHAVIOR_VERSION = 'stage1b-meal-package-v2';
  const home = await (await worker.fetch(req('/'), e, context())).text();
  const health = await (await worker.fetch(req('/health'), e, context())).json();
  const review = await (await worker.fetch(req('/review'), e, context())).text();
  const created = await worker.fetch(req('/api/sessions', 'POST', { context: '' }), e, context());
  const { id } = await created.json();
  const cookie = created.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
  assert.equal(health.stage, '1B-production');
  assert.equal(health.behavior_version, 'stage1b-meal-package-v2');
  assert.match(home, /<title>Snap n Dish<\/title>/);
  assert.match(home, /<option value="5">In 5 minutes<\/option>/);
  assert.doesNotMatch(home + review + JSON.stringify(health), /staging|\(test\)|Live Lab|private test records/i);
  assert.equal((await worker.fetch(req('/api/review/sessions'), e, context())).status, 401);
  assert.equal((await worker.fetch(req(`/api/sessions/${id}/return`, 'POST', { minutes: 1 }, cookie), e, context())).status, 400);
  const staging = page('chat', 'testnonce', true, true, true);
  assert.match(staging, /In 1 minute \(test\)/);
});

test('Stage 1B package keeps Shopping and a complete recipe together, then preserves edits and actual reports', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-meal-package-v1';
  const visitor = await createVisitorSession(e, 'Two people. A skillet and rice cooker.');
  const recipe = [
    { title: 'Rice', directions: 'Start 1 cup rice with the water required for that rice. Cook until tender.' },
    { title: 'Chicken', directions: 'Season 2 lb chicken thighs. Sear in 1 tbsp oil; cook until safely done.' },
    { title: 'Plate', directions: 'Finish with lime and serve the chicken over rice.' },
  ];
  const packageFor = (servings, chickenQuantity) => ({
    meal: 'Chicken with rice and lime', servings,
    sections: [
      { section: 'Meat', items: [{ name: 'Chicken thighs', quantity: chickenQuantity, have_status: 'need' }] },
      { section: 'Produce', items: [{ name: 'Lime', quantity: '2', have_status: 'need' }] },
      { section: 'Pantry', items: [{ name: 'Olive oil', quantity: '1 tbsp', have_status: 'assumed' }] },
    ], full_plan: recipe, current_action: 'Start the rice while you prepare the chicken.',
  });
  const responses = [
    { text: 'Perfect. I got you from here. Chicken with rice and lime.',
      call: { type: 'function_call', name: 'publish_meal_plan', arguments: JSON.stringify(packageFor(2, '2 lb')) } },
    { text: 'Start the rice while you prepare the chicken.',
      call: { type: 'function_call', name: 'update_cooking_progress', arguments: JSON.stringify({
        current_action: 'Start the rice while you prepare the chicken.', full_plan: null,
        remaining_components: null, customer_report: null, equipment_change: null,
      }) } },
    { text: 'Keep the rice cooking and prepare the chicken.',
      call: { type: 'function_call', name: 'update_cooking_progress', arguments: JSON.stringify({
        current_action: 'Keep the rice cooking and prepare the chicken.', full_plan: null,
        remaining_components: null,
        customer_report: { quote: 'The rice is going.', understood_as: 'Rice cooking has started' },
        equipment_change: null,
      }) } },
    { text: 'I adjusted the complete meal for four.',
      call: { type: 'function_call', name: 'publish_meal_plan', arguments: JSON.stringify(packageFor(4, '4 lb')) } },
  ];
  let call = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const input = JSON.parse(init.body);
    assert.equal(input.tools[0].strict, true);
    assert.ok(input.tools[0].parameters.properties.full_plan);
    assert.equal(input.tool_choice, 'auto');
    const result = responses[call++];
    assert.ok(result, 'one normal culinary call per turn');
    return providerStream(result.text, [result.call]);
  };
  async function send(text) {
    const revision = e.DB.raw.prepare('SELECT revision FROM sessions WHERE id=?').get(visitor.id).revision;
    const response = await worker.fetch(req(`/api/sessions/${visitor.id}/turns`, 'POST',
      { text, turnId: crypto.randomUUID(), expectedRevision: revision }, visitor.cookie), e, context());
    assert.match(await response.text(), /"type":"complete"/);
  }
  try {
    await send('Chicken with rice and lime for two.');
    let saved = await (await worker.fetch(req(`/api/sessions/${visitor.id}`, 'GET', undefined, visitor.cookie), e, context())).json();
    assert.deepEqual(saved.meal_plan.full_plan, recipe, 'full plan exists at commitment');
    assert.equal(saved.cooking_progress, null, 'no physical progress was invented');
    const sourceTurnId = e.DB.raw.prepare("SELECT id FROM turns WHERE session_id=? AND revision=1 AND role='user'")
      .get(visitor.id).id;
    const painted = await worker.fetch(req(`/api/sessions/${visitor.id}/metrics`, 'POST',
      { sourceTurnId, kind: 'full_plan_visible', revision: saved.meal_revision, elapsedMs: 940 }, visitor.cookie), e, context());
    assert.equal(painted.status, 200);
    assert.equal(e.DB.raw.prepare("SELECT json_extract(details_json,'$.elapsed_ms') AS ms FROM state_events WHERE kind='full_plan_visible'")
      .get().ms, 940);
    const before = Object.fromEntries(saved.meal_plan.sections.flatMap(s => s.items).map(item => [item.name, item]));
    for (const [name, checked] of [['Lime', true], ['Olive oil', false]]) {
      const item = saved.meal_plan.sections.flatMap(s => s.items).find(i => i.name === name);
      const changed = await worker.fetch(req(`/api/sessions/${visitor.id}/shopping/${item.id}`, 'PATCH',
        { expectedShoppingRevision: saved.shopping_revision, checked }, visitor.cookie), e, context());
      assert.equal(changed.status, 200);
      saved = await (await worker.fetch(req(`/api/sessions/${visitor.id}`, 'GET', undefined, visitor.cookie), e, context())).json();
    }
    await send("Let's cook.");
    saved = await (await worker.fetch(req(`/api/sessions/${visitor.id}`, 'GET', undefined, visitor.cookie), e, context())).json();
    assert.deepEqual(saved.cooking_progress.full_plan, recipe, 'cooking focus reused the package plan');
    assert.equal(saved.cooking_progress.reports.length, 0);
    await send('The rice is going.');
    await send('Make it four people instead.');
    saved = await (await worker.fetch(req(`/api/sessions/${visitor.id}`, 'GET', undefined, visitor.cookie), e, context())).json();
    const after = Object.fromEntries(saved.meal_plan.sections.flatMap(s => s.items).map(item => [item.name, item]));
    assert.equal(after.Lime.id, before.Lime.id);
    assert.equal(after.Lime.checked, true);
    assert.equal(after.Lime.customer_edited, true);
    assert.equal(after['Olive oil'].id, before['Olive oil'].id);
    assert.equal(after['Olive oil'].checked, false);
    assert.equal(after['Olive oil'].customer_edited, true);
    assert.equal(after['Chicken thighs'].checked, false);
    assert.equal(after['Chicken thighs'].quantity_changed, true);
    assert.equal(saved.cooking_progress.reports[0].understood_as, 'Rice cooking has started');
    assert.deepEqual(saved.cooking_progress.full_plan, recipe);
    assert.equal(call, responses.length);
    const html = page('chat', 'testnonce', true, true, true);
    assert.match(html, /data-meal-package="true"/);
    assert.ok(html.indexOf('id="recipe"') > html.indexOf('id="plan-details"'), 'recipe follows Shopping');
  } finally { globalThis.fetch = original; }
});

test('a Stage 1B meal package rejects missing or malformed cooking sections', () => {
  const base = { meal: 'A complete supper', servings: 2,
    sections: [{ section: 'Produce', items: [{ name: 'Potatoes', quantity: '1 lb', have_status: 'need' }] }],
    current_action: 'Start the potatoes.' };
  assert.equal(normalizeMealPlan(base, { requireFullPlan: true }), null);
  assert.equal(normalizeMealPlan({ ...base, full_plan: 'Start potatoes' }, { requireFullPlan: true }), null);
  assert.equal(normalizeMealPlan({ ...base, full_plan: [{ title: 'Potatoes', directions: 'Roast 1 lb potatoes until tender.' }] },
    { requireFullPlan: true }).full_plan.length, 1);
});

test('cooking-content v2 keeps the package authority path and voice bridge', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-meal-package-v2';
  const visitor = await createVisitorSession(e, 'Two people. Blackstone and rice cooker.');
  const proposal = { meal: 'Pork souvlaki with rice, tzatziki and salad', servings: 2,
    sections: [{ section: 'Meat', items: [{ name: 'Pork loin', quantity: '1 lb', have_status: 'need' }] }],
    full_plan: [{ title: 'Cook pork', directions: 'Cook 1 lb pork on the Blackstone until done.' },
      { title: 'Plate', directions: 'Serve pork with rice, tzatziki and salad.' }],
    current_action: 'Start the rice and tzatziki.' };
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(init.body);
    assert.match(body.instructions, /quantities at the point of use/i);
    assert.match(body.instructions, /Shopping ingredients, an actual cooking or preparation action/i);
    assert.equal(body.tools[0].name, 'publish_meal_plan');
    return providerStream('Pork souvlaki with rice, tzatziki and salad it is.',
      [{ type: 'function_call', name: 'publish_meal_plan', arguments: JSON.stringify(proposal) }]);
  };
  try {
    const turn = await worker.fetch(req(`/api/sessions/${visitor.id}/turns`, 'POST',
      { text: 'Pork souvlaki for two, please.', turnId: crypto.randomUUID(), expectedRevision: 0 }, visitor.cookie),
    e, context());
    assert.match(await turn.text(), /"type":"complete"/);
    const saved = await (await worker.fetch(req(`/api/sessions/${visitor.id}`, 'GET', undefined,
      visitor.cookie), e, context())).json();
    assert.deepEqual(saved.meal_plan.full_plan, proposal.full_plan);
    assert.equal(saved.cooking_progress, null);
    assert.equal(calls, 1, 'one primary culinary call');
    const html = await (await worker.fetch(req('/'), e, context())).text();
    assert.match(html, /data-meal-package="true"/);
  } finally { globalThis.fetch = original; }

  const second = await createVisitorSession(e, 'Two people. Blackstone and rice cooker.');
  globalThis.fetch = async (_url, options) => {
    const setup = JSON.parse(options.body.get('session'));
    assert.match(setup.instructions, /quantities at the point of use/i);
    assert.equal(setup.tools[0].name, 'publish_meal_plan');
    return new Response('v=0\r\nanswer', { status: 201 });
  };
  try {
    const response = await worker.fetch(req(`/api/sessions/${second.id}/voice/start`, 'POST',
      { sdp: 'v=0\r\noffer', expectedRevision: 0 }, second.cookie), e, context());
    assert.equal(response.status, 201);
    const connected = await response.json();
    assert.equal(connected.behaviorVersion, 'stage1b-meal-package-v2+voice-bridge-v2');
    assert.match(connected.cookingSyncInstructions, /quantities at the point of use/i);
  } finally { globalThis.fetch = original; }
});

test('cooking voice v3 changes only plan-writing guidance on the existing text and Realtime paths', async () => {
  const v2 = instructionsForCookingContent('Two people. A skillet.');
  const v3 = instructionsForCookingVoice('Two people. A skillet.');
  assert.match(v2, /chef's coordination note/);
  assert.doesNotMatch(v3, /end with a brief chef's coordination note/);
  assert.match(v3, /Put timing and coordination where the cook needs them/);
  assert.match(v3, /each quantity where it is used/);
  assert.match(v3, /final assembly/);
  assert.equal(v3.slice(0, v3.indexOf('Cooking-content refinement')),
    v2.slice(0, v2.indexOf('Cooking-content refinement')), 'discovery and package behavior prefix is unchanged');

  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-meal-package-v3';
  const visitor = await createVisitorSession(e, 'Two people. A skillet.');
  const original = globalThis.fetch;
  let textCalls = 0;
  globalThis.fetch = async (_url, init) => {
    textCalls++;
    const request = JSON.parse(init.body);
    assert.match(request.instructions, /Put timing and coordination where the cook needs them/);
    assert.deepEqual(request.tools.map(tool => tool.name), ['publish_meal_plan', 'update_cooking_progress']);
    assert.deepEqual(request.tools.map(tool => tool.strict), [true, true]);
    return providerStream('A few good dinner directions.');
  };
  try {
    const turn = await worker.fetch(req(`/api/sessions/${visitor.id}/turns`, 'POST',
      { text: 'Chicken thighs tonight.', turnId: crypto.randomUUID(), expectedRevision: 0 }, visitor.cookie), e, context());
    assert.match(await turn.text(), /"type":"complete"/);
    assert.equal(textCalls, 1);
  } finally { globalThis.fetch = original; }

  globalThis.fetch = async (_url, init) => {
    const setup = JSON.parse(init.body.get('session'));
    assert.match(setup.instructions, /Put timing and coordination where the cook needs them/);
    assert.deepEqual(setup.tools.map(tool => tool.name), ['publish_meal_plan', 'update_cooking_progress']);
    assert.ok(setup.tools.every(tool => !Object.hasOwn(tool, 'strict')));
    assert.equal(setup.audio.output.voice, 'marin');
    assert.equal(setup.model, 'gpt-realtime-2.1');
    return new Response('v=0\r\nanswer', { status: 201 });
  };
  try {
    const second = await createVisitorSession(e, 'Two people. A skillet.');
    const response = await worker.fetch(req(`/api/sessions/${second.id}/voice/start`, 'POST',
      { sdp: 'v=0\r\noffer', expectedRevision: 0 }, second.cookie), e, context());
    assert.equal(response.status, 201);
    const connected = await response.json();
    assert.equal(connected.behaviorVersion, 'stage1b-meal-package-v3+voice-bridge-v2');
    assert.match(connected.cookingSyncInstructions, /Put timing and coordination where the cook needs them/);
  } finally { globalThis.fetch = original; }
});

test('retail Shopping v4 accepts a revised complete package and keeps text/voice authority intact', async () => {
  const v3 = instructionsForCookingVoice('Four diners.');
  const v4 = instructionsForRetailShopping('Four diners.');
  assert.ok(v4.startsWith(v3), 'discovery and cooking instructions remain unchanged');
  assert.match(v4, /first total each ingredient across all meal components/i);
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-meal-package-v4';
  const visitor = await createVisitorSession(e, 'No allergies. A skillet.');
  const packageFor = (servings, cups, ounces, display, retailTotal) => ({
    meal: 'Greek yogurt breakfast bowls with berries', servings,
    sections: [{ section: 'Dairy', items: [{ name: 'Greek yogurt', quantity: display,
      required_quantity: `${cups} cups`, normalized_quantity: { amount: ounces, unit: 'fl oz' },
      retail_total: { amount: retailTotal, unit: 'fl oz' }, have_status: 'need' }] }],
    full_plan: [{ title: 'Build the bowls', directions: `Spoon ${cups} cups Greek yogurt into the bowls and add berries.` }],
    current_action: 'Put out the bowls.',
  });
  const proposals = [packageFor(4, 2, 16, '1 × 32-oz tub', 32),
    packageFor(20, 10, 80, '3 × 32-oz tubs', 96)];
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.equal(request.tools[0].strict, true, 'Responses keeps strict tools');
    assert.deepEqual(request.tools[0], RETAIL_MEAL_PACKAGE_TOOL);
    assert.match(request.instructions, /retail_total must meet or slightly exceed/i);
    const proposal = proposals[call++];
    return providerStream('I got you. Breakfast bowls it is.',
      [{ type: 'function_call', name: 'publish_meal_plan', arguments: JSON.stringify(proposal) }]);
  };
  async function send(text) {
    const revision = e.DB.raw.prepare('SELECT revision FROM sessions WHERE id=?').get(visitor.id).revision;
    const turn = await worker.fetch(req(`/api/sessions/${visitor.id}/turns`, 'POST',
      { text, turnId: crypto.randomUUID(), expectedRevision: revision }, visitor.cookie), e, context());
    assert.match(await turn.text(), /"type":"complete"/);
    return (await (await worker.fetch(req(`/api/sessions/${visitor.id}`, 'GET', undefined, visitor.cookie),
      e, context())).json());
  }
  let saved;
  try {
    saved = await send('Breakfast bowls for four.');
    let yogurt = saved.meal_plan.sections[0].items[0];
    assert.equal(yogurt.quantity, '1 × 32-oz tub');
    assert.equal(yogurt.required_quantity, '2 cups');
    assert.deepEqual(yogurt.purchase_requirement, { amount: 16, unit: 'fl oz' });
    const changed = await worker.fetch(req(`/api/sessions/${visitor.id}/shopping/${yogurt.id}`, 'PATCH',
      { checked: true, expectedShoppingRevision: saved.shopping_revision }, visitor.cookie), e, context());
    assert.equal(changed.status, 200);
    yogurt = (await changed.json()).mealPlan.sections[0].items[0];
    assert.deepEqual(yogurt.purchase_requirement, { amount: 0, unit: 'fl oz' });
    saved = await send('Make it for twenty instead.');
    yogurt = saved.meal_plan.sections[0].items[0];
    assert.equal(yogurt.quantity, '3 × 32-oz tubs');
    assert.equal(yogurt.required_quantity, '10 cups');
    assert.deepEqual(yogurt.normalized_quantity, { amount: 80, unit: 'fl oz' });
    assert.deepEqual(yogurt.purchase_requirement, { amount: 80, unit: 'fl oz' });
    assert.equal(yogurt.checked, false, 'prior possession requires review after requirement grows');
    assert.match(saved.meal_plan.full_plan[0].directions, /10 cups Greek yogurt/,
      'retail packaging did not replace the cooking quantity');
    assert.equal(call, 2);
  } finally { globalThis.fetch = original; }

  globalThis.fetch = async (_url, init) => {
    const setup = JSON.parse(init.body.get('session'));
    assert.equal(setup.model, 'gpt-realtime-2.1');
    assert.equal(setup.audio.output.voice, 'marin');
    assert.deepEqual(setup.tools.map(tool => tool.name), ['publish_meal_plan', 'update_cooking_progress']);
    assert.ok(setup.tools.every(tool => !Object.hasOwn(tool, 'strict')),
      'Realtime continues omitting unsupported top-level strict');
    assert.ok(setup.tools[0].parameters.properties.sections.items.properties.items.items.properties.retail_total);
    return new Response('v=0\r\nanswer', { status: 201 });
  };
  try {
    const response = await worker.fetch(req(`/api/sessions/${visitor.id}/voice/start`, 'POST',
      { sdp: 'v=0\r\noffer', expectedRevision: saved.revision }, visitor.cookie), e, context());
    assert.equal(response.status, 201);
    assert.equal((await response.json()).behaviorVersion, 'stage1b-meal-package-v4+voice-bridge-v2');
  } finally { globalThis.fetch = original; }
});

test('cooking quality v5 replaces compression guidance while retaining retail acceptance and shared voice tools', async () => {
  const contextText = 'Two diners. Rice cooker explicitly selected. No allergies.';
  const v4 = instructionsForRetailShopping(contextText);
  const v5 = instructionsForCookingQuality(contextText);
  assert.equal(v5.slice(0, v5.indexOf('Stage 1B meal-package behavior')),
    v4.slice(0, v4.indexOf('Stage 1B meal-package behavior')));
  assert.doesNotMatch(v5, /short action lines|Complete does not mean verbose|Cooking-content refinement/);
  assert.match(v5, /shorter is not the goal/i);
  assert.match(v5, /retail_total must meet or slightly exceed/i);
  assert.deepEqual(COOKING_QUALITY_MEAL_PACKAGE_TOOL.parameters.properties.sections,
    RETAIL_MEAL_PACKAGE_TOOL.parameters.properties.sections);
  assert.equal(COOKING_QUALITY_MEAL_PACKAGE_TOOL.strict, true);

  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-meal-package-v5';
  const visitor = await createVisitorSession(e, contextText);
  const proposal = { meal: 'Ginger chicken with rice', servings: 2,
    sections: [{ section: 'Meat', items: [{ name: 'Chicken thighs', quantity: '1 × 1-lb pack',
      required_quantity: '12 oz', normalized_quantity: { amount: 12, unit: 'oz' },
      retail_total: { amount: 16, unit: 'oz' }, have_status: 'need' }] }],
    full_plan: [{ title: 'Rice', directions: 'Cook 3/4 cup jasmine rice in the selected rice cooker.' },
      { title: 'Chicken and plate', directions: 'Brown 12 oz chicken until cooked through, then serve with the rice.' }],
    current_action: 'Start the rice.' };
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const request = JSON.parse(init.body);
    assert.equal(request.max_output_tokens, 4096);
    assert.equal(request.reasoning.effort, 'medium');
    assert.deepEqual(request.tools[0], COOKING_QUALITY_MEAL_PACKAGE_TOOL);
    assert.match(request.instructions, /selected equipment governs the method/i);
    return providerStream('Ginger chicken and rice it is. I have the whole meal ready.',
      [{ type: 'function_call', name: 'publish_meal_plan', arguments: JSON.stringify(proposal) }]);
  };
  let saved;
  try {
    const answer = await worker.fetch(req(`/api/sessions/${visitor.id}/turns`, 'POST',
      { text: 'Ginger chicken and rice for two. Use my rice cooker.', turnId: crypto.randomUUID(),
        expectedRevision: 0 }, visitor.cookie), e, context());
    assert.match(await answer.text(), /"type":"complete"/);
    saved = await (await worker.fetch(req(`/api/sessions/${visitor.id}`, 'GET', undefined,
      visitor.cookie), e, context())).json();
    assert.equal(saved.meal_plan.meal, proposal.meal);
    assert.deepEqual(saved.meal_plan.full_plan, proposal.full_plan);
    assert.equal(saved.meal_plan.sections[0].items[0].quantity, '1 × 1-lb pack');
  } finally { globalThis.fetch = original; }

  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/realtime/calls');
    const setup = JSON.parse(init.body.get('session'));
    assert.match(setup.instructions, /shorter is not the goal/i);
    assert.deepEqual(setup.tools.map(tool => tool.name), ['publish_meal_plan', 'update_cooking_progress']);
    assert.ok(setup.tools.every(tool => !Object.hasOwn(tool, 'strict')));
    assert.deepEqual(setup.tools[0].parameters, COOKING_QUALITY_MEAL_PACKAGE_TOOL.parameters);
    return new Response('v=0\r\nanswer', { status: 201 });
  };
  try {
    const connected = await worker.fetch(req(`/api/sessions/${visitor.id}/voice/start`, 'POST',
      { sdp: 'v=0\r\noffer', expectedRevision: saved.revision }, visitor.cookie), e, context());
    assert.equal(connected.status, 201);
    const body = await connected.json();
    assert.equal(body.behaviorVersion, 'stage1b-meal-package-v5+voice-bridge-v2');
    assert.match(body.cookingSyncInstructions, /shorter is not the goal/i);
  } finally { globalThis.fetch = original; }
});

test('an exhausted V5 response records a bounded incomplete reason without accepting a package', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-meal-package-v5';
  const visitor = await createVisitorSession(e, 'Two diners.');
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ type: 'response.incomplete',
      response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens',
        private_customer_content: 'do-not-record-private-content' } } }) + '\n\n'));
    controller.close();
  } }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  try {
    const result = await worker.fetch(req(`/api/sessions/${visitor.id}/turns`, 'POST',
      { text: 'The chicken dinner for two, please.', turnId: crypto.randomUUID(),
        expectedRevision: 0 }, visitor.cookie), e, context());
    assert.match(await result.text(), /INCOMPLETE_MAX_OUTPUT_TOKENS/);
    const call = e.DB.raw.prepare('SELECT status,error_code,assistant_text FROM model_calls').get();
    assert.equal(call.status, 'error');
    assert.equal(call.error_code, 'INCOMPLETE_MAX_OUTPUT_TOKENS');
    assert.doesNotMatch(JSON.stringify(call), /do-not-record-private-content/);
    const saved = await (await worker.fetch(req(`/api/sessions/${visitor.id}`, 'GET', undefined,
      visitor.cookie), e, context())).json();
    assert.equal(saved.meal_plan, null);
  } finally { globalThis.fetch = original; }
});

test('a revised package applies new ingredient facts but preserves manual Shopping choices', () => {
  const prior = normalizeMealPlan({ meal: 'Dinner', servings: 2,
    sections: [{ section: 'Pantry', items: [
      { name: 'Oil', quantity: '2 tbsp', have_status: 'assumed' },
      { name: 'Rice', quantity: '1 cup', have_status: 'need' },
    ] }] });
  prior.sections[0].items[1].checked = true;
  prior.sections[0].items[1].have_status = 'confirmed';
  prior.sections[0].items[1].customer_edited = true;
  const next = normalizeMealPlan({ meal: 'Dinner', servings: 2,
    sections: [{ section: 'Pantry', items: [
      { name: 'Oil', quantity: '2 tbsp', have_status: 'need' },
      { name: 'Rice', quantity: '1 cup', have_status: 'need' },
    ] }] }, { priorPlan: prior });
  assert.equal(next.sections[0].items[0].checked, false, 'newly reported missing staple overrides assumption');
  assert.equal(next.sections[0].items[1].checked, true, 'manual check survives unrelated revision');
  assert.equal(next.sections[0].items[1].customer_edited, true);
});

test('one commitment response can atomically accept related meal and Now proposals', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-meal-package-v1';
  const { id, cookie } = await createVisitorSession(e, 'Dinner for two.');
  const recipe = [{ title: 'Chicken', directions: 'Cook 1 lb chicken thighs until safely done.' }];
  const packageCall = { meal: 'Chicken dinner', servings: 2,
    sections: [{ section: 'Meat', items: [{ name: 'Chicken thighs', quantity: '1 lb', have_status: 'confirmed' }] }],
    full_plan: recipe, current_action: 'Cook the chicken.' };
  const original = globalThis.fetch;
  globalThis.fetch = async () => providerStream('Chicken dinner it is.', [
    { type: 'function_call', name: 'publish_meal_plan', arguments: JSON.stringify(packageCall) },
    { type: 'function_call', name: 'update_cooking_progress', arguments: JSON.stringify({
      current_action: 'Start heating the skillet for the chicken.', full_plan: null,
      remaining_components: null, customer_report: null, equipment_change: null,
    }) },
  ]);
  try {
    const response = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text: 'Make the chicken dinner for two and let’s cook.', turnId: crypto.randomUUID(), expectedRevision: 0 }, cookie), e, context());
    assert.match(await response.text(), /"type":"complete"/);
  } finally { globalThis.fetch = original; }
  const saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
  assert.equal(saved.meal_revision, 1);
  assert.equal(saved.cooking_revision, 1);
  assert.equal(saved.cooking_progress.current_action, 'Start heating the skillet for the chicken.');
  assert.deepEqual(saved.cooking_progress.full_plan, recipe);
  assert.equal(saved.cooking_progress.reports.length, 0);
});

test('Talk It accepts the complete package before speaking and reuses it on reconnect', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-meal-package-v1';
  const { id, cookie } = await createVisitorSession(e, 'Two people. Skillet and rice cooker.');
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const setup = JSON.parse(options.body.get('session'));
    assert.equal(Object.hasOwn(setup.tools[0], 'strict'), false);
    assert.ok(setup.tools[0].parameters.properties.full_plan);
    return new Response('v=0\r\nanswer', { status: 201 });
  };
  let voiceId;
  try {
    const response = await worker.fetch(req(`/api/sessions/${id}/voice/start`, 'POST',
      { sdp: 'v=0\r\noffer', expectedRevision: 0 }, cookie), e, context());
    assert.equal(response.status, 201);
    const connected = await response.json();
    voiceId = connected.voiceSessionId;
    assert.equal(connected.behaviorVersion, 'stage1b-meal-package-v1+voice-bridge-v2');
  } finally { globalThis.fetch = original; }
  const post = async payload => {
    const response = await worker.fetch(req(`/api/sessions/${id}/voice/events`, 'POST',
      { voiceSessionId: voiceId, ...payload }, cookie), e, context());
    assert.equal(response.status, 200);
    return response.json();
  };
  const user = await post({ type: 'user', itemId: 'item_package_one',
    transcript: 'Make the lemon chicken with rice and salad for two.' });
  const packageCall = { meal: 'Lemon chicken, rice and cucumber salad', servings: 2,
    sections: [{ section: 'Meat', items: [{ name: 'Chicken thighs', quantity: '1 lb', have_status: 'need' }] },
      { section: 'Produce', items: [{ name: 'Cucumber', quantity: '1', have_status: 'need' }] },
      { section: 'Pantry', items: [{ name: 'Rice', quantity: '1 cup', have_status: 'assumed' }] }],
    full_plan: [{ title: 'Rice', directions: 'Cook 1 cup rice in the rice cooker until tender.' },
      { title: 'Chicken and salad', directions: 'Sear 1 lb chicken until safely done; slice cucumber and serve.' }],
    current_action: 'Start the rice, then prepare the chicken and cucumber.' };
  const result = await post({ type: 'proposal', responseId: 'resp_package_one',
    userItemId: 'item_package_one', call: { name: 'publish_meal_plan', arguments: JSON.stringify(packageCall) },
    usage: { input_tokens: 80, output_tokens: 120 }, fullMs: 2900 });
  assert.equal(result.accepted, true);
  assert.equal(result.operation, 'meal');
  let saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
  assert.equal(saved.meal_plan.full_plan.length, 2);
  assert.equal(saved.cooking_progress, null);
  assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM turns WHERE role='assistant'").get().n, 0,
    'proposal acceptance precedes the spoken continuation');
  const spoken = await post({ type: 'assistant', responseId: 'resp_package_speech',
    userItemId: 'item_package_one', transcript: 'Lemon chicken with rice and salad it is. Shopping and the recipe are ready.' });
  assert.equal(spoken.status, 'accepted');
  saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
  assert.equal(saved.turns.at(-1).source, 'talk');
  assert.equal(saved.meal_revision, 1);
  const metric = await worker.fetch(req(`/api/sessions/${id}/metrics`, 'POST',
    { sourceTurnId: user.turnId, kind: 'full_plan_visible', revision: 1, elapsedMs: 610 }, cookie), e, context());
  assert.equal(metric.status, 200);
  assert.equal((await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined,
    (await createVisitorSession(e, 'Other visitor')).cookie), e, context())).status, 404);
  assert.equal((await worker.fetch(req(`/api/sessions/${id}/voice/stop`, 'POST',
    { voiceSessionId: voiceId }, cookie), e, context())).status, 200);
  globalThis.fetch = async (_url, options) => {
    const setup = JSON.parse(options.body.get('session'));
    assert.match(setup.instructions, /Lemon chicken, rice and cucumber salad/);
    assert.match(setup.instructions, /Cook 1 cup rice/);
    return new Response('v=0\r\nanswer', { status: 201 });
  };
  try {
    const reopened = await worker.fetch(req(`/api/sessions/${id}/voice/start`, 'POST',
      { sdp: 'v=0\r\noffer', expectedRevision: saved.revision }, cookie), e, context());
    assert.equal(reopened.status, 201);
  } finally { globalThis.fetch = original; }
});

test('Realtime tools omit Responses-only strict without changing either tool schema', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-meal-package-v2';
  const voice = await createVisitorSession(e, '');
  const original = globalThis.fetch;
  let realtimeSeen = false, responsesSeen = false;
  globalThis.fetch = async (url, options) => {
    if (url === 'https://api.openai.com/v1/realtime/calls') {
      const setup = JSON.parse(options.body.get('session'));
      assert.deepEqual(setup.tools.map(tool => tool.name), ['publish_meal_plan', 'update_cooking_progress']);
      assert.ok(setup.tools.every(tool => !Object.hasOwn(tool, 'strict')));
      assert.deepEqual(setup.tools[0].parameters, MEAL_PACKAGE_TOOL.parameters);
      assert.deepEqual(setup.tools[1].parameters, COOKING_PROGRESS_TOOL_V2.parameters);
      realtimeSeen = true;
      return new Response('v=0\r\nanswer', { status: 201 });
    }
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const setup = JSON.parse(options.body);
    assert.deepEqual(setup.tools.map(tool => tool.strict), [true, true]);
    assert.deepEqual(setup.tools[0].parameters, MEAL_PACKAGE_TOOL.parameters);
    assert.deepEqual(setup.tools[1].parameters, COOKING_PROGRESS_TOOL_V2.parameters);
    responsesSeen = true;
    return providerStream('Try lemon chicken with potatoes or ginger chicken with rice.');
  };
  try {
    const started = await worker.fetch(req(`/api/sessions/${voice.id}/voice/start`, 'POST',
      { sdp: 'v=0\r\noffer', expectedRevision: 0 }, voice.cookie), e, context());
    assert.equal(started.status, 201);
    const text = await createVisitorSession(e, '');
    const answer = await worker.fetch(req(`/api/sessions/${text.id}/turns`, 'POST',
      { text: 'Chicken thighs tonight', turnId: crypto.randomUUID(), expectedRevision: 0 }, text.cookie), e, context());
    assert.match(await answer.text(), /"type":"complete"/);
  } finally { globalThis.fetch = original; }
  assert.equal(realtimeSeen, true);
  assert.equal(responsesSeen, true);
  assert.equal(MEAL_PACKAGE_TOOL.strict, true);
  assert.equal(COOKING_PROGRESS_TOOL_V2.strict, true);
});

test('a cooking-only proposal cannot fork the accepted package recipe', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-meal-package-v1';
  const { id, cookie } = await createVisitorSession(e, 'Dinner for two.');
  const plan = { meal: 'Rice and chicken', servings: 2,
    sections: [{ section: 'Meat', items: [{ id: crypto.randomUUID(), name: 'Chicken', quantity: '1 lb',
      have_status: 'confirmed', checked: true }] }],
    full_plan: [{ title: 'Rice', directions: 'Cook 1 cup rice until tender.' },
      { title: 'Chicken', directions: 'Cook 1 lb chicken until safely done.' }],
    current_action: 'Start the rice.' };
  e.DB.raw.prepare('UPDATE sessions SET meal_revision=1,meal_plan_json=?,shopping_revision=1 WHERE id=?')
    .run(JSON.stringify(plan), id);
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('v=0\r\nanswer', { status: 201 });
  let voiceId;
  try {
    const started = await worker.fetch(req(`/api/sessions/${id}/voice/start`, 'POST',
      { sdp: 'v=0\r\noffer', expectedRevision: 0 }, cookie), e, context());
    assert.equal(started.status, 201);
    voiceId = (await started.json()).voiceSessionId;
  } finally { globalThis.fetch = original; }
  await worker.fetch(req(`/api/sessions/${id}/voice/events`, 'POST',
    { voiceSessionId: voiceId, type: 'user', itemId: 'item_recipe_change',
      transcript: 'I do not have rice; use potatoes instead.' }, cookie), e, context());
  const proposed = await worker.fetch(req(`/api/sessions/${id}/voice/events`, 'POST',
    { voiceSessionId: voiceId, type: 'proposal', responseId: 'resp_recipe_change',
      userItemId: 'item_recipe_change', call: { name: 'update_cooking_progress',
        arguments: JSON.stringify({ current_action: 'Cook potatoes instead.',
          full_plan: [{ title: 'Potatoes', directions: 'Boil 1 lb potatoes until tender.' },
            { title: 'Chicken', directions: 'Cook 1 lb chicken until safely done.' }],
          remaining_components: null, customer_report: null, equipment_change: null }) } }, cookie), e, context());
  assert.equal(proposed.status, 200);
  const result = await proposed.json();
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'FULL_PLAN_REQUIRES_MEAL_PACKAGE_REVISION');
  const saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
  assert.deepEqual(saved.meal_plan.full_plan, plan.full_plan);
  assert.equal(saved.cooking_progress, null);
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

test('Realtime initialization preserves only bounded provider diagnostics', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-meal-package-v2';
  const { id, cookie } = await createVisitorSession(e, 'Synthetic private customer fact');
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: {
      type: 'invalid_request_error', code: 'invalid_function_parameters',
      param: 'session.tools[0].parameters',
      message: "Invalid schema for function 'publish_meal_plan': In context=('properties', 'full_plan', 'items'), 'additionalProperties' is required to be supplied and to be false.",
      secret: 'sk-proj-synthetic-private-value',
      transcript: 'Synthetic private customer fact',
    },
  }), { status: 400, headers: { 'x-request-id': 'req_test-123' } });
  try {
    const response = await worker.fetch(req(`/api/sessions/${id}/voice/start`, 'POST',
      { sdp: 'v=0\r\noffer-private-marker', expectedRevision: 0 }, cookie), e, context());
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'HTTP_400' });
  } finally { globalThis.fetch = original; }
  const row = e.DB.raw.prepare("SELECT details_json FROM state_events WHERE kind='voice_init_failed'").get();
  assert.ok(row);
  const diagnostic = JSON.parse(row.details_json);
  assert.equal(diagnostic.upstream_status, 400);
  assert.equal(diagnostic.openai_error_type, 'invalid_request_error');
  assert.equal(diagnostic.openai_error_code, 'invalid_function_parameters');
  assert.equal(diagnostic.openai_error_param, 'session.tools[0].parameters');
  assert.match(diagnostic.openai_error_message, /additionalProperties is required to be false/);
  assert.equal(diagnostic.openai_request_id, 'req_test-123');
  assert.equal(diagnostic.model, 'gpt-realtime-2.1');
  assert.equal(diagnostic.behavior_version, 'stage1b-meal-package-v2+voice-bridge-v2');
  assert.equal(diagnostic.endpoint, '/v1/realtime/calls');
  assert.equal(diagnostic.session_type, 'realtime');
  assert.equal(diagnostic.voice, 'marin');
  assert.equal(diagnostic.transcription_model, 'gpt-live-transcribe');
  assert.equal(diagnostic.turn_detection, 'semantic_vad');
  assert.deepEqual(diagnostic.tool_schemas.map(t => t.name), ['publish_meal_plan', 'update_cooking_progress']);
  assert.ok(diagnostic.tool_schemas.every(t => /^[a-f0-9]{16}$/.test(t.schema_fingerprint)));
  assert.equal(diagnostic.field_presence.customer_context, true);
  assert.equal(diagnostic.field_presence.accepted_meal, false);
  assert.doesNotMatch(row.details_json, /sk-proj|Synthetic private|offer-private-marker|Authorization|instructionsFor/);
  assert.equal(e.DB.raw.prepare('SELECT error_code FROM voice_sessions').get().error_code, 'HTTP_400');
  assert.equal(e.DB.raw.prepare('SELECT active_voice_id FROM sessions WHERE id=?').get(id).active_voice_id, null);
});

test('Realtime initialization with malformed or hostile errors records no arbitrary content', async () => {
  assert.equal(safeRealtimeMessage("Invalid value for 'session.instructions': Bearer sk-proj-example Customer: private"),
    'Invalid value or type for session.instructions.');
  assert.equal(safeRealtimeMessage('Customer: private meal and sk-proj-example'), null);
  for (const body of ['<html>sk-proj-private Customer: secret meal</html>',
    JSON.stringify({ error: { type: 'private words here', code: 'sk-proj-private',
      message: 'Customer: secret meal', param: 'sk-proj-private' } })]) {
    const e = env();
    e.STAGE1B_ENABLED = 'true';
    const { id, cookie } = await createVisitorSession(e, '');
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(body, { status: 400,
      headers: { 'x-request-id': 'req.invalid' } });
    try {
      const response = await worker.fetch(req(`/api/sessions/${id}/voice/start`, 'POST',
        { sdp: 'v=0\r\noffer', expectedRevision: 0 }, cookie), e, context());
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: 'HTTP_400' });
    } finally { globalThis.fetch = original; }
    const diagnostic = e.DB.raw.prepare("SELECT details_json FROM state_events WHERE kind='voice_init_failed'").get().details_json;
    assert.doesNotMatch(diagnostic, /sk-proj|Customer: secret|req\.invalid|private words here|<html>/);
    assert.equal(JSON.parse(diagnostic).openai_error_message, null);
  }
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

test('Stage 1B next flow accepts one current meal proposal and keeps shopping editable', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-next-flow-v1';
  const { id, cookie } = await createVisitorSession(e, 'Owns a Blackstone.');
  const proposal = { meal: 'Chicken tacos, lime slaw and black beans', servings: 8, sections: [
    { section: 'Produce', items: [{ name: 'Limes', quantity: '8', have_status: 'need' }] },
    { section: 'Pantry', items: [{ name: 'Cumin', quantity: '2 teaspoons', have_status: 'assumed' }] },
  ] };
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.tools?.[0]?.name, 'publish_meal_plan');
    assert.match(body.instructions, /never ask for facts already known or volunteered/i);
    return providerStream('I got you from here. Chicken tacos with lime slaw and black beans.',
      [{ type: 'function_call', name: 'publish_meal_plan', arguments: JSON.stringify(proposal) }]);
  };
  try {
    const response = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text: 'Tacos for eight; no allergies.', turnId: crypto.randomUUID(), expectedRevision: 0 }, cookie), e, context());
    assert.match(await response.text(), /"type":"complete"/);
  } finally { globalThis.fetch = original; }
  const saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
  assert.equal(saved.meal_revision, 1);
  assert.equal(saved.shopping_revision, 1);
  assert.equal(saved.meal_plan.meal, proposal.meal);
  assert.equal(saved.meal_plan.sections[0].items[0].checked, false);
  assert.equal(saved.meal_plan.sections[1].items[0].checked, true);
  assert.equal(saved.meal_plan.sections[1].items[0].have_status, 'assumed');
  const itemId = saved.meal_plan.sections[0].items[0].id;
  const changed = await worker.fetch(req(`/api/sessions/${id}/shopping/${itemId}`, 'PATCH',
    { checked: true, expectedShoppingRevision: 1 }, cookie), e, context());
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).mealPlan.sections[0].items[0].checked, true);
  assert.equal((await worker.fetch(req(`/api/sessions/${id}/shopping/${itemId}`, 'PATCH',
    { checked: false, expectedShoppingRevision: 1 }, cookie), e, context())).status, 409);
  assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM state_events WHERE kind='meal_plan_accepted'").get().n, 1);
  assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM state_events WHERE kind='shopping_item_changed'").get().n, 1);
});

test('Stage 1B voice proposal uses the same accepted plan and shopping state', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-next-flow-v1';
  const { id, cookie } = await createVisitorSession(e, 'Owns a grill.');
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const setup = JSON.parse(options.body.get('session'));
    assert.equal(setup.tools?.[0]?.name, 'publish_meal_plan');
    return new Response('v=0\r\nanswer', { status: 201, headers: { Location: '/v1/realtime/calls/rtc_test' } });
  };
  let voiceId;
  try {
    const response = await worker.fetch(req(`/api/sessions/${id}/voice/start`, 'POST',
      { sdp: 'v=0\r\noffer', expectedRevision: 0 }, cookie), e, context());
    assert.equal(response.status, 201);
    voiceId = (await response.json()).voiceSessionId;
  } finally { globalThis.fetch = original; }
  await worker.fetch(req(`/api/sessions/${id}/voice/events`, 'POST',
    { voiceSessionId: voiceId, type: 'user', itemId: 'item_plan_1', transcript: 'Tacos for eight; no allergies.' }, cookie), e, context());
  const proposal = { meal: 'Chicken tacos and slaw', servings: 8, sections: [
    { section: 'Meat', items: [{ name: 'Chicken thighs', quantity: '4 pounds', have_status: 'need' }] },
  ] };
  const response = await worker.fetch(req(`/api/sessions/${id}/voice/events`, 'POST',
    { voiceSessionId: voiceId, type: 'assistant', responseId: 'resp_plan_1', userItemId: 'item_plan_1',
      transcript: 'Chicken tacos and slaw it is. I have your shopping list up.',
      planCall: { name: 'publish_meal_plan', arguments: JSON.stringify(proposal) },
      usage: { input_tokens: 100, output_tokens: 200 }, firstUsefulMs: 500, fullMs: 2100 }, cookie), e, context());
  assert.equal((await response.json()).planAccepted, true);
  const saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
  assert.equal(saved.meal_plan.servings, 8);
  assert.equal(saved.meal_revision, 1);
  const itemId = saved.meal_plan.sections[0].items[0].id;
  assert.equal((await worker.fetch(req(`/api/sessions/${id}/shopping/${itemId}`, 'PATCH',
    { checked: true, expectedShoppingRevision: 1 }, cookie), e, context())).status, 200);
  assert.equal(e.DB.raw.prepare('SELECT meal_snapshot FROM voice_sessions').get().meal_snapshot.includes('Chicken tacos'), true);
});

test('Stage 1B renders a current model meal when the provider returns only a plan tool call', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-next-flow-v1';
  const { id, cookie } = await createVisitorSession(e, '');
  const original = globalThis.fetch;
  globalThis.fetch = async () => providerStream('', [{ type: 'function_call', name: 'publish_meal_plan',
    arguments: JSON.stringify({ meal: 'Steak tacos and slaw', servings: 4, sections: [
      { section: 'Meat', items: [{ name: 'Steak', quantity: '2 pounds', have_status: 'need' }] },
    ] }) }]);
  try {
    const response = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text: 'Make that steak tacos for four.', turnId: crypto.randomUUID(), expectedRevision: 0 }, cookie), e, context());
    const stream = await response.text();
    assert.match(stream, /I got you from here/);
    assert.match(stream, /"type":"complete"/);
  } finally { globalThis.fetch = original; }
  assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM state_events WHERE kind='tool_only_transition_rendered'").get().n, 1);
  assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM state_events WHERE kind='meal_plan_accepted'").get().n, 1);
});

test('Cooking Mode accepts only customer-reported progress and keeps one current action', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-cooking-v1';
  const visitor = await createVisitorSession(e, '');
  const plan = { meal: 'Beef and vegetable stir-fry with jasmine rice and citrus salad', servings: 4, sections: [
    { section: 'Meat', items: [{ name: 'Beef', quantity: '1 pound', have_status: 'confirmed' }] },
    { section: 'Pantry', items: [{ name: 'Jasmine rice', quantity: '1 cup', have_status: 'confirmed' }] },
  ] };
  const sequence = [
    { text: 'Perfect. Your beef stir-fry, rice and salad are planned. The shopping list is ready.',
      call: { type: 'function_call', name: 'publish_meal_plan', arguments: JSON.stringify(plan) } },
    { text: '', call: { type: 'function_call', name: 'update_cooking_progress', arguments: JSON.stringify({
      current_action: 'First, add 1 cup jasmine rice and the appropriate water to your rice cooker and start it. Tell me when it is going.',
      remaining_components: ['Rice', 'Sauce', 'Beef and vegetables', 'Citrus salad'],
      customer_report: { quote: "Let's cook.", understood_as: 'Ready to begin cooking' },
    }) } },
    { text: 'Perfect. Mix the sauce in a small bowl, then tell me when it is smooth.',
      call: { type: 'function_call', name: 'update_cooking_progress', arguments: JSON.stringify({
        current_action: 'Mix the sauce in a small bowl, then tell me when it is smooth.',
        customer_report: { quote: 'Rice is going.', understood_as: 'Rice cooker started' },
        remaining_components: ['Sauce', 'Beef and vegetables', 'Citrus salad'],
      }) } },
    { text: 'Great. Do you have a wok or a cast-iron skillet?',
      call: { type: 'function_call', name: 'update_cooking_progress', arguments: JSON.stringify({
        current_action: 'Do you have a wok or a cast-iron skillet?',
        customer_report: { quote: 'Done.', understood_as: 'Sauce mixed' },
        remaining_components: ['Beef and vegetables', 'Citrus salad'],
      }) } },
    { text: 'Get your wok hot, add the oil and beef, and leave it to brown before stirring. Tell me when the beef is browned.',
      call: { type: 'function_call', name: 'update_cooking_progress', arguments: JSON.stringify({
        current_action: 'Get your wok hot, add the oil and beef, and leave it to brown before stirring. Tell me when the beef is browned.',
        equipment_change: { name: 'wok', status: 'owned', quote: 'Wok.' },
        remaining_components: ['Beef and vegetables', 'Citrus salad'],
      }) } },
    { text: 'Now cook the vegetables until crisp-tender while the rice finishes.',
      call: { type: 'function_call', name: 'update_cooking_progress', arguments: JSON.stringify({
        current_action: 'Cook the vegetables until crisp-tender while the rice finishes.',
        customer_report: { quote: 'Beef is browned.', understood_as: 'Beef browned' },
        remaining_components: ['Vegetables', 'Citrus salad'],
      }) } },
    { text: 'About 2 tablespoons, added when the wok is hot.', call: null },
    { text: 'No problem. Keep the rice going while you finish the vegetables; check it before serving.',
      call: { type: 'function_call', name: 'update_cooking_progress', arguments: JSON.stringify({
        current_action: 'Keep the rice going while you finish the vegetables; check it before serving.',
        customer_report: { quote: "My rice isn't done.", understood_as: 'Rice is not ready yet' },
        remaining_components: ['Vegetables', 'Rice', 'Citrus salad'],
      }) } },
    { text: 'Chicken curry and rice it is. I have updated the meal and shopping list.',
      call: { type: 'function_call', name: 'publish_meal_plan', arguments: JSON.stringify({
        meal: 'Chicken curry and rice', servings: 4, sections: [
          { section: 'Meat', items: [{ name: 'Chicken', quantity: '2 pounds', have_status: 'need' }] },
        ],
      }) } },
  ];
  let step = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const input = JSON.parse(init.body);
    assert.deepEqual(input.tools.map(x => x.name), ['publish_meal_plan', 'update_cooking_progress']);
    assert.equal(input.tool_choice, step <= 1 ? 'auto' : 'required');
    if (step === 5) assert.match(input.instructions, /Customer-reported equipment.*wok/i);
    const next = sequence[step++];
    assert.ok(next, 'no extra model call');
    return providerStream(next.text, next.call ? [next.call] : []);
  };
  async function send(text) {
    const revision = e.DB.raw.prepare('SELECT revision FROM sessions WHERE id=?').get(visitor.id).revision;
    const response = await worker.fetch(req(`/api/sessions/${visitor.id}/turns`, 'POST',
      { text, turnId: crypto.randomUUID(), expectedRevision: revision }, visitor.cookie), e, context());
    assert.match(await response.text(), /"type":"complete"/);
  }
  try {
    await send('That meal sounds good. Shopping is complete.');
    await send("Let's cook.");
    let saved = await (await worker.fetch(req(`/api/sessions/${visitor.id}`, 'GET', undefined, visitor.cookie), e, context())).json();
    assert.equal(saved.cooking_progress.reports.length, 0, 'instruction did not imply completion');
    assert.match(saved.turns.at(-1).text, /1 cup jasmine rice/);
    assert.doesNotMatch(saved.turns.at(-1).text, /beef|salad/i);
    await send('Rice is going.');
    await send('Done.');
    await send('Wok.');
    assert.equal(e.DB.raw.prepare("SELECT status FROM customer_equipment WHERE name='wok'").get().status, 'owned');
    await send('Beef is browned.');
    saved = await (await worker.fetch(req(`/api/sessions/${visitor.id}`, 'GET', undefined, visitor.cookie), e, context())).json();
    assert.deepEqual(saved.cooking_progress.reports.map(x => x.understood_as),
      ['Rice cooker started', 'Sauce mixed', 'Beef browned']);
    const beforeQuestion = saved.cooking_revision;
    await send('How much oil?');
    assert.equal(e.DB.raw.prepare('SELECT cooking_revision FROM sessions WHERE id=?').get(visitor.id).cooking_revision,
      beforeQuestion, 'direct question did not advance progress');
    await send("My rice isn't done.");
    saved = await (await worker.fetch(req(`/api/sessions/${visitor.id}`, 'GET', undefined, visitor.cookie), e, context())).json();
    assert.equal(saved.cooking_progress.reports.at(-1).understood_as, 'Rice is not ready yet');
    assert.match(saved.cooking_progress.current_action, /rice going/);
    assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM state_events WHERE kind='cooking_progress_accepted'").get().n, 6);
    const beforeMealChange = saved.cooking_revision;
    await send('Actually, change to chicken curry instead.');
    saved = await (await worker.fetch(req(`/api/sessions/${visitor.id}`, 'GET', undefined, visitor.cookie), e, context())).json();
    assert.equal(saved.meal_plan.meal, 'Chicken curry and rice');
    assert.equal(saved.cooking_progress, null, 'new meal invalidates prior cooking action and reports');
    assert.equal(saved.cooking_revision, beforeMealChange + 1);
    assert.equal(step, sequence.length);
  } finally { globalThis.fetch = original; }
});

test('Cooking v2 keeps a complete plan visible without inventing routine completion', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-cooking-v2';
  const { id, cookie } = await createVisitorSession(e, 'Owns a rice cooker and a skillet.');
  e.DB.raw.prepare('UPDATE sessions SET meal_revision=1,meal_plan_json=? WHERE id=?')
    .run(JSON.stringify({ meal: 'Beef stir-fry, rice and salad', servings: 2, sections: [] }), id);
  const original = globalThis.fetch;
  const fullPlan = [
    { title: 'Rice', directions: 'Start 1 cup rice in the rice cooker with the water specified for that rice.' },
    { title: 'Sauce', directions: 'Mix soy sauce, honey and citrus before heating the pan.' },
    { title: 'Beef and vegetables', directions: 'Brown the beef, then cook the vegetables and combine with sauce.' },
    { title: 'Salad and plate', directions: 'Dress the salad and serve everything together.' },
  ];
  const responses = [
    { text: 'Get the rice going and mix the sauce while it cooks. You can keep going from the full plan.',
      call: { type: 'function_call', name: 'update_cooking_progress', arguments: JSON.stringify({
        current_action: 'Start rice in the cooker, then mix the sauce while it cooks.', full_plan: fullPlan,
        remaining_components: null, customer_report: { quote: "Let's cook.", understood_as: 'Rice started' },
        equipment_change: null,
      }) } },
    { text: 'Yes, use the rice cooker. Follow its water line for your rice; the rest of the plan still works.', call: null },
    { text: 'Not a problem. Leave the rice alone while we swap citrus for vinegar in the sauce.',
      call: { type: 'function_call', name: 'update_cooking_progress', arguments: JSON.stringify({
        current_action: 'Keep the rice cooking; replace vinegar with citrus in the sauce.',
        full_plan: fullPlan.map(section => section.title === 'Sauce'
          ? { ...section, directions: 'Mix soy sauce, honey and citrus in place of vinegar.' } : section),
        remaining_components: null,
        customer_report: { quote: "I don't have rice vinegar.", understood_as: 'Rice vinegar unavailable' },
        equipment_change: null,
      }) } },
  ];
  let step = 0;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.tool_choice, 'auto', 'direct questions do not require a state proposal');
    assert.match(body.instructions, /complete plan/i);
    assert.equal(body.tools[1].parameters.properties.full_plan.type[0], 'array');
    const next = responses[step++];
    assert.ok(next);
    return providerStream(next.text, next.call ? [next.call] : []);
  };
  async function send(text) {
    const revision = e.DB.raw.prepare('SELECT revision FROM sessions WHERE id=?').get(id).revision;
    const response = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text, turnId: crypto.randomUUID(), expectedRevision: revision }, cookie), e, context());
    assert.match(await response.text(), /"type":"complete"/);
  }
  try {
    await send("Let's cook.");
    let saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
    assert.equal(saved.cooking_progress.full_plan.length, 4);
    assert.equal(saved.cooking_progress.reports.length, 0, 'readiness is not a physical event');
    const revision = saved.cooking_revision;
    await send('Can I use my rice cooker?');
    saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
    assert.equal(saved.cooking_revision, revision);
    assert.deepEqual(saved.cooking_progress.full_plan, fullPlan);
    await send("I don't have rice vinegar.");
    saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
    assert.equal(saved.cooking_progress.reports.length, 1);
    assert.equal(saved.cooking_progress.full_plan[1].directions, 'Mix soy sauce, honey and citrus in place of vinegar.');
    assert.equal(saved.cooking_revision, revision + 1);
    assert.equal(step, responses.length);
  } finally { globalThis.fetch = original; }
});

test('an equipment answer remains conversational when a premature cooking-state proposal lacks a full plan', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-cooking-v2';
  const { id, cookie } = await createVisitorSession(e, 'Owns a wok and skillet.');
  e.DB.raw.prepare('UPDATE sessions SET meal_revision=1,meal_plan_json=? WHERE id=?')
    .run(JSON.stringify({ meal: 'Beef stir-fry with rice', servings: 2, sections: [] }), id);
  const original = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => ++attempts === 1
    ? providerStream('', [{ type: 'function_call', call_id: 'call_wok_1', name: 'update_cooking_progress',
      arguments: JSON.stringify({ current_action: 'Use the wok for the stir-fry; it suits the quick high-heat cooking.',
        full_plan: null, remaining_components: null, customer_report: null, equipment_change: null }) }])
    : new Response(JSON.stringify({ id: 'resp_repaired', model: 'gpt-6-astra', output: [
      { type: 'message', content: [{ type: 'output_text', text: 'The wok is a good fit for the quick stir-fry. We can use it when you are ready to cook.' }] }],
      usage: { input_tokens: 50, output_tokens: 20 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const response = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text: 'Either pan is available.', turnId: crypto.randomUUID(), expectedRevision: 0 }, cookie), e, context());
    assert.match(await response.text(), /"type":"complete"/);
    const saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
    assert.match(saved.turns.at(-1).text, /The wok is a good fit/);
    assert.equal(saved.cooking_progress, null, 'an invalid tool proposal is not accepted as cooking truth');
    assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM state_events WHERE kind='cooking_proposal_rejected'").get().n, 1);
    assert.equal(attempts, 2);
  } finally { globalThis.fetch = original; }
});

test('an accepted shopping plan does not start Cooking Mode before the customer does', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-cooking-v1';
  const { id, cookie } = await createVisitorSession(e, 'Owns a rice cooker.');
  e.DB.raw.prepare('UPDATE sessions SET meal_revision=1,meal_plan_json=? WHERE id=?')
    .run(JSON.stringify({ meal: 'Stir-fry with rice', servings: 2, sections: [] }), id);
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const input = JSON.parse(init.body);
    assert.equal(input.tool_choice, 'auto');
    assert.match(input.instructions, /do not start cooking until the customer wants to/i);
    return providerStream('Yes, the shopping list is still available. You can change any checked item before we cook.', []);
  };
  try {
    const response = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text: 'Can I change the shopping list?', turnId: crypto.randomUUID(), expectedRevision: 0 }, cookie), e, context());
    assert.match(await response.text(), /"type":"complete"/);
    const saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
    assert.equal(saved.cooking_progress, null);
    assert.equal(saved.meal_plan.meal, 'Stir-fry with rice');
  } finally { globalThis.fetch = original; }
});

test('temporary equipment is removed when an older Worker expires its customer', () => {
  const db = new TestDB().raw;
  db.exec('PRAGMA foreign_keys=ON');
  const customerId = crypto.randomUUID(), sessionId = crypto.randomUUID();
  const at = new Date().toISOString();
  db.prepare('INSERT INTO customers (id,created_at,expires_at) VALUES (?,?,?)')
    .run(customerId, at, at);
  db.prepare(`INSERT INTO customer_equipment
    (customer_id,name,status,source_session_id,source_turn_id,created_at,expires_at)
    VALUES (?,?,?,?,?,?,?)`).run(customerId, 'wok', 'owned', sessionId, crypto.randomUUID(), at, at);
  db.prepare('DELETE FROM customers WHERE id=?').run(customerId);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customer_equipment').get().n, 0);
});

test('Cooking Mode rejects unsupported progress and accepts the same state through Talk It', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-cooking-v1';
  const { id, cookie } = await createVisitorSession(e, 'Owns a rice cooker.');
  e.DB.raw.prepare('UPDATE sessions SET meal_revision=1,meal_plan_json=? WHERE id=?')
    .run(JSON.stringify({ meal: 'Stir-fry, rice and citrus salad', servings: 2, sections: [
      { section: 'Pantry', items: [{ id: crypto.randomUUID(), name: 'Rice', quantity: '1 cup',
        checked: true, have_status: 'confirmed' }] },
    ] }), id);
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const setup = JSON.parse(options.body.get('session'));
    assert.deepEqual(setup.tools.map(x => x.name), ['publish_meal_plan', 'update_cooking_progress']);
    assert.equal(setup.tool_choice, 'auto');
    assert.match(setup.instructions, /Stir-fry, rice and citrus salad/);
    return new Response('v=0\r\nanswer', { status: 201 });
  };
  let voiceId;
  try {
    const start = await worker.fetch(req(`/api/sessions/${id}/voice/start`, 'POST',
      { sdp: 'v=0\r\noffer', expectedRevision: 0 }, cookie), e, context());
    assert.equal(start.status, 201);
    const connected = await start.json();
    voiceId = connected.voiceSessionId;
    assert.match(connected.cookingSyncInstructions, /Guide cooking one coherent action at a time/);
  } finally { globalThis.fetch = original; }
  async function user(itemId, transcript) {
    const response = await worker.fetch(req(`/api/sessions/${id}/voice/events`, 'POST',
      { voiceSessionId: voiceId, type: 'user', itemId, transcript }, cookie), e, context());
    assert.equal(response.status, 200);
  }
  async function assistant(responseId, itemId, transcript, proposal) {
    const response = await worker.fetch(req(`/api/sessions/${id}/voice/events`, 'POST',
      { voiceSessionId: voiceId, type: 'assistant', responseId, userItemId: itemId,
        transcript, cookingCall: { name: 'update_cooking_progress', arguments: JSON.stringify(proposal) } },
      cookie), e, context());
    return response.json();
  }
  await user('item_cook_1', "Let's cook.");
  const first = await assistant('resp_cook_1', 'item_cook_1', 'First, get the rice going in your rice cooker.',
    { current_action: 'Get the rice going in your rice cooker.', remaining_components: ['Rice', 'Beef', 'Salad'] });
  assert.equal(first.cookingAccepted, true);
  let saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
  assert.equal(saved.cooking_progress.reports.length, 0);
  await user('item_cook_2', 'Rice is going.');
  const second = await assistant('resp_cook_2', 'item_cook_2', 'Now mix the sauce in a small bowl.',
    { current_action: 'Mix the sauce in a small bowl.',
      customer_report: { quote: 'Rice is going.', understood_as: 'Rice cooker started' },
      remaining_components: ['Sauce', 'Beef', 'Salad'] });
  assert.equal(second.cookingAccepted, true);
  saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
  assert.equal(saved.cooking_progress.reports[0].understood_as, 'Rice cooker started');
  assert.equal(e.DB.raw.prepare('SELECT cooking_revision_snapshot FROM voice_sessions WHERE id=?').get(voiceId)
    .cooking_revision_snapshot, saved.cooking_revision);
  await user('item_cook_3', 'Actually, the sauce is missing soy sauce.');
  const late = await assistant('resp_cook_late', 'item_cook_2', 'Ignore that and start the beef.',
    { current_action: 'Start the beef.', customer_report: { quote: 'Rice is going.', understood_as: 'Rice done' } });
  assert.equal(late.status, 'stale_rejected');
  assert.equal(e.DB.raw.prepare('SELECT cooking_revision FROM sessions WHERE id=?').get(id).cooking_revision,
    saved.cooking_revision);
  const invalid = await assistant('resp_cook_3', 'item_cook_3', 'Use a little citrus instead.',
    { current_action: 'Use a little citrus instead.',
      customer_report: { quote: 'Everything is done.', understood_as: 'Meal completed' } });
  assert.equal(invalid.cookingAccepted, true, 'safe next action remains usable');
  const final = JSON.parse(e.DB.raw.prepare('SELECT cooking_progress_json FROM sessions WHERE id=?').get(id).cooking_progress_json);
  assert.equal(final.reports.length, 1, 'unsupported completion was not saved');
  const events = e.DB.raw.prepare("SELECT details_json FROM state_events WHERE kind='cooking_progress_accepted' ORDER BY rowid").all();
  assert.deepEqual(JSON.parse(events.at(-1).details_json).ignored_fields, ['customer_report']);
  assert.equal(e.DB.raw.prepare('SELECT cooking_revision FROM sessions WHERE id=?').get(id).cooking_revision,
    saved.cooking_revision + 1);
});

test('Cooking v2 Talk It shares the visual plan and answers without requiring a progress write', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-cooking-v2';
  const { id, cookie } = await createVisitorSession(e, 'Owns a rice cooker.');
  e.DB.raw.prepare('UPDATE sessions SET meal_revision=1,meal_plan_json=? WHERE id=?')
    .run(JSON.stringify({ meal: 'Chicken with rice and cucumber salad', servings: 2, sections: [] }), id);
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const setup = JSON.parse(options.body.get('session'));
    assert.equal(setup.tool_choice, 'auto');
    assert.match(setup.instructions, /complete plan/i);
    assert.equal(setup.tools[1].parameters.properties.full_plan.type[0], 'array');
    return new Response('v=0\r\nanswer', { status: 201 });
  };
  let voiceId;
  try {
    const start = await worker.fetch(req(`/api/sessions/${id}/voice/start`, 'POST',
      { sdp: 'v=0\r\noffer', expectedRevision: 0 }, cookie), e, context());
    assert.equal(start.status, 201);
    const connected = await start.json();
    voiceId = connected.voiceSessionId;
    assert.match(connected.cookingSyncInstructions, /full plan remains visible/i);
  } finally { globalThis.fetch = original; }
  const post = async payload => (await worker.fetch(req(`/api/sessions/${id}/voice/events`, 'POST',
    { voiceSessionId: voiceId, ...payload }, cookie), e, context())).json();
  await post({ type: 'user', itemId: 'item_v2_1', transcript: "Let's cook." });
  const plan = [
    { title: 'Rice', directions: 'Start rice in the rice cooker.' },
    { title: 'Chicken and salad', directions: 'Cook the chicken safely, prepare salad, and serve together.' },
  ];
  const first = await post({ type: 'proposal', responseId: 'resp_v2_1', userItemId: 'item_v2_1',
    call: { name: 'update_cooking_progress', arguments: JSON.stringify({
      current_action: 'Start the rice and prep the cucumber while it cooks.', full_plan: plan,
      remaining_components: null, customer_report: null, equipment_change: null,
    }) } });
  assert.equal(first.accepted, true);
  await post({ type: 'assistant', responseId: 'resp_v2_1_speech', userItemId: 'item_v2_1',
    transcript: 'Start the rice and prep the cucumber while it cooks.' });
  let saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
  assert.deepEqual(saved.cooking_progress.full_plan, plan);
  assert.equal(saved.cooking_progress.reports.length, 0);
  const cookingRevision = saved.cooking_revision;
  await post({ type: 'user', itemId: 'item_v2_2', transcript: 'Can I use my rice cooker?' });
  const second = await post({ type: 'assistant', responseId: 'resp_v2_2', userItemId: 'item_v2_2',
    transcript: 'Yes, use your rice cooker; the full plan still applies.' });
  assert.equal(second.status, 'accepted');
  saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
  assert.equal(saved.cooking_revision, cookingRevision);
  assert.deepEqual(saved.cooking_progress.full_plan, plan);
  assert.equal(saved.turns.at(-1).text, 'Yes, use your rice cooker; the full plan still applies.');
});

test('Stage 1B bridge rejects the observed string-shaped cooking plan, then accepts one canonical plan before speech', async () => {
  const e = env();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-cooking-v2';
  const { id, cookie } = await createVisitorSession(e, 'A skillet and an oven.');
  e.DB.raw.prepare('UPDATE sessions SET meal_revision=1,meal_plan_json=? WHERE id=?')
    .run(JSON.stringify({ meal: 'Pork chops with potatoes and green beans', servings: 2, sections: [] }), id);
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const setup = JSON.parse(options.body.get('session'));
    assert.equal(Object.hasOwn(setup.tools[1], 'strict'), false);
    assert.match(setup.instructions, /call the narrow tool first/i);
    return new Response('v=0\r\nanswer', { status: 201 });
  };
  let voiceId;
  try {
    const started = await worker.fetch(req(`/api/sessions/${id}/voice/start`, 'POST',
      { sdp: 'v=0\r\noffer', expectedRevision: 0 }, cookie), e, context());
    assert.equal(started.status, 201);
    const connected = await started.json();
    voiceId = connected.voiceSessionId;
    assert.equal(connected.behaviorVersion, 'stage1b-cooking-v2+voice-bridge-v2');
  } finally { globalThis.fetch = original; }
  const post = async payload => {
    const response = await worker.fetch(req(`/api/sessions/${id}/voice/events`, 'POST',
      { voiceSessionId: voiceId, ...payload }, cookie), e, context());
    assert.equal(response.status, 200);
    return response.json();
  };
  const user = await post({ type: 'user', itemId: 'item_pork_bridge', transcript: "Let's cook." });
  const broken = await post({ type: 'proposal', responseId: 'resp_pork_bad', userItemId: 'item_pork_bridge',
    call: { name: 'update_cooking_progress', arguments: JSON.stringify({
      current_action: 'Start the potatoes while the oven warms.',
      full_plan: 'Potatoes, pork chops, beans, plate', remaining_components: 'Pork and beans',
      customer_report: null, equipment_change: null,
    }) } });
  assert.equal(broken.accepted, false);
  assert.match(broken.reason, /full_plan must be an array/);
  assert.equal(e.DB.raw.prepare('SELECT cooking_progress_json FROM sessions WHERE id=?').get(id).cooking_progress_json, null);
  const sections = [
    { title: 'Potatoes', directions: 'Roast the potatoes until tender and browned.' },
    { title: 'Pork chops', directions: 'Sear and finish the chops safely; rest before serving.' },
    { title: 'Green beans and plate', directions: 'Cook the beans, then plate with pork and potatoes.' },
  ];
  const accepted = await post({ type: 'proposal', responseId: 'resp_pork_fixed', userItemId: 'item_pork_bridge',
    call: { name: 'update_cooking_progress', arguments: JSON.stringify({
      current_action: 'Start the potatoes while the oven warms.', full_plan: sections,
      remaining_components: null, customer_report: null, equipment_change: null,
    }) } });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.operation, 'cooking');
  assert.equal((await post({ type: 'proposal', responseId: 'resp_pork_fixed', userItemId: 'item_pork_bridge',
    call: { name: 'update_cooking_progress', arguments: '{}' } })).accepted, true, 'replay is idempotent');
  const assistant = await post({ type: 'assistant', responseId: 'resp_pork_speech',
    userItemId: 'item_pork_bridge', transcript: 'Start with the potatoes; the full plan is open below.' });
  assert.equal(assistant.status, 'accepted');
  const saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
  assert.deepEqual(saved.cooking_progress.full_plan, sections);
  assert.equal(saved.cooking_progress.reports.length, 0);
  assert.equal(saved.turns.at(-1).text, 'Start with the potatoes; the full plan is open below.');
  const metric = await worker.fetch(req(`/api/sessions/${id}/metrics`, 'POST',
    { sourceTurnId: user.turnId, kind: 'now_visible', revision: saved.cooking_revision, elapsedMs: 523 }, cookie), e, context());
  assert.equal(metric.status, 200);
  assert.equal(e.DB.raw.prepare('SELECT elapsed_ms FROM client_render_metrics WHERE source_turn_id=?').get(user.turnId).elapsed_ms, 523);
  assert.equal((await worker.fetch(req(`/api/sessions/${id}/metrics`, 'POST',
    { sourceTurnId: user.turnId, kind: 'now_visible', revision: saved.cooking_revision + 1, elapsedMs: 1 }, cookie), e, context())).status, 409);
  const stopped = await worker.fetch(req(`/api/sessions/${id}/voice/stop`, 'POST',
    { voiceSessionId: voiceId }, cookie), e, context());
  assert.equal(stopped.status, 200);
  globalThis.fetch = async (_url, options) => {
    const setup = JSON.parse(options.body.get('session'));
    assert.match(setup.instructions, /Start the potatoes while the oven warms/);
    assert.match(setup.instructions, /Full Plan/);
    return new Response('v=0\r\nanswer', { status: 201 });
  };
  try {
    const reconnected = await worker.fetch(req(`/api/sessions/${id}/voice/start`, 'POST',
      { sdp: 'v=0\r\noffer', expectedRevision: saved.revision }, cookie), e, context());
    assert.equal(reconnected.status, 201);
  } finally { globalThis.fetch = original; }
});

test('a newer shopping checkbox wins over an older model meal replacement', async () => {
  const e = env(), ctx = context();
  e.STAGE1B_ENABLED = 'true';
  e.BEHAVIOR_VERSION = 'stage1b-cooking-v2';
  const { id, cookie } = await createVisitorSession(e, 'Dinner for two.');
  const itemId = crypto.randomUUID();
  const originalPlan = { meal: 'Lemon chicken with rice', servings: 2, sections: [
    { section: 'Produce', items: [{ id: itemId, name: 'Lemon', quantity: '1',
      checked: false, have_status: 'need' }] },
  ] };
  e.DB.raw.prepare('UPDATE sessions SET meal_revision=1,shopping_revision=1,meal_plan_json=? WHERE id=?')
    .run(JSON.stringify(originalPlan), id);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const original = globalThis.fetch;
  const replacement = { meal: 'Ginger chicken with rice and greens', servings: 2, sections: [
    { section: 'Produce', items: [{ name: 'Ginger', quantity: '1 knob', have_status: 'need' }] },
  ] };
  globalThis.fetch = async () => { await gate; return providerStream('I changed the meal to ginger chicken.',
    [{ type: 'function_call', name: 'publish_meal_plan', arguments: JSON.stringify(replacement) }]); };
  try {
    const turnId = crypto.randomUUID();
    const pending = await worker.fetch(req(`/api/sessions/${id}/turns`, 'POST',
      { text: 'Switch to ginger chicken.', turnId, expectedRevision: 0 }, cookie), e, ctx);
    const changed = await worker.fetch(req(`/api/sessions/${id}/shopping/${itemId}`, 'PATCH',
      { expectedShoppingRevision: 1, checked: true }, cookie), e, context());
    assert.equal(changed.status, 200);
    release();
    const stream = await pending.text();
    await ctx.settle();
    assert.match(stream, /"proposalStale":true/);
    const saved = await (await worker.fetch(req(`/api/sessions/${id}`, 'GET', undefined, cookie), e, context())).json();
    assert.equal(saved.meal_plan.meal, originalPlan.meal);
    assert.equal(saved.meal_plan.sections[0].items[0].checked, true);
    assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM state_events WHERE kind='meal_plan_accepted'").get().n, 0);
    assert.equal(e.DB.raw.prepare("SELECT COUNT(*) AS n FROM state_events WHERE kind='meal_plan_proposal_stale'").get().n, 1);
  } finally { release(); globalThis.fetch = original; }
});
