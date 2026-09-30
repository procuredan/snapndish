import fs from 'node:fs';
import { instructionsFor, instructionsForNextFlow, instructionsForCookingMode, instructionsForCookingModeV2,
  estimateUsd } from '../src/config.ts';
import { MEAL_PLAN_TOOL } from '../live-lab/meal-plan.mjs';
import { COOKING_PROGRESS_TOOL, COOKING_PROGRESS_TOOL_V2, cookingFromOutput } from '../live-lab/cooking-progress.mjs';

if (!process.env.OPENAI_API_KEY) throw Error('OPENAI_API_KEY is not configured');
const model = process.env.MODEL || 'gpt-6-astra';
const reasoningEffort = process.env.REASONING_EFFORT || 'medium';
const meal = { meal: 'Beef and vegetable stir-fry with jasmine rice and citrus side salad', servings: 4,
  sections: [
    { section: 'Meat', items: [{ name: 'Beef strips', quantity: '1½ pounds' }] },
    { section: 'Produce', items: [{ name: 'Broccoli', quantity: '1 head' },
      { name: 'Bell peppers', quantity: '2' }, { name: 'Oranges', quantity: '2' },
      { name: 'Salad greens', quantity: '1 bag' }] },
    { section: 'Pantry', items: [{ name: 'Jasmine rice', quantity: '2 cups' },
      { name: 'Soy sauce', quantity: '4 tablespoons' }, { name: 'Rice vinegar', quantity: '2 tablespoons' },
      { name: 'Honey', quantity: '2 tablespoons' }, { name: 'Sesame oil', quantity: '2 teaspoons' },
      { name: 'Cornstarch', quantity: '2 teaspoons' }, { name: 'Neutral oil', quantity: '3 tablespoons' }] },
  ] };
const cases = [
  { id: 'cooking-checkpoints-fixed', turns: ["Let's cook.", 'Rice is going.', 'Done.', 'Wok.', 'Beef is browned.'] },
  { id: 'cooking-recovery-held-out', turns: ["Let's cook.", "I don't have rice vinegar.", "The rice isn't done yet."] },
  { id: 'cooking-direct-question-held-out', turns: ["Let's cook.", 'How much water should go in the rice cooker?'] },
  { id: 'cooking-burning-held-out', initialAction: 'Cook the beef strips in a hot wok until browned; tell me when they are browned.',
    turns: ['The beef is burning.'] },
  { id: 'cooking-cold-wok-held-out', initialAction: 'Heat the wok for the beef strips; tell me when it is hot.',
    turns: ["The wok isn't getting hot."] },
  { id: 'full-plan-no-routine-ack', turns: ["Let's cook.", 'Can I use my rice cooker for the rice?'] },
  { id: 'full-plan-recovery', turns: ["Let's cook.", "I don't have rice vinegar and the rice isn't done yet."] },
  { id: 'equipment-multiple-options', priorAssistant: 'For the stir-fry, do you have a wok or a skillet?',
    turns: ['I have both.'] },
  { id: 'equipment-repeated-answer', priorTurns: [
    { role: 'assistant', content: 'For the stir-fry, do you have a wok or a skillet?' },
    { role: 'user', content: 'Both.' },
    { role: 'assistant', content: 'Which one do you have?' },
  ],
    turns: ['Both are available.'] },
];
const arms = [
  { id: 'foundation', instructions: instructionsFor('A', ''), tools: [] },
  { id: 'next-flow-v1', instructions: instructionsForNextFlow('Owns a rice cooker.'), tools: [MEAL_PLAN_TOOL] },
  { id: 'cooking-v1', tools: [MEAL_PLAN_TOOL, COOKING_PROGRESS_TOOL] },
  { id: 'cooking-required', tools: [MEAL_PLAN_TOOL, COOKING_PROGRESS_TOOL], toolChoice: 'required' },
  { id: 'cooking-forced', tools: [MEAL_PLAN_TOOL, COOKING_PROGRESS_TOOL], toolChoice: { type: 'function', name: 'update_cooking_progress' } },
  { id: 'cooking-v2', tools: [MEAL_PLAN_TOOL, COOKING_PROGRESS_TOOL_V2], toolChoice: 'auto' },
];

