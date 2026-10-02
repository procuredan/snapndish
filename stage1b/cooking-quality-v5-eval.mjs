// Synthetic, matched complete-plan comparison. Outputs and blind key stay in ignored runs/.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { instructionsFor, instructionsForRetailShopping, instructionsForCookingQuality,
  estimateUsd } from '../src/config.ts';
import { RETAIL_MEAL_PACKAGE_TOOL, COOKING_QUALITY_MEAL_PACKAGE_TOOL,
  normalizeMealPlan } from '../live-lab/meal-plan.mjs';

const model = process.env.MODEL || 'gpt-6-astra';
const effort = process.env.REASONING_EFFORT || 'medium';
const outputLimit = 4096;
const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const cases = [
  { id: 'stir-fry-selected-equipment', heldOut: false, kind: 'package',
    facts: 'Two adults. They explicitly chose their wok and rice cooker. No allergies. The accepted meal is boneless chicken-thigh stir-fry with broccoli, bell pepper, a savory ginger sauce and jasmine rice. Use 12 oz chicken thighs. No other sauce ingredients have been specified.',
    turns: [
      { role: 'user', content: 'Boneless chicken thighs tonight.' },
      { role: 'assistant', content: 'Chicken-thigh stir-fry with broccoli, peppers, ginger sauce and jasmine rice is one good direction.' },
      { role: 'user', content: 'That full stir-fry meal for the two of us. Use my wok and rice cooker.' },
    ] },
  { id: 'simple-chickpea-pasta', heldOut: true, kind: 'package',
    facts: 'Two adults. Vegetarian. Pot and skillet available. The accepted meal is lemon-garlic chickpea pasta with spinach and a simple green salad. Weeknight time is about 30 minutes. No allergies.',
    turns: [{ role: 'user', content: 'Lemon-garlic chickpea pasta, spinach, and a green salad for two tonight. Please make the complete meal.' }] },
  { id: 'grilled-salmon-complete', heldOut: true, kind: 'package',
    facts: 'Four adults. Outdoor grill explicitly selected; oven available for potatoes. No allergies. The accepted meal is grilled salmon with crisp potatoes, shaved fennel salad and lemon-dill yogurt sauce.',
    turns: [{ role: 'user', content: 'Let us do the grilled salmon with crispy potatoes, shaved fennel salad, and lemon-dill yogurt sauce for four.' }] },
  { id: 'shrimp-from-frozen', heldOut: false, kind: 'package',
    facts: 'Two adults. Raw frozen Argentine red shrimp, pot and skillet. No wine. No allergies. The accepted meal is lemony shrimp linguine and tomato-arugula salad.',
    turns: [{ role: 'user', content: 'The lemony Argentine shrimp linguine with tomato-arugula salad for two. The shrimp are still frozen.' }] },
  { id: 'business-breakfast-twenty', heldOut: false, kind: 'package',
    facts: 'Business breakfast for 20 adults. Oven and two burners. No allergies. Accepted spread: Greek yogurt parfait bar using 10 cups Greek yogurt, berries and granola; soft scrambled eggs; roasted potatoes; citrus fruit.',
    turns: [{ role: 'user', content: 'Yes, that whole breakfast spread for twenty. Keep the yogurt total at ten cups.' }] },
  { id: 'party-taco-twenty-four', heldOut: true, kind: 'package',
    facts: 'Taco party for 24 adults. Grill, oven, large skillet. No allergies or restrictions. Accepted meal: grilled chicken tacos with smoky black beans, slaw, avocado, lime crema, salsa and tortillas.',
    turns: [{ role: 'user', content: 'The complete grilled chicken taco spread and sides for twenty-four. I have the grill and oven.' }] },
  { id: 'owned-wok-selected-skillet', heldOut: true, kind: 'package',
    facts: 'Four adults. The customer owns a wok and a rice cooker, but explicitly chose a skillet tonight. No allergies. Accepted meal: coconut chicken curry with green beans, jasmine rice and cucumber salad.',
    turns: [{ role: 'user', content: 'That coconut chicken curry, jasmine rice and cucumber salad for four. I am using my skillet tonight.' }] },
  { id: 'serious-peanut-allergy', heldOut: true, kind: 'package',
    facts: 'Three adults. One has a serious peanut allergy and must avoid peanut ingredients and cross-contact. Customer can verify packaged ingredient labels. Oven and stove. Accepted meal: roast chicken thighs, lemon potatoes and green beans with a herb sauce.',
    turns: [{ role: 'user', content: 'Let us do the roast chicken, lemon potatoes, green beans and herb sauce for three. One guest has a serious peanut allergy.' }] },
  { id: 'meal-revision-dairy', heldOut: true, kind: 'package',
    facts: 'Four adults. The previously accepted meal was grilled fish tacos with cabbage slaw, lime crema, black beans, avocado and tortillas. New fact: one guest cannot have dairy. Revise the complete meal and Shopping consistently without losing its defining components.',
    turns: [
      { role: 'user', content: 'Grilled fish tacos with slaw, lime crema, beans and avocado for four.' },
      { role: 'assistant', content: 'The full fish taco package is ready, with the lime crema and sides.' },
      { role: 'user', content: 'One guest cannot have dairy. Keep the meal, but make the necessary changes.' },
    ] },
  { id: 'discovery-control', heldOut: false, kind: 'control', facts: 'No saved customer facts.',
    turns: [{ role: 'user', content: 'I have boneless chicken thighs tonight.' }] },
  { id: 'rejection-control', heldOut: false, kind: 'control', facts: 'No saved customer facts.',
    turns: [{ role: 'user', content: 'I have chicken thighs.' },
      { role: 'assistant', content: 'Greek pitas, sticky chicken rice bowls, or smoky chicken tacos?' },
      { role: 'user', content: 'None of those. Something completely different.' }] },
  { id: 'direct-question-control', heldOut: false, kind: 'control', facts: 'No saved customer facts.',
    turns: [{ role: 'user', content: 'My pan sauce split. How do I save it right now?' }] },
  { id: 'recovery-control', heldOut: true, kind: 'control', facts: 'No saved customer facts.',
    turns: [{ role: 'user', content: 'I am making lemony chicken pasta.' },
      { role: 'assistant', content: 'Start the sauce while the pasta water heats.' },
      { role: 'user', content: "I just realized I don't have lemon. What should I do?" }] },
];
const arms = [
  { id: 'foundation', instructions: c => instructionsFor('A', c.facts), tool: null,
    input: c => [{ role: 'user', content: `Established customer and meal facts for this conversation: ${c.facts} When the person commits to the meal, provide its complete cooking plan in natural named sections, with quantities, important safety guidance and final assembly. Do not discuss Shopping.` }, ...c.turns] },
  { id: 'v4', instructions: c => instructionsForRetailShopping(c.facts), tool: RETAIL_MEAL_PACKAGE_TOOL,
    input: c => c.turns },
  { id: 'v5', instructions: c => instructionsForCookingQuality(c.facts), tool: COOKING_QUALITY_MEAL_PACKAGE_TOOL,
    input: c => c.turns },
];
const chosenCases = new Set((process.env.COOKING_V5_CASES || cases.map(c => c.id).join(',')).split(','));
const chosenArms = new Set((process.env.COOKING_V5_ARMS || arms.map(a => a.id).join(',')).split(','));
const runsPerCase = Math.max(1, Math.min(3, Number(process.env.COOKING_V5_REPEATS || 1)));
const selectedCases = cases.filter(c => chosenCases.has(c.id));
if (!process.env.OPENAI_API_KEY) throw Error('OPENAI_API_KEY is not configured');

