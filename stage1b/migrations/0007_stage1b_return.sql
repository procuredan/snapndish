-- One permissioned Web Push return experiment, bound to the existing customer.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE INDEX IF NOT EXISTS push_subscriptions_customer ON push_subscriptions(customer_id);

CREATE TABLE IF NOT EXISTS return_reminders (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  push_accepted_at TEXT,
  displayed_at TEXT,
  clicked_at TEXT,
  error_code TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS return_reminders_due ON return_reminders(status,due_at);
