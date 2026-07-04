CREATE TABLE IF NOT EXISTS runners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  strava_connected INTEGER NOT NULL DEFAULT 0,
  strava_athlete_id INTEGER UNIQUE,
  scope TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS strava_tokens (
  runner_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (runner_id) REFERENCES runners(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  runner_id TEXT NOT NULL,
  source TEXT NOT NULL,
  strava_activity_id INTEGER UNIQUE,
  name TEXT,
  date TEXT NOT NULL,
  miles REAL NOT NULL,
  minutes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (runner_id) REFERENCES runners(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  runner_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (runner_id) REFERENCES runners(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_runs_runner_id ON runs(runner_id);
CREATE INDEX IF NOT EXISTS idx_runs_date ON runs(date);