async function call(instructions, input, tools, toolChoice = 'auto') {
  const started = performance.now();
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({ model, instructions, input, reasoning: { effort: reasoningEffort },
      ...(tools.length ? { tools, tool_choice: toolChoice } : {}),
      max_output_tokens: 4096, store: false, stream: true }) });
  if (!response.ok || !response.body) throw Error(`HTTP_${response.status}`);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', text = '', firstTextMs = null, completed = null, incomplete = null;
  function frame(raw) {
    const line = raw.split('\n').find(x => x.startsWith('data: '));
    if (!line || line.slice(6) === '[DONE]') return;
    const event = JSON.parse(line.slice(6));
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
      text += event.delta;
      if (firstTextMs === null && /\S/.test(event.delta)) firstTextMs = Math.round(performance.now() - started);
    } else if (event.type === 'response.completed') completed = event.response;
    else if (event.type === 'response.incomplete') incomplete = event.response;
    else if (event.type === 'error' || event.type === 'response.failed') throw Error('PROVIDER_STREAM_FAILED');
  }
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    buffer += decoder.decode(next.value, { stream: true }).replace(/\r\n/g, '\n');
    let index;
    while ((index = buffer.indexOf('\n\n')) >= 0) { frame(buffer.slice(0, index)); buffer = buffer.slice(index + 2); }
  }
  if (buffer.trim()) frame(buffer);
  if (!completed && !incomplete) throw Error('INCOMPLETE_STREAM');
  const fullMs = Math.round(performance.now() - started);
  const result = completed ?? incomplete;
  const usage = result.usage ?? {};
  const costUsd = Number.isFinite(usage.input_tokens) && Number.isFinite(usage.output_tokens)
    ? estimateUsd(result.model ?? model, usage.input_tokens,
      usage.input_tokens_details?.cached_tokens ?? 0, usage.output_tokens) : null;
  return { text, output: result.output ?? [], firstTextMs, fullMs, usage, costUsd,
    incompleteReason: incomplete?.incomplete_details?.reason ?? null,
    responseModel: result.model ?? model };
}

