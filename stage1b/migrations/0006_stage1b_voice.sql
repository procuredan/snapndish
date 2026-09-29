-- One active spoken session per conversation; only text transcripts are durable.
ALTER TABLE sessions ADD COLUMN active_voice_id TEXT;
ALTER TABLE sessions ADD COLUMN active_voice_until TEXT;
ALTER TABLE turns ADD COLUMN source TEXT NOT NULL DEFAULT 'write';
ALTER TABLE turns ADD COLUMN provider_item_id TEXT;
ALTER TABLE model_calls ADD COLUMN modality_usage_json TEXT;

CREATE TABLE IF NOT EXISTS voice_sessions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  expires_at TEXT NOT NULL,
  provider_call_id TEXT,
  model TEXT NOT NULL,
  behavior_version TEXT NOT NULL,
  context_snapshot TEXT NOT NULL,
  meal_snapshot TEXT,
  transcript_snapshot TEXT NOT NULL,
  connect_ms INTEGER,
  error_code TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS voice_sessions_session ON voice_sessions(session_id, opened_at);

CREATE TABLE IF NOT EXISTS voice_user_items (
  voice_session_id TEXT NOT NULL,
  provider_item_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  transcription_usage_json TEXT,
  PRIMARY KEY (voice_session_id, provider_item_id),
  FOREIGN KEY (voice_session_id) REFERENCES voice_sessions(id)
);

CREATE TABLE IF NOT EXISTS voice_assistant_items (
  voice_session_id TEXT NOT NULL,
  provider_response_id TEXT NOT NULL,
  model_call_id TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (voice_session_id, provider_response_id),
  FOREIGN KEY (voice_session_id) REFERENCES voice_sessions(id)
);
