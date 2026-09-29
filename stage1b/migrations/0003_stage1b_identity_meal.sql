-- Stage 1B isolated staging: temporary customer/device link and one accepted meal pointer.
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
ALTER TABLE sessions ADD COLUMN customer_id TEXT;
ALTER TABLE sessions ADD COLUMN meal_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN meal_source_turn_id TEXT;
ALTER TABLE sessions ADD COLUMN meal_accepted_at TEXT;
CREATE INDEX IF NOT EXISTS sessions_customer_updated ON sessions(customer_id, updated_at);

CREATE TABLE IF NOT EXISTS pairing_links (
  code_hash TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS pairing_links_expiry ON pairing_links(expires_at);
