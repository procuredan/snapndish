import { instructionsFor, instructionsForCandidate, instructionsForNextFlow, instructionsForCookingMode, instructionsForCookingModeV2, instructionsForMealPackage, instructionsForCookingContent, estimateUsd, BEHAVIOR_VERSION, CANDIDATE_BEHAVIOR_VERSION, NEXT_FLOW_BEHAVIOR_VERSION, COOKING_BEHAVIOR_VERSION, COOKING_PLAN_BEHAVIOR_VERSION, MEAL_PACKAGE_BEHAVIOR_VERSION, COOKING_CONTENT_BEHAVIOR_VERSION, CONTEXT_VERSION, SCENARIO_VERSION } from '../src/config.ts';
import { page } from './ui.mjs';
import { stripJpegMetadata } from './jpeg.mjs';
import { serviceWorker } from './push-sw.mjs';
import { MEAL_PLAN_TOOL, MEAL_PACKAGE_TOOL, normalizeMealPlan, planFromOutput } from './meal-plan.mjs';
import { COOKING_PROGRESS_TOOL, COOKING_PROGRESS_TOOL_V2, cookingFromOutput } from './cooking-progress.mjs';

const DAY = 86_400_000;
const VOICE_MODEL = 'gpt-realtime-2.1';
const VOICE_BRIDGE_VERSION = 'voice-bridge-v2';
const REVIEW_COOKIE = '__Host-sndlab';
const SESSION_COOKIE = '__Host-sndlab-session';
const CUSTOMER_COOKIE = '__Host-sndlab-customer';
const encoder = new TextEncoder();
const isStage1b = env => env.STAGE1B_ENABLED === 'true';
const isPackageVersion = version => version === MEAL_PACKAGE_BEHAVIOR_VERSION || version === COOKING_CONTENT_BEHAVIOR_VERSION;
const isBridgeVersion = version => version === COOKING_PLAN_BEHAVIOR_VERSION || isPackageVersion(version);
const isCookingVersion = version => version === COOKING_BEHAVIOR_VERSION || isBridgeVersion(version);
const isNextFlow = version => version === NEXT_FLOW_BEHAVIOR_VERSION || isCookingVersion(version);
const toolsFor = version => isPackageVersion(version)
  ? [MEAL_PACKAGE_TOOL, COOKING_PROGRESS_TOOL_V2] : version === COOKING_PLAN_BEHAVIOR_VERSION
  ? [MEAL_PLAN_TOOL, COOKING_PROGRESS_TOOL_V2] : version === COOKING_BEHAVIOR_VERSION
    ? [MEAL_PLAN_TOOL, COOKING_PROGRESS_TOOL] : version === NEXT_FLOW_BEHAVIOR_VERSION ? [MEAL_PLAN_TOOL] : [];
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
async function makeCustomerCookie(secret, id, expiresAt) {
  const payload = `${id}.${Date.parse(expiresAt)}`;
  return `${payload}.${await mac(secret, payload)}`;
}
async function currentCustomer(request, env) {
  if (!isStage1b(env)) return null;
  const token = cookieValue(request, CUSTOMER_COOKIE);
  const pieces = token?.split('.') ?? [];
  if (pieces.length !== 3 || !/^[0-9a-f-]{36}$/i.test(pieces[0])
    || !Number.isFinite(Number(pieces[1])) || Number(pieces[1]) < Date.now()
    || !equal(pieces[2], await mac(env.COOKIE_SIGNING_KEY, `${pieces[0]}.${pieces[1]}`))) return null;
  return env.DB.prepare('SELECT id,expires_at FROM customers WHERE id=? AND expires_at>?')
    .bind(pieces[0], now()).first();
}
async function authorizedSession(request, secret, id) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return false;
  const pieces = token.split('.');
  if (pieces.length !== 3 || pieces[0] !== id || !Number.isFinite(Number(pieces[1])) || Number(pieces[1]) < Date.now()) return false;
  return equal(pieces[2], await mac(secret, `${pieces[0]}.${pieces[1]}`));
}
async function canUseSession(request, env, id) {
  if (await authorizedSession(request, env.COOKIE_SIGNING_KEY, id)) return true;
  const customer = await currentCustomer(request, env);
  if (!customer) return false;
  const session = await getSession(env.DB, id);
  return session?.customer_id === customer.id;
}
function html(kind, env) {
  const nonce = randomToken(15);
  return new Response(page(kind, nonce, isStage1b(env), isNextFlow(env.BEHAVIOR_VERSION),
    isPackageVersion(env.BEHAVIOR_VERSION), env.RELEASE_ENV === 'production'), { headers: {
    ...BASE_HEADERS,
    'Permissions-Policy': isStage1b(env) ? 'camera=(self), microphone=(self), geolocation=()' : BASE_HEADERS['Permissions-Policy'],
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  } });
}
async function bodyJson(request) {
  const raw = await request.text();
  if (raw.length > 16_000) throw new Error('REQUEST_TOO_LARGE');
  try { return JSON.parse(raw); }
  catch { throw new Error('INVALID_JSON'); }
}
async function boundedBytes(request, max = 2_000_000) {
  if (Number(request.headers.get('Content-Length')) > max) throw new Error('IMAGE_TOO_LARGE');
  if (!request.body) throw new Error('EMPTY_IMAGE');
  const reader = request.body.getReader();
  const pieces = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > max) { await reader.cancel(); throw new Error('IMAGE_TOO_LARGE'); }
    pieces.push(next.value);
  }
  if (!size) throw new Error('EMPTY_IMAGE');
  const result = new Uint8Array(size);
  let offset = 0;
  for (const piece of pieces) { result.set(piece, offset); offset += piece.byteLength; }
  return result;
}
function base64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
function b64url(bytes) { return base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
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
  return { id: s.id, created_at: s.created_at, updated_at: s.updated_at, revision: s.revision,
    customer_context: s.customer_context, meal_revision: s.meal_revision ?? 0,
    meal_source_turn_id: s.meal_source_turn_id ?? null, meal_accepted_at: s.meal_accepted_at ?? null,
    shopping_revision: s.shopping_revision ?? 0,
    meal_plan: s.meal_plan_json ? JSON.parse(s.meal_plan_json) : null,
    cooking_revision: s.cooking_revision ?? 0,
    cooking_progress: s.cooking_progress_json ? JSON.parse(s.cooking_progress_json) : null,
    active_voice_id: s.active_voice_until > now() ? s.active_voice_id : null };
}

async function equipmentContext(env, session) {
  if (!session.customer_id || !isStage1b(env) || !isCookingVersion(env.BEHAVIOR_VERSION))
    return { text: '', memory: 'none — no equipment facts retrieved' };
  const rows = await env.DB.prepare("SELECT name FROM customer_equipment WHERE customer_id=? AND status='owned' AND expires_at>? ORDER BY created_at LIMIT 20")
    .bind(session.customer_id, now()).all();
  const names = (rows.results ?? []).map(row => row.name);
  return { text: names.length ? `\n\nCustomer-reported equipment available across this temporary Stage 1B customer: ${names.join(', ')}. Ownership creates options, not obligations.` : '',
    memory: names.length ? JSON.stringify({ reported_equipment: names }) : 'none — no equipment facts retrieved' };
}

function cookingContext(session) {
  return session.cooking_progress_json
    ? `\n\nApplication-accepted cooking guidance and customer reports (meal revision ${session.meal_revision}, cooking revision ${session.cooking_revision}):\n${session.cooking_progress_json}\n${needsFullCookingPlan(session) ? 'This older session has no accepted Full Plan. Propose one with the next cooking update.' : ''} Reports from earlier meal revisions are historical; apply them only when relevant. Now guidance is not proof of completion.`
    : `\n\n${needsFullCookingPlan(session) ? 'No full cooking plan' : 'The complete plan is in the accepted meal package; no separate cooking guidance'} or physical progress has been accepted for this meal.`;
}

function needsFullCookingPlan(session) {
  try { if (Array.isArray(JSON.parse(session.meal_plan_json ?? 'null')?.full_plan)) return false; }
  catch { /* Read older state below. */ }
  if (!session.cooking_progress_json) return true;
  try { return !Array.isArray(JSON.parse(session.cooking_progress_json).full_plan); }
  catch { return true; }
}

function rejectedCookingCallText(calls) {
  if (calls.length !== 1) return null;
  try {
    const action = JSON.parse(calls[0].arguments).current_action;
    return typeof action === 'string' && action.trim() && action.length <= 1200 ? action.trim() : null;
  } catch { return null; }
}

function nextCookingState(session, proposed, assistantId, userTurnId, at) {
  const prior = session.cooking_progress_json ? JSON.parse(session.cooking_progress_json) : null;
  const mealPlan = session.meal_plan_json ? JSON.parse(session.meal_plan_json) : null;
  const reports = prior?.meal_revision === session.meal_revision ? prior.reports ?? [] : [];
  return JSON.stringify({ meal_revision: session.meal_revision, current_action: proposed.current_action,
    current_action_turn_id: assistantId, remaining_components: proposed.remaining_components ??
      (prior?.meal_revision === session.meal_revision ? prior.remaining_components : null) ?? [],
    full_plan: proposed.full_plan ?? (prior?.meal_revision === session.meal_revision ? prior.full_plan : null) ?? mealPlan?.full_plan ?? null,
    reports: [...reports, ...(proposed.customer_report ? [{ source_turn_id: userTurnId,
      quote: proposed.customer_report.quote, understood_as: proposed.customer_report.understood_as,
      meal_revision: session.meal_revision, at }] : [])].slice(-30),
    updated_at: at });
}

function mealProposal(output, session, version) {
  return planFromOutput(output, isPackageVersion(version)
    ? { requireFullPlan: true, priorPlan: session.meal_plan_json ? JSON.parse(session.meal_plan_json) : null }
    : {});
}

function cookingProposalForVersion(output, userText, session, version, proposedPlan = null) {
  const proposal = cookingFromOutput(output, userText,
    isBridgeVersion(version) && needsFullCookingPlan(session) && !proposedPlan);
  if (isPackageVersion(version) && proposal.cooking?.full_plan) {
    const acceptedPlan = proposedPlan?.full_plan ??
      (session.meal_plan_json ? JSON.parse(session.meal_plan_json).full_plan : null);
    if (JSON.stringify(proposal.cooking.full_plan) !== JSON.stringify(acceptedPlan)) {
      proposal.cooking = null;
      proposal.reason = 'FULL_PLAN_REQUIRES_MEAL_PACKAGE_REVISION';
    } else proposal.cooking.full_plan = null;
  }
  return proposal;
}

function revisedCookingState(session, plan, assistantId, at, cooking = null, userTurnId = null) {
  if (!session.cooking_progress_json && !cooking) return null;
  const prior = session.cooking_progress_json ? JSON.parse(session.cooking_progress_json) : null;
  const reports = (prior?.reports ?? []).map(report => ({ ...report,
    meal_revision: report.meal_revision ?? prior.meal_revision }));
  if (cooking?.customer_report) reports.push({ source_turn_id: userTurnId,
    quote: cooking.customer_report.quote, understood_as: cooking.customer_report.understood_as,
    meal_revision: session.meal_revision + 1, at });
  return JSON.stringify({ meal_revision: session.meal_revision + 1,
    current_action: cooking?.current_action ?? plan.current_action, current_action_turn_id: assistantId,
    remaining_components: plan.full_plan.map(section => section.title), full_plan: plan.full_plan,
    reports: reports.slice(-30), updated_at: at });
}

async function createSession(request, env) {
  const input = await bodyJson(request);
  const context = typeof input.context === 'string' ? input.context.trim() : '';
  if (context.length > 2000) return json({ error: 'CONTEXT_TOO_LONG' }, 400);
  const id = crypto.randomUUID();
  const at = now();
  const expires = new Date(Date.now() + 30 * DAY).toISOString();
  let customer = await currentCustomer(request, env);
  if (isStage1b(env) && !customer) {
    customer = { id: crypto.randomUUID(), expires_at: expires };
    await env.DB.prepare('INSERT INTO customers (id,created_at,expires_at) VALUES (?,?,?)')
      .bind(customer.id, at, expires).run();
  } else if (isStage1b(env)) {
    await env.DB.prepare('UPDATE customers SET expires_at=? WHERE id=? AND expires_at>?')
      .bind(expires, customer.id, at).run();
    if (isCookingVersion(env.BEHAVIOR_VERSION))
      await env.DB.prepare('UPDATE customer_equipment SET expires_at=? WHERE customer_id=? AND expires_at>?')
        .bind(expires, customer.id, at).run();
    customer.expires_at = expires;
  }
  await env.DB.prepare('INSERT INTO sessions (id,created_at,updated_at,revision,customer_context,expires_at,customer_id) VALUES (?,?,?,?,?,?,?)')
    .bind(id, at, at, 0, context, expires, customer?.id ?? null).run();
  await event(env.DB, id, null, 0, 'session_created', { context_supplied: Boolean(context) });
  const result = json({ id, revision: 0 }, 201, { 'Set-Cookie': `${SESSION_COOKIE}=${await makeSessionCookie(env.COOKIE_SIGNING_KEY, id, expires)}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict` });
  if (customer && isStage1b(env)) result.headers.append('Set-Cookie',
    `${CUSTOMER_COOKIE}=${await makeCustomerCookie(env.COOKIE_SIGNING_KEY, customer.id, customer.expires_at)}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict`);
  return result;
}

