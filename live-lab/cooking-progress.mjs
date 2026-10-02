export const COOKING_PROGRESS_TOOL = {
  type: 'function',
  name: 'update_cooking_progress',
  description: 'Propose the next coherent cooking action and, only when the customer actually reported it in their latest message, a cooking-progress or equipment fact. The application decides whether this proposal becomes current state.',
  parameters: {
    type: 'object',
    properties: {
      current_action: { type: 'string', description: 'The one useful action or question for the customer now, with relevant quantities and checkpoint. Never a complete recipe.' },
      remaining_components: { type: ['array', 'null'], items: { type: 'string' }, description: 'JSON ARRAY of brief component names for the optional More view, never a prose string. Use null if unchanged.' },
      customer_report: { type: ['object', 'null'], description: 'Null unless the latest customer message reports a cooking outcome, problem, or completed/started action. Readiness to cook is not progress.', properties: {
        quote: { type: 'string', description: 'Exact words from the latest customer message supporting this progress update.' },
        understood_as: { type: 'string', description: 'What the customer reports actually happened; do not infer completion from Snap instructions.' },
      }, required: ['quote', 'understood_as'], additionalProperties: false },
      equipment_change: { type: ['object', 'null'], description: 'Null unless the latest customer message explicitly names equipment they own or corrects ownership. Never copy older facts.', properties: {
        name: { type: 'string', description: 'Free-form equipment name explicitly reported by the customer.' },
        status: { type: 'string', enum: ['owned', 'not_owned'], description: 'The customer says they have it or corrects that they do not.' },
        quote: { type: 'string', description: 'Exact words from the latest customer message supporting ownership.' },
      }, required: ['name', 'status', 'quote'], additionalProperties: false },
    }, required: ['current_action', 'remaining_components', 'customer_report', 'equipment_change'], additionalProperties: false,
  },
};

export const COOKING_PROGRESS_TOOL_V2 = {
  ...COOKING_PROGRESS_TOOL,
  strict: true,
  description: 'Propose the complete coordinated cooking plan for the visual Full Plan view and the useful Now section. Reports of physical progress require explicit customer evidence. The application decides what becomes current state.',
  parameters: {
    ...COOKING_PROGRESS_TOOL.parameters,
    properties: {
      ...COOKING_PROGRESS_TOOL.parameters.properties,
      current_action: { type: 'string', description: 'Useful Now guidance or a material question. May group compatible preparation actions; never require acknowledgements for routine actions. Not evidence that they happened.' },
      full_plan: { type: ['array', 'null'], description: 'JSON ARRAY of section objects, never a prose string. Complete coordinated cooking plan for every component, in free-form named sections, for visual display. Required when cooking first starts; null on later turns unless the plan materially changes. Do not read it aloud.', items: {
        type: 'object', properties: {
          title: { type: 'string', description: 'Short free-form component or section name.' },
          directions: { type: 'string', description: 'Usable quantities, technique, and dependencies for this section. No mandatory check-in after routine work.' },
        }, required: ['title', 'directions'], additionalProperties: false,
      } },
    },
    required: [...COOKING_PROGRESS_TOOL.parameters.required, 'full_plan'],
  },
};

export const COOKING_PROGRESS_TOOL_V51 = structuredClone(COOKING_PROGRESS_TOOL_V2);
COOKING_PROGRESS_TOOL_V51.parameters.properties.full_plan.description +=
  ' V5.1 application acceptance maxima for an exact accepted-plan echo: 1–14 sections, 2,000 characters per directions and 10,000 serialized characters for the complete plan. A changed plan requires publish_meal_plan.';
COOKING_PROGRESS_TOOL_V51.parameters.properties.full_plan.items.properties.title.description =
  'Application acceptance maximum: 80 characters.';
COOKING_PROGRESS_TOOL_V51.parameters.properties.current_action.description +=
  ' Application acceptance maximum: 1,200 characters.';

function supportedQuote(quote, latestUserText) {
  return typeof quote === 'string' && quote.trim().length > 0 && quote.length <= 300 &&
    latestUserText.toLocaleLowerCase().includes(quote.trim().toLocaleLowerCase());
}

