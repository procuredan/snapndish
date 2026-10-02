import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeMealPlan, COOKING_QUALITY_MEAL_PACKAGE_TOOL,
  COOKING_QUALITY_V51_MEAL_PACKAGE_TOOL } from '../live-lab/meal-plan.mjs';
import { normalizeCookingProposal, COOKING_PROGRESS_TOOL_V2,
  COOKING_PROGRESS_TOOL_V51 } from '../live-lab/cooking-progress.mjs';
import { boundedBridgeDiagnostic } from '../live-lab/bridge-diagnostics.mjs';

const failedProposal = JSON.parse(fs.readFileSync(new URL('./fixtures/v5-1-serving-revision.json',
  import.meta.url), 'utf8'));
const candidate = raw => normalizeMealPlan(raw, { requireFullPlan: true,
  requireRetail: true, maxDirectionsLength: 2000 });

test('V5.1 accepts the exact preserved 1,494-character revision without changing cooking text', () => {
  assert.equal(failedProposal.full_plan[2].directions.length, 1494);
  assert.equal(normalizeMealPlan(failedProposal, { requireFullPlan: true, requireRetail: true }), null);
  const accepted = candidate(failedProposal);
  assert.ok(accepted);
  assert.deepEqual(accepted.full_plan, failedProposal.full_plan);
  assert.equal(accepted.servings, 4);
  assert.equal(accepted.sections.length, failedProposal.sections.length);
});

test('candidate changes only the section allowance and retains surrounding bounds', () => {
  const at = structuredClone(failedProposal);
  at.full_plan[2].directions = 'A'.repeat(2000);
  assert.ok(candidate(at));
  const over = structuredClone(at);
  over.full_plan[2].directions += 'A';
  const validation = {};
  assert.equal(normalizeMealPlan(over, { requireFullPlan: true, requireRetail: true,
    maxDirectionsLength: 2000, validation }), null);
  assert.deepEqual(validation, { code: 'PLAN_DIRECTIONS_LENGTH',
    field: 'full_plan[2].directions', actual: 2001, max: 2000 });
  assert.equal(normalizeMealPlan(at, { requireFullPlan: true, requireRetail: true }), null);
  const tooMany = structuredClone(at);
  tooMany.full_plan = Array.from({ length: 15 }, () => ({ title: 'Cook', directions: 'Cook.' }));
  assert.equal(candidate(tooMany), null);
  const tooLong = structuredClone(at);
  tooLong.full_plan = Array.from({ length: 6 }, (_, i) =>
    ({ title: `Section ${i}`, directions: 'A'.repeat(1900) }));
  assert.equal(candidate(tooLong), null);
  const title = structuredClone(at);
  title.full_plan[0].title = 'T'.repeat(81);
  assert.equal(candidate(title), null);
  const now = structuredClone(at);
  now.current_action = 'N'.repeat(1201);
  assert.equal(candidate(now), null);
});

test('V5.1 cooking echo uses package bounds while older cooking bounds stay intact', () => {
  const echo = { current_action: failedProposal.current_action,
    full_plan: failedProposal.full_plan, remaining_components: null,
    customer_report: null, equipment_change: null };
  assert.equal(normalizeCookingProposal(echo, '', false), null);
  const accepted = normalizeCookingProposal(echo, '', false,
    { maxDirectionsLength: 2000, maxPlanLength: 10000, minSections: 1, maxSections: 14 });
  assert.deepEqual(accepted.full_plan, failedProposal.full_plan);
  assert.equal(COOKING_PROGRESS_TOOL_V2.strict, true);
  assert.equal(COOKING_PROGRESS_TOOL_V51.strict, true);
  assert.equal(COOKING_QUALITY_MEAL_PACKAGE_TOOL.strict, true);
  assert.equal(COOKING_QUALITY_V51_MEAL_PACKAGE_TOOL.strict, true);
  assert.deepEqual(COOKING_QUALITY_V51_MEAL_PACKAGE_TOOL.parameters.properties.sections,
    COOKING_QUALITY_MEAL_PACKAGE_TOOL.parameters.properties.sections);
});

test('retail rejection identifies only a numeric display mismatch for the single repair', () => {
  const proposal = { ...failedProposal, sections: [{ section: 'Produce', items: [{
    name: 'Potatoes', quantity: '1 × 5-lb bag plus 1 lb loose', have_status: 'need',
    required_quantity: '6 lb', normalized_quantity: { amount: 6, unit: 'lb' },
    retail_total: { amount: 6, unit: 'lb' },
  }] }] };
  const validation = {};
  assert.equal(normalizeMealPlan(proposal, { requireFullPlan: true, requireRetail: true,
    maxDirectionsLength: 2000, validation }), null);
  assert.deepEqual(validation, { code: 'RETAIL_DISPLAY_TOTAL_MISMATCH',
    field: 'sections[0].items[0].quantity', actual: 5, expected: 6 });
  assert.deepEqual(boundedBridgeDiagnostic({ validation }).validation, validation);
  proposal.sections[0].items[0].quantity = '1 × 6-lb bag';
  assert.ok(candidate(proposal));
});

test('bridge diagnostics allow only bounded metadata', () => {
  const hostile = boundedBridgeDiagnostic({ stage: 'repair', requestId: 'req_good',
    response: { id: 'resp_good', status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens', private: 'private-meal' },
      usage: { input_tokens: 80, output_tokens: 20, input_tokens_details: { cached_tokens: 8 },
        private: 'private-usage' },
      output: [{ type: 'function_call', name: 'publish_meal_plan',
        arguments: 'sk-proj-secret customer meal' }], authorization: 'Bearer secret' },
    validation: { code: 'PLAN_DIRECTIONS_LENGTH', field: 'full_plan[2].directions',
      actual: 1494, max: 1400, private: 'customer meal' },
    durationMs: 85, outcome: 'incomplete', estimatedUsd: 0.0123 });
  assert.deepEqual(hostile.validation, { code: 'PLAN_DIRECTIONS_LENGTH',
    field: 'full_plan[2].directions', actual: 1494, max: 1400 });
  assert.equal(hostile.request_id, 'req_good');
  assert.equal(hostile.incomplete_reason, 'max_output_tokens');
  assert.equal(hostile.input_tokens, 80);
  assert.equal(hostile.output_tokens, 20);
  assert.equal(hostile.cached_input_tokens, 8);
  assert.equal(hostile.estimated_usd, 0.0123);
  assert.doesNotMatch(JSON.stringify(hostile), /secret|private-meal|customer meal|Bearer/);
  const bad = boundedBridgeDiagnostic({ stage: 'anything', requestId: 'req_good\nAuthorization',
    validation: { code: 'FREEFORM', field: 'private[0]', actual: 'secret', max: 1 } });
  assert.equal(bad.validation, null);
  assert.equal(bad.request_id, null);
});