async function hashPairCode(code) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(code)))].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function startPair(request, env) {
  const customer = await currentCustomer(request, env);
  if (!customer) return json({ error: 'NOT_FOUND' }, 404);
  const { sessionId } = await bodyJson(request);
  const session = await getSession(env.DB, sessionId);
  if (!session || session.customer_id !== customer.id) return json({ error: 'NOT_FOUND' }, 404);
  const code = randomToken(24);
  const at = now(), expires = new Date(Date.now() + 10 * 60_000).toISOString();
  await env.DB.prepare('INSERT INTO pairing_links (code_hash,customer_id,session_id,created_at,expires_at) VALUES (?,?,?,?,?)')
    .bind(await hashPairCode(code), customer.id, sessionId, at, expires).run();
  return json({ code, expires_at: expires });
}
async function claimPair(request, env) {
  const { code } = await bodyJson(request);
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(code)) return json({ error: 'INVALID_PAIR_CODE' }, 400);
  const codeHash = await hashPairCode(code);
  const at = now();
  const pair = await env.DB.prepare('SELECT customer_id,session_id FROM pairing_links WHERE code_hash=? AND claimed_at IS NULL AND expires_at>?')
    .bind(codeHash, at).first();
  if (!pair) return json({ error: 'PAIR_UNAVAILABLE' }, 404);
  const claimed = await env.DB.prepare('UPDATE pairing_links SET claimed_at=? WHERE code_hash=? AND claimed_at IS NULL AND expires_at>?')
    .bind(at, codeHash, at).run();
  if (claimed.meta.changes !== 1) return json({ error: 'PAIR_UNAVAILABLE' }, 404);
  const customer = await env.DB.prepare('SELECT id,expires_at FROM customers WHERE id=? AND expires_at>?')
    .bind(pair.customer_id, at).first();
  if (!customer) return json({ error: 'PAIR_UNAVAILABLE' }, 404);
  return json({ sessionId: pair.session_id }, 200, { 'Set-Cookie':
    `${CUSTOMER_COOKIE}=${await makeCustomerCookie(env.COOKIE_SIGNING_KEY, customer.id, customer.expires_at)}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict` });
}
async function customerSessions(request, env) {
  const customer = await currentCustomer(request, env);
  if (!customer) return json({ error: 'NOT_FOUND' }, 404);
  const sessions = await env.DB.prepare('SELECT id,created_at,updated_at,revision,meal_revision FROM sessions WHERE customer_id=? AND expires_at>? ORDER BY updated_at DESC LIMIT 20')
    .bind(customer.id, now()).all();
  return json({ sessions: sessions.results ?? [] });
}

async function acceptMeal(request, env, id) {
  const input = await bodyJson(request);
  const session = await getSession(env.DB, id);
  if (!session) return json({ error: 'NOT_FOUND' }, 404);
  if (session.active_voice_id && session.active_voice_until > now())
    return json({ error: 'VOICE_ACTIVE' }, 409);
  if (!Number.isInteger(input.expectedMealRevision) || input.expectedMealRevision !== session.meal_revision ||
    !Number.isInteger(input.expectedRevision) || input.expectedRevision !== session.revision)
    return json({ error: 'STALE_MEAL', mealRevision: session.meal_revision, revision: session.revision }, 409);
  const selected = await env.DB.prepare("SELECT id FROM turns WHERE id=? AND session_id=? AND role='assistant'")
    .bind(input.assistantTurnId, id).first();
  if (!selected) return json({ error: 'NOT_FOUND' }, 404);
  const acceptedAt = now();
  const saved = await env.DB.batch([
    env.DB.prepare(`UPDATE sessions SET revision=revision+1,meal_revision=meal_revision+1,
      meal_source_turn_id=?,meal_accepted_at=?,
      ${isCookingVersion(env.BEHAVIOR_VERSION) ? 'cooking_revision=cooking_revision+1,cooking_progress_json=NULL,' : ''}updated_at=?
      WHERE id=? AND revision=? AND meal_revision=? AND (active_voice_id IS NULL OR active_voice_until<=?)`)
      .bind(selected.id, acceptedAt, acceptedAt, id, session.revision, session.meal_revision, acceptedAt),
    env.DB.prepare(`INSERT INTO state_events (id,session_id,turn_id,revision,kind,at,details_json)
      SELECT ?,id,?,revision,'meal_accepted',?,? FROM sessions WHERE id=? AND meal_revision=? AND meal_source_turn_id=?`)
      .bind(crypto.randomUUID(), selected.id, acceptedAt, JSON.stringify({ meal_revision: session.meal_revision + 1 }),
        id, session.meal_revision + 1, selected.id),
  ]);
  if (saved[0].meta.changes !== 1) return json({ error: 'STALE_MEAL' }, 409);
  return json({ revision: session.revision + 1, mealRevision: session.meal_revision + 1, sourceTurnId: selected.id });
}

async function setShoppingItem(request, env, id, itemId) {
  const input = await bodyJson(request);
  if (!Number.isInteger(input.expectedShoppingRevision) || typeof input.checked !== 'boolean')
    return json({ error: 'INVALID_SHOPPING_CHANGE' }, 400);
  const session = await getSession(env.DB, id);
  if (!session?.meal_plan_json) return json({ error: 'NO_ACTIVE_PLAN' }, 404);
  if (session.shopping_revision !== input.expectedShoppingRevision)
    return json({ error: 'STALE_SHOPPING', shoppingRevision: session.shopping_revision }, 409);
  const plan = JSON.parse(session.meal_plan_json);
  const item = plan.sections.flatMap(section => section.items).find(entry => entry.id === itemId);
  if (!item) return json({ error: 'NOT_FOUND' }, 404);
  if (item.checked === input.checked) return json({ shoppingRevision: session.shopping_revision, mealPlan: plan });
  item.checked = input.checked;
  item.have_status = input.checked ? 'confirmed' : 'need';
  item.customer_edited = true;
  delete item.quantity_changed;
  const at = now();
  const changed = await env.DB.prepare(`UPDATE sessions SET meal_plan_json=?,shopping_revision=shopping_revision+1,updated_at=?
    WHERE id=? AND shopping_revision=? AND meal_revision=? AND meal_plan_json IS NOT NULL`)
    .bind(JSON.stringify(plan), at, id, session.shopping_revision, session.meal_revision).run();
  if (changed.meta.changes !== 1) return json({ error: 'STALE_SHOPPING' }, 409);
  await event(env.DB, id, session.meal_source_turn_id, session.revision, 'shopping_item_changed',
    { meal_revision: session.meal_revision, shopping_revision: session.shopping_revision + 1,
      item_id: itemId, checked: input.checked });
  return json({ shoppingRevision: session.shopping_revision + 1, mealPlan: plan });
}

async function uploadImage(request, env, id) {
  if (!env.IMAGES) return json({ error: 'IMAGE_STORAGE_UNAVAILABLE' }, 503);
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'image/jpeg')
    return json({ error: 'JPEG_REQUIRED' }, 415);
  let cleaned;
  try { cleaned = stripJpegMetadata(await boundedBytes(request)); }
  catch (error) { return json({ error: error.message === 'IMAGE_TOO_LARGE' ? 'IMAGE_TOO_LARGE' : 'INVALID_JPEG' }, 400); }
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM images WHERE session_id=?').bind(id).first();
  if ((count?.n ?? 0) >= 8) return json({ error: 'IMAGE_LIMIT' }, 429);
  const imageId = crypto.randomUUID(), at = now();
  const session = await getSession(env.DB, id);
  if (!session) return json({ error: 'NOT_FOUND' }, 404);
  const key = `${id}/${imageId}`;
  await env.IMAGES.put(key, cleaned, { httpMetadata: { contentType: 'image/jpeg' } });
  try {
    await env.DB.prepare('INSERT INTO images (id,session_id,created_at,expires_at,byte_length) VALUES (?,?,?,?,?)')
      .bind(imageId, id, at, session.expires_at, cleaned.length).run();
  } catch (error) { await env.IMAGES.delete(key); throw error; }
  return json({ imageId, byteLength: cleaned.length }, 201);
}
async function showImage(env, id, imageId) {
  if (!env.IMAGES) return json({ error: 'IMAGE_STORAGE_UNAVAILABLE' }, 503);
  const image = await env.DB.prepare('SELECT id FROM images WHERE id=? AND session_id=? AND expires_at>?')
    .bind(imageId, id, now()).first();
  if (!image) return json({ error: 'NOT_FOUND' }, 404);
  const stored = await env.IMAGES.get(`${id}/${imageId}`);
  if (!stored) return json({ error: 'NOT_FOUND' }, 404);
  return new Response(stored.body, { headers: { ...BASE_HEADERS,
    'Content-Type': 'image/jpeg', 'Content-Disposition': 'inline', 'Content-Security-Policy': "default-src 'none'" } });
}
async function inputImage(env, id, imageId) {
  const stored = await env.IMAGES?.get(`${id}/${imageId}`);
  if (!stored) throw new Error('IMAGE_UNAVAILABLE');
  return `data:image/jpeg;base64,${base64(new Uint8Array(await stored.arrayBuffer()))}`;
}
async function messagesWithImages(env, id, turns) {
  const priorImages = turns.filter(t => t.role === 'user' && t.image_id).map(t => t.image_id);
  const latestPriorImage = priorImages.at(-1);
  const messages = [], imageIds = [];
  for (const turn of turns) {
    if (turn.image_id && (turn.image_id === latestPriorImage || turn === turns.at(-1))) {
      imageIds.push(turn.image_id);
      messages.push({ role: 'user', content: [
        { type: 'input_text', text: turn.text || 'Help me explore this food photo.' },
        { type: 'input_image', image_url: await inputImage(env, id, turn.image_id), detail: 'auto' },
      ] });
    } else messages.push({ role: turn.role, content: turn.text || '[Photo attached earlier]' });
  }
  return { messages, imageIds };
}

