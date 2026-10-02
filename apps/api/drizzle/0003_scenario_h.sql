CREATE TABLE applications_scenario_h (
  id TEXT PRIMARY KEY NOT NULL,
  scenario_id TEXT NOT NULL CHECK (scenario_id IN ('scenario-a', 'scenario-b', 'scenario-c', 'scenario-h')),
  status TEXT NOT NULL CHECK (status IN ('documents_required', 'processing', 'needs_review', 'ready_to_submit', 'submitted', 'referred', 'not_approved', 'offer_accepted', 'funded')),
  version INTEGER NOT NULL, snapshot TEXT NOT NULL, outcome_snapshot TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
INSERT INTO applications_scenario_h SELECT * FROM applications;
DROP TABLE applications;
ALTER TABLE applications_scenario_h RENAME TO applications;
