-- FiloSage Spark atomic monthly budget ledger for Cloudflare D1.
-- All amounts are integer microUSD. The admission trigger checks and reserves
-- funds in the same SQLite statement so concurrent Workers cannot overspend.

CREATE TABLE IF NOT EXISTS spark_month_budget (
  month_key TEXT PRIMARY KEY,
  configuration_version INTEGER NOT NULL DEFAULT 1 CHECK (configuration_version > 0),
  total_cap_microusd INTEGER NOT NULL CHECK (total_cap_microusd >= 0),
  fixed_reserve_microusd INTEGER NOT NULL CHECK (fixed_reserve_microusd >= 0),
  ai_cap_microusd INTEGER NOT NULL CHECK (ai_cap_microusd >= 0),
  infrastructure_reserve_microusd INTEGER NOT NULL CHECK (infrastructure_reserve_microusd >= 0),
  uncertainty_reserve_microusd INTEGER NOT NULL CHECK (uncertainty_reserve_microusd >= 0),
  committed_microusd INTEGER NOT NULL DEFAULT 0 CHECK (committed_microusd >= 0),
  reserved_microusd INTEGER NOT NULL DEFAULT 0 CHECK (reserved_microusd >= 0),
  unknown_microusd INTEGER NOT NULL DEFAULT 0 CHECK (unknown_microusd >= 0),
  mode TEXT NOT NULL DEFAULT 'practice_only' CHECK (mode IN ('live', 'conserve', 'practice_only', 'halted')),
  live_ai_enabled INTEGER NOT NULL DEFAULT 0 CHECK (live_ai_enabled IN (0, 1)),
  preparation_enabled INTEGER NOT NULL DEFAULT 0 CHECK (preparation_enabled IN (0, 1)),
  concurrency_limit INTEGER NOT NULL DEFAULT 4 CHECK (concurrency_limit BETWEEN 1 AND 16),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (fixed_reserve_microusd + ai_cap_microusd + infrastructure_reserve_microusd + uncertainty_reserve_microusd <= total_cap_microusd)
);