async function showSession(env, id) {
  const session = await getSession(env.DB, id);
  if (!session) return json({ error: 'NOT_FOUND' }, 404);
  const [turns, feedback] = await Promise.all([
    env.DB.prepare("SELECT id,role,text,image_id,source,created_at,revision FROM turns WHERE session_id=? ORDER BY revision,CASE role WHEN 'user' THEN 0 ELSE 1 END,created_at,id").bind(id).all(),
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
  const [voiceSessions, reminders, renderMetrics] = isStage1b(env) ? await Promise.all([
    env.DB.prepare('SELECT * FROM voice_sessions WHERE session_id=? ORDER BY opened_at').bind(id).all(),
    env.DB.prepare('SELECT * FROM return_reminders WHERE session_id=? ORDER BY created_at').bind(id).all(),
    env.DB.prepare('SELECT * FROM client_render_metrics WHERE session_id=? ORDER BY observed_at').bind(id).all(),
  ]) : [{ results: [] }, { results: [] }, { results: [] }];
  const timeline = [
    ...(turns.results ?? []).map(t => ({ at: t.created_at, revision: t.revision, kind: `conversation_${t.role}`,
      text: t.text, image_id: t.image_id ?? null, source: t.source ?? 'write' })),
    ...(calls.results ?? []).map(c => ({ at: c.requested_at, revision: c.revision, kind: `model_call_${c.status}`,
      details: JSON.stringify({ id: c.id, requested_model: c.requested_model, response_model: c.response_model,
        provider_response_id: c.provider_response_id, behavior_version: c.behavior_version,
        context_version: c.context_version, reasoning_effort: c.reasoning_effort,
        customer_context_supplied: c.customer_context_snapshot,
        accepted_meal_supplied: c.accepted_meal_snapshot,
        accepted_meal_revision: c.accepted_meal_revision,
        memory_retrieved: c.memory_retrieved, image_ids: JSON.parse(c.image_ids_json || '[]'),
        tool_calls: JSON.parse(c.tool_calls_json), modality_usage: c.modality_usage_json ? JSON.parse(c.modality_usage_json) : null,
        first_text_ms: c.first_text_ms,
        first_useful_ms: c.first_useful_ms, first_useful_excerpt: c.first_useful_excerpt,
        first_useful_method: c.requested_model === VOICE_MODEL
          ? 'first spoken transcript delta after speech stop (proxy)'
          : 'first >=50-character streamed prefix with sentence end or list item (proxy)',
        full_ms: c.full_ms, input_tokens: c.input_tokens,
        cached_input_tokens: c.cached_input_tokens, output_tokens: c.output_tokens,
        reasoning_tokens: c.reasoning_tokens, estimated_usd: c.estimated_usd,
        retry_count: c.retry_count, error_code: c.error_code, completed_at: c.completed_at,
        model_said: c.assistant_text }, null, 2) })),
    ...(events.results ?? []).map(e => ({ at: e.at, revision: e.revision, kind: `state_${e.kind}`,
      details: JSON.stringify({ turn_id: e.turn_id, ...JSON.parse(e.details_json) }) })),
    ...(voiceSessions.results ?? []).map(v => ({ at: v.opened_at, revision: null, kind: 'voice_session',
      details: JSON.stringify({ id: v.id, model: v.model, behavior_version: v.behavior_version,
        context_snapshot: v.context_snapshot, meal_snapshot: v.meal_snapshot,
        transcript_snapshot: v.transcript_snapshot, connect_ms: v.connect_ms,
        provider_call_id: v.provider_call_id, closed_at: v.closed_at, error_code: v.error_code }, null, 2) })),
    ...(reminders.results ?? []).map(r => ({ at: r.created_at, revision: null, kind: 'return_reminder',
      details: JSON.stringify({ id: r.id, due_at: r.due_at, status: r.status, attempt_count: r.attempt_count,
        push_accepted_at: r.push_accepted_at, displayed_at: r.displayed_at,
        clicked_at: r.clicked_at, error_code: r.error_code }, null, 2) })),
    ...(renderMetrics.results ?? []).map(m => ({ at: m.observed_at, revision: m.revision,
      kind: `client_${m.kind}`, details: JSON.stringify({ source_turn_id: m.source_turn_id,
        elapsed_ms: m.elapsed_ms, method: m.kind === 'now_speech_delta_proxy'
          ? 'first post-acceptance speech transcript delta (audibility proxy)'
          : 'browser animation frame after accepted state rendered' }) })),
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

function behaviorFor(env, context, hasAcceptedMeal = false, cookingActive = false) {
  const version = env.BEHAVIOR_VERSION || BEHAVIOR_VERSION;
  if (isPackageVersion(version) && isStage1b(env) && (!env.ARM || env.ARM === 'C'))
    return { version, instructions: (version === COOKING_CONTENT_BEHAVIOR_VERSION
      ? instructionsForCookingContent : instructionsForMealPackage)(context, hasAcceptedMeal, cookingActive) };
  if (version === COOKING_PLAN_BEHAVIOR_VERSION && isStage1b(env) && (!env.ARM || env.ARM === 'C'))
    return { version, instructions: instructionsForCookingModeV2(context, hasAcceptedMeal, cookingActive) };
  if (version === COOKING_BEHAVIOR_VERSION && isStage1b(env) && (!env.ARM || env.ARM === 'C'))
    return { version, instructions: instructionsForCookingMode(context, hasAcceptedMeal, cookingActive) };
  if (version === NEXT_FLOW_BEHAVIOR_VERSION && isStage1b(env) && (!env.ARM || env.ARM === 'C'))
    return { version, instructions: instructionsForNextFlow(context) };
  if (version === CANDIDATE_BEHAVIOR_VERSION && (!env.ARM || env.ARM === 'C'))
    return { version, instructions: instructionsForCandidate(context) };
  if (version === BEHAVIOR_VERSION)
    return { version, instructions: instructionsFor(env.ARM || 'C', context) };
  throw new Error('INVALID_BEHAVIOR_CONFIGURATION');
}

async function acceptTurn(env, id, input) {
  const session = await getSession(env.DB, id);
  if (!session) return { response: json({ error: 'NOT_FOUND' }, 404) };
  if (isStage1b(env) && session.active_voice_id && session.active_voice_until > now())
    return { response: json({ error: 'VOICE_ACTIVE' }, 409) };
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  const turnId = input.turnId;
  const imageId = isStage1b(env) && typeof input.imageId === 'string' ? input.imageId : null;
  if ((!text && !imageId) || text.length > 4000 || typeof turnId !== 'string' || !/^[0-9a-f-]{36}$/i.test(turnId)
    || (imageId && !/^[0-9a-f-]{36}$/i.test(imageId)))
    return { response: json({ error: 'INVALID_TURN' }, 400) };
  const existing = await env.DB.prepare("SELECT revision,text,image_id FROM turns WHERE id=? AND session_id=? AND role='user'")
    .bind(turnId, id).first();
  if (existing) {
    if (existing.text !== text || (existing.image_id ?? null) !== imageId)
      return { response: json({ error: 'TURN_ID_CONFLICT' }, 409) };
    const outcome = await turnResult(env, id, turnId);
    if (outcome.status === 'accepted' || session.revision !== existing.revision)
      return { response: json(outcome) };
    if (outcome.status === 'pending' && !outcome.leaseExpired)
      return { response: json(outcome, 202) };
    const prior = await env.DB.prepare("SELECT role,text,image_id FROM turns WHERE session_id=? AND revision<=? ORDER BY revision,CASE role WHEN 'user' THEN 0 ELSE 1 END,created_at,id")
      .bind(id, existing.revision).all();
    return { session, text, imageId, turnId, revision: existing.revision,
      ...await messagesWithImages(env, id, prior.results ?? []) };
  }
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== session.revision)
    return { response: json({ error: 'STALE_REVISION', revision: session.revision }, 409) };
  if (imageId) {
    const image = await env.DB.prepare('SELECT id FROM images WHERE id=? AND session_id=? AND turn_id IS NULL AND expires_at>?')
      .bind(imageId, id, now()).first();
    if (!image) return { response: json({ error: 'IMAGE_UNAVAILABLE' }, 400) };
  }
  const prior = await env.DB.prepare("SELECT role,text,image_id FROM turns WHERE session_id=? ORDER BY revision,CASE role WHEN 'user' THEN 0 ELSE 1 END,created_at,id").bind(id).all();
  const userCount = (prior.results ?? []).filter(t => t.role === 'user').length;
  if (userCount >= 50) return { response: json({ error: 'SESSION_LIMIT' }, 429) };
  const today = now().slice(0, 10);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM model_calls WHERE requested_at>=?')
    .bind(`${today}T00:00:00.000Z`).first();
  if ((count?.n ?? 0) >= 100) return { response: json({ error: 'DAILY_LAB_LIMIT' }, 429) };

  const revision = session.revision + 1;
  const at = now();
  const accepted = await env.DB.batch([
    env.DB.prepare(`UPDATE sessions SET revision=?,last_turn_id=?,updated_at=? WHERE id=? AND revision=?
      AND (active_voice_id IS NULL OR active_voice_until<=?)`)
      .bind(revision, turnId, at, id, session.revision, at),
    env.DB.prepare(`INSERT INTO turns (id,session_id,revision,role,text,image_id,created_at)
      SELECT ?,id,?,'user',?,?,? FROM sessions WHERE id=? AND revision=? AND last_turn_id=?`)
      .bind(turnId, revision, text, imageId, at, id, revision, turnId),
    env.DB.prepare(`UPDATE images SET turn_id=? WHERE id=? AND session_id=? AND turn_id IS NULL
      AND EXISTS (SELECT 1 FROM turns WHERE id=? AND session_id=?)`)
      .bind(turnId, imageId, id, turnId, id),
    env.DB.prepare(`INSERT INTO state_events (id,session_id,turn_id,revision,kind,at,details_json)
      SELECT ?,id,? ,?,'user_turn_accepted',?,? FROM sessions WHERE id=? AND revision=? AND last_turn_id=?`)
      .bind(crypto.randomUUID(), turnId, revision, at, '{"text_stored_in":"turns"}', id, revision, turnId),
  ]);
  if (accepted[0].meta.changes !== 1) return { response: json({ error: 'STALE_REVISION' }, 409) };
  const assembled = await messagesWithImages(env, id,
    [...(prior.results ?? []), { role: 'user', text, image_id: imageId }]);
  return { session, text, imageId, turnId, revision, ...assembled };
}

async function turnResult(env, id, turnId) {
  const user = await env.DB.prepare("SELECT revision FROM turns WHERE id=? AND session_id=? AND role='user'")
    .bind(turnId, id).first();
  if (!user) return { error: 'NOT_FOUND', status: 'missing' };
  const assistant = await env.DB.prepare("SELECT id,text FROM turns WHERE session_id=? AND revision=? AND role='assistant' ORDER BY created_at,id LIMIT 1")
    .bind(id, user.revision).first();
  if (assistant) return { turnId, revision: user.revision, status: 'accepted', assistant };
  const op = await env.DB.prepare('SELECT status,lease_until FROM turn_operations WHERE user_turn_id=? AND session_id=?')
    .bind(turnId, id).first();
  const leaseExpired = !op || (op.status === 'pending' && op.lease_until < now());
  return { turnId, revision: user.revision,
    status: leaseExpired ? 'interrupted' : op.status, leaseExpired };
}

async function claimTurnOperation(env, id, turnId, revision, callId) {
  const at = now();
  const leaseUntil = new Date(Date.now() + 120_000).toISOString();
  const first = await env.DB.prepare(`INSERT OR IGNORE INTO turn_operations
    (user_turn_id,session_id,revision,current_call_id,status,lease_until,updated_at)
    SELECT ?,id,?,?, 'pending',?,? FROM sessions WHERE id=? AND revision=?`)
    .bind(turnId, revision, callId, leaseUntil, at, id, revision).run();
  if (first.meta.changes === 1) return true;
  const retry = await env.DB.prepare(`UPDATE turn_operations SET current_call_id=?,status='pending',lease_until=?,updated_at=?
    WHERE user_turn_id=? AND session_id=? AND revision=? AND (status='error' OR (status='pending' AND lease_until<?))
    AND EXISTS (SELECT 1 FROM sessions WHERE id=? AND revision=?)`)
    .bind(callId, leaseUntil, at, turnId, id, revision, at, id, revision).run();
  return retry.meta.changes === 1;
}

function voiceCost(usage) {
  if (!usage || !Number.isFinite(usage.input_tokens) || !Number.isFinite(usage.output_tokens)) return null;
  const incoming = usage.input_token_details ?? {}, outgoing = usage.output_token_details ?? {};
  const cached = incoming.cached_tokens_details ?? {};
  const textIn = Math.max(0, (incoming.text_tokens ?? 0) - (cached.text_tokens ?? 0));
  const audioIn = Math.max(0, (incoming.audio_tokens ?? 0) - (cached.audio_tokens ?? 0));
  const imageIn = Math.max(0, (incoming.image_tokens ?? 0) - (cached.image_tokens ?? 0));
  return (textIn * 4 + audioIn * 32 + imageIn * 5 +
    (cached.text_tokens ?? 0) * .4 + (cached.audio_tokens ?? 0) * .4 +
    (cached.image_tokens ?? 0) * .5 + (outgoing.text_tokens ?? 0) * 24 +
    (outgoing.audio_tokens ?? 0) * 64) / 1_000_000;
}

async function startVoice(request, env, id) {
  if (!env.OPENAI_API_KEY) return json({ error: 'MODEL_UNAVAILABLE' }, 503);
  const raw = await request.text();
  if (raw.length > 32_000) return json({ error: 'REQUEST_TOO_LARGE' }, 413);
  let input;
  try { input = JSON.parse(raw); } catch { return json({ error: 'INVALID_JSON' }, 400); }
  if (typeof input.sdp !== 'string' || !input.sdp.startsWith('v=0') || input.sdp.length > 24_000 ||
    !Number.isInteger(input.expectedRevision)) return json({ error: 'INVALID_VOICE_START' }, 400);
  const session = await getSession(env.DB, id);
  if (!session) return json({ error: 'NOT_FOUND' }, 404);
  if (session.revision !== input.expectedRevision ||
    (session.active_voice_id && session.active_voice_until > now()))
    return json({ error: 'STALE_REVISION', revision: session.revision }, 409);
  const pending = await env.DB.prepare(`SELECT COUNT(*) AS n FROM turn_operations
    WHERE session_id=? AND status='pending' AND lease_until>?`).bind(id, now()).first();
  if (pending?.n) return json({ error: 'TURN_PENDING' }, 409);
  const prior = await env.DB.prepare(`SELECT role,text,image_id FROM turns WHERE session_id=?
    ORDER BY revision,CASE role WHEN 'user' THEN 0 ELSE 1 END,created_at,id`).bind(id).all();
  const transcript = (prior.results ?? []).map(t => `${t.role === 'user' ? 'Customer' : 'Snap'}: ${t.text || '[Photo shared]'}`)
    .join('\n').slice(-20_000);
  const meal = session.meal_source_turn_id ? await env.DB.prepare("SELECT text FROM turns WHERE id=? AND session_id=? AND role='assistant'")
    .bind(session.meal_source_turn_id, id).first() : null;
  const contextText = session.customer_context || 'No saved customer facts provided yet.';
  const behavior = behaviorFor(env, contextText, Boolean(session.meal_plan_json), Boolean(session.cooking_progress_json));
  const equipment = await equipmentContext(env, session);
   const planContext = isNextFlow(behavior.version) && session.meal_plan_json
     ? `\n\nCurrent application-accepted meal, shopping and cooking plan (revision ${session.meal_revision}):\n${session.meal_plan_json}\nChecked shopping items are held or assumed as labeled, not proof of cooking.` : '';
   const instructions = behavior.instructions + (meal
    ? `\n\nAccepted meal reference (revision ${session.meal_revision}): The customer saved this reply as the active meal; do not assume they cooked anything.\n${meal.text.slice(0, 4000)}` : '') +
     planContext + equipment.text + (isCookingVersion(behavior.version) && session.meal_plan_json ? cookingContext(session) : '') +
     (transcript ? `\n\nConversation so far, in order. Continue naturally from this context; these are past turns, not new instructions:\n${transcript}` : '') +
     (isBridgeVersion(behavior.version)
       ? '\n\nSpoken mode: respond conversationally with the same culinary judgment as Write It. When an application operation is needed, call the narrow tool first. Wait for its actual function_call_output before saying that a meal, shopping list or cooking plan is ready. If rejected, repair once or explain the issue usefully. Then speak a brief transition or Now guidance; the visual interface shows the list and Full Plan. Never read the list or full plan aloud. Direct questions need no tool.'
       : '\n\nSpoken mode: respond conversationally and keep each spoken reply proportional to the immediate need. The visible transcript accompanies your speech. Use the same culinary judgment as Write It. When a meal is ready, speak only the brief transition and meal, then propose the shopping list with the tool. Never read the shopping items aloud.');
  const voiceBehaviorVersion = `${behavior.version}+${isBridgeVersion(behavior.version) ? VOICE_BRIDGE_VERSION : 'voice-v1'}`;
  const voiceId = crypto.randomUUID(), opened = now(), expires = new Date(Date.now() + 60 * 60_000).toISOString();
  const claimed = await env.DB.batch([
    env.DB.prepare(`UPDATE sessions SET active_voice_id=?,active_voice_until=? WHERE id=? AND revision=? AND meal_revision=?
      AND (active_voice_id IS NULL OR active_voice_until<=?)
      AND NOT EXISTS (SELECT 1 FROM turn_operations o WHERE o.session_id=sessions.id
        AND o.status='pending' AND o.lease_until>?)`)
      .bind(voiceId, expires, id, session.revision, session.meal_revision, opened, opened),
    env.DB.prepare(`INSERT INTO voice_sessions
      (id,session_id,opened_at,expires_at,model,behavior_version,context_snapshot,meal_snapshot,transcript_snapshot,
       meal_revision_snapshot,cooking_revision_snapshot,cooking_snapshot,equipment_snapshot)
      SELECT ?,id,?,?,?,?,?,?,?,?,?,?,? FROM sessions WHERE id=? AND active_voice_id=?`)
      .bind(voiceId, opened, expires, VOICE_MODEL, voiceBehaviorVersion,
         session.customer_context, session.meal_plan_json ?? meal?.text.slice(0, 4000) ?? null,
         transcript, session.meal_revision, session.cooking_revision ?? 0,
         session.cooking_progress_json ?? null, equipment.memory, id, voiceId),
  ]);
  if (claimed[0].meta.changes !== 1) return json({ error: 'VOICE_ACTIVE' }, 409);
  const began = performance.now();
  try {
    const form = new FormData();
    form.set('sdp', input.sdp);
     form.set('session', JSON.stringify({ type: 'realtime', model: VOICE_MODEL,
       instructions, output_modalities: ['audio'],
       ...(isNextFlow(behavior.version) ? { tools: toolsFor(behavior.version),
         tool_choice: behavior.version === COOKING_BEHAVIOR_VERSION && session.cooking_progress_json ? 'required' : 'auto' } : {}),
       audio: {
        input: { transcription: { model: 'gpt-live-transcribe' }, turn_detection: { type: 'semantic_vad' } },
        output: { voice: 'marin' },
      } }));
    const safetyId = await mac(env.COOKIE_SIGNING_KEY, session.customer_id || id);
    const response = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'OpenAI-Safety-Identifier': safetyId }, body: form });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const sdp = await response.text();
    if (!sdp.startsWith('v=0')) throw new Error('INVALID_SDP_ANSWER');
    const connectMs = Math.round(performance.now() - began);
    const callId = response.headers.get('Location')?.split('/').at(-1) ?? null;
    await env.DB.prepare('UPDATE voice_sessions SET provider_call_id=?,connect_ms=? WHERE id=?')
      .bind(callId, connectMs, voiceId).run();
    await event(env.DB, id, null, session.revision, 'voice_connected',
      { voice_session_id: voiceId, model: VOICE_MODEL, behavior_version: voiceBehaviorVersion, connect_ms: connectMs });
    return json({ voiceSessionId: voiceId, sdp, model: VOICE_MODEL,
      behaviorVersion: voiceBehaviorVersion, connectMs,
      ...(isNextFlow(behavior.version) ? { syncInstructions: instructions } : {}),
      ...(isCookingVersion(behavior.version) ? { cookingSyncInstructions:
        (behavior.version === COOKING_CONTENT_BEHAVIOR_VERSION ? instructionsForCookingContent :
          isPackageVersion(behavior.version) ? instructionsForMealPackage :
          behavior.version === COOKING_PLAN_BEHAVIOR_VERSION ? instructionsForCookingModeV2 : instructionsForCookingMode)(contextText, true, true) +
        (transcript ? `\n\nConversation before this spoken session:\n${transcript}` : '') +
        '\n\nSpoken mode: say the useful Now guidance or answer conversationally; keep the visible transcript. Do not read the full plan or shopping list aloud.' } : {}) }, 201);
  } catch (error) {
    const code = error instanceof Error && /^[A-Z_0-9]+$/.test(error.message) ? error.message : 'VOICE_CONNECT_ERROR';
    await env.DB.batch([
      env.DB.prepare('UPDATE voice_sessions SET closed_at=?,error_code=? WHERE id=?').bind(now(), code, voiceId),
      env.DB.prepare('UPDATE sessions SET active_voice_id=NULL,active_voice_until=NULL WHERE id=? AND active_voice_id=?')
        .bind(id, voiceId),
    ]);
    return json({ error: code }, 502);
  }
}

