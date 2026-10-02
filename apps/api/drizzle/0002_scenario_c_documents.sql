CREATE TABLE applications_scenario_c (
  id TEXT PRIMARY KEY NOT NULL,
  scenario_id TEXT NOT NULL CHECK (scenario_id IN ('scenario-a', 'scenario-b', 'scenario-c')),
  status TEXT NOT NULL CHECK (status IN ('documents_required', 'processing', 'needs_review', 'ready_to_submit', 'submitted', 'referred', 'offer_accepted', 'funded')),
  version INTEGER NOT NULL, snapshot TEXT NOT NULL, outcome_snapshot TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
INSERT INTO applications_scenario_c SELECT * FROM applications;
DROP TABLE applications;
ALTER TABLE applications_scenario_c RENAME TO applications;

CREATE TABLE documents (
  id TEXT PRIMARY KEY NOT NULL,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  source_hash TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  storage_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('bank_statement', 'drivers_licence', 'payslip')),
  issuer TEXT NOT NULL, period_start TEXT, period_end TEXT,
  status TEXT NOT NULL CHECK (status IN ('uploaded', 'processing', 'processed', 'needs_review')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(application_id, source_hash)
);
CREATE INDEX documents_application_id_idx ON documents(application_id);

CREATE TABLE document_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  check_name TEXT NOT NULL, status TEXT NOT NULL,
  details TEXT NOT NULL, data TEXT NOT NULL
);
CREATE INDEX document_checks_application_id_idx ON document_checks(application_id);

CREATE TABLE extracted_fields (
  id TEXT PRIMARY KEY NOT NULL,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL, raw_value TEXT NOT NULL, normalized_value TEXT,
  confidence TEXT NOT NULL, source_location TEXT NOT NULL,
  review_required INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE application_audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL, type TEXT NOT NULL, at TEXT NOT NULL,
  details TEXT NOT NULL,
  UNIQUE(application_id, sequence)
);
