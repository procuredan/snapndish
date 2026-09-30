export const COOKING_PROGRESS_TOOL = {
  type: 'function',
  name: 'update_cooking_progress',
  description: 'Propose the next coherent cooking action and, only when the customer actually reported it in their latest message, a cooking-progress or equipment fact. The application decides whether this proposal becomes current state.',
  parameters: {
    type: 'object',
    properties: {
      current_action: { type: 'string', description: 'The one useful action or question for the customer now, with relevant quantities and checkpoint. Never a complete recipe.' },
      remaining_components: { type: ['array', 'null'], items: { type: 'string' }, description: 'Brief component names for the optional More view, not instructions. Use null if unchanged.' },
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

function supportedQuote(quote, latestUserText) {
  return typeof quote === 'string' && quote.trim().length > 0 && quote.length <= 300 &&
    latestUserText.toLocaleLowerCase().includes(quote.trim().toLocaleLowerCase());
}

function readinessOnly(quote) {
  return /^(?:let['’]?s cook|ready to cook|let['’]?s start|start cooking|begin cooking)[.!]?$/i.test(quote.trim());
}

export function normalizeCookingProposal(raw, latestUserText) {
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
  return { current_action: value.current_action.trim(), remaining_components: remaining,
    customer_report: report, equipment_change: equipment, ignored_fields: ignoredFields };
}

export function cookingFromOutput(output, latestUserText) {
  const calls = (output || []).filter(item => item.type === 'function_call' && item.name === COOKING_PROGRESS_TOOL.name);
  if (calls.length !== 1) return { cooking: null, reason: calls.length ? 'MULTIPLE_COOKING_CALLS' : null, calls };
  const cooking = normalizeCookingProposal(calls[0].arguments, latestUserText);
  return { cooking, reason: cooking ? null : 'INVALID_COOKING_PROPOSAL', calls };
}
