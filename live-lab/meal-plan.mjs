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

export function normalizeMealPlan(raw) {
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
  return { meal: value.meal.trim(), servings: value.servings, sections };
}

export function planFromOutput(output) {
  const calls = (output || []).filter(item => item.type === 'function_call' && item.name === MEAL_PLAN_TOOL.name);
  if (calls.length !== 1) return { plan: null, reason: calls.length ? 'MULTIPLE_PLAN_CALLS' : null, calls };
  const plan = normalizeMealPlan(calls[0].arguments);
  return { plan, reason: plan ? null : 'INVALID_PLAN_PROPOSAL', calls };
}