function readinessOnly(quote) {
  return /^(?:let['’]?s cook|ready to cook|let['’]?s start|start cooking|begin cooking)[.!]?$/i.test(quote.trim());
}

export function normalizeCookingProposal(raw, latestUserText, requireFullPlan = false,
  { maxDirectionsLength = 1400, maxPlanLength = 7000, minSections = 2, maxSections = 10 } = {}) {
  let value;
  try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!value || typeof value !== 'object' || typeof value.current_action !== 'string' ||
    !value.current_action.trim() || value.current_action.length > 1200) return null;
  let remaining = null;
  if (value.remaining_components !== undefined && value.remaining_components !== null) {
    if (!Array.isArray(value.remaining_components) || value.remaining_components.length > 12 ||
      value.remaining_components.some(x => typeof x !== 'string' || !x.trim() || x.length > 100)) return null;
    remaining = value.remaining_components.map(x => x.trim());
  }
  let fullPlan = null;
  if (value.full_plan !== undefined && value.full_plan !== null) {
    if (!Array.isArray(value.full_plan) || value.full_plan.length < minSections || value.full_plan.length > maxSections ||
      value.full_plan.some(x => !x || typeof x.title !== 'string' || !x.title.trim() || x.title.length > 80 ||
        typeof x.directions !== 'string' || !x.directions.trim() || x.directions.length > maxDirectionsLength)) return null;
    fullPlan = value.full_plan.map(x => ({ title: x.title.trim(), directions: x.directions.trim() }));
    if (JSON.stringify(fullPlan).length > maxPlanLength) return null;
  }
  if (requireFullPlan && !fullPlan) return null;
  const ignoredFields = [];
  let report = null;
  if (value.customer_report !== undefined && value.customer_report !== null) {
    const r = value.customer_report;
    if (!supportedQuote(r?.quote, latestUserText) || readinessOnly(r.quote) || typeof r.understood_as !== 'string' ||
      !r.understood_as.trim() || r.understood_as.length > 240) ignoredFields.push('customer_report');
    else report = { quote: r.quote.trim(), understood_as: r.understood_as.trim() };
  }
  let equipment = null;
  if (value.equipment_change !== undefined && value.equipment_change !== null) {
    const e = value.equipment_change;
    if (!supportedQuote(e?.quote, latestUserText) || typeof e.name !== 'string' ||
      !e.name.trim() || e.name.length > 80 || !['owned', 'not_owned'].includes(e.status) ||
      !e.quote.toLocaleLowerCase().includes(e.name.trim().toLocaleLowerCase())) ignoredFields.push('equipment_change');
    else equipment = { name: e.name.trim(), status: e.status, quote: e.quote.trim() };
  }
  return { current_action: value.current_action.trim(), remaining_components: remaining, full_plan: fullPlan,
    customer_report: report, equipment_change: equipment, ignored_fields: ignoredFields };
}

export function cookingFromOutput(output, latestUserText, requireFullPlan = false, options = {}) {
  const calls = (output || []).filter(item => item.type === 'function_call' && item.name === COOKING_PROGRESS_TOOL.name);
  if (calls.length !== 1) return { cooking: null, reason: calls.length ? 'MULTIPLE_COOKING_CALLS' : null, calls };
  let candidate;
  try { candidate = JSON.parse(calls[0].arguments); }
  catch { return { cooking: null, reason: 'COOKING_ARGUMENTS_NOT_JSON', calls }; }
  const shapeErrors = [];
  if (candidate?.full_plan != null && !Array.isArray(candidate.full_plan))
    shapeErrors.push('full_plan must be an array of {title,directions} sections');
  if (candidate?.remaining_components != null && !Array.isArray(candidate.remaining_components))
    shapeErrors.push('remaining_components must be an array of component names');
  if (shapeErrors.length) return { cooking: null, reason: shapeErrors.join('; '), calls };
  const cooking = normalizeCookingProposal(calls[0].arguments, latestUserText, requireFullPlan, options);
  return { cooking, reason: cooking ? null : requireFullPlan && !candidate?.full_plan
    ? 'full_plan is required when cooking first starts' : 'INVALID_COOKING_PROPOSAL', calls };
}