async function acceptVoiceProposal(env, id, session, voice, input) {
  if (!isBridgeVersion(voice.behavior_version.split('+')[0]))
    return json({ error: 'UNSUPPORTED_VOICE_PROPOSAL' }, 400);
  const responseId = input.responseId, itemId = input.userItemId, call = input.call;
  if (typeof responseId !== 'string' || !/^[A-Za-z0-9_-]{4,128}$/.test(responseId) ||
    typeof itemId !== 'string' || !/^[A-Za-z0-9_-]{4,128}$/.test(itemId) ||
    !call || !['publish_meal_plan', 'update_cooking_progress'].includes(call.name) ||
    typeof call.arguments !== 'string' || call.arguments.length > 16000)
    return json({ error: 'INVALID_VOICE_PROPOSAL' }, 400);
  const prior = await env.DB.prepare(`SELECT i.status,c.error_code FROM voice_assistant_items i
    LEFT JOIN model_calls c ON c.id=i.model_call_id
    WHERE i.voice_session_id=? AND i.provider_response_id=?`).bind(voice.id, responseId).first();
  if (prior) return json({ status: prior.status === 'rejected' ? 'rejected' : 'accepted',
    accepted: prior.status !== 'rejected', reason: prior.error_code ?? null,
    operation: prior.status === 'meal_accepted' ? 'meal' : prior.status === 'cooking_accepted' ? 'cooking' : null });
  const user = await env.DB.prepare(`SELECT i.turn_id,i.revision,i.shopping_revision_snapshot,t.text
    FROM voice_user_items i JOIN turns t ON t.id=i.turn_id
    WHERE i.voice_session_id=? AND i.provider_item_id=?`).bind(voice.id, itemId).first();
  if (!user) return json({ error: 'VOICE_USER_NOT_SAVED' }, 409);
  if (session.revision !== user.revision || session.active_voice_id !== voice.id ||
    session.meal_revision !== voice.meal_revision_snapshot ||
    session.cooking_revision !== voice.cooking_revision_snapshot ||
    session.shopping_revision !== user.shopping_revision_snapshot)
    return json({ status: 'stale_rejected', accepted: false, reason: 'ACCEPTED_STATE_CHANGED' });

  const isMeal = call.name === 'publish_meal_plan';
  const plan = isMeal ? mealProposal([{ type: 'function_call', ...call }], session,
    voice.behavior_version.split('+')[0]) : null;
  const cooking = isMeal ? null : cookingProposalForVersion([{ type: 'function_call', ...call }],
    user.text, session, voice.behavior_version.split('+')[0]);
  const reason = isMeal ? plan.reason : !session.meal_plan_json ? 'NO_ACTIVE_PLAN' : cooking.reason;
  const proposed = isMeal ? plan.plan : cooking.cooking;
  const at = now(), callId = crypto.randomUUID();
  const usage = typeof input.usage === 'object' && input.usage !== null ? input.usage : null;
  const cost = voiceCost(usage);
  const record = status => env.DB.prepare(`INSERT INTO model_calls
    (id,session_id,user_turn_id,revision,requested_at,completed_at,status,requested_model,response_model,
     provider_response_id,behavior_version,context_version,reasoning_effort,customer_context_snapshot,
     memory_retrieved,tool_calls_json,assistant_text,input_tokens,cached_input_tokens,output_tokens,
     estimated_usd,error_code,full_ms)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS
    (SELECT 1 FROM voice_assistant_items WHERE voice_session_id=? AND provider_response_id=? AND model_call_id=?)`)
    .bind(callId, id, user.turn_id, user.revision, voice.opened_at, at, status, VOICE_MODEL, VOICE_MODEL,
      responseId, voice.behavior_version, 'stage1b-context-v1', 'provider-default', voice.context_snapshot,
      voice.equipment_snapshot ?? 'none — no equipment facts retrieved',
      JSON.stringify([{ name: call.name, arguments: call.arguments, source: 'client_observed_realtime_event' }]), '',
      usage?.input_tokens ?? null, usage?.input_token_details?.cached_tokens ?? null,
      usage?.output_tokens ?? null, cost, status === 'rejected' ? reason : null,
      Number.isInteger(input.fullMs) ? input.fullMs : null, voice.id, responseId, callId);
  if (!proposed) {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO voice_assistant_items
        (voice_session_id,provider_response_id,model_call_id,status) VALUES (?,?,?,'rejected')`)
        .bind(voice.id, responseId, callId),
      record('rejected'),
      env.DB.prepare(`INSERT INTO state_events (id,session_id,turn_id,revision,kind,at,details_json)
        VALUES (?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), id, user.turn_id, user.revision,
          isMeal ? 'meal_plan_proposal_rejected' : 'cooking_proposal_rejected', at,
          JSON.stringify({ model_call_id: callId, reason })),
    ]);
    return json({ status: 'rejected', accepted: false, reason });
  }

  const planJson = isMeal ? JSON.stringify(proposed) : null;
  const cookingJson = isMeal ? null : nextCookingState(session, proposed, user.turn_id, user.turn_id, at);
  const packageVoice = isMeal && isPackageVersion(voice.behavior_version.split('+')[0]);
  const revisedJson = packageVoice ? revisedCookingState(session, proposed, user.turn_id, at) : null;
  const changed = await env.DB.batch([
    isMeal ? env.DB.prepare(`UPDATE sessions SET meal_revision=meal_revision+1,
      meal_source_turn_id=?,meal_accepted_at=?,meal_plan_json=?,shopping_revision=shopping_revision+1,
      cooking_revision=cooking_revision+1,cooking_progress_json=${packageVoice ? '?' : 'NULL'},updated_at=?
      WHERE id=? AND revision=? AND meal_revision=? AND cooking_revision=?
      AND shopping_revision=? AND active_voice_id=?`)
      .bind(user.turn_id, at, planJson, ...(packageVoice ? [revisedJson] : []), at, id, user.revision, session.meal_revision,
        session.cooking_revision, user.shopping_revision_snapshot, voice.id)
      : env.DB.prepare(`UPDATE sessions SET cooking_revision=cooking_revision+1,
        cooking_progress_json=?,updated_at=? WHERE id=? AND revision=? AND meal_revision=?
        AND cooking_revision=? AND shopping_revision=? AND active_voice_id=? AND meal_plan_json IS NOT NULL`)
        .bind(cookingJson, at, id, user.revision, session.meal_revision,
          session.cooking_revision, user.shopping_revision_snapshot, voice.id),
    env.DB.prepare(`INSERT INTO voice_assistant_items
      (voice_session_id,provider_response_id,model_call_id,status)
      SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM sessions WHERE id=? AND revision=?
      AND ${isMeal ? 'meal_revision=? AND meal_source_turn_id=?' : "cooking_revision=? AND json_extract(cooking_progress_json,'$.current_action_turn_id')=?"})`)
      .bind(voice.id, responseId, callId, isMeal ? 'meal_accepted' : 'cooking_accepted',
        id, user.revision, isMeal ? session.meal_revision + 1 : session.cooking_revision + 1, user.turn_id),
    record('accepted'),
    env.DB.prepare(`INSERT INTO state_events (id,session_id,turn_id,revision,kind,at,details_json)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM voice_assistant_items
      WHERE voice_session_id=? AND provider_response_id=? AND model_call_id=?)`)
      .bind(crypto.randomUUID(), id, user.turn_id, user.revision,
        isMeal ? 'meal_plan_accepted' : 'cooking_progress_accepted', at,
        JSON.stringify({ model_call_id: callId, source: 'client_observed_realtime_event',
          ...(isMeal ? { item_count: proposed.sections.reduce((n, s) => n + s.items.length, 0) }
            : { customer_reported: Boolean(proposed.customer_report),
                ignored_fields: proposed.ignored_fields }) }), voice.id, responseId, callId),
    env.DB.prepare(`UPDATE voice_sessions SET
      ${isMeal ? `meal_snapshot=?,meal_revision_snapshot=meal_revision_snapshot+1,cooking_revision_snapshot=cooking_revision_snapshot+1,cooking_snapshot=${packageVoice ? '?' : 'NULL'}`
        : 'cooking_revision_snapshot=cooking_revision_snapshot+1,cooking_snapshot=?'}
      WHERE id=? AND EXISTS (SELECT 1 FROM voice_assistant_items
      WHERE voice_session_id=? AND provider_response_id=? AND model_call_id=?)`)
      .bind(...(isMeal ? packageVoice ? [planJson, revisedJson] : [planJson] : [cookingJson]),
        voice.id, voice.id, responseId, callId),
  ]);
  if (changed[0].meta.changes !== 1)
    return json({ status: 'stale_rejected', accepted: false, reason: 'ACCEPTED_STATE_CHANGED' });
  return json({ status: 'accepted', accepted: true,
    operation: isMeal ? 'meal' : 'cooking', mealRevision: session.meal_revision + (isMeal ? 1 : 0),
    shoppingRevision: session.shopping_revision + (isMeal ? 1 : 0),
    cookingRevision: session.cooking_revision + 1 });
}

