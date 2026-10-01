// Synthetic culinary comparisons. Raw responses remain under ignored runs/.
import fs from 'node:fs';
import { instructionsFor, instructionsForMealPackage, instructionsForCookingContent, instructionsForCookingVoice, estimateUsd } from '../src/config.ts';
import { MEAL_PACKAGE_TOOL, normalizeMealPlan } from '../live-lab/meal-plan.mjs';

if (!process.env.OPENAI_API_KEY) throw Error('OPENAI_API_KEY is not configured');
const model = process.env.MODEL || 'gpt-6-astra';
const effort = process.env.REASONING_EFFORT || 'medium';
const cases = [
  { id: 'flat-top-souvlaki-known-equipment', kind: 'package', context: 'Four diners, Blackstone flat top and rice cooker. No allergies.',
    turns: [{ role: 'user', content: 'Greek dinner with pork sounds good.' },
      { role: 'assistant', content: 'Pork souvlaki with lemon rice, tzatziki, cucumber-tomato salad and warm pita would be a complete meal.' },
      { role: 'user', content: 'Yes, pork souvlaki with those sides. Let’s do it.' }] },
  { id: 'flat-top-souvlaki-unknown-equipment', kind: 'equipment', context: 'Four diners. No allergies.',
    turns: [{ role: 'user', content: 'Greek dinner with pork sounds good.' },
      { role: 'assistant', content: 'Pork souvlaki with lemon rice, tzatziki, cucumber-tomato salad and warm pita would be a complete meal.' },
      { role: 'user', content: 'Yes, pork souvlaki with those sides. Let’s do it.' }] },
  { id: 'flat-top-answer-held-out', kind: 'package', context: 'Four diners. No allergies.',
    turns: [{ role: 'user', content: 'Pork souvlaki with lemon rice, tzatziki, salad and pita for four. Let’s do it.' },
      { role: 'assistant', content: 'Will you be cooking the pork on an outdoor grill, or indoors on the stove?' },
      { role: 'user', content: 'I have a Blackstone and a rice cooker.' }] },
  { id: 'frozen-shrimp-pasta', kind: 'package', context: 'Two diners. Raw frozen Argentine red shrimp, skillet and pot. No wine, no allergies.',
    turns: [{ role: 'user', content: 'I have raw frozen Argentine red shrimp.' },
      { role: 'assistant', content: 'Lemony shrimp scampi over linguine with a bright tomato-arugula salad could be lovely.' },
      { role: 'user', content: 'Scampi over linguine and the salad. Make that.' }] },
  { id: 'asian-chicken-bowls', kind: 'package', context: 'Two diners. Rice cooker and skillet. No allergies.',
    turns: [{ role: 'user', content: 'I have boneless chicken thighs.' },
      { role: 'assistant', content: 'Sticky soy-ginger chicken bowls with broccoli, sesame cucumber and jasmine rice are one direction.' },
      { role: 'user', content: 'The sticky soy-ginger chicken bowls with those sides sound great.' }] },
  { id: 'chicken-lettuce-cups-held-out', kind: 'package', context: 'Four diners. Large skillet. No allergies.',
    turns: [{ role: 'user', content: 'Ground chicken for dinner.' },
      { role: 'assistant', content: 'Chicken lettuce cups with quick cucumber pickles and a savory ginger sauce would be fresh and satisfying.' },
      { role: 'user', content: 'Those lettuce cups and pickles sound good. Make the whole meal.' }] },
  { id: 'brunch-taco-spread', kind: 'package', context: 'Six diners. Oven and griddle. No guest allergies or restrictions.',
    turns: [{ role: 'user', content: 'Family brunch this weekend.' },
      { role: 'assistant', content: 'A breakfast taco spread with eggs, black beans, roasted potatoes, pico, lime crema and tortillas would let everyone build their own.' },
      { role: 'user', content: 'Let’s do the breakfast taco spread.' }] },
  { id: 'salmon-with-sauce', kind: 'package', context: 'Four diners. Outdoor grill and oven. No allergies.',
    turns: [{ role: 'user', content: 'Salmon for dinner.' },
      { role: 'assistant', content: 'Grilled salmon with crispy potatoes, shaved fennel salad and lemon-dill yogurt sauce could work well.' },
      { role: 'user', content: 'That salmon meal sounds good. Go with it.' }] },
  { id: 'steak-pan-sauce-held-out', kind: 'package', context: 'Two diners. Cast-iron skillet and oven. No allergies.',
    turns: [{ role: 'user', content: 'I have steak.' },
      { role: 'assistant', content: 'Steak with a peppercorn pan sauce, smashed potatoes and garlicky green beans is one satisfying direction.' },
      { role: 'user', content: 'Peppercorn sauce and those sides. Yes.' }] },
  { id: 'steak-cut-answer-held-out', kind: 'package', context: 'Two diners. Cast-iron skillet and oven. No allergies.',
    turns: [{ role: 'user', content: 'Steak with peppercorn sauce, smashed potatoes and garlicky green beans for two.' },
      { role: 'assistant', content: 'What cut of steak do you have, and roughly how thick is it? That will help me get the cooking method right.' },
      { role: 'user', content: 'Two ribeyes, each about 1½ inches thick.' }] },
  { id: 'chicken-discovery-control', kind: 'discovery', context: '', turns: ['I have boneless chicken thighs tonight.'] },
  { id: 'rejection-control', kind: 'discovery', context: '', turns: [{ role: 'user', content: 'I have chicken thighs.' },
    { role: 'assistant', content: 'Greek pitas, sticky chicken rice bowls, or smoky chicken tacos?' },
    { role: 'user', content: 'None of those. Something completely different.' }] },
  { id: 'direct-cooking-question-control', kind: 'direct', context: '', turns: ['My sauce split. How do I save it?'] },
  { id: 'missing-ingredient-recovery-held-out', kind: 'direct', context: '',
    turns: [{ role: 'user', content: 'I am making lemony chicken pasta.' },
      { role: 'assistant', content: 'Start the sauce while the pasta water heats.' },
      { role: 'user', content: "I just realized I don't have lemon. What should I do?" }] },
];
const arms = [
  { id: 'foundation-a', instructions: c => instructionsFor('A', c), tools: [] },
  { id: 'package-v1', instructions: c => instructionsForMealPackage(c), tools: [MEAL_PACKAGE_TOOL] },
  { id: 'content-v2', instructions: c => instructionsForCookingContent(c), tools: [MEAL_PACKAGE_TOOL] },
  { id: 'cooking-voice-v3', instructions: c => instructionsForCookingVoice(c), tools: [MEAL_PACKAGE_TOOL] },
];
const chosenCases = new Set((process.env.CONTENT_EVAL_CASES || cases.map(c => c.id).join(',')).split(','));
const chosenArms = new Set((process.env.CONTENT_EVAL_ARMS || 'cooking-voice-v3,content-v2,foundation-a').split(','));
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
    ? normalizeMealPlan(calls[0].arguments, { requireFullPlan: true }) : null;
  const usage = result.usage || {};
  return { case: c.id, kind: c.kind, arm: arm.id, text, firstTextMs,
    completeMs: Math.round(performance.now() - started), status: result.status,
    incompleteReason: result.incomplete_details?.reason || null,
    outputTypes: result.output?.map(x => x.type), calls, plan, validPackage: Boolean(plan),
    sectionCount: plan?.full_plan.length || 0, shoppingCount: plan?.sections.reduce((n, s) => n + s.items.length, 0) || 0,
    planCharacters: plan?.full_plan.reduce((n, s) => n + s.directions.length, 0) || 0,
    usage, estimatedUsd: estimateUsd(result.model || model, usage.input_tokens,
      usage.input_tokens_details?.cached_tokens || 0, usage.output_tokens) };
}
for (const c of cases.filter(c => chosenCases.has(c.id))) for (const arm of arms.filter(a => chosenArms.has(a.id))) {
  if (arm.id === 'foundation-a' && c.kind !== 'discovery') continue;
  try {
    const row = await probe(c, arm); results.push(row);
    process.stdout.write(JSON.stringify({ case: row.case, arm: row.arm, status: row.status,
      validPackage: row.validPackage, sections: row.sectionCount, shopping: row.shoppingCount,
      planCharacters: row.planCharacters, firstTextMs: row.firstTextMs,
      completeMs: row.completeMs, outputTokens: row.usage.output_tokens,
      estimatedUsd: row.estimatedUsd }) + '\n');
  } catch (error) {
    results.push({ case: c.id, arm: arm.id, error: error.message });
    process.stdout.write(JSON.stringify({ case: c.id, arm: arm.id, error: error.message }) + '\n');
  }
}
fs.mkdirSync('runs', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = `runs/cooking-content-${stamp}.private.json`;
fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), model, effort,
  versions: { foundation: 'foundation-a-v1', package: 'stage1b-meal-package-v1',
    content: 'stage1b-meal-package-v2', candidate: 'stage1b-meal-package-v3' }, cases, results }, null, 2));
process.stdout.write(JSON.stringify({ privateResultFile: file, cases: new Set(results.map(r => r.case)).size,
  calls: results.length }) + '\n');