async function probe(c, arm, repeat) {
  const started = performance.now();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(180_000),
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, reasoning: { effort }, instructions: arm.instructions(c), input: arm.input(c),
      ...(arm.tool ? { tools: [arm.tool], tool_choice: 'auto' } : {}),
      max_output_tokens: outputLimit, store: false, stream: true }),
  });
  if (!response.ok || !response.body) throw Error(`HTTP_${response.status}`);
  let buffer = '', text = '', firstTextProxyMs = null, completed = null, incomplete = null;
  const decoder = new TextDecoder();
  function frame(raw) {
    const line = raw.split('\n').find(x => x.startsWith('data: '));
    if (!line || line.slice(6) === '[DONE]') return;
    const event = JSON.parse(line.slice(6));
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
      text += event.delta;
      if (firstTextProxyMs === null && /\S/.test(event.delta))
        firstTextProxyMs = Math.round(performance.now() - started);
    } else if (event.type === 'response.completed') completed = event.response;
    else if (event.type === 'response.incomplete') incomplete = event.response;
    else if (event.type === 'error' || event.type === 'response.failed') throw Error('PROVIDER_STREAM_FAILED');
  }
  const reader = response.body.getReader();
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    buffer += decoder.decode(next.value, { stream: true }).replace(/\r\n/g, '\n');
    let i;
    while ((i = buffer.indexOf('\n\n')) >= 0) { frame(buffer.slice(0, i)); buffer = buffer.slice(i + 2); }
  }
  if (buffer.trim()) frame(buffer);
  const result = completed || incomplete;
  if (!result) throw Error('INCOMPLETE_STREAM');
  const calls = (result.output || []).filter(x => x.type === 'function_call');
  const plan = arm.tool && calls.length === 1 && calls[0].name === 'publish_meal_plan'
    ? normalizeMealPlan(calls[0].arguments, { requireFullPlan: true, requireRetail: true }) : null;
  const usage = result.usage || {};
  return { case: c.id, repeat, arm: arm.id, status: result.status,
    incompleteReason: result.incomplete_details?.reason || null,
    firstTextProxyMs, completeMs: Math.round(performance.now() - started),
    text, fullPlan: plan?.full_plan || null, validPackage: Boolean(plan), plan,
    outputTypes: result.output?.map(x => x.type), usage,
    estimatedUsd: estimateUsd(result.model || model, usage.input_tokens || 0,
      usage.input_tokens_details?.cached_tokens || 0, usage.output_tokens || 0) };
}