async function recordClientRenderMetric(request, env, id) {
  const input = await bodyJson(request);
  const { sourceTurnId, kind, revision, elapsedMs } = input;
  if (!/^[0-9a-f-]{36}$/i.test(sourceTurnId ?? '') ||
    !['shopping_visible', 'now_visible', 'now_speech_delta_proxy',
      'full_plan_visible', 'meal_speech_delta_proxy'].includes(kind) ||
    !Number.isInteger(revision) || revision < 1 ||
    !Number.isInteger(elapsedMs) || elapsedMs < 0 || elapsedMs > 120_000)
    return json({ error: 'INVALID_RENDER_METRIC' }, 400);
  const session = await getSession(env.DB, id);
  const authoritativeRevision = ['shopping_visible', 'full_plan_visible', 'meal_speech_delta_proxy'].includes(kind)
    ? session?.meal_revision : session?.cooking_revision;
  if (authoritativeRevision !== revision) return json({ error: 'STALE_RENDER_METRIC' }, 409);
  const source = await env.DB.prepare('SELECT id FROM turns WHERE id=? AND session_id=? AND role=?')
    .bind(sourceTurnId, id, 'user').first();
  if (!source) return json({ error: 'UNKNOWN_RENDER_SOURCE' }, 404);
  if (kind === 'full_plan_visible' || kind === 'meal_speech_delta_proxy') {
    if (!isPackageVersion(env.BEHAVIOR_VERSION) || !session?.meal_plan_json)
      return json({ error: 'INVALID_RENDER_METRIC' }, 400);
    await env.DB.prepare(`INSERT INTO state_events (id,session_id,turn_id,revision,kind,at,details_json)
      SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS
      (SELECT 1 FROM state_events WHERE session_id=? AND turn_id=? AND kind=?)`)
      .bind(crypto.randomUUID(), id, sourceTurnId, revision, kind, now(),
        JSON.stringify({ elapsed_ms: elapsedMs, source: 'client_render_metric' }),
        id, sourceTurnId, kind).run();
    return json({ accepted: true });
  }
  await env.DB.prepare(`INSERT OR IGNORE INTO client_render_metrics
    (id,session_id,source_turn_id,kind,revision,elapsed_ms,observed_at)
    VALUES (?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), id, sourceTurnId, kind, revision, elapsedMs, now()).run();
  return json({ accepted: true });
}

async function voiceEvent(request, env, id) {
  const input = await bodyJson(request);
  const voiceId = input.voiceSessionId;
  if (typeof voiceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(voiceId))
    return json({ error: 'INVALID_VOICE_SESSION' }, 400);
  const session = await getSession(env.DB, id);
  if (!session || session.active_voice_id !== voiceId || session.active_voice_until <= now())
    return json({ error: 'STALE_VOICE_SESSION' }, 409);
  const voice = await env.DB.prepare('SELECT * FROM voice_sessions WHERE id=? AND session_id=? AND closed_at IS NULL')
    .bind(voiceId, id).first();
  if (!voice) return json({ error: 'STALE_VOICE_SESSION' }, 409);
  if (input.type === 'proposal') return acceptVoiceProposal(env, id, session, voice, input);
  if (input.type === 'user') {
    const itemId = input.itemId, transcript = typeof input.transcript === 'string' ? input.transcript.trim() : '';
    if (typeof itemId !== 'string' || !/^[A-Za-z0-9_-]{4,128}$/.test(itemId) || !transcript || transcript.length > 4000)
      return json({ error: 'INVALID_VOICE_TURN' }, 400);
    const existing = await env.DB.prepare('SELECT turn_id,revision FROM voice_user_items WHERE voice_session_id=? AND provider_item_id=?')
      .bind(voiceId, itemId).first();
    if (existing) return json({ turnId: existing.turn_id, revision: existing.revision, status: 'accepted' });
    const turnId = crypto.randomUUID(), revision = session.revision + 1, at = now();
    const writes = await env.DB.batch([
      env.DB.prepare('UPDATE sessions SET revision=?,last_turn_id=?,updated_at=? WHERE id=? AND revision=? AND active_voice_id=?')
        .bind(revision, turnId, at, id, session.revision, voiceId),
      env.DB.prepare(`INSERT INTO turns (id,session_id,revision,role,text,created_at,source,provider_item_id)
        SELECT ?,id,?,'user',?,?,'talk',? FROM sessions WHERE id=? AND revision=? AND last_turn_id=?`)
        .bind(turnId, revision, transcript, at, itemId, id, revision, turnId),
      env.DB.prepare(`INSERT INTO voice_user_items (voice_session_id,provider_item_id,turn_id,revision,
        transcription_usage_json,shopping_revision_snapshot)
        SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM turns WHERE id=?)`)
        .bind(voiceId, itemId, turnId, revision, input.usage ? JSON.stringify(input.usage).slice(0, 3000) : null,
          session.shopping_revision, turnId),
      env.DB.prepare(`INSERT INTO state_events (id,session_id,turn_id,revision,kind,at,details_json)
        SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM turns WHERE id=?)`)
        .bind(crypto.randomUUID(), id, turnId, revision, 'voice_user_turn_accepted', at,
          JSON.stringify({ provider_item_id: itemId, source: 'client_observed_transcript' }), turnId),
    ]);
    return writes[0].meta.changes === 1 ? json({ turnId, revision, status: 'accepted' })
      : json({ error: 'STALE_REVISION', revision: session.revision }, 409);
  }
  if (input.type === 'assistant') {
    if (isBridgeVersion(voice.behavior_version.split('+')[0]) &&
      (input.planCall || input.cookingCall))
      return json({ error: 'PROPOSAL_MUST_PRECEDE_SPEECH' }, 409);
    const responseId = input.responseId, itemId = input.userItemId;
    const transcript = typeof input.transcript === 'string' ? input.transcript.trim() : '';
    if (typeof responseId !== 'string' || !/^[A-Za-z0-9_-]{4,128}$/.test(responseId) ||
      typeof itemId !== 'string' || !/^[A-Za-z0-9_-]{4,128}$/.test(itemId) || !transcript || transcript.length > 8000)
      return json({ error: 'INVALID_VOICE_REPLY' }, 400);
    const prior = await env.DB.prepare('SELECT status FROM voice_assistant_items WHERE voice_session_id=? AND provider_response_id=?')
      .bind(voiceId, responseId).first();
    if (prior) return json({ status: prior.status });
    const user = await env.DB.prepare(`SELECT i.turn_id,i.revision,t.text FROM voice_user_items i
      JOIN turns t ON t.id=i.turn_id WHERE i.voice_session_id=? AND i.provider_item_id=?`)
      .bind(voiceId, itemId).first();
    if (!user) return json({ error: 'VOICE_USER_NOT_SAVED' }, 409);
    const at = now(), callId = crypto.randomUUID(), assistantId = crypto.randomUUID();
    const usage = typeof input.usage === 'object' && input.usage !== null ? input.usage : null;
    const firstMs = Number.isInteger(input.firstUsefulMs) && input.firstUsefulMs >= 0 ? input.firstUsefulMs : null;
    const fullMs = Number.isInteger(input.fullMs) && input.fullMs >= 0 ? input.fullMs : null;
     const cost = voiceCost(usage);
     const proposed = (voice.behavior_version.startsWith(NEXT_FLOW_BEHAVIOR_VERSION) ||
       isCookingVersion(voice.behavior_version.replace(/\+voice-v1$/, ''))) && input.planCall
       ? mealProposal([{ type: 'function_call', name: input.planCall.name,
         arguments: input.planCall.arguments }], session, voice.behavior_version.split('+')[0])
       : { plan: null, reason: null, calls: [] };
     const cookingProposal = isCookingVersion(voice.behavior_version.replace(/\+voice-v1$/, '')) && input.cookingCall
       ? cookingFromOutput([{ type: 'function_call', name: input.cookingCall.name,
         arguments: input.cookingCall.arguments }], user.text,
         isBridgeVersion(voice.behavior_version.split('+')[0]) && needsFullCookingPlan(session))
       : { cooking: null, reason: null, calls: [] };
     if (cookingProposal.cooking && !session.meal_plan_json) {
       cookingProposal.cooking = null;
       cookingProposal.reason = 'NO_ACTIVE_PLAN';
     }
     if (proposed.plan && cookingProposal.cooking) {
       proposed.plan = null;
       cookingProposal.cooking = null;
       cookingProposal.reason = 'CONFLICTING_STATE_PROPOSALS';
     }
     const planJson = proposed.plan ? JSON.stringify(proposed.plan) : null;
     const cookingJson = cookingProposal.cooking
       ? nextCookingState(session, cookingProposal.cooking, assistantId, user.turn_id, at) : null;
     const cookingEventId = crypto.randomUUID();
     const equipmentName = cookingProposal.cooking?.equipment_change?.name.toLocaleLowerCase() ?? null;
     const equipmentStatus = cookingProposal.cooking?.equipment_change?.status ?? null;
    const writes = await env.DB.batch([
      env.DB.prepare(`INSERT INTO turns (id,session_id,revision,role,text,created_at,model_call_id,source,provider_item_id)
        SELECT ?,s.id,?,'assistant',?,?,?,?,? FROM sessions s
        WHERE s.id=? AND s.revision=? AND s.active_voice_id=?
        AND s.meal_revision=? AND s.cooking_revision=?
        AND NOT EXISTS (SELECT 1 FROM turns t WHERE t.session_id=s.id AND t.revision=? AND t.role='assistant')`)
        .bind(assistantId, user.revision, transcript, at, callId, 'talk', responseId,
          id, user.revision, voiceId, voice.meal_revision_snapshot, voice.cooking_revision_snapshot, user.revision),
      env.DB.prepare(`INSERT INTO model_calls
        (id,session_id,user_turn_id,revision,requested_at,completed_at,status,requested_model,response_model,
         provider_response_id,behavior_version,context_version,reasoning_effort,customer_context_snapshot,
         memory_retrieved,tool_calls_json,image_ids_json,accepted_meal_snapshot,accepted_meal_revision,
         first_text_ms,first_useful_ms,full_ms,input_tokens,cached_input_tokens,output_tokens,
         estimated_usd,assistant_text,modality_usage_json)
        VALUES (?,?,?,?,?,?,CASE WHEN EXISTS (SELECT 1 FROM turns WHERE model_call_id=?)
          THEN 'accepted' ELSE 'stale_rejected' END,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(callId, id, user.turn_id, user.revision, voice.opened_at, at, callId, VOICE_MODEL, VOICE_MODEL,
          responseId, voice.behavior_version, 'stage1b-context-v1', 'provider-default', voice.context_snapshot,
           voice.equipment_snapshot ?? 'none — no equipment facts retrieved', JSON.stringify([...proposed.calls, ...cookingProposal.calls].map(call => ({
             name: call.name, arguments: call.arguments, source: 'client_observed_realtime_event' }))), '[]', voice.meal_snapshot,
          voice.meal_snapshot ? session.meal_revision : null, firstMs, firstMs, fullMs,
          usage?.input_tokens ?? null, usage?.input_token_details?.cached_tokens ?? null,
          usage?.output_tokens ?? null, cost, transcript, usage ? JSON.stringify(usage).slice(0, 4000) : null),
      env.DB.prepare(`INSERT INTO voice_assistant_items (voice_session_id,provider_response_id,model_call_id,status)
        SELECT ?,?,?,CASE WHEN EXISTS (SELECT 1 FROM turns WHERE model_call_id=?)
          THEN 'accepted' ELSE 'stale_rejected' END`)
        .bind(voiceId, responseId, callId, callId),
      env.DB.prepare(`UPDATE sessions SET meal_source_turn_id=? WHERE id=? AND meal_source_turn_id=?
        AND EXISTS (SELECT 1 FROM turns WHERE id=? AND model_call_id=?)`)
        .bind(assistantId, id, user.turn_id, assistantId, callId),
       env.DB.prepare(`INSERT INTO state_events (id,session_id,turn_id,revision,kind,at,details_json)
         VALUES (?,?,?,?,?,?,?)`)
         .bind(crypto.randomUUID(), id, user.turn_id, user.revision,
           'voice_assistant_result', at, JSON.stringify({ provider_response_id: responseId, model_call_id: callId,
             source: 'client_observed_realtime_event', status: session.revision === user.revision ? 'accepted' : 'stale_rejected' })),
       ...(planJson ? [
         env.DB.prepare(`UPDATE sessions SET meal_revision=meal_revision+1,meal_source_turn_id=?,
           meal_accepted_at=?,meal_plan_json=?,shopping_revision=shopping_revision+1,
           ${isCookingVersion(voice.behavior_version.replace(/\+voice-v1$/, '')) ? 'cooking_revision=cooking_revision+1,cooking_progress_json=NULL,' : ''}updated_at=?
           WHERE id=? AND revision=? AND active_voice_id=? AND EXISTS
           (SELECT 1 FROM turns WHERE id=? AND model_call_id=?)`)
           .bind(assistantId, at, planJson, at, id, user.revision, voiceId, assistantId, callId),
         env.DB.prepare(`UPDATE voice_sessions SET meal_snapshot=?,meal_revision_snapshot=meal_revision_snapshot+1,
           ${isCookingVersion(voice.behavior_version.replace(/\+voice-v1$/, '')) ? 'cooking_revision_snapshot=cooking_revision_snapshot+1,cooking_snapshot=NULL,' : ''}
           transcript_snapshot=transcript_snapshot WHERE id=? AND EXISTS
           (SELECT 1 FROM turns WHERE id=? AND model_call_id=?)`)
           .bind(planJson, voiceId, assistantId, callId),
         env.DB.prepare(`INSERT INTO state_events (id,session_id,turn_id,revision,kind,at,details_json)
           SELECT ?,?,?,?,?,?,? WHERE EXISTS
           (SELECT 1 FROM turns WHERE id=? AND model_call_id=?)`)
           .bind(crypto.randomUUID(), id, assistantId, user.revision, 'meal_plan_accepted', at,
             JSON.stringify({ model_call_id: callId, assistant_turn_id: assistantId,
               source: 'client_observed_realtime_event',
               item_count: proposed.plan.sections.reduce((n, section) => n + section.items.length, 0) }),
             assistantId, callId),
       ] : []),
       ...(cookingJson ? [
         env.DB.prepare(`UPDATE sessions SET cooking_revision=cooking_revision+1,cooking_progress_json=?,updated_at=?
           WHERE id=? AND revision=? AND meal_revision=? AND cooking_revision=? AND active_voice_id=?
           AND meal_plan_json IS NOT NULL AND EXISTS (SELECT 1 FROM turns WHERE id=? AND model_call_id=?)`)
           .bind(cookingJson, at, id, user.revision, session.meal_revision,
             session.cooking_revision ?? 0, voiceId, assistantId, callId),
         env.DB.prepare(`UPDATE voice_sessions SET cooking_revision_snapshot=cooking_revision_snapshot+1,
           cooking_snapshot=? WHERE id=? AND EXISTS (SELECT 1 FROM sessions s WHERE s.id=?
           AND s.cooking_revision=? AND json_extract(s.cooking_progress_json,'$.current_action_turn_id')=?)`)
           .bind(cookingJson, voiceId, id, (session.cooking_revision ?? 0) + 1, assistantId),
         env.DB.prepare(`INSERT INTO state_events (id,session_id,turn_id,revision,kind,at,details_json)
           SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM sessions s WHERE s.id=?
           AND s.cooking_revision=? AND json_extract(s.cooking_progress_json,'$.current_action_turn_id')=?)`)
           .bind(cookingEventId, id, user.turn_id, user.revision, 'cooking_progress_accepted', at,
             JSON.stringify({ model_call_id: callId, assistant_turn_id: assistantId,
               customer_reported: Boolean(cookingProposal.cooking.customer_report),
               equipment_change: equipmentName ? { name: equipmentName, status: equipmentStatus } : null,
               ignored_fields: cookingProposal.cooking.ignored_fields,
               source: 'client_observed_realtime_event', cooking_revision: (session.cooking_revision ?? 0) + 1 }),
             id, (session.cooking_revision ?? 0) + 1, assistantId),
         ...(equipmentName && session.customer_id ? [env.DB.prepare(`INSERT INTO customer_equipment
           (customer_id,name,status,source_session_id,source_turn_id,created_at,expires_at)
           SELECT ?,?,?,?,?,?,s.expires_at FROM sessions s WHERE s.id=? AND EXISTS
           (SELECT 1 FROM state_events WHERE id=? AND kind='cooking_progress_accepted')
           ON CONFLICT(customer_id,name) DO UPDATE SET status=excluded.status,
           source_session_id=excluded.source_session_id,source_turn_id=excluded.source_turn_id,
           created_at=excluded.created_at,expires_at=excluded.expires_at`)
           .bind(session.customer_id, equipmentName, equipmentStatus, id, user.turn_id, at, id, cookingEventId)] : []),
       ] : []),
       ...(proposed.reason ? [env.DB.prepare(`INSERT INTO state_events
         (id,session_id,turn_id,revision,kind,at,details_json) VALUES (?,?,?,?,?,?,?)`)
         .bind(crypto.randomUUID(), id, user.turn_id, user.revision, 'meal_plan_proposal_rejected', at,
           JSON.stringify({ model_call_id: callId, reason: proposed.reason }))] : []),
       ...(cookingProposal.reason ? [env.DB.prepare(`INSERT INTO state_events
         (id,session_id,turn_id,revision,kind,at,details_json) VALUES (?,?,?,?,?,?,?)`)
         .bind(crypto.randomUUID(), id, user.turn_id, user.revision, 'cooking_proposal_rejected', at,
           JSON.stringify({ model_call_id: callId, reason: cookingProposal.reason }))] : []),
     ]);
     return json({ status: writes[0].meta.changes === 1 ? 'accepted' : 'stale_rejected',
       revision: user.revision, assistantTurnId: writes[0].meta.changes === 1 ? assistantId : null,
       planAccepted: planJson && writes[0].meta.changes === 1,
       cookingAccepted: cookingJson && writes[0].meta.changes === 1 });
  }
  return json({ error: 'INVALID_VOICE_EVENT' }, 400);
}

