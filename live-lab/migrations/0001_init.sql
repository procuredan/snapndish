CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  last_turn_id TEXT,
  customer_context TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  model_call_id TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS turns_session_time ON turns(session_id, created_at);

CREATE TABLE IF NOT EXISTS model_calls (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_turn_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  requested_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  requested_model TEXT NOT NULL,
  response_model TEXT,
  provider_response_id TEXT,
  behavior_version TEXT NOT NULL,
  context_version TEXT NOT NULL,
  reasoning_effort TEXT NOT NULL,
  customer_context_snapshot TEXT NOT NULL,
  memory_retrieved TEXT NOT NULL,
  tool_calls_json TEXT NOT NULL,
  first_text_ms INTEGER,
  first_useful_ms INTEGER,
  first_useful_excerpt TEXT,
  full_ms INTEGER,
  input_tokens INTEGER,
  cached_input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  estimated_usd REAL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  assistant_text TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS model_calls_session_time ON model_calls(session_id, requested_at);

CREATE TABLE IF NOT EXISTS state_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn_id TEXT,
  revision INTEGER NOT NULL,
  kind TEXT NOT NULL,
  at TEXT NOT NULL,
  details_json TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS state_events_session_time ON state_events(session_id, at);
