-- Stage 1B image evidence. Only metadata-stripped JPEG derivatives enter R2.
ALTER TABLE turns ADD COLUMN image_id TEXT;
ALTER TABLE model_calls ADD COLUMN image_ids_json TEXT NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS images_session ON images(session_id, created_at);
CREATE INDEX IF NOT EXISTS images_expiry ON images(expires_at);
