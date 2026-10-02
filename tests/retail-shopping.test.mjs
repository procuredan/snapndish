import test from 'node:test';
import assert from 'node:assert/strict';
import { MEAL_PACKAGE_TOOL, RETAIL_MEAL_PACKAGE_TOOL, normalizeMealPlan,
  reconcileShopping, updatePurchaseRequirements } from '../live-lab/meal-plan.mjs';

const item = (name, required, amount, unit, display, retailAmount, have_status = 'need') => ({
  name, required_quantity: required,
  normalized_quantity: { amount, unit }, retail_total: { amount: retailAmount, unit },
  quantity: display, have_status,
});
const packageFor = (servings, items) => ({ meal: 'Complete meal', servings,
  sections: [{ section: 'Groceries', items }],
  full_plan: [{ title: 'Cook and serve', directions: 'Use the measured amounts for the meal and serve every component.' }],
  current_action: 'Start cooking.' });
const accepted = raw => normalizeMealPlan(raw, { requireFullPlan: true, requireRetail: true });

test('retail proposal retains culinary requirements and rounds purchase recommendations up', () => {
  const cases = [
    item('Greek yogurt', '10 cups', 80, 'fl oz', '3 × 32-oz tubs', 96),
    item('Chicken stock', '7 cups', 56, 'fl oz', '2 × 32-oz cartons', 64),
    item('Eggs', '30 eggs', 30, 'each', '3 dozen eggs', 36),
    item('Lemons', '3½ lemons', 3.5, 'each', '4 lemons', 4),
    item('Bell peppers', '5½ peppers', 5.5, 'each', '6 bell peppers', 6),
    item('Chicken thighs', '5¼ lb', 5.25, 'lb', 'about 5½–6 lb', 5.5),
    item('Cilantro', '1 bunch', 1, 'bunch', '1 bunch', 1),
    item('Garlic', '2 heads', 2, 'head', '2 heads', 2),
    item('Baguette', '1 baguette', 1, 'each', '1 baguette', 1),
    item('Avocados', '2 avocados', 2, 'each', '2 avocados', 2),
  ];
  const plan = accepted(packageFor(20, cases));
  assert.ok(plan);
  for (const [index, shopping] of plan.sections[0].items.entries()) {
    assert.equal(shopping.required_quantity, cases[index].required_quantity);
    assert.equal(shopping.quantity, cases[index].quantity);
    assert.ok(shopping.retail_total.amount >= shopping.normalized_quantity.amount);
    assert.deepEqual(shopping.purchase_requirement, shopping.normalized_quantity);
  }
  assert.equal(plan.full_plan[0].directions, 'Use the measured amounts for the meal and serve every component.');
});

test('retail proposal rejects underbuying, incompatible units, malformed amounts and duplicate ingredients', () => {
  const yogurt = item('Greek yogurt', '10 cups', 80, 'fl oz', '2 × 32-oz tubs', 64);
  assert.equal(accepted(packageFor(20, [yogurt])), null, 'two cartons cannot cover 80 fl oz');
  assert.equal(accepted(packageFor(20, [{ ...yogurt, retail_total: { amount: 96, unit: 'cups' } }])), null);
  assert.equal(accepted(packageFor(20, [{ ...yogurt, normalized_quantity: { amount: -1, unit: 'fl oz' } }])), null);
  assert.equal(accepted(packageFor(20, [{ ...yogurt, required_quantity: 10 }])), null);
  assert.equal(accepted(packageFor(20, [item('Greek yogurt', '10 cups, about 2450 g', 2450,
    'g', '3 × 32-oz tubs', 2450)])), null,
  'the displayed packages and recorded total must agree when their units are comparable');
  assert.equal(accepted(packageFor(20, [item('Eggs', '30 eggs', 30, 'each', '3 dozen eggs', 30)])), null,
  'three dozen must represent 36 eggs');
  const one = item('Greek yogurt', '10 cups', 80, 'fl oz', '3 × 32-oz tubs', 96);
  const duplicate = { ...one, name: 'greek yogurt' };
  assert.equal(accepted(packageFor(20, [one, duplicate])), null, 'shared ingredient must be consolidated first');
  assert.equal(normalizeMealPlan(packageFor(20, [{ name: 'Yogurt', quantity: '10 cups', have_status: 'need' }]),
    { requireFullPlan: true, requireRetail: true }), null);
  assert.ok(normalizeMealPlan(packageFor(20, [{ name: 'Yogurt', quantity: '10 cups', have_status: 'need' }]),
    { requireFullPlan: true }), 'prior meal-package contract still works');
});

