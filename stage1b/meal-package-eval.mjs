// Synthetic fixed and held-out probes. Private model responses are written under ignored runs/.
import fs from 'node:fs';
import { instructionsFor, instructionsForCandidate, instructionsForMealPackage, estimateUsd } from '../src/config.ts';
import { MEAL_PACKAGE_TOOL, normalizeMealPlan } from '../live-lab/meal-plan.mjs';

if (!process.env.OPENAI_API_KEY) throw Error('OPENAI_API_KEY is not configured');
const model = process.env.MODEL || 'gpt-6-astra';
const effort = process.env.REASONING_EFFORT || 'medium';
const cases = [
  { id: 'chicken-discovery-fixed', context: '', turns: ['I have boneless chicken thighs tonight.'] },
  { id: 'frozen-shrimp-discovery-held-out', context: '', turns: ['I have frozen Argentine red shrimp. Any ideas?'] },
  { id: 'chosen-multicomponent-fixed', context: 'Two people; skillet and rice cooker.',
    turns: [{ role: 'user', content: 'I want Japanese hambāgu for dinner.' },
      { role: 'assistant', content: 'Hambāgu with rice and a cucumber salad sounds good. Two people, with a skillet and rice cooker?' },
      { role: 'user', content: 'Yes, two of us. Make that.' }] },
  { id: 'delegated-choice-held-out', context: 'Dinner for three. Peanut allergy in the household.',
    turns: [{ role: 'user', content: 'I have chickpeas and cauliflower. What could I make?' },
      { role: 'assistant', content: 'We could go Indian with spiced chickpeas and roasted cauliflower, Mediterranean with lemon-herb bowls, or Spanish with smoky tomato stew.' },
      { role: 'user', content: 'You pick. We have 45 minutes.' }] },
  { id: 'party-commitment-held-out', context: 'Blackstone griddle and oven.',
    turns: [{ role: 'user', content: 'Family brunch for six this weekend.' },
      { role: 'assistant', content: 'A savory breakfast taco spread, baked French toast with fruit, or a Mediterranean brunch board could be fun. Any guest restrictions?' },
      { role: 'user', content: 'No allergies. Let’s do the breakfast tacos.' }] },
  { id: 'direct-cooking-question-control', context: '', turns: ['My sauce is too thin. What should I do?'] },
  { id: 'rejection-control', context: '', turns: [{ role: 'user', content: 'I have boneless chicken thighs.' },
    { role: 'assistant', content: 'How about chicken pitas, sticky chicken rice bowls, or chicken tacos?' },
    { role: 'user', content: 'None of those. Something completely different.' }] },
  { id: 'frozen-shrimp-commitment-held-out', context: 'Dinner for two. No allergies.',
    turns: [{ role: 'user', content: 'I have frozen Argentine red shrimp.' },
      { role: 'assistant', content: 'Lemony shrimp pasta, shrimp tacos, or a coconut curry could work. Which sounds good?' },
      { role: 'user', content: 'Let’s do the lemony pasta.' }] },
  { id: 'serious-allergy-commitment-held-out', context: 'Dinner for four; one guest has a severe peanut allergy.',
    turns: [{ role: 'user', content: 'We want Italian tonight.' },
      { role: 'assistant', content: 'How about chicken Parmesan with spaghetti and a green salad, a mushroom risotto with asparagus, or a tomato-braised fish with polenta?' },
      { role: 'user', content: 'Chicken Parmesan. Keep it safe for that allergy.' }] },
  { id: 'ambiguous-reference-control', context: 'Dinner for two.',
    turns: [{ role: 'user', content: 'I have chicken thighs.' },
      { role: 'assistant', content: 'We could do Greek pitas, Korean-style rice bowls, or Moroccan chicken with couscous.' },
      { role: 'user', content: 'That one sounds good.' }] },
  { id: 'indexed-selection-held-out', context: 'Dinner for two. Skillet and oven.',
    turns: [{ role: 'user', content: 'I have pork tenderloin.' },
      { role: 'assistant', content: '1. Pork schnitzel with potatoes and cucumber salad. 2. Soy-ginger pork bowls with rice and greens. 3. Pork medallions with apple and mustard, mashed potatoes and green beans.' },
      { role: 'user', content: 'The second one.' }] },
  { id: 'change-direction-held-out', context: 'Dinner for three. No allergies.',
    turns: [{ role: 'user', content: 'Chicken thighs for dinner.' },
      { role: 'assistant', content: 'How about chicken shawarma with rice and salad, BBQ chicken with corn, or coconut curry with rice?' },
      { role: 'user', content: 'Curry sounds good.' },
      { role: 'assistant', content: 'Coconut curry it is.' },
      { role: 'user', content: 'Actually, let’s do the shawarma instead.' }] },
];
const arms = [
  { id: 'foundation', instructions: c => instructionsFor('A', c), tools: [] },
  { id: 'v2', instructions: c => instructionsForCandidate(c), tools: [] },
  { id: 'package-v1', instructions: c => instructionsForMealPackage(c), tools: [MEAL_PACKAGE_TOOL] },
];
const selected = new Set((process.env.PACKAGE_EVAL_CASES || cases.map(c => c.id).join(',')).split(','));
const selectedArms = new Set((process.env.PACKAGE_EVAL_ARMS || arms.map(a => a.id).join(',')).split(','));
const results = [];
async function probe(c, arm) {
  const input = typeof c.turns[0] === 'string' ? c.turns[0] : c.turns;
  const started = performance.now();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(120_000),
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, reasoning: { effort }, instructions: arm.instructions(c.context), input,
      ...(arm.tools.length ? { tools: arm.tools, tool_choice: 'auto' } : {}),
      max_output_tokens: Number(process.env.PACKAGE_EVAL_OUTPUT_TOKENS || 4096), store: false, stream: true }),
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
    ? normalizeMealPlan(calls[0].arguments, { requireFullPlan: true }) : null;
  const usage = result.usage || {};
  return { case: c.id, arm: arm.id, text, firstTextMs, completeMs: Math.round(performance.now() - started),
    status: result.status, incompleteReason: result.incomplete_details?.reason || null,
    outputTypes: result.output?.map(x => x.type), calls, plan, validPackage: Boolean(plan),
    sectionCount: plan?.full_plan.length || 0, shoppingCount: plan?.sections.reduce((n, s) => n + s.items.length, 0) || 0,
    planCharacters: plan?.full_plan.reduce((n, s) => n + s.directions.length, 0) || 0,
    usage, estimatedUsd: estimateUsd(result.model || model, usage.input_tokens, usage.input_tokens_details?.cached_tokens || 0,
      usage.output_tokens) };
}
for (const c of cases.filter(c => selected.has(c.id))) for (const arm of arms.filter(a => selectedArms.has(a.id))) {
  try {
    const row = await probe(c, arm); results.push(row);
    process.stdout.write(JSON.stringify({ case: row.case, arm: row.arm, status: row.status,
      validPackage: row.validPackage, sections: row.sectionCount, shopping: row.shoppingCount,
      planCharacters: row.planCharacters, firstTextMs: row.firstTextMs, completeMs: row.completeMs,
      outputTokens: row.usage.output_tokens, estimatedUsd: row.estimatedUsd }) + '\n');
  } catch (error) {
    results.push({ case: c.id, arm: arm.id, error: error.message });
    process.stdout.write(JSON.stringify({ case: c.id, arm: arm.id, error: error.message }) + '\n');
  }
}
fs.mkdirSync('runs', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = `runs/meal-package-${stamp}.private.json`;
fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), model, effort,
  maxOutputTokens: Number(process.env.PACKAGE_EVAL_OUTPUT_TOKENS || 4096), cases, results }, null, 2));
process.stdout.write(JSON.stringify({ privateResultFile: file, cases: new Set(results.map(r => r.case)).size,
  calls: results.length }) + '\n');
