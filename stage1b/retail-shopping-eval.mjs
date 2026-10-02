// Synthetic, versioned Shopping comparison. Full responses stay in ignored runs/.
import fs from 'node:fs';
import { instructionsFor, instructionsForCookingVoice, instructionsForRetailShopping,
  estimateUsd } from '../src/config.ts';
import { MEAL_PACKAGE_TOOL, RETAIL_MEAL_PACKAGE_TOOL, normalizeMealPlan } from '../live-lab/meal-plan.mjs';

if (!process.env.OPENAI_API_KEY) throw Error('OPENAI_API_KEY is not configured');
const model = process.env.MODEL || 'gpt-6-astra';
const effort = process.env.REASONING_EFFORT || 'medium';
const cases = [
  { id: 'dinner-two', kind: 'package', context: 'Two adults. Skillet and rice cooker. No allergies.',
    turns: [{ role: 'user', content: 'Boneless chicken thighs for dinner.' },
      { role: 'assistant', content: 'Sticky soy-ginger chicken bowls with jasmine rice, broccoli and sesame cucumber are one good direction.' },
      { role: 'user', content: 'That bowl with all those parts for two. Let’s make it.' }] },
  { id: 'family-five', kind: 'package', context: 'Five diners, one is a child. Oven and skillet. No allergies.',
    turns: [{ role: 'user', content: 'Salmon for family dinner.' },
      { role: 'assistant', content: 'Salmon tacos with cabbage slaw, avocado-lime crema and black beans could work.' },
      { role: 'user', content: 'Yes, salmon tacos and those sides for all five of us.' }] },
  { id: 'breakfast-twenty', kind: 'package', context: 'Business breakfast for 20 adults. No allergies. Oven and two stovetop burners.',
    turns: [{ role: 'user', content: 'I need a business breakfast for twenty people.' },
      { role: 'assistant', content: 'A Greek yogurt parfait bar with berries and granola, soft scrambled eggs, roasted potatoes and citrus fruit will cover sweet and savory.' },
      { role: 'user', content: 'That complete breakfast works. Plan for 20. Use about 10 cups of Greek yogurt across the parfait bar and a small yogurt topping bowl.' }] },
  { id: 'party-twenty-four', kind: 'package', context: 'Party for 24 adults. Grill, oven and large skillet. No allergies or restrictions.',
    turns: [{ role: 'user', content: 'A taco party for 24.' },
      { role: 'assistant', content: 'Grilled chicken tacos with smoky black beans, slaw, avocado, lime crema, salsa and tortillas will make a complete spread.' },
      { role: 'user', content: 'Yes, that complete taco spread for 24. Make the consolidated list and plan.' }] },
  { id: 'shared-yogurt-held-out', kind: 'package', context: 'Twenty brunch guests. Oven, griddle and large mixing bowls. No allergies.',
    turns: [{ role: 'user', content: 'I want a Mediterranean brunch for twenty.' },
      { role: 'assistant', content: 'We could do shakshuka, warm flatbread, a cucumber-herb salad, a yogurt fruit bowl, and a savory yogurt sauce for the eggs.' },
      { role: 'user', content: 'That whole spread. The fruit bowl uses 7 cups Greek yogurt and the savory sauce uses 3 cups. Plan it for 20.' }] },
  { id: 'discovery-control', kind: 'discovery', context: '', turns: ['I have boneless chicken thighs tonight.'] },
  { id: 'recovery-control', kind: 'direct', context: '', turns: ['My pan sauce split. What should I do right now?'] },
];
const arms = [
  { id: 'foundation-a', instructions: c => instructionsFor('A', c), tools: [] },
  { id: 'cooking-voice-v3', instructions: c => instructionsForCookingVoice(c), tools: [MEAL_PACKAGE_TOOL] },
  { id: 'retail-shopping-v4', instructions: c => instructionsForRetailShopping(c), tools: [RETAIL_MEAL_PACKAGE_TOOL], retail: true },
];
const chosenCases = new Set((process.env.RETAIL_EVAL_CASES || cases.map(c => c.id).join(',')).split(','));
const chosenArms = new Set((process.env.RETAIL_EVAL_ARMS || 'cooking-voice-v3,retail-shopping-v4,foundation-a').split(','));
const results = [];