async function stopVoice(request, env, id) {
  const input = await bodyJson(request);
  const voiceId = input.voiceSessionId, at = now();
  if (typeof voiceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(voiceId)) return json({ error: 'INVALID_VOICE_SESSION' }, 400);
  const failureCode = input.failureCode == null ? null : input.failureCode;
  if (failureCode !== null && (typeof failureCode !== 'string' || !/^[A-Z_0-9]{3,64}$/.test(failureCode)))
    return json({ error: 'INVALID_VOICE_FAILURE_CODE' }, 400);
  await env.DB.batch([
    env.DB.prepare('UPDATE voice_sessions SET closed_at=?,error_code=COALESCE(?,error_code) WHERE id=? AND session_id=? AND closed_at IS NULL')
      .bind(at, failureCode, voiceId, id),
    env.DB.prepare('UPDATE sessions SET active_voice_id=NULL,active_voice_until=NULL WHERE id=? AND active_voice_id=?')
      .bind(id, voiceId),
  ]);
  return json({ stopped: true });
}

function pushHostAllowed(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com' ||
        url.hostname.endsWith('.push.apple.com'));
  } catch { return false; }
}
async function subscribePush(request, env) {
  const customer = await currentCustomer(request, env);
  if (!customer) return json({ error: 'NOT_FOUND' }, 404);
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK || !env.VAPID_SUBJECT)
    return json({ error: 'PUSH_UNAVAILABLE' }, 503);
  const input = await bodyJson(request);
  const endpoint = input?.subscription?.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length > 2000 || !pushHostAllowed(endpoint))
    return json({ error: 'UNSUPPORTED_PUSH_ENDPOINT' }, 400);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE customer_id=?')
    .bind(customer.id).first();
  const prior = await env.DB.prepare('SELECT id,customer_id FROM push_subscriptions WHERE endpoint=?').bind(endpoint).first();
  if (!prior && count.n >= 5) return json({ error: 'DEVICE_LIMIT' }, 429);
  if (prior && prior.customer_id !== customer.id) return json({ error: 'SUBSCRIPTION_ALREADY_LINKED' }, 409);
  if (!prior) await env.DB.prepare('INSERT INTO push_subscriptions (id,customer_id,endpoint,created_at,expires_at) VALUES (?,?,?,?,?)')
    .bind(crypto.randomUUID(), customer.id, endpoint, now(), customer.expires_at).run();
  return json({ subscribed: true });
}
async function scheduleReturn(request, env, id) {
  const customer = await currentCustomer(request, env);
  const session = await getSession(env.DB, id);
  if (!customer || !session || session.customer_id !== customer.id) return json({ error: 'NOT_FOUND' }, 404);
  const input = await bodyJson(request);
  if (!Number.isInteger(input.minutes) || input.minutes < (env.RELEASE_ENV === 'production' ? 5 : 1) || input.minutes > 120)
    return json({ error: 'INVALID_REMINDER_TIME' }, 400);
  const subscription = await env.DB.prepare('SELECT id FROM push_subscriptions WHERE customer_id=? LIMIT 1')
    .bind(customer.id).first();
  if (!subscription) return json({ error: 'NOT_SUBSCRIBED' }, 409);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM return_reminders WHERE customer_id=? AND status IN ('pending','sending')")
    .bind(customer.id).first();
  if (count.n >= 3) return json({ error: 'REMINDER_LIMIT' }, 429);
  const idReminder = crypto.randomUUID(), at = now(), due = new Date(Date.now() + input.minutes * 60_000).toISOString();
  await env.DB.prepare("INSERT INTO return_reminders (id,customer_id,session_id,created_at,due_at,status) VALUES (?,?,?,?,?,'pending')")
    .bind(idReminder, customer.id, id, at, due).run();
  await event(env.DB, id, null, session.revision, 'return_reminder_scheduled',
    { reminder_id: idReminder, due_at: due, mechanism: 'web_push' });
  return json({ reminderId: idReminder, dueAt: due, mechanism: 'web_push' }, 201);
}
async function pendingPush(request, env) {
  const customer = await currentCustomer(request, env);
  if (!customer) return json({ error: 'NOT_FOUND' }, 404);
  const reminder = await env.DB.prepare(`SELECT id,session_id,due_at FROM return_reminders
    WHERE customer_id=? AND status IN ('sending','push_accepted') AND displayed_at IS NULL
    ORDER BY due_at,id LIMIT 1`).bind(customer.id).first();
  return json({ reminder: reminder ? { id: reminder.id, sessionId: reminder.session_id, dueAt: reminder.due_at } : null });
}
async function ackPush(request, env) {
  const customer = await currentCustomer(request, env);
  if (!customer) return json({ error: 'NOT_FOUND' }, 404);
  const input = await bodyJson(request);
  if (!/^[0-9a-f-]{36}$/i.test(input.reminderId ?? '') || !['displayed','clicked'].includes(input.kind))
    return json({ error: 'INVALID_ACK' }, 400);
  const field = input.kind === 'displayed' ? 'displayed_at' : 'clicked_at';
  const changed = await env.DB.prepare(`UPDATE return_reminders SET ${field}=COALESCE(${field},?)
    WHERE id=? AND customer_id=? AND status IN ('sending','push_accepted')`)
    .bind(now(), input.reminderId, customer.id).run();
  return changed.meta.changes ? json({ accepted: true }) : json({ error: 'NOT_FOUND' }, 404);
}
async function vapidHeader(env, endpoint) {
  const origin = new URL(endpoint).origin;
  const timestamp = Math.floor(Date.now() / 1000);
  const head = b64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64url(encoder.encode(JSON.stringify({ aud: origin, exp: timestamp + 12 * 3600, sub: env.VAPID_SUBJECT })));
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signed = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key,
    encoder.encode(`${head}.${payload}`)));
  return `vapid t=${head}.${payload}.${b64url(signed)}, k=${env.VAPID_PUBLIC_KEY}`;
}
async function dispatchReturns(env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK || !env.VAPID_SUBJECT) return;
  const at = now();
  const abandonedBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  const due = await env.DB.prepare(`SELECT id,customer_id,session_id FROM return_reminders
    WHERE ((status='pending' AND due_at<=?) OR (status='sending' AND due_at<=?))
    AND attempt_count<3 ORDER BY due_at LIMIT 10`).bind(at, abandonedBefore).all();
  for (const reminder of due.results ?? []) {
    const claimed = await env.DB.prepare(`UPDATE return_reminders SET status='sending',attempt_count=attempt_count+1
      WHERE id=? AND ((status='pending' AND due_at<=?) OR (status='sending' AND due_at<=?))
      AND attempt_count<3`).bind(reminder.id, at, abandonedBefore).run();
    if (claimed.meta.changes !== 1) continue;
    const subscriptions = await env.DB.prepare('SELECT id,endpoint FROM push_subscriptions WHERE customer_id=? AND expires_at>?')
      .bind(reminder.customer_id, at).all();
    let accepted = 0, lastError = null;
    for (const subscription of subscriptions.results ?? []) {
      try {
        const result = await fetch(subscription.endpoint, { method: 'POST',
          headers: { Authorization: await vapidHeader(env, subscription.endpoint), TTL: '300', Urgency: 'normal' } });
        if (result.status === 201 || result.status === 202) accepted++;
        else if (result.status === 404 || result.status === 410) {
          await env.DB.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(subscription.id).run();
          lastError = `PUSH_${result.status}`;
        } else lastError = `PUSH_${result.status}`;
      } catch { lastError = 'PUSH_NETWORK_ERROR'; }
    }
    const outcome = accepted ? 'push_accepted' : subscriptions.results?.length ? 'pending' : 'no_subscription';
    await env.DB.prepare('UPDATE return_reminders SET status=?,push_accepted_at=?,error_code=? WHERE id=? AND status=\'sending\'')
      .bind(outcome, accepted ? now() : null, lastError, reminder.id).run();
    const session = await getSession(env.DB, reminder.session_id);
    if (session) await event(env.DB, reminder.session_id, null, session.revision,
      'return_push_attempt', { reminder_id: reminder.id, accepted_by_push_service: accepted,
        status: outcome, error_code: lastError });
  }
}

