-- Stage 1B only: fence spoken meal proposals against newer shopping edits and
-- record when accepted objects actually reach the client. No customer audio.
ALTER TABLE voice_user_items ADD COLUMN shopping_revision_snapshot INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS client_render_metrics (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  source_turn_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('shopping_visible', 'now_visible', 'now_speech_delta_proxy')),
  revision INTEGER NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  UNIQUE(session_id, source_turn_id, kind),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
