PRAGMA foreign_keys = ON;

CREATE TABLE demo_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE applications (
  id TEXT PRIMARY KEY NOT NULL,
  scenario_id TEXT NOT NULL CHECK (scenario_id = 'scenario-a'),
  status TEXT NOT NULL CHECK (status IN ('ready_to_submit', 'submitted', 'offer_accepted', 'funded')),
  version INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  outcome_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE offers (
  id TEXT PRIMARY KEY NOT NULL,
  application_id TEXT NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ready', 'accepted', 'funded')),
  snapshot TEXT NOT NULL
);

CREATE TABLE disbursements (
  id TEXT PRIMARY KEY NOT NULL,
  offer_id TEXT NOT NULL UNIQUE REFERENCES offers(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status = 'completed'),
  snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE idempotency_records (
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (operation, idempotency_key)
);