CREATE TABLE IF NOT EXISTS spark_budget_category (
  month_key TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('tutoring', 'preparation', 'assessment', 'summary', 'embedding')),
  cap_microusd INTEGER NOT NULL CHECK (cap_microusd >= 0),
  committed_microusd INTEGER NOT NULL DEFAULT 0 CHECK (committed_microusd >= 0),
  reserved_microusd INTEGER NOT NULL DEFAULT 0 CHECK (reserved_microusd >= 0),
  unknown_microusd INTEGER NOT NULL DEFAULT 0 CHECK (unknown_microusd >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (month_key, category),
  FOREIGN KEY (month_key) REFERENCES spark_month_budget(month_key) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS spark_usage_reservation (
  request_id TEXT PRIMARY KEY,
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  month_key TEXT NOT NULL,
  category TEXT NOT NULL,
  owner_pseudonym TEXT NOT NULL,
  session_id TEXT,
  payload_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  price_version TEXT NOT NULL,
  reserved_microusd INTEGER NOT NULL CHECK (reserved_microusd > 0),
  actual_microusd INTEGER CHECK (actual_microusd >= 0),
  input_tokens INTEGER CHECK (input_tokens >= 0),
  cached_input_tokens INTEGER CHECK (cached_input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens >= 0),
  response_id TEXT,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'dispatched', 'committed', 'unknown', 'released')),
  created_at TEXT NOT NULL,
  dispatched_at TEXT,
  settled_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (month_key, category) REFERENCES spark_budget_category(month_key, category) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS spark_budget_audit (
  id TEXT PRIMARY KEY,
  month_key TEXT NOT NULL,
  actor_pseudonym TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (month_key) REFERENCES spark_month_budget(month_key) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS spark_usage_month_status_idx
  ON spark_usage_reservation (month_key, status, created_at);
CREATE INDEX IF NOT EXISTS spark_usage_owner_month_idx
  ON spark_usage_reservation (owner_pseudonym, month_key, created_at);
CREATE INDEX IF NOT EXISTS spark_usage_session_status_idx
  ON spark_usage_reservation (session_id, status);

CREATE TRIGGER IF NOT EXISTS spark_month_configuration_guard
BEFORE UPDATE OF ai_cap_microusd, concurrency_limit ON spark_month_budget
BEGIN
  SELECT CASE WHEN NEW.ai_cap_microusd < OLD.committed_microusd + OLD.reserved_microusd + OLD.unknown_microusd
    THEN RAISE(ABORT, 'SPARK_CAP_BELOW_EXPOSURE') END;
  SELECT CASE WHEN NEW.fixed_reserve_microusd + NEW.ai_cap_microusd + NEW.infrastructure_reserve_microusd + NEW.uncertainty_reserve_microusd > NEW.total_cap_microusd
    THEN RAISE(ABORT, 'SPARK_TOTAL_LIMIT') END;
END;

CREATE TRIGGER IF NOT EXISTS spark_category_configuration_guard
BEFORE UPDATE OF cap_microusd ON spark_budget_category
BEGIN
  SELECT CASE WHEN NEW.cap_microusd < OLD.committed_microusd + OLD.reserved_microusd + OLD.unknown_microusd
    THEN RAISE(ABORT, 'SPARK_CAP_BELOW_EXPOSURE') END;
END;

CREATE TRIGGER IF NOT EXISTS spark_usage_admit
BEFORE INSERT ON spark_usage_reservation
BEGIN
  SELECT CASE WHEN NEW.status <> 'reserved'
    THEN RAISE(ABORT, 'SPARK_INVALID_INITIAL_STATUS') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM spark_month_budget
    WHERE month_key = NEW.month_key AND mode IN ('live', 'conserve') AND live_ai_enabled = 1
  ) THEN RAISE(ABORT, 'SPARK_BUDGET_UNAVAILABLE') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM spark_budget_category
    WHERE month_key = NEW.month_key AND category = NEW.category
  ) THEN RAISE(ABORT, 'SPARK_CATEGORY_UNAVAILABLE') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM spark_month_budget
    WHERE month_key = NEW.month_key
      AND committed_microusd + reserved_microusd + unknown_microusd + NEW.reserved_microusd > ai_cap_microusd
  ) THEN RAISE(ABORT, 'SPARK_AI_LIMIT') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM spark_budget_category
    WHERE month_key = NEW.month_key AND category = NEW.category
      AND committed_microusd + reserved_microusd + unknown_microusd + NEW.reserved_microusd > cap_microusd
  ) THEN RAISE(ABORT, 'SPARK_CATEGORY_LIMIT') END;
  SELECT CASE WHEN NEW.session_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM spark_usage_reservation
    WHERE session_id = NEW.session_id AND status IN ('reserved', 'dispatched')
  ) THEN RAISE(ABORT, 'SPARK_SESSION_BUSY') END;
  UPDATE spark_month_budget
    SET reserved_microusd = reserved_microusd + NEW.reserved_microusd,
        updated_at = NEW.updated_at
    WHERE month_key = NEW.month_key;
  UPDATE spark_budget_category
    SET reserved_microusd = reserved_microusd + NEW.reserved_microusd,
        updated_at = NEW.updated_at
    WHERE month_key = NEW.month_key AND category = NEW.category;
END;

CREATE TRIGGER IF NOT EXISTS spark_usage_transition_guard
BEFORE UPDATE ON spark_usage_reservation
BEGIN
  SELECT CASE WHEN OLD.request_id IS NOT NEW.request_id
    OR OLD.attempt_number IS NOT NEW.attempt_number
    OR OLD.month_key IS NOT NEW.month_key
    OR OLD.category IS NOT NEW.category
    OR OLD.owner_pseudonym IS NOT NEW.owner_pseudonym
    OR OLD.session_id IS NOT NEW.session_id
    OR OLD.payload_hash IS NOT NEW.payload_hash
    OR OLD.provider IS NOT NEW.provider
    OR OLD.model IS NOT NEW.model
    OR OLD.price_version IS NOT NEW.price_version
    OR OLD.reserved_microusd IS NOT NEW.reserved_microusd
    THEN RAISE(ABORT, 'SPARK_RESERVATION_IMMUTABLE') END;
  SELECT CASE WHEN NOT (
    (OLD.status = 'reserved' AND NEW.status IN ('dispatched', 'released'))
    OR (OLD.status = 'dispatched' AND NEW.status IN ('committed', 'unknown'))
    OR (OLD.status = 'unknown' AND NEW.status = 'committed')
  ) THEN RAISE(ABORT, 'SPARK_INVALID_TRANSITION') END;
  SELECT CASE WHEN NEW.status = 'committed' AND (
    NEW.actual_microusd IS NULL
    OR NEW.input_tokens IS NULL
    OR NEW.cached_input_tokens IS NULL
    OR NEW.output_tokens IS NULL
  ) THEN RAISE(ABORT, 'SPARK_USAGE_REQUIRED') END;
  SELECT CASE WHEN NEW.status <> 'committed' AND NEW.actual_microusd IS NOT NULL
    THEN RAISE(ABORT, 'SPARK_USAGE_NOT_SETTLED') END;
  SELECT CASE WHEN OLD.status = 'reserved' AND NEW.status = 'dispatched' AND (
    SELECT count(*) FROM spark_usage_reservation
    WHERE month_key = NEW.month_key AND status = 'dispatched'
  ) >= (SELECT concurrency_limit FROM spark_month_budget WHERE month_key = NEW.month_key)
    THEN RAISE(ABORT, 'SPARK_CONCURRENCY_LIMIT') END;
