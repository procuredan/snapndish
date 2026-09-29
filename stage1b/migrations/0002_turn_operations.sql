-- Stage 1B: one current attempt per accepted user turn. Lease expiry permits
-- recovery after an interrupted Worker while fencing the old attempt.
CREATE TABLE IF NOT EXISTS turn_operations (
  user_turn_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  current_call_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'error', 'stale_rejected')),
  lease_until TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS turn_operations_session ON turn_operations(session_id, revision);