const results = [];
for (const scenario of cases.filter(x => !process.env.COOKING_EVAL_CASES ||
  process.env.COOKING_EVAL_CASES.split(',').includes(x.id))) for (const arm of arms.filter(x => !process.env.COOKING_EVAL_ARMS ||
  process.env.COOKING_EVAL_ARMS.split(',').includes(x.id))) {
  const messages = [{ role: 'user', content: `We selected ${meal.meal} for four. Shopping is complete. I own a rice cooker. Here is the consolidated meal and ingredient plan: ${JSON.stringify(meal)}` },
    { role: 'assistant', content: 'Perfect. I got you from here. The complete meal and shopping list are ready.' }];
  if (scenario.priorAssistant) messages.push({ role: 'assistant', content: scenario.priorAssistant });
  if (scenario.priorTurns) messages.push(...scenario.priorTurns);
  let cookingProgress = scenario.initialAction ? { current_action: scenario.initialAction,
    remaining_components: ['Beef', 'Vegetables', 'Citrus side salad'], reports: [] } : null;
  if (scenario.initialAction) messages.push({ role: 'assistant', content: scenario.initialAction });
  for (const userText of scenario.turns.slice(0, Number(process.env.COOKING_EVAL_TURN_LIMIT) || scenario.turns.length)) {
    messages.push({ role: 'user', content: userText });
    const state = arm.id.startsWith('cooking-') ? `\n\nApplication-accepted cooking progress: ${JSON.stringify(cookingProgress)}. Only customer reports count as actual progress.` : '';
    try {
      const instructions = arm.id.startsWith('cooking-')
        ? (arm.id === 'cooking-v2' ? instructionsForCookingModeV2 : instructionsForCookingMode)
          ('Owns a rice cooker.', true, Boolean(cookingProgress)) : arm.instructions;
      const toolChoice = arm.id === 'cooking-required' && !cookingProgress ? 'auto' : arm.toolChoice;
      const response = await call(instructions + `\n\nCurrent application-accepted meal and shopping state: ${JSON.stringify(meal)}. Shopping is complete.` + state,
        messages, arm.tools, toolChoice);
      if (response.incompleteReason) {
        const record = { scenario: scenario.id, arm: arm.id, userText,
          error: `INCOMPLETE_${response.incompleteReason}`, partialText: response.text,
          partialOutput: response.output, firstTextMs: response.firstTextMs,
          fullMs: response.fullMs, usage: response.usage, costUsd: response.costUsd };
        results.push(record);
        process.stdout.write(JSON.stringify({ scenario: record.scenario, arm: record.arm,
          userText, error: record.error, firstTextMs: record.firstTextMs,
          fullMs: record.fullMs, outputTypes: record.partialOutput.map(x => x.type) }) + '\n');
        break;
      }
      const cooking = arm.id.startsWith('cooking-') ? cookingFromOutput(response.output, userText,
        arm.id === 'cooking-v2' && !cookingProgress?.full_plan) : { cooking: null, reason: null, calls: [] };
      const planCalls = response.output.filter(x => x.type === 'function_call' && x.name === 'publish_meal_plan');
      if (cooking.cooking) {
        cookingProgress = { current_action: cooking.cooking.current_action,
          remaining_components: cooking.cooking.remaining_components ?? cookingProgress?.remaining_components ?? [],
          full_plan: cooking.cooking.full_plan ?? cookingProgress?.full_plan ?? null,
          reports: [...(cookingProgress?.reports ?? []), ...(cooking.cooking.customer_report
            ? [cooking.cooking.customer_report] : [])] };
      }
      const renderedText = response.text || cooking.cooking?.current_action || '';
      messages.push({ role: 'assistant', content: renderedText || '[No conversational text]' });
      const record = { scenario: scenario.id, arm: arm.id, userText, renderedText,
        firstTextMs: response.firstTextMs, fullMs: response.fullMs, usage: response.usage,
        costUsd: response.costUsd, responseModel: response.responseModel,
        cookingProposal: cooking.cooking, cookingProposalError: cooking.reason,
        planCallCount: planCalls.length, toolCalls: response.output.filter(x => x.type === 'function_call') };
      results.push(record);
      process.stdout.write(JSON.stringify({ scenario: record.scenario, arm: record.arm, userText,
        firstTextMs: record.firstTextMs, fullMs: record.fullMs, costUsd: record.costUsd,
        cookingTool: Boolean(record.cookingProposal), planCallCount: record.planCallCount,
        preview: renderedText.slice(0, 220) }) + '\n');
    } catch (error) {
      results.push({ scenario: scenario.id, arm: arm.id, userText, error: error.message });
      process.stdout.write(JSON.stringify({ scenario: scenario.id, arm: arm.id, userText, error: error.message }) + '\n');
      break;
    }
  }
}
const output = { at: new Date().toISOString(), model, reasoningEffort, meal, cases, results };
fs.mkdirSync('runs', { recursive: true });
const suffix = process.env.COOKING_EVAL_RUN || (process.env.COOKING_EVAL_ARMS ? 'required' : 'comparison');
if (!/^[a-z0-9-]+$/.test(suffix)) throw Error('INVALID_RUN_SUFFIX');
fs.writeFileSync(`runs/cooking-mode-${suffix}-2026-09-30.private.json`, JSON.stringify(output, null, 2));
