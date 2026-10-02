export const NEXT_FLOW_VERSION = 'stage1b-next-flow-v1';

export const MEAL_PLAN_TOOL = {
  type: 'function',
  name: 'publish_meal_plan',
  description: 'Propose a complete chosen meal and consolidated shopping list once the customer has selected or delegated a direction and important unknowns are resolved. This is a proposal; the application accepts it only if the conversation is current.',
  parameters: {
    type: 'object',
    properties: {
      meal: { type: 'string', description: 'Short name and complete meal, including sides.' },
      servings: { type: 'integer' },
      sections: { type: 'array', items: { type: 'object', properties: {
        section: { type: 'string', description: 'Store section, not recipe.' },
        items: { type: 'array', items: { type: 'object', properties: {
          name: { type: 'string' }, quantity: { type: 'string' },
          have_status: { type: 'string', enum: ['confirmed', 'assumed', 'need'],
            description: 'confirmed only if the customer said they have it; assumed only for likely staples; need otherwise.' },
        }, required: ['name', 'quantity', 'have_status'] } },
      }, required: ['section', 'items'] } },
    }, required: ['meal', 'servings', 'sections'],
  },
};

// Stage 1B's meal decision produces Shopping and the recipe in the same proposal.
// The older tool remains available to the previous behavior versions for rollback.
export const MEAL_PACKAGE_TOOL = {
  type: 'function', name: 'publish_meal_plan', strict: true,
  description: 'Propose one complete chosen meal package after the customer has committed and necessary facts are known. Shopping, measured ingredients and the concise coordinated cooking plan belong to this same proposal. The application accepts it only while current.',
  parameters: {
    type: 'object', additionalProperties: false,
    properties: {
      meal: { type: 'string', description: 'Short name of the complete chosen meal, including accepted sides.' },
      servings: { type: 'integer' },
      sections: { type: 'array', description: 'Every required purchase ingredient, consolidated by grocery department.', items: {
        type: 'object', additionalProperties: false,
        properties: {
          section: { type: 'string' },
          items: { type: 'array', items: {
            type: 'object', additionalProperties: false,
            properties: {
              name: { type: 'string' }, quantity: { type: 'string' },
              have_status: { type: 'string', enum: ['confirmed', 'assumed', 'need'],
                description: 'Confirmed only from customer evidence; assumed only for likely staples; need otherwise.' },
            }, required: ['name', 'quantity', 'have_status'],
          } },
        }, required: ['section', 'items'],
      } },
      full_plan: { type: 'array', description: 'The complete coordinated recipe, already available before cooking starts. Free-form culinary sections. Each directions field uses brief action lines with measured ingredients, necessary actions, material timing/heat/doneness and relevant cautions. Avoid dense prose, obvious micro-steps, generic contingency and routine acknowledgement.', items: {
        type: 'object', additionalProperties: false,
        properties: { title: { type: 'string' }, directions: { type: 'string' } },
        required: ['title', 'directions'],
      } },
      current_action: { type: 'string', description: 'Short useful first cooking section or revised Now guidance. This is a proposed plan, never proof that physical work happened.' },
    }, required: ['meal', 'servings', 'sections', 'full_plan', 'current_action'],
  },
};

// The retail-aware version extends only Shopping's accepted ingredient facts.
// V1–V3 keep their original tool contract for reproducibility and rollback.
export const RETAIL_MEAL_PACKAGE_TOOL = structuredClone(MEAL_PACKAGE_TOOL);
RETAIL_MEAL_PACKAGE_TOOL.description = 'Propose the same complete meal package with consolidated culinary requirements and practical retail Shopping quantities. The application accepts it only while current.';
const retailItem = RETAIL_MEAL_PACKAGE_TOOL.parameters.properties.sections.items.properties.items.items;
retailItem.properties.quantity.description = 'Practical store purchase display, such as 3 × 32-oz tubs or 4 lemons; an estimate, not verified inventory.';
retailItem.properties.required_quantity = { type: 'string', description: 'Total culinary amount used by this complete meal for the selected servings, consolidated across components.' };
retailItem.properties.normalized_quantity = { type: 'object', additionalProperties: false,
  description: 'The consolidated required amount in one arithmetic-ready unit.',
  properties: { amount: { type: 'number' }, unit: { type: 'string' } }, required: ['amount', 'unit'] };
