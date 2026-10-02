CREATE TABLE applications_next (
  id TEXT PRIMARY KEY NOT NULL,
  scenario_id TEXT NOT NULL CHECK (scenario_id IN ('scenario-a', 'scenario-b')),
  status TEXT NOT NULL CHECK (status IN ('ready_to_submit', 'submitted', 'referred', 'offer_accepted', 'funded')),
  version INTEGER NOT NULL, snapshot TEXT NOT NULL, outcome_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
INSERT INTO applications_next SELECT * FROM applications;
DROP TABLE applications;
ALTER TABLE applications_next RENAME TO applications;
CREATE TABLE application_corrections (
  id TEXT PRIMARY KEY NOT NULL,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK (field = 'loan.purposeDetail'),
  original_value TEXT NOT NULL, current_value TEXT NOT NULL,
  application_version INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX application_corrections_application_id_idx ON application_corrections(application_id);