async function streamTurn(request, env, ctx, id) {
  if (!env.OPENAI_API_KEY) return json({ error: 'MODEL_UNAVAILABLE' }, 503);
  if (![BEHAVIOR_VERSION, CANDIDATE_BEHAVIOR_VERSION, NEXT_FLOW_BEHAVIOR_VERSION, COOKING_BEHAVIOR_VERSION, COOKING_PLAN_BEHAVIOR_VERSION, MEAL_PACKAGE_BEHAVIOR_VERSION, COOKING_CONTENT_BEHAVIOR_VERSION].includes(env.BEHAVIOR_VERSION || BEHAVIOR_VERSION)
    || (env.BEHAVIOR_VERSION === CANDIDATE_BEHAVIOR_VERSION && env.ARM && env.ARM !== 'C')
    || (isNextFlow(env.BEHAVIOR_VERSION) && (!isStage1b(env) || (env.ARM && env.ARM !== 'C'))))
    return json({ error: 'INVALID_BEHAVIOR_CONFIGURATION' }, 503);
  const input = await bodyJson(request);
  const accepted = await acceptTurn(env, id, input);
  if (accepted.response) return accepted.response;
  const { session, imageIds, turnId, revision, messages } = accepted;
  const model = env.MODEL || 'gpt-6-astra';
  const effort = env.REASONING_EFFORT || 'medium';
  const contextText = session.customer_context || 'No saved customer facts provided yet.';
  const behavior = behaviorFor(env, contextText, Boolean(session.meal_plan_json), Boolean(session.cooking_progress_json));
  const equipment = await equipmentContext(env, session);
  const meal = isStage1b(env) && session.meal_source_turn_id
    ? await env.DB.prepare("SELECT text FROM turns WHERE id=? AND session_id=? AND role='assistant'")
      .bind(session.meal_source_turn_id, id).first() : null;
  const imageAddendum = imageIds.length > 0;
   const prompt = behavior.instructions + (meal
    ? `\n\nAccepted meal reference (revision ${session.meal_revision}): The customer explicitly saved this prior Snap reply as the active meal. It is a chosen plan, not evidence that any cooking step occurred.\n${meal.text.slice(0, 4000)}`
     : '') + (isNextFlow(behavior.version) && session.meal_plan_json
     ? `\n\nCurrent application-accepted meal, shopping and cooking plan (revision ${session.meal_revision}):\n${session.meal_plan_json}\nChecked shopping items are held or assumed as labeled, not proof of cooking.` : '') + (imageAddendum
    ? '\n\nFor a food photo, distinguish visible details from likely interpretation. Ask when a hidden ingredient or preparation choice changes the reconstruction. A photo cannot prove allergens or exact ingredients. Continue the same open culinary conversation.'
    : '') + equipment.text + (isCookingVersion(behavior.version) && session.meal_plan_json
    ? cookingContext(session) : '');
  const callId = crypto.randomUUID();
  if (!await claimTurnOperation(env, id, turnId, revision, callId)) {
    const outcome = await turnResult(env, id, turnId);
    return json(outcome, outcome.status === 'pending' ? 202 : 200);
  }
  const requestedAt = now();
  await env.DB.prepare(`INSERT INTO model_calls
    (id,session_id,user_turn_id,revision,requested_at,status,requested_model,behavior_version,context_version,
     reasoning_effort,customer_context_snapshot,memory_retrieved,tool_calls_json,image_ids_json,
     accepted_meal_snapshot,accepted_meal_revision)
     VALUES (?,?,?,?,?,'pending',?,?,?,?,?,?,?,?,?,?)`)
    .bind(callId, id, turnId, revision, requestedAt, model,
      imageAddendum ? `${behavior.version}+image-v1` : behavior.version,
      isStage1b(env) ? 'stage1b-context-v1' : CONTEXT_VERSION,
      effort, session.customer_context, equipment.memory, '[]',
       JSON.stringify(imageIds), session.meal_plan_json ?? meal?.text.slice(0, 4000) ?? null,
      meal ? session.meal_revision : null).run();

  const stream = new ReadableStream({
    start(controller) {
      const task = (async () => {
        const started = performance.now();
        let text = '', firstTextMs = null, firstUsefulMs = null, firstUsefulExcerpt = null, retryCount = 0, completed = null;
        let bridgeContinuationCount = 0, bridgeRejectedReason = null, bridgeRejectedCalls = [];
        try {
          sendSse(controller, { type: 'accepted', turnId, revision });
          let provider;
          for (let attempt = 0; attempt < 3; attempt++) {
            provider = await fetch('https://api.openai.com/v1/responses', {
              method: 'POST',
              headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
               body: JSON.stringify({ model, instructions: prompt, input: messages, reasoning: { effort },
                 ...(isNextFlow(behavior.version) ? { tools: toolsFor(behavior.version),
                   tool_choice: behavior.version === COOKING_BEHAVIOR_VERSION && session.cooking_progress_json ? 'required' : 'auto' } : {}),
                 max_output_tokens: 4096, store: false, stream: true }),
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
           if (!completed) throw new Error('INCOMPLETE_STREAM');
           let proposed = isNextFlow(behavior.version)
             ? mealProposal(completed.output, session, behavior.version) : { plan: null, reason: null, calls: [] };
           let cookingProposal = isCookingVersion(behavior.version)
             ? cookingProposalForVersion(completed.output, accepted.text, session, behavior.version, proposed.plan)
             : { cooking: null, reason: null, calls: [] };
           if (isBridgeVersion(behavior.version) &&
             ((proposed.reason && proposed.calls.length === 1) ||
               (cookingProposal.reason && cookingProposal.calls.length === 1))) {
             const failed = cookingProposal.reason ? cookingProposal : proposed;
             const rejectedCall = failed.calls[0];
             const rejection = failed.reason;
             bridgeRejectedReason = rejection;
             bridgeRejectedCalls = [{ name: rejectedCall.name, arguments: rejectedCall.arguments,
               rejected_reason: rejection }];
             const continuationInput = [...messages, ...(completed.output || []),
               ...(rejectedCall.call_id ? [{ type: 'function_call_output', call_id: rejectedCall.call_id,
                 output: JSON.stringify({ accepted: false, reason: rejection }) }]
                 : [{ role: 'user', content: `The application rejected the proposed operation: ${rejection}.` }])];
             const recovery = await fetch('https://api.openai.com/v1/responses', {
               method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`,
                 'Content-Type': 'application/json' },
               body: JSON.stringify({ model, instructions: prompt +
                 '\n\nAn application proposal was rejected. Correct the same narrow tool arguments once, or give one necessary clarification/useful recovery. Never claim the rejected operation was saved.',
                 input: continuationInput, reasoning: { effort }, tools: toolsFor(behavior.version),
                 tool_choice: 'auto', max_output_tokens: 4096, store: false }),
             });
             if (!recovery.ok) throw new Error(`BRIDGE_RECOVERY_HTTP_${recovery.status}`);
             const repaired = await recovery.json();
             bridgeContinuationCount = 1;
             const earlierUsage = completed.usage || {};
             const laterUsage = repaired.usage || {};
             completed = { ...repaired, usage: {
               input_tokens: (earlierUsage.input_tokens || 0) + (laterUsage.input_tokens || 0),
               output_tokens: (earlierUsage.output_tokens || 0) + (laterUsage.output_tokens || 0),
               input_tokens_details: { cached_tokens: (earlierUsage.input_tokens_details?.cached_tokens || 0) +
                 (laterUsage.input_tokens_details?.cached_tokens || 0) },
               output_tokens_details: { reasoning_tokens: (earlierUsage.output_tokens_details?.reasoning_tokens || 0) +
                 (laterUsage.output_tokens_details?.reasoning_tokens || 0) },
             } };
             proposed = mealProposal(completed.output, session, behavior.version);
             cookingProposal = cookingProposalForVersion(completed.output, accepted.text,
               session, behavior.version, proposed.plan);
             const recoveryText = (completed.output || []).flatMap(item => item.content || [])
               .map(part => part.text || '').join('\n').trim();
             if (recoveryText) {
               text += (text ? '\n\n' : '') + recoveryText;
               sendSse(controller, { type: 'delta', text: (text === recoveryText ? '' : '\n\n') + recoveryText });
             }
             if (!proposed.plan && !cookingProposal.cooking && !recoveryText)
               throw new Error('BRIDGE_RECOVERY_EMPTY');
           }
           if (cookingProposal.cooking && !session.meal_plan_json && !proposed.plan) {
             cookingProposal.cooking = null;
             cookingProposal.reason = 'NO_ACTIVE_PLAN';
           }
           let combinedCooking = null;
           if (proposed.plan && cookingProposal.cooking) {
             if (isPackageVersion(behavior.version)) {
               combinedCooking = cookingProposal.cooking;
               proposed.plan.current_action = combinedCooking.current_action;
               cookingProposal.cooking = null;
             } else {
               proposed.plan = null;
               cookingProposal.cooking = null;
               cookingProposal.reason = 'CONFLICTING_STATE_PROPOSALS';
             }
           }
           let toolOnlyTransition = false;
           if (!text && proposed.plan) {
             text = `Perfect. I got you from here. ${proposed.plan.meal}. Let's make sure you have everything.`;
             toolOnlyTransition = true;
             const elapsed = Math.round(performance.now() - started);
             firstTextMs = elapsed;
             firstUsefulMs = elapsed;
             firstUsefulExcerpt = text.slice(0, 400);
             sendSse(controller, { type: 'delta', text });
           }
           if (!text && cookingProposal.cooking) {
             text = cookingProposal.cooking.current_action;
             toolOnlyTransition = true;
             const elapsed = Math.round(performance.now() - started);
             firstTextMs = elapsed;
             firstUsefulMs = elapsed;
             firstUsefulExcerpt = text.slice(0, 400);
             sendSse(controller, { type: 'delta', text });
           }
           if (!text && cookingProposal.reason && !isBridgeVersion(behavior.version)) {
             const conversationalText = rejectedCookingCallText(cookingProposal.calls);
             if (conversationalText) {
               text = conversationalText;
               const elapsed = Math.round(performance.now() - started);
               firstTextMs = elapsed;
               firstUsefulMs = elapsed;
               firstUsefulExcerpt = text.slice(0, 400);
               sendSse(controller, { type: 'delta', text });
             }
           }
           if (!text) throw new Error('INCOMPLETE_STREAM');
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
           const planJson = proposed.plan ? JSON.stringify(proposed.plan) : null;
           const revisedJson = proposed.plan && isPackageVersion(behavior.version)
             ? revisedCookingState(session, proposed.plan, assistantId, assistantAt, combinedCooking, turnId) : null;
           const toolCalls = [...bridgeRejectedCalls, ...proposed.calls, ...cookingProposal.calls]
             .map(call => ({ name: call.name, arguments: call.arguments,
               ...(call.rejected_reason ? { rejected_reason: call.rejected_reason } : {}) }));
           const cookingJson = cookingProposal.cooking && session.meal_plan_json
             ? nextCookingState(session, cookingProposal.cooking, assistantId, turnId, assistantAt) : null;
           const cookingEventId = crypto.randomUUID();
           const equipmentName = (cookingProposal.cooking ?? combinedCooking)?.equipment_change?.name.toLocaleLowerCase() ?? null;
           const equipmentStatus = (cookingProposal.cooking ?? combinedCooking)?.equipment_change?.status ?? null;
           const write = await env.DB.batch([
            env.DB.prepare(`INSERT INTO turns (id,session_id,revision,role,text,created_at,model_call_id)
              SELECT ?,s.id,?,'assistant',?,?,? FROM sessions s JOIN turn_operations o
              ON o.session_id=s.id AND o.user_turn_id=? WHERE s.id=? AND s.revision=?
              AND o.current_call_id=? AND o.status='pending'
              AND NOT EXISTS (SELECT 1 FROM turns t WHERE t.session_id=s.id AND t.revision=? AND t.role='assistant')`)
              .bind(assistantId, revision, text, assistantAt, callId, turnId, id, revision, callId, revision),
            env.DB.prepare(`UPDATE model_calls SET completed_at=?,
            status=CASE WHEN EXISTS (SELECT 1 FROM turns WHERE model_call_id=?) THEN 'accepted' ELSE 'stale_rejected' END,
            response_model=?,provider_response_id=?,
            first_text_ms=?,first_useful_ms=?,first_useful_excerpt=?,full_ms=?,input_tokens=?,cached_input_tokens=?,output_tokens=?,
             reasoning_tokens=?,estimated_usd=?,retry_count=?,assistant_text=?,tool_calls_json=? WHERE id=?`)
               .bind(assistantAt, callId, completed.model ?? model,
               completed.id ?? null, firstTextMs, firstUsefulMs, firstUsefulExcerpt, fullMs, inputTokens, cached, outputTokens,
               reasoning, cost, retryCount + bridgeContinuationCount, text, JSON.stringify(toolCalls), callId),
            env.DB.prepare(`UPDATE turn_operations SET
              status=CASE WHEN EXISTS (SELECT 1 FROM turns WHERE model_call_id=?) THEN 'accepted' ELSE 'stale_rejected' END,
              updated_at=? WHERE user_turn_id=? AND current_call_id=?`)
              .bind(callId, assistantAt, turnId, callId),
            env.DB.prepare(`INSERT INTO state_events (id,session_id,turn_id,revision,kind,at,details_json)
              SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM turns WHERE model_call_id=?)`)
              .bind(crypto.randomUUID(), id, turnId, revision, 'assistant_turn_accepted', assistantAt,
                JSON.stringify({ model_call_id: callId, assistant_turn_id: assistantId }), callId),
             env.DB.prepare(`INSERT INTO state_events (id,session_id,turn_id,revision,kind,at,details_json)
               SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM turns WHERE model_call_id=?)`)
               .bind(crypto.randomUUID(), id, turnId, revision, 'stale_result_rejected', assistantAt,
                 JSON.stringify({ model_call_id: callId, assistant_turn_id: null }), callId),
             ...(planJson ? [
               env.DB.prepare(`UPDATE sessions SET meal_revision=meal_revision+1,meal_source_turn_id=?,
                 meal_accepted_at=?,meal_plan_json=?,shopping_revision=shopping_revision+1,
                 ${isPackageVersion(behavior.version) ? 'cooking_revision=cooking_revision+1,cooking_progress_json=?,' :
                   isCookingVersion(behavior.version) ? 'cooking_revision=cooking_revision+1,cooking_progress_json=NULL,' : ''}updated_at=?
                 WHERE id=? AND revision=? AND shopping_revision=? AND EXISTS
                 (SELECT 1 FROM turns WHERE id=? AND model_call_id=?)`)
                 .bind(assistantId, assistantAt, planJson,
                   ...(isPackageVersion(behavior.version) ? [revisedJson] : []), assistantAt, id, revision,
                   session.shopping_revision, assistantId, callId),
               env.DB.prepare(`INSERT INTO state_events (id,session_id,turn_id,revision,kind,at,details_json)
                 SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM sessions
                 WHERE id=? AND meal_source_turn_id=? AND meal_revision=? AND shopping_revision=?)`)
                 .bind(crypto.randomUUID(), id, assistantId, revision, 'meal_plan_accepted', assistantAt,
                   JSON.stringify({ model_call_id: callId, assistant_turn_id: assistantId,
                     item_count: proposed.plan.sections.reduce((n, section) => n + section.items.length, 0) }),
                   id, assistantId, session.meal_revision + 1, session.shopping_revision + 1),
             ] : []),
             ...(planJson && combinedCooking ? [
               env.DB.prepare(`INSERT INTO state_events (id,session_id,turn_id,revision,kind,at,details_json)
                 SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM sessions
                   WHERE id=? AND meal_source_turn_id=? AND meal_revision=?)`)
                 .bind(crypto.randomUUID(), id, turnId, revision, 'cooking_progress_accepted', assistantAt,
                   JSON.stringify({ model_call_id: callId, assistant_turn_id: assistantId,
                     customer_reported: Boolean(combinedCooking.customer_report),
                     equipment_change: equipmentName ? { name: equipmentName, status: equipmentStatus } : null,
                     combined_with_meal_package: true }), id, assistantId, session.meal_revision + 1),
               ...(equipmentName && session.customer_id ? [env.DB.prepare(`INSERT INTO customer_equipment
                 (customer_id,name,status,source_session_id,source_turn_id,created_at,expires_at)
                 SELECT ?,?,?,?,?,?,s.expires_at FROM sessions s WHERE s.id=? AND EXISTS
                 (SELECT 1 FROM sessions WHERE id=? AND meal_source_turn_id=? AND meal_revision=?)
                 ON CONFLICT(customer_id,name) DO UPDATE SET status=excluded.status,
                 source_session_id=excluded.source_session_id,source_turn_id=excluded.source_turn_id,
                 created_at=excluded.created_at,expires_at=excluded.expires_at`)
                 .bind(session.customer_id, equipmentName, equipmentStatus, id, turnId, assistantAt,
                   id, id, assistantId, session.meal_revision + 1)] : []),
             ] : []),
             ...(cookingJson ? [
               env.DB.prepare(`UPDATE sessions SET cooking_revision=cooking_revision+1,
                 cooking_progress_json=?,updated_at=? WHERE id=? AND revision=? AND meal_revision=?
                 AND cooking_revision=? AND shopping_revision=? AND meal_plan_json IS NOT NULL AND EXISTS
                 (SELECT 1 FROM turns WHERE id=? AND model_call_id=?)`)
                 .bind(cookingJson, assistantAt, id, revision, session.meal_revision,
                   session.cooking_revision ?? 0, session.shopping_revision, assistantId, callId),
               env.DB.prepare(`INSERT INTO state_events (id,session_id,turn_id,revision,kind,at,details_json)
                 SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM sessions WHERE id=? AND revision=?
                   AND cooking_revision=? AND json_extract(cooking_progress_json,'$.current_action_turn_id')=?)`)
                 .bind(cookingEventId, id, turnId, revision, 'cooking_progress_accepted', assistantAt,
                   JSON.stringify({ model_call_id: callId, assistant_turn_id: assistantId,
                     customer_reported: Boolean(cookingProposal.cooking.customer_report),
                     equipment_change: equipmentName ? { name: equipmentName, status: equipmentStatus } : null,
                     ignored_fields: cookingProposal.cooking.ignored_fields,
                     cooking_revision: (session.cooking_revision ?? 0) + 1 }),
                   id, revision, (session.cooking_revision ?? 0) + 1, assistantId),
               ...(equipmentName && session.customer_id ? [env.DB.prepare(`INSERT INTO customer_equipment
                 (customer_id,name,status,source_session_id,source_turn_id,created_at,expires_at)
                 SELECT ?,?,?,?,?,?,s.expires_at FROM sessions s WHERE s.id=? AND EXISTS
                 (SELECT 1 FROM state_events WHERE id=? AND kind='cooking_progress_accepted')
                 ON CONFLICT(customer_id,name) DO UPDATE SET status=excluded.status,
                 source_session_id=excluded.source_session_id,source_turn_id=excluded.source_turn_id,
                 created_at=excluded.created_at,expires_at=excluded.expires_at`)
                 .bind(session.customer_id, equipmentName, equipmentStatus, id, turnId, assistantAt, id, cookingEventId)] : []),
             ] : []),
             ...(proposed.reason ? [env.DB.prepare(`INSERT INTO state_events
               (id,session_id,turn_id,revision,kind,at,details_json)
               VALUES (?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), id, turnId, revision,
                 'meal_plan_proposal_rejected', assistantAt,
                 JSON.stringify({ model_call_id: callId, reason: proposed.reason }))] : []),
             ...(cookingProposal.reason ? [env.DB.prepare(`INSERT INTO state_events
               (id,session_id,turn_id,revision,kind,at,details_json) VALUES (?,?,?,?,?,?,?)`)
               .bind(crypto.randomUUID(), id, turnId, revision, 'cooking_proposal_rejected', assistantAt,
                 JSON.stringify({ model_call_id: callId, reason: cookingProposal.reason }))] : []),
             ...(bridgeRejectedReason ? [env.DB.prepare(`INSERT INTO state_events
               (id,session_id,turn_id,revision,kind,at,details_json) VALUES (?,?,?,?,?,?,?)`)
               .bind(crypto.randomUUID(), id, turnId, revision,
                 bridgeRejectedCalls[0].name === 'publish_meal_plan'
                   ? 'meal_plan_proposal_rejected' : 'cooking_proposal_rejected', assistantAt,
                 JSON.stringify({ model_call_id: callId, reason: bridgeRejectedReason,
                   continued_with_same_model: true }))] : []),
             ...(toolOnlyTransition ? [env.DB.prepare(`INSERT INTO state_events
               (id,session_id,turn_id,revision,kind,at,details_json)
               VALUES (?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), id, turnId, revision,
                 'tool_only_transition_rendered', assistantAt, JSON.stringify({ model_call_id: callId }))] : []),
           ]);
          const wasAccepted = write[0].meta.changes === 1;
          const proposalStale = wasAccepted && Boolean(planJson || cookingJson) && write[5].meta.changes !== 1;
          if (proposalStale) await event(env.DB, id, turnId, revision,
            planJson ? 'meal_plan_proposal_stale' : 'cooking_proposal_stale',
            { model_call_id: callId, reason: 'ACCEPTED_STATE_CHANGED' });
          sendSse(controller, { type: wasAccepted ? 'complete' : 'stale', turnId, revision,
            firstTextMs, firstUsefulMs, fullMs, proposalStale });
        } catch (error) {
          const code = error instanceof Error && /^[A-Z_0-9]+$/.test(error.message)
            ? error.message : 'MODEL_ERROR';
          await env.DB.batch([
            env.DB.prepare(`UPDATE model_calls SET completed_at=?,status='error',first_text_ms=?,
            first_useful_ms=?,first_useful_excerpt=?,full_ms=?,retry_count=?,error_code=?,assistant_text=? WHERE id=?`)
              .bind(now(), firstTextMs, firstUsefulMs, firstUsefulExcerpt, Math.round(performance.now() - started), retryCount, code, text, callId),
            env.DB.prepare("UPDATE turn_operations SET status='error',updated_at=? WHERE user_turn_id=? AND current_call_id=?")
              .bind(now(), turnId, callId),
            env.DB.prepare('INSERT INTO state_events (id,session_id,turn_id,revision,kind,at,details_json) VALUES (?,?,?,?,?,?,?)')
              .bind(crypto.randomUUID(), id, turnId, revision, 'model_call_failed', now(),
                JSON.stringify({ model_call_id: callId, code })),
          ]);
          sendSse(controller, { type: 'error', code });
        } finally {
          try { controller.close(); } catch { /* Disconnected browser. */ }
        }
      })();
      ctx.waitUntil(task);
    },
    cancel() { /* The accepted request continues; reconnecting clients read its recorded result. */ },
  });
  return new Response(stream, { headers: { ...BASE_HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8',
    'Connection': 'keep-alive' } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ status: 'ok', stage: isStage1b(env)
      ? env.RELEASE_ENV === 'production' ? '1B-production' : '1B-staging' : '1A-live-lab', model: env.MODEL || 'gpt-6-astra',
      behavior_version: env.BEHAVIOR_VERSION || BEHAVIOR_VERSION,
      context_version: isStage1b(env) ? 'stage1b-context-v1' : CONTEXT_VERSION, scenario_version: SCENARIO_VERSION });
    if (!env.DB || !env.LAB_ACCESS_CODE || !env.COOKIE_SIGNING_KEY) return json({ error: 'LAB_NOT_CONFIGURED' }, 503);
    if (request.method !== 'GET' && !sameOrigin(request)) return json({ error: 'ORIGIN_REQUIRED' }, 403);
    if (url.pathname === '/' && request.method === 'GET') return html('chat', env);
    if (url.pathname === '/api/review/login' && request.method === 'POST') {
      const input = await bodyJson(request);
      if (!equal(String(input.code ?? ''), env.LAB_ACCESS_CODE)) return json({ error: 'UNAUTHORIZED' }, 401);
      return json({ ok: true }, 200, { 'Set-Cookie': `${REVIEW_COOKIE}=${await makeReviewCookie(env.COOKIE_SIGNING_KEY)}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict` });
    }
    if (url.pathname === '/review' && request.method === 'GET')
      return html(await authorizedReview(request, env.COOKIE_SIGNING_KEY) ? 'review' : 'login', env);
    if (url.pathname === '/api/review/logout' && request.method === 'POST')
      return json({ ok: true }, 200, { 'Set-Cookie': `${REVIEW_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict` });
    if (url.pathname.startsWith('/api/review/')) {
      if (!await authorizedReview(request, env.COOKIE_SIGNING_KEY)) return json({ error: 'UNAUTHORIZED' }, 401);
      if (url.pathname === '/api/review/sessions' && request.method === 'GET') return listSessions(env);
      const review = url.pathname.match(/^\/api\/review\/sessions\/([0-9a-f-]{36})$/i);
      if (review && request.method === 'GET') return reviewSession(env, review[1]);
      return json({ error: 'NOT_FOUND' }, 404);
    }
    if (isStage1b(env)) {
      if (url.pathname === '/api/pair/start' && request.method === 'POST') return startPair(request, env);
      if (url.pathname === '/api/pair/claim' && request.method === 'POST') return claimPair(request, env);
      if (url.pathname === '/api/customer/sessions' && request.method === 'GET') return customerSessions(request, env);
      if (url.pathname === '/sw.js' && request.method === 'GET')
        return new Response(serviceWorker, { headers: { ...BASE_HEADERS,
          'Content-Type': 'text/javascript; charset=utf-8', 'Service-Worker-Allowed': '/' } });
      if (url.pathname === '/api/push/config' && request.method === 'GET')
        return env.VAPID_PUBLIC_KEY ? json({ publicKey: env.VAPID_PUBLIC_KEY }) : json({ error: 'PUSH_UNAVAILABLE' }, 503);
      if (url.pathname === '/api/push/subscribe' && request.method === 'POST') return subscribePush(request, env);
      if (url.pathname === '/api/push/pending' && request.method === 'GET') return pendingPush(request, env);
      if (url.pathname === '/api/push/ack' && request.method === 'POST') return ackPush(request, env);
    }
    if (url.pathname === '/api/sessions' && request.method === 'POST') return createSession(request, env);
    const session = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})$/i);
    if (session && request.method === 'GET')
      return await canUseSession(request, env, session[1]) ? showSession(env, session[1]) : json({ error: 'NOT_FOUND' }, 404);
    const images = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/images$/i);
    if (isStage1b(env) && images && request.method === 'POST')
      return await canUseSession(request, env, images[1]) ? uploadImage(request, env, images[1]) : json({ error: 'NOT_FOUND' }, 404);
    const image = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/images\/([0-9a-f-]{36})$/i);
    if (isStage1b(env) && image && request.method === 'GET')
      return await canUseSession(request, env, image[1]) || await authorizedReview(request, env.COOKIE_SIGNING_KEY)
        ? showImage(env, image[1], image[2]) : json({ error: 'NOT_FOUND' }, 404);
    const voiceStart = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/voice\/start$/i);
    if (isStage1b(env) && voiceStart && request.method === 'POST')
      return await canUseSession(request, env, voiceStart[1]) ? startVoice(request, env, voiceStart[1]) : json({ error: 'NOT_FOUND' }, 404);
    const voiceEvents = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/voice\/events$/i);
    if (isStage1b(env) && voiceEvents && request.method === 'POST')
      return await canUseSession(request, env, voiceEvents[1]) ? voiceEvent(request, env, voiceEvents[1]) : json({ error: 'NOT_FOUND' }, 404);
    const voiceStop = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/voice\/stop$/i);
    if (isStage1b(env) && voiceStop && request.method === 'POST')
      return await canUseSession(request, env, voiceStop[1]) ? stopVoice(request, env, voiceStop[1]) : json({ error: 'NOT_FOUND' }, 404);
    const reminder = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/return$/i);
    if (isStage1b(env) && reminder && request.method === 'POST')
      return await canUseSession(request, env, reminder[1]) ? scheduleReturn(request, env, reminder[1]) : json({ error: 'NOT_FOUND' }, 404);
    const turn = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/turns$/i);
    if (turn && request.method === 'POST')
      return await canUseSession(request, env, turn[1]) ? streamTurn(request, env, ctx, turn[1]) : json({ error: 'NOT_FOUND' }, 404);
    const turnStatus = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/turns\/([0-9a-f-]{36})$/i);
    if (turnStatus && request.method === 'GET')
      return await canUseSession(request, env, turnStatus[1])
        ? json(await turnResult(env, turnStatus[1], turnStatus[2])) : json({ error: 'NOT_FOUND' }, 404);
    const meal = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/meal$/i);
    if (isStage1b(env) && meal && request.method === 'POST')
      return await canUseSession(request, env, meal[1]) ? acceptMeal(request, env, meal[1]) : json({ error: 'NOT_FOUND' }, 404);
    const shopping = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/shopping\/([0-9a-f-]{36})$/i);
    if (isStage1b(env) && shopping && request.method === 'PATCH')
      return await canUseSession(request, env, shopping[1])
        ? setShoppingItem(request, env, shopping[1], shopping[2]) : json({ error: 'NOT_FOUND' }, 404);
    const metrics = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/metrics$/i);
    if (isStage1b(env) && metrics && request.method === 'POST')
      return await canUseSession(request, env, metrics[1])
        ? recordClientRenderMetric(request, env, metrics[1]) : json({ error: 'NOT_FOUND' }, 404);
    const feedback = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/turns\/([0-9a-f-]{36})\/feedback$/i);
    if (feedback && request.method === 'POST')
      return await canUseSession(request, env, feedback[1])
        ? recordFeedback(request, env, feedback[1], feedback[2]) : json({ error: 'NOT_FOUND' }, 404);
    return json({ error: 'NOT_FOUND' }, 404);
  },
  async scheduled(_event, env) {
    if (isStage1b(env)) await dispatchReturns(env);
    const at = now();
    if (isStage1b(env) && env.IMAGES) {
      const expired = await env.DB.prepare('SELECT id,session_id FROM images WHERE expires_at<=?')
        .bind(at).all();
      for (const image of expired.results ?? []) await env.IMAGES.delete(`${image.session_id}/${image.id}`);
    }
    const stage1bExpiry = isStage1b(env) ? [
      env.DB.prepare('DELETE FROM client_render_metrics WHERE session_id IN (SELECT id FROM sessions WHERE expires_at<=?)').bind(at),
      env.DB.prepare('DELETE FROM voice_assistant_items WHERE voice_session_id IN (SELECT id FROM voice_sessions WHERE session_id IN (SELECT id FROM sessions WHERE expires_at<=?))').bind(at),
      env.DB.prepare('DELETE FROM voice_user_items WHERE voice_session_id IN (SELECT id FROM voice_sessions WHERE session_id IN (SELECT id FROM sessions WHERE expires_at<=?))').bind(at),
      env.DB.prepare('DELETE FROM voice_sessions WHERE session_id IN (SELECT id FROM sessions WHERE expires_at<=?)').bind(at),
      env.DB.prepare('DELETE FROM return_reminders WHERE session_id IN (SELECT id FROM sessions WHERE expires_at<=?)').bind(at),
      env.DB.prepare('DELETE FROM push_subscriptions WHERE expires_at<=?').bind(at),
      ...(isCookingVersion(env.BEHAVIOR_VERSION)
        ? [env.DB.prepare('DELETE FROM customer_equipment WHERE expires_at<=?').bind(at)] : []),
    ] : [];
    await env.DB.batch([
      ...stage1bExpiry,
      env.DB.prepare('DELETE FROM model_calls WHERE session_id IN (SELECT id FROM sessions WHERE expires_at<=?)').bind(at),
      env.DB.prepare('DELETE FROM turns WHERE session_id IN (SELECT id FROM sessions WHERE expires_at<=?)').bind(at),
      env.DB.prepare('DELETE FROM state_events WHERE session_id IN (SELECT id FROM sessions WHERE expires_at<=?)').bind(at),
      env.DB.prepare('DELETE FROM turn_operations WHERE session_id IN (SELECT id FROM sessions WHERE expires_at<=?)').bind(at),
      env.DB.prepare('DELETE FROM pairing_links WHERE expires_at<=? OR session_id IN (SELECT id FROM sessions WHERE expires_at<=?)').bind(at, at),
      env.DB.prepare('DELETE FROM images WHERE expires_at<=?').bind(at),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(at),
      env.DB.prepare('DELETE FROM customers WHERE expires_at<=?').bind(at),
    ]);
  },
};