function displayPlan(row) {
  if (row.arm === 'foundation') return row.text.trim();
  return row.fullPlan?.map(s => `${s.title}\n${s.directions}`).join('\n\n') ||
    `[No accepted complete plan: ${row.status || 'error'}]`;
}

const results = [];
for (const c of selectedCases) {
  const repeats = c.kind === 'package' && ['stir-fry-selected-equipment', 'grilled-salmon-complete',
    'business-breakfast-twenty'].includes(c.id) ? Math.max(2, runsPerCase) : runsPerCase;
  for (let repeat = 1; repeat <= repeats; repeat++) {
    for (const arm of arms.filter(a => chosenArms.has(a.id) && (c.kind === 'package' || a.id !== 'foundation'))) {
      try {
        const row = await probe(c, arm, repeat);
        results.push(row);
        process.stdout.write(JSON.stringify({ case: c.id, repeat, arm: arm.id, status: row.status,
          incompleteReason: row.incompleteReason, validPackage: row.validPackage,
          firstTextProxyMs: row.firstTextProxyMs, completeMs: row.completeMs,
          outputTokens: row.usage.output_tokens, estimatedUsd: row.estimatedUsd }) + '\n');
      } catch (error) {
        results.push({ case: c.id, repeat, arm: arm.id, error: error.message });
        process.stdout.write(JSON.stringify({ case: c.id, repeat, arm: arm.id, error: error.message }) + '\n');
      }
    }
  }
}

fs.mkdirSync('runs', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const prefix = `runs/cooking-quality-v5-${stamp}`;
fs.writeFileSync(`${prefix}.private.json`, JSON.stringify({ at: new Date().toISOString(), source,
  model, effort, outputLimit, cases: selectedCases, results }, null, 2), { mode: 0o600 });
const reviewCases = ['stir-fry-selected-equipment', 'simple-chickpea-pasta', 'business-breakfast-twenty'];
const blind = [];
const key = [];
for (const id of reviewCases) {
  const c = selectedCases.find(x => x.id === id);
  const rows = results.filter(r => r.case === id && r.repeat === 1);
  if (!c || rows.length !== 3) continue;
  const shuffled = [...rows];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  blind.push(`## ${id}\n\nCustomer facts: ${c.facts}\n\nLatest request: ${c.turns.at(-1).content}\n`);
  shuffled.forEach((row, index) => {
    blind.push(`### Option ${index + 1}\n\n\`\`\`text\n${displayPlan(row)}\n\`\`\`\n`);
    key.push({ case: id, option: index + 1, arm: row.arm });
  });
  blind.push('Best: 1 / 2 / 3 / None\n\nAcceptable: 1 / 2 / 3 / None\n\nWould I want to cook this? Does it feel like a capable cook thought it through? What is missing?\n');
}
fs.writeFileSync(`${prefix}.blind.md`, `# Cooking Quality V5 — owner blind review\n\n` +
  `These are matched synthetic meal cases. The separate real staging meal test is the primary owner gate.\n\n${blind.join('\n')}`, { mode: 0o600 });
fs.writeFileSync(`${prefix}.key.private.json`, JSON.stringify(key, null, 2), { mode: 0o600 });
process.stdout.write(JSON.stringify({ privateResults: `${prefix}.private.json`,
  blindReview: `${prefix}.blind.md`, blindKey: `${prefix}.key.private.json`, calls: results.length }) + '\n');
