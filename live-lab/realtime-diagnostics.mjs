const TOKEN = /^[a-z][a-z0-9_]{0,63}$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const FIELD = /^[A-Za-z_][A-Za-z0-9_.\[\]-]{0,159}$/;
const REQUEST_ID = /^req_[A-Za-z0-9_-]{1,120}$/;
const ERROR_TYPES = new Set(['invalid_request_error', 'authentication_error', 'permission_error',
  'rate_limit_error', 'api_error', 'server_error', 'not_found_error']);
const ERROR_CODES = new Set(['invalid_function_parameters', 'model_not_found', 'invalid_api_key',
  'invalid_request_error', 'invalid_value', 'invalid_type', 'unknown_parameter',
  'missing_required_parameter', 'unsupported_model', 'insufficient_quota',
  'rate_limit_exceeded', 'invalid_sdp', 'invalid_session', 'permission_denied',
  'not_found', 'bad_request']);
const CONFIG_FIELDS = new Set(['session', 'sdp', 'model', 'tools', 'audio', 'input', 'output',
  'instructions', 'output_modalities', 'tool_choice', 'transcription', 'turn_detection',
  'voice', 'type', 'name', 'description', 'parameters', 'properties', 'required',
  'additionalProperties', 'items', 'full_plan', 'sections', 'section', 'meal',
  'servings', 'quantity', 'have_status', 'current_action', 'remaining_components',
  'customer_report', 'equipment_change', 'title', 'directions', 'strict', 'format']);
const TOOL_NAMES = new Set(['publish_meal_plan', 'update_cooking_progress']);

function safeToken(value, allowlist) {
  return typeof value === 'string' && TOKEN.test(value) && allowlist.has(value) ? value : null;
}

function safeField(value) {
  if (typeof value !== 'string' || !FIELD.test(value)) return null;
  const names = value.replace(/\[\d+\]/g, '').split('.');
  return names.every(name => CONFIG_FIELDS.has(name)) ? value : null;
}

// Reconstruct only recognized provider diagnostics. Never persist an arbitrary
// upstream message, which could echo instructions, customer text, or a secret.
export function safeRealtimeMessage(value) {
  if (typeof value !== 'string' || value.length > 1024) return null;
  const schema = value.match(/^Invalid schema for function ['"]([A-Za-z_][A-Za-z0-9_]*)['"]: In context=\(([^)]{0,160})\), ['"]([A-Za-z_][A-Za-z0-9_]*)['"] is required to be supplied and to be false\.?$/);
  if (schema && IDENTIFIER.test(schema[1]) && TOOL_NAMES.has(schema[1]) &&
    IDENTIFIER.test(schema[3]) && CONFIG_FIELDS.has(schema[3]) &&
    /^(?:['"][A-Za-z_][A-Za-z0-9_]*['"],?\s*)*$/.test(schema[2]) &&
    [...schema[2].matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)].every(match => CONFIG_FIELDS.has(match[0])))
    return `Invalid schema for function ${schema[1]}: in context (${schema[2]}), ${schema[3]} is required to be false.`;
  const parameter = value.match(/^(Unknown parameter|Missing required parameter): ['"]?([A-Za-z_][A-Za-z0-9_.\[\]-]*)['"]?\.?$/);
  if (parameter && safeField(parameter[2])) return `${parameter[1]}: ${parameter[2]}.`;
  const invalid = value.match(/^Invalid (?:value|type) for ['"]([A-Za-z_][A-Za-z0-9_.\[\]-]*)['"]:/);
  if (invalid && safeField(invalid[1])) return `Invalid value or type for ${invalid[1]}.`;
  const model = value.match(/^(?:The )?model ['"]?([a-z][a-z0-9_.-]*)['"]? does not exist or you do not have access to it\.?$/i);
  if (model && ['gpt-realtime-2.1', 'gpt-live-transcribe'].includes(model[1]))
    return `Model ${model[1]} does not exist or is inaccessible.`;
  return null;
}

export async function realtimeFailureDiagnostic(response, configuration) {
  let provider = null;
  try {
    const body = await response.text();
    if (body.length <= 4096) provider = JSON.parse(body)?.error ?? null;
  } catch { /* Malformed or unavailable provider error is never persisted. */ }
  const schemas = await Promise.all((configuration.tools ?? []).map(async tool => {
    const bytes = new TextEncoder().encode(JSON.stringify(tool));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const fingerprint = Array.from(new Uint8Array(digest).slice(0, 8), b => b.toString(16).padStart(2, '0')).join('');
    return { name: tool.name, schema_fingerprint: fingerprint };
  }));
  return {
    diagnostic_version: 'realtime-init-v1',
    upstream_status: response.status,
    openai_error_type: safeToken(provider?.type, ERROR_TYPES),
    openai_error_code: safeToken(provider?.code, ERROR_CODES),
    openai_error_param: safeField(provider?.param),
    openai_error_message: safeRealtimeMessage(provider?.message),
    openai_request_id: REQUEST_ID.test(response.headers.get('x-request-id') ?? '')
      ? response.headers.get('x-request-id') : null,
    endpoint: '/v1/realtime/calls', session_type: 'realtime',
    model: configuration.model, behavior_version: configuration.behaviorVersion,
    voice: configuration.voice, transcription_model: configuration.transcriptionModel,
    turn_detection: configuration.turnDetection,
    tool_schemas: schemas,
    field_presence: {
      instructions: configuration.instructionsPresent,
      accepted_meal: configuration.acceptedMealPresent,
      transcript: configuration.transcriptPresent,
      customer_context: configuration.customerContextPresent,
      tools: schemas.length > 0,
      sdp: configuration.sdpPresent,
    },
  };
}