async function probe(c, arm) {
  const started = performance.now();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(120_000),
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, reasoning: { effort }, instructions: arm.instructions(c.context),
      input: typeof c.turns[0] === 'string' ? c.turns[0] : c.turns,
      ...(arm.tools.length ? { tools: arm.tools, tool_choice: 'auto' } : {}),
      max_output_tokens: 4096, store: false, stream: true }),
  });
  if (!response.ok || !response.body) throw Error(`HTTP_${response.status}`);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', text = '', firstTextMs = null, completed = null, incomplete = null;
  function frame(raw) {
    const data = raw.split('\n').find(line => line.startsWith('data: '))?.slice(6);
    if (!data || data === '[DONE]') return;
    const event = JSON.parse(data);
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
      text += event.delta;
      if (firstTextMs === null && /\S/.test(event.delta)) firstTextMs = Math.round(performance.now() - started);
    }
    if (event.type === 'response.completed') completed = event.response;
    if (event.type === 'response.incomplete') incomplete = event.response;
    if (event.type === 'error' || event.type === 'response.failed') throw Error('PROVIDER_STREAM_FAILED');
  }
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    buffer += decoder.decode(next.value, { stream: true }).replace(/\r\n/g, '\n');
    let index;
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      frame(buffer.slice(0, index)); buffer = buffer.slice(index + 2);
    }
  }
  if (buffer.trim()) frame(buffer);
  const result = completed || incomplete;
  if (!result) throw Error('INCOMPLETE_STREAM');
  const calls = (result.output || []).filter(x => x.type === 'function_call');
  const plan = calls.length === 1 && calls[0].name === 'publish_meal_plan'
    ? normalizeMealPlan(calls[0].arguments, { requireFullPlan: true, requireRetail: Boolean(arm.retail) }) : null;
  const items = plan?.sections.flatMap(s => s.items) ?? [];
  const usage = result.usage || {};
  return { case: c.id, kind: c.kind, arm: arm.id, text, firstTextMs,
    completeMs: Math.round(performance.now() - started), status: result.status,
    incompleteReason: result.incomplete_details?.reason || null,
    outputTypes: result.output?.map(x => x.type), calls, plan, validPackage: Boolean(plan),
    shoppingCount: items.length, duplicateNames: items.length - new Set(items.map(i => i.name.toLowerCase())).size,
    underbuyCount: items.filter(i => i.retail_total && i.retail_total.amount < i.normalized_quantity.amount).length,
    planCharacters: plan?.full_plan.reduce((n, s) => n + s.directions.length, 0) || 0,
    usage, estimatedUsd: estimateUsd(result.model || model, usage.input_tokens,
      usage.input_tokens_details?.cached_tokens || 0, usage.output_tokens) };
}

for (const c of cases.filter(c => chosenCases.has(c.id))) for (const arm of arms.filter(a => chosenArms.has(a.id))) {
  if (arm.id === 'foundation-a' && c.kind === 'package') continue;
  try {
    const row = await probe(c, arm); results.push(row);
    process.stdout.write(JSON.stringify({ case: row.case, arm: row.arm, status: row.status,
      validPackage: row.validPackage, shopping: row.shoppingCount, duplicates: row.duplicateNames,
      underbuy: row.underbuyCount, planCharacters: row.planCharacters,
      firstTextMs: row.firstTextMs, completeMs: row.completeMs,
      outputTokens: row.usage.output_tokens, estimatedUsd: row.estimatedUsd }) + '\n');
  } catch (error) {
    results.push({ case: c.id, arm: arm.id, error: error.message });
    process.stdout.write(JSON.stringify({ case: c.id, arm: arm.id, error: error.message }) + '\n');
  }
}
fs.mkdirSync('runs', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = `runs/retail-shopping-${stamp}.private.json`;
fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), model, effort,
  versions: { baseline: 'stage1b-meal-package-v3', candidate: 'stage1b-meal-package-v4' }, cases, results }, null, 2));
process.stdout.write(JSON.stringify({ privateResultFile: file, cases: new Set(results.map(r => r.case)).size,
  calls: results.length }) + '\n');
