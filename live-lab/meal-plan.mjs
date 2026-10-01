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

export function normalizeMealPlan(raw, { requireFullPlan = false, priorPlan = null } = {}) {
  let value;
  try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!value || typeof value !== 'object' || typeof value.meal !== 'string' ||
    !value.meal.trim() || value.meal.length > 400 || !Number.isInteger(value.servings) ||
    value.servings < 1 || value.servings > 100 || !Array.isArray(value.sections) ||
    value.sections.length < 1 || value.sections.length > 12) return null;
  const sections = [];
  let count = 0;
  for (const section of value.sections) {
    if (typeof section?.section !== 'string' || !section.section.trim() ||
      section.section.length > 80 || !Array.isArray(section.items) ||
      section.items.length < 1 || section.items.length > 30) return null;
    const items = [];
    for (const item of section.items) {
      if (typeof item?.name !== 'string' || !item.name.trim() || item.name.length > 120 ||
        typeof item.quantity !== 'string' || !item.quantity.trim() || item.quantity.length > 120 ||
        !['confirmed', 'assumed', 'need'].includes(item.have_status)) return null;
      count++;
      if (count > 100) return null;
      items.push({ id: crypto.randomUUID(), name: item.name.trim(), quantity: item.quantity.trim(),
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
  return priorPlan ? reconcileShopping(priorPlan, plan) : plan;
}

function shoppingKey(item) {
  return `${item.name.trim().toLocaleLowerCase()}\u0000${item.quantity.trim().toLocaleLowerCase()}`;
}

export function reconcileShopping(prior, plan) {
  const existing = new Map();
  for (const section of prior?.sections ?? []) for (const item of section.items ?? []) {
    const key = shoppingKey(item);
    existing.set(key, [...(existing.get(key) ?? []), item]);
  }
  const oldQuantities = new Map();
  for (const section of prior?.sections ?? []) for (const item of section.items ?? [])
    oldQuantities.set(item.name.trim().toLocaleLowerCase(), item.quantity.trim().toLocaleLowerCase());
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
      oldQuantities.get(item.name.trim().toLocaleLowerCase()) !== item.quantity.trim().toLocaleLowerCase()) {
      item.checked = false;
      item.have_status = 'need';
      item.quantity_changed = true;
    }
  }
  return plan;
}

export function planFromOutput(output, options = {}) {
  const calls = (output || []).filter(item => item.type === 'function_call' && item.name === MEAL_PLAN_TOOL.name);
  if (calls.length !== 1) return { plan: null, reason: calls.length ? 'MULTIPLE_PLAN_CALLS' : null, calls };
  const plan = normalizeMealPlan(calls[0].arguments, options);
  return { plan, reason: plan ? null : 'INVALID_PLAN_PROPOSAL', calls };
}
