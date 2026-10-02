// Allowlisted metadata only. Provider text, tool arguments and transcripts never enter this record.
const STAGES = new Set(['primary', 'repair']);
const STATUSES = new Set(['completed', 'incomplete', 'failed', 'unknown']);
const OUTPUT_TYPES = new Set(['message', 'function_call', 'reasoning']);
const TOOL_NAMES = new Set(['publish_meal_plan', 'update_cooking_progress']);
const VALIDATION_CODES = new Set(['PLAN_SECTION_COUNT', 'PLAN_TITLE_LENGTH',
  'PLAN_DIRECTIONS_LENGTH', 'PLAN_TOTAL_LENGTH', 'CURRENT_ACTION_LENGTH']);

function count(value) {
  return Number.isInteger(value) && value >= 0 && value <= 1_000_000 ? value : null;
}

export function boundedBridgeDiagnostic({ stage, response, requestId, httpStatus, validation, durationMs,
  outcome } = {}) {
  const status = STATUSES.has(response?.status) ? response.status : 'unknown';
  const output = Array.isArray(response?.output) ? response.output.slice(0, 12) : [];
  const field = validation?.field;
  const safeField = typeof field === 'string' &&
    (/^full_plan\[\d{1,2}\]\.(?:directions|title)$/.test(field) ||
      ['full_plan', 'current_action'].includes(field)) ? field : null;
  return {
    stage: STAGES.has(stage) ? stage : 'primary',
    status,
    response_id: typeof response?.id === 'string' && /^resp_[A-Za-z0-9_-]{1,120}$/.test(response.id)
      ? response.id : null,
    request_id: typeof requestId === 'string' && /^req_[A-Za-z0-9_-]{1,120}$/.test(requestId)
      ? requestId : null,
    incomplete_reason: response?.incomplete_details?.reason === 'max_output_tokens'
      ? 'max_output_tokens' : status === 'incomplete' ? 'other' : null,
    output: output.map(item => ({ type: OUTPUT_TYPES.has(item?.type) ? item.type : 'other',
      ...(TOOL_NAMES.has(item?.name) ? { tool: item.name } : {}) })),
    http_status: Number.isInteger(httpStatus) && httpStatus >= 400 && httpStatus <= 599 ? httpStatus : null,
    duration_ms: count(durationMs),
    outcome: ['accepted', 'rejected', 'http_error', 'bad_json', 'incomplete', 'no_usable_output']
      .includes(outcome) ? outcome : null,
    validation: VALIDATION_CODES.has(validation?.code) && safeField &&
      count(validation?.actual) !== null && count(validation?.max) !== null
      ? { code: validation.code, field: safeField, actual: validation.actual, max: validation.max } : null,
  };
}
