BEGIN;

CREATE TABLE IF NOT EXISTS budget_users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(40) NOT NULL CHECK (role IN ('superadmin', 'department_supervisor')),
  department_id VARCHAR(64),
  department_name_snapshot TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT budget_users_department_required
    CHECK (role = 'superadmin' OR NULLIF(BTRIM(department_id), '') IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS budget_sessions (
  id BIGSERIAL PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id BIGINT NOT NULL REFERENCES budget_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_budget_sessions_expiry ON budget_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_budget_sessions_user ON budget_sessions(user_id);

COMMIT;
