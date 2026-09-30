-- Stage 1B isolated staging: current-meal cooking reports, separate from meal and shopping authority.
ALTER TABLE sessions ADD COLUMN cooking_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN cooking_progress_json TEXT;
ALTER TABLE voice_sessions ADD COLUMN meal_revision_snapshot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE voice_sessions ADD COLUMN cooking_revision_snapshot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE voice_sessions ADD COLUMN cooking_snapshot TEXT;
ALTER TABLE voice_sessions ADD COLUMN equipment_snapshot TEXT;
CREATE TABLE IF NOT EXISTS customer_equipment (
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('owned','not_owned')),
  source_session_id TEXT NOT NULL,
  source_turn_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (customer_id, name),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS customer_equipment_expiry ON customer_equipment(expires_at);