END;

CREATE TRIGGER IF NOT EXISTS spark_usage_commit_reserved
AFTER UPDATE OF status ON spark_usage_reservation
WHEN OLD.status = 'dispatched' AND NEW.status = 'committed'
BEGIN
  UPDATE spark_month_budget SET
    reserved_microusd = reserved_microusd - OLD.reserved_microusd,
    committed_microusd = committed_microusd + NEW.actual_microusd,
    mode = CASE WHEN NEW.actual_microusd > OLD.reserved_microusd THEN 'halted' ELSE mode END,
    updated_at = NEW.updated_at
    WHERE month_key = NEW.month_key;
  UPDATE spark_budget_category SET
    reserved_microusd = reserved_microusd - OLD.reserved_microusd,
    committed_microusd = committed_microusd + NEW.actual_microusd,
    updated_at = NEW.updated_at
    WHERE month_key = NEW.month_key AND category = NEW.category;
END;

CREATE TRIGGER IF NOT EXISTS spark_usage_mark_unknown
AFTER UPDATE OF status ON spark_usage_reservation
WHEN OLD.status = 'dispatched' AND NEW.status = 'unknown'
BEGIN
  UPDATE spark_month_budget SET
    reserved_microusd = reserved_microusd - OLD.reserved_microusd,
    unknown_microusd = unknown_microusd + OLD.reserved_microusd,
    updated_at = NEW.updated_at
    WHERE month_key = NEW.month_key;
  UPDATE spark_budget_category SET
    reserved_microusd = reserved_microusd - OLD.reserved_microusd,
    unknown_microusd = unknown_microusd + OLD.reserved_microusd,
    updated_at = NEW.updated_at
    WHERE month_key = NEW.month_key AND category = NEW.category;
END;

CREATE TRIGGER IF NOT EXISTS spark_usage_release_reserved
AFTER UPDATE OF status ON spark_usage_reservation
WHEN OLD.status = 'reserved' AND NEW.status = 'released'
BEGIN
  UPDATE spark_month_budget SET
    reserved_microusd = reserved_microusd - OLD.reserved_microusd,
    updated_at = NEW.updated_at
    WHERE month_key = NEW.month_key;
  UPDATE spark_budget_category SET
    reserved_microusd = reserved_microusd - OLD.reserved_microusd,
    updated_at = NEW.updated_at
    WHERE month_key = NEW.month_key AND category = NEW.category;
END;

CREATE TRIGGER IF NOT EXISTS spark_usage_reconcile_unknown
AFTER UPDATE OF status ON spark_usage_reservation
WHEN OLD.status = 'unknown' AND NEW.status = 'committed'
BEGIN
  UPDATE spark_month_budget SET
    unknown_microusd = unknown_microusd - OLD.reserved_microusd,
    committed_microusd = committed_microusd + NEW.actual_microusd,
    mode = CASE WHEN NEW.actual_microusd > OLD.reserved_microusd THEN 'halted' ELSE mode END,
    updated_at = NEW.updated_at
    WHERE month_key = NEW.month_key;
  UPDATE spark_budget_category SET
    unknown_microusd = unknown_microusd - OLD.reserved_microusd,
    committed_microusd = committed_microusd + NEW.actual_microusd,
    updated_at = NEW.updated_at
    WHERE month_key = NEW.month_key AND category = NEW.category;
END;