CREATE TABLE IF NOT EXISTS hook_state (
  session_key TEXT PRIMARY KEY,
  offset INTEGER NOT NULL DEFAULT 0,
  attempts_total INTEGER NOT NULL DEFAULT 0,
  attempts_rate_limit INTEGER NOT NULL DEFAULT 0,
  attempts_overload INTEGER NOT NULL DEFAULT 0,
  attempts_usage_limit INTEGER NOT NULL DEFAULT 0,
  last_processed_turn_id TEXT NOT NULL DEFAULT '',
  transcript_prefix_hash TEXT NOT NULL DEFAULT '',
  migrated_from_json INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stop_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  session_key TEXT NOT NULL,
  turn_id TEXT,
  model TEXT,
  cwd TEXT,
  transcript_present INTEGER NOT NULL DEFAULT 0,
  matched_kind TEXT NOT NULL,
  decision TEXT NOT NULL,
  attempts_total_after INTEGER NOT NULL DEFAULT 0,
  attempts_kind_after INTEGER NOT NULL DEFAULT 0,
  exhausted INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_stop_events_occurred_at ON stop_events(occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_stop_events_session_key ON stop_events(session_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_stop_events_kind ON stop_events(matched_kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_stop_events_decision ON stop_events(decision, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_stop_events_model ON stop_events(model, occurred_at DESC);
