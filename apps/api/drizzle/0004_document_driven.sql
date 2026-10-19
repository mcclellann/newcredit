CREATE TABLE applications_document_driven (
  id TEXT PRIMARY KEY NOT NULL,
  scenario_id TEXT NOT NULL CHECK (scenario_id IN ('document-driven', 'scenario-a', 'scenario-b', 'scenario-c', 'scenario-h')),
  status TEXT NOT NULL CHECK (status IN ('documents_required', 'processing', 'needs_review', 'ready_to_submit', 'submitted', 'referred', 'not_approved', 'offer_accepted', 'funded')),
  version INTEGER NOT NULL, snapshot TEXT NOT NULL, outcome_snapshot TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
INSERT INTO applications_document_driven SELECT * FROM applications;
DROP TABLE applications;
ALTER TABLE applications_document_driven RENAME TO applications;

CREATE TABLE document_extractions (
  document_id TEXT PRIMARY KEY NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  parsed TEXT NOT NULL
);