retailItem.properties.retail_total = { type: 'object', additionalProperties: false,
  description: 'Total amount the recommended purchase provides, in exactly the same unit as normalized_quantity. It must meet or exceed the requirement.',
  properties: { amount: { type: 'number' }, unit: { type: 'string' } }, required: ['amount', 'unit'] };
retailItem.required = ['name', 'quantity', 'required_quantity', 'normalized_quantity', 'retail_total', 'have_status'];

function normalizedAmount(value) {
  if (!value || typeof value !== 'object' || !Number.isFinite(value.amount) ||
    value.amount <= 0 || value.amount > 1_000_000 || typeof value.unit !== 'string' ||
    !value.unit.trim() || value.unit.length > 32) return null;
  return { amount: value.amount, unit: value.unit.trim().replace(/\s+/g, ' ').toLowerCase() };
}

// Check only unambiguous unit arithmetic. Food-density conversions and compound
// amounts remain culinary judgments; this deliberately is not an ingredient catalog.
const FRACTIONS = { '¼': .25, '½': .5, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3,
  '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875 };
const MEASURES = {
  cup: ['volume', 236.588], cups: ['volume', 236.588], tbsp: ['volume', 14.7868],
  tablespoon: ['volume', 14.7868], tablespoons: ['volume', 14.7868],
  tsp: ['volume', 4.92892], teaspoon: ['volume', 4.92892], teaspoons: ['volume', 4.92892],
  'fl oz': ['volume', 29.5735], 'fluid ounce': ['volume', 29.5735],
  'fluid ounces': ['volume', 29.5735], ml: ['volume', 1], milliliter: ['volume', 1],
  milliliters: ['volume', 1], l: ['volume', 1000], liter: ['volume', 1000], liters: ['volume', 1000],
  pint: ['volume', 473.176], pints: ['volume', 473.176], quart: ['volume', 946.353],
  quarts: ['volume', 946.353],
  oz: ['weight', 28.3495], ounce: ['weight', 28.3495], ounces: ['weight', 28.3495],
  lb: ['weight', 453.592], lbs: ['weight', 453.592], pound: ['weight', 453.592],
  pounds: ['weight', 453.592], g: ['weight', 1], gram: ['weight', 1], grams: ['weight', 1],
  kg: ['weight', 1000], kilogram: ['weight', 1000], kilograms: ['weight', 1000],
};
function leadingMeasure(required) {
  const text = required.trim();
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)/);
  const fraction = !mixed && text.match(/^(\d+)\/(\d+)/);
  const unicode = !mixed && !fraction && text.match(/^(\d+(?:\.\d+)?)\s*([¼½¾⅓⅔⅛⅜⅝⅞])/);
  const lone = !mixed && !fraction && !unicode && text.match(/^([¼½¾⅓⅔⅛⅜⅝⅞])/);
  const decimal = !mixed && !fraction && !unicode && !lone && text.match(/^(\d+(?:\.\d+)?)/);
  const match = mixed || fraction || unicode || lone || decimal;
  if (!match) return null;
  const amount = mixed ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
    : fraction ? Number(fraction[1]) / Number(fraction[2])
    : unicode ? Number(unicode[1]) + FRACTIONS[unicode[2]]
    : lone ? FRACTIONS[lone[1]] : Number(decimal[1]);
  const tail = text.slice(match[0].length).trim();
  const unit = tail.match(/^(fluid ounces?|fl\.?\s*oz|tablespoons?|tbsp|teaspoons?|tsp|milliliters?|ml|kilograms?|kg|pounds?|lbs?|ounces?|oz|grams?|g|cups?|liters?|l)(?=\s|[,:;.(]|$)/i);
  if (!unit) return null;
  const afterUnit = tail.slice(unit[0].length).trim();
  if (/^(?:\+|plus\b|and\b)/i.test(afterUnit)) return null;
  const name = unit[0].toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  const measure = MEASURES[name];
  return measure && Number.isFinite(amount) && amount > 0 ? { amount, measure } : null;
}
function checkedNormalizedQuantity(required, normalized) {
  const culinary = leadingMeasure(required);
  const target = MEASURES[normalized.unit];
  if (!culinary || !target || culinary.measure[0] !== target[0]) return normalized;
  const expected = culinary.amount * culinary.measure[1] / target[1];
  if (Math.abs(expected - normalized.amount) / expected <= .02) return normalized;
  return { ...normalized, amount: Math.round(expected * 1000) / 1000 };
}
function retailDisplayMatchesTotal(display, total) {
  const packages = display.trim().match(/^(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*[- ]\s*(fl\.?\s*oz|oz|lbs?|g|kg|ml|l|pints?|quarts?)\b/i);
  if (packages) {
    const source = MEASURES[packages[3].toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ')];
    const target = MEASURES[total.unit];
    if (source && target && source[0] === target[0]) {
      const displayed = Number(packages[1]) * Number(packages[2]) * source[1];
      const recorded = total.amount * target[1];
      return Math.abs(displayed - recorded) / displayed <= .05;
    }
  }
  const dozen = display.trim().match(/^(\d+(?:\.\d+)?)\s+dozen\b/i);
  if (dozen && /^(?:count|each|eggs?)$/.test(total.unit))
    return Math.abs(Number(dozen[1]) * 12 - total.amount) < .01;
  return true;
}

export function updatePurchaseRequirements(plan) {
  for (const section of plan.sections) for (const item of section.items) {
    if (item.normalized_quantity)
      item.purchase_requirement = { amount: item.checked ? 0 : item.normalized_quantity.amount,
        unit: item.normalized_quantity.unit };
  }
  return plan;
}

export function normalizeMealPlan(raw, { requireFullPlan = false, requireRetail = false, priorPlan = null } = {}) {
  let value;
  try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!value || typeof value !== 'object' || typeof value.meal !== 'string' ||
    !value.meal.trim() || value.meal.length > 400 || !Number.isInteger(value.servings) ||
    value.servings < 1 || value.servings > 100 || !Array.isArray(value.sections) ||
    value.sections.length < 1 || value.sections.length > 12) return null;
  const sections = [];
  let count = 0;
  const retailNames = new Set();
  for (const section of value.sections) {
    if (typeof section?.section !== 'string' || !section.section.trim() ||
      section.section.length > 80 || !Array.isArray(section.items) ||
      section.items.length < 1 || section.items.length > 30) return null;
    const items = [];
    for (const item of section.items) {
      if (typeof item?.name !== 'string' || !item.name.trim() || item.name.length > 120 ||
        typeof item.quantity !== 'string' || !item.quantity.trim() || item.quantity.length > 120 ||
        !['confirmed', 'assumed', 'need'].includes(item.have_status)) return null;
      const required = requireRetail && typeof item.required_quantity === 'string'
        ? item.required_quantity.trim() : null;
      const proposedNormalized = requireRetail ? normalizedAmount(item.normalized_quantity) : null;
      const normalized = proposedNormalized && required
        ? checkedNormalizedQuantity(required, proposedNormalized) : proposedNormalized;
      const retailTotal = requireRetail ? normalizedAmount(item.retail_total) : null;
      const nameKey = item.name.trim().toLocaleLowerCase();
      if (requireRetail && (typeof item.required_quantity !== 'string' || !required || required.length > 120 ||
        !normalized || !retailTotal || normalized.unit !== retailTotal.unit ||
        retailTotal.amount < normalized.amount || !retailDisplayMatchesTotal(item.quantity, retailTotal) ||
        retailNames.has(nameKey))) return null;
      if (requireRetail) retailNames.add(nameKey);
      count++;
      if (count > 100) return null;
      items.push({ id: crypto.randomUUID(), name: item.name.trim(), quantity: item.quantity.trim(),
        ...(requireRetail ? { required_quantity: required, normalized_quantity: normalized,
          retail_total: retailTotal } : {}),
        checked: item.have_status !== 'need', have_status: item.have_status });
    }
    sections.push({ section: section.section.trim(), items });
  }
  let fullPlan = null;
  if (value.full_plan !== undefined && value.full_plan !== null) {
    if (!Array.isArray(value.full_plan) || value.full_plan.length < 1 || value.full_plan.length > 14 ||
      value.full_plan.some(x => !x || typeof x.title !== 'string' || !x.title.trim() || x.title.length > 80 ||
        typeof x.directions !== 'string' || !x.directions.trim() || x.directions.length > 1400)) return null;
    fullPlan = value.full_plan.map(x => ({ title: x.title.trim(), directions: x.directions.trim() }));
    if (JSON.stringify(fullPlan).length > 10000) return null;
    if (typeof value.current_action !== 'string' || !value.current_action.trim() ||
      value.current_action.length > 1200) return null;
  }
  if (requireFullPlan && !fullPlan) return null;
  const plan = { meal: value.meal.trim(), servings: value.servings, sections };
  if (fullPlan) {
    plan.full_plan = fullPlan;
    plan.current_action = value.current_action.trim();
  }
  return updatePurchaseRequirements(priorPlan ? reconcileShopping(priorPlan, plan) : plan);
}

function quantitySignature(item) {
  return [item.quantity, item.required_quantity ?? '',
    item.normalized_quantity ? `${item.normalized_quantity.amount} ${item.normalized_quantity.unit}` : '']
    .map(value => value.trim().toLocaleLowerCase()).join('\u0000');
}

function shoppingKey(item) {
  return `${item.name.trim().toLocaleLowerCase()}\u0000${quantitySignature(item)}`;
}

export function reconcileShopping(prior, plan) {
  const existing = new Map();
  for (const section of prior?.sections ?? []) for (const item of section.items ?? []) {
    const key = shoppingKey(item);
    existing.set(key, [...(existing.get(key) ?? []), item]);
  }
  const oldQuantities = new Map();
  for (const section of prior?.sections ?? []) for (const item of section.items ?? [])
    oldQuantities.set(item.name.trim().toLocaleLowerCase(), quantitySignature(item));
  for (const section of plan.sections) for (const item of section.items) {
    const priorItem = existing.get(shoppingKey(item))?.shift();
    if (priorItem) {
      item.id = priorItem.id;
      if (priorItem.customer_edited || item.have_status === 'assumed') {
        item.checked = priorItem.checked;
        item.have_status = priorItem.have_status;
      }
      if (priorItem.customer_edited) item.customer_edited = true;
    } else if (oldQuantities.has(item.name.trim().toLocaleLowerCase()) &&
      oldQuantities.get(item.name.trim().toLocaleLowerCase()) !== quantitySignature(item)) {
      item.checked = false;
      item.have_status = 'need';
      item.quantity_changed = true;
    }
  }
  return updatePurchaseRequirements(plan);
}

export function planFromOutput(output, options = {}) {
  const calls = (output || []).filter(item => item.type === 'function_call' && item.name === MEAL_PLAN_TOOL.name);
  if (calls.length !== 1) return { plan: null, reason: calls.length ? 'MULTIPLE_PLAN_CALLS' : null, calls };
  const plan = normalizeMealPlan(calls[0].arguments, options);
  return { plan, reason: plan ? null : 'INVALID_PLAN_PROPOSAL', calls };
}
