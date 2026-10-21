-- Dedicated operations database only; never apply to application D1.
CREATE TABLE IF NOT EXISTS operational_alerts (
 id TEXT PRIMARY KEY, body_hash TEXT NOT NULL, code TEXT NOT NULL,
 severity TEXT NOT NULL, environment TEXT NOT NULL, version TEXT,
 occurred_at TEXT NOT NULL, received_at INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','accepted','failed')),
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL,
 lease_until INTEGER NOT NULL DEFAULT 0, accepted_at INTEGER, last_error TEXT
);
CREATE INDEX IF NOT EXISTS operational_alerts_due ON operational_alerts(state, next_attempt_at, lease_until);
