PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  project_area TEXT,
  status TEXT,
  confidence REAL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
CREATE INDEX IF NOT EXISTS idx_events_project_area ON events(project_area);

CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  fact_type TEXT NOT NULL,
  content TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('short_term','long_term','audit')),
  source_event_id TEXT,
  valid_from TEXT,
  valid_to TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(source_event_id) REFERENCES events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_facts_type ON facts(fact_type);
CREATE INDEX IF NOT EXISTS idx_facts_scope ON facts(scope);
CREATE INDEX IF NOT EXISTS idx_facts_active ON facts(is_active);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  path TEXT NOT NULL,
  artifact_type TEXT NOT NULL CHECK(artifact_type IN ('file','dir','commit','doc','link','other')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artifacts_event_id ON artifacts(event_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_path ON artifacts(path);

CREATE TABLE IF NOT EXISTS risks (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  mitigation TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','accepted','mitigated','closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_risks_severity ON risks(severity);
CREATE INDEX IF NOT EXISTS idx_risks_status ON risks(status);
CREATE INDEX IF NOT EXISTS idx_risks_category ON risks(category);

CREATE TABLE IF NOT EXISTS daily_summaries (
  summary_date TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  key_changes TEXT NOT NULL DEFAULT '[]',
  open_risks TEXT NOT NULL DEFAULT '[]',
  next_actions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
  id UNINDEXED,
  title,
  content,
  tags,
  project_area,
  content=''
);