test('clear volume arithmetic is corrected without changing cooking amounts or making another model call', () => {
  const oil = item('Olive oil', '3 tbsp', 3, 'fl oz', '1 × 8.5-fl-oz bottle', 8.5);
  const plan = accepted(packageFor(5, [oil]));
  assert.ok(plan);
  assert.equal(plan.sections[0].items[0].required_quantity, '3 tbsp');
  assert.deepEqual(plan.sections[0].items[0].normalized_quantity, { amount: 1.5, unit: 'fl oz' });
  assert.deepEqual(plan.sections[0].items[0].purchase_requirement, { amount: 1.5, unit: 'fl oz' });
  assert.equal(accepted(packageFor(5, [{ ...oil, quantity: '1-fl-oz bottle',
    retail_total: { amount: 1, unit: 'fl oz' } }])), null,
  'the corrected culinary requirement cannot exceed the proposed purchase');
  assert.equal(accepted(packageFor(5, [item('Stock', '7 cups', 56, 'fl oz',
    '2 × 32-oz cartons', 64)])).sections[0].items[0].normalized_quantity.amount, 56);
});

test('checkbox state drives remaining requirement without changing recipe or retail recommendation', () => {
  const plan = accepted(packageFor(20, [item('Eggs', '30 eggs', 30, 'each', '3 dozen eggs', 36)]));
  const egg = plan.sections[0].items[0];
  egg.checked = true;
  updatePurchaseRequirements(plan);
  assert.deepEqual(egg.purchase_requirement, { amount: 0, unit: 'each' });
  assert.equal(egg.required_quantity, '30 eggs');
  assert.equal(egg.quantity, '3 dozen eggs');
  egg.checked = false;
  updatePurchaseRequirements(plan);
  assert.deepEqual(egg.purchase_requirement, { amount: 30, unit: 'each' });
});

test('serving or meal revision recalculates requirement before retail display and fences prior checks', () => {
  const small = accepted(packageFor(4, [item('Greek yogurt', '2 cups', 16, 'fl oz', '1 × 32-oz tub', 32)]));
  const prior = small.sections[0].items[0];
  prior.checked = true;
  prior.customer_edited = true;
  const large = accepted(packageFor(20, [item('Greek yogurt', '10 cups', 80, 'fl oz', '3 × 32-oz tubs', 96)]));
  reconcileShopping(small, large);
  const next = large.sections[0].items[0];
  assert.equal(next.checked, false);
  assert.equal(next.quantity_changed, true);
  assert.deepEqual(next.purchase_requirement, { amount: 80, unit: 'fl oz' });

  const sameDisplay = accepted(packageFor(20, [item('Greek yogurt', '10½ cups', 84, 'fl oz', '3 × 32-oz tubs', 96)]));
  next.checked = true;
  next.customer_edited = true;
  reconcileShopping(large, sameDisplay);
  assert.equal(sameDisplay.sections[0].items[0].checked, false,
    'a larger culinary requirement still needs review when the retail display happens to be unchanged');
});

test('retail tool remains a strict Responses schema while the earlier tool is unchanged', () => {
  assert.equal(RETAIL_MEAL_PACKAGE_TOOL.strict, true);
  assert.equal(MEAL_PACKAGE_TOOL.strict, true);
  const oldItem = MEAL_PACKAGE_TOOL.parameters.properties.sections.items.properties.items.items;
  const newItem = RETAIL_MEAL_PACKAGE_TOOL.parameters.properties.sections.items.properties.items.items;
  assert.deepEqual(oldItem.required, ['name', 'quantity', 'have_status']);
  assert.deepEqual(newItem.required, ['name', 'quantity', 'required_quantity',
    'normalized_quantity', 'retail_total', 'have_status']);
  assert.equal(newItem.properties.normalized_quantity.additionalProperties, false);
  assert.equal(newItem.properties.retail_total.additionalProperties, false);
});
