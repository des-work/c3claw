-- A new semester database. Historical Heroku records are not imported here.
CREATE TABLE events (
  id TEXT PRIMARY KEY, team_id TEXT NOT NULL, timestamp TEXT NOT NULL,
  tool TEXT NOT NULL, target TEXT NOT NULL, result TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '', source_id TEXT UNIQUE
);
CREATE INDEX events_recent_idx ON events(timestamp DESC, id DESC);
CREATE TABLE team_status (
  team_id TEXT PRIMARY KEY, last_seen TEXT NOT NULL, last_action TEXT NOT NULL,
  event_count INTEGER NOT NULL, blocked_count INTEGER NOT NULL
);
-- Run inside the insert transaction. Retries cannot increment counters twice.
CREATE TRIGGER events_source_conflict BEFORE INSERT ON events
WHEN NEW.source_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM events WHERE source_id = NEW.source_id AND
    (team_id <> NEW.team_id OR tool <> NEW.tool OR target <> NEW.target
     OR result <> NEW.result OR details <> NEW.details)
)
BEGIN SELECT RAISE(ABORT, 'SOURCE_CONFLICT'); END;
CREATE TRIGGER events_summary AFTER INSERT ON events BEGIN
  INSERT INTO team_status(team_id, last_seen, last_action, event_count, blocked_count)
  VALUES(NEW.team_id, NEW.timestamp, NEW.tool || ' → ' || NEW.target || ' [' || NEW.result || ']',
    1, CASE WHEN UPPER(NEW.result) = 'BLOCKED' THEN 1 ELSE 0 END)
  ON CONFLICT(team_id) DO UPDATE SET
    event_count = team_status.event_count + 1,
    blocked_count = team_status.blocked_count + excluded.blocked_count,
    last_action = CASE WHEN excluded.last_seen >= team_status.last_seen
      THEN excluded.last_action ELSE team_status.last_action END,
    last_seen = MAX(team_status.last_seen, excluded.last_seen);
END;
CREATE TABLE machine_status (
  team_id TEXT NOT NULL, machine_id TEXT NOT NULL, label TEXT NOT NULL, zone TEXT NOT NULL,
  address TEXT, status TEXT NOT NULL, last_seen TEXT NOT NULL,
  PRIMARY KEY(team_id, machine_id)
);
CREATE TABLE discord_cursors (
  channel_id TEXT PRIMARY KEY, message_id TEXT NOT NULL,
  scan_head TEXT, scan_before TEXT, scan_complete INTEGER NOT NULL DEFAULT 0,
  last_attempt TEXT, last_success TEXT, last_error TEXT, retry_at INTEGER NOT NULL DEFAULT 0
);
-- Durable staging prevents a large gap from exceeding one scheduled invocation.
-- Padded keys preserve exact snowflake ordering without 64-bit number conversion.
CREATE TABLE discord_inbox (
  channel_id TEXT NOT NULL, message_key TEXT NOT NULL, payload TEXT NOT NULL,
  PRIMARY KEY(channel_id, message_key)
);
CREATE TABLE discord_rejections (
  message_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, reason TEXT NOT NULL,
  content TEXT NOT NULL, rejected_at TEXT NOT NULL
);
CREATE TABLE sync_state (source TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE sync_locks (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE enrollment_snapshots (
  source TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at TEXT NOT NULL
);
CREATE TABLE backend_sync_cursors (source TEXT PRIMARY KEY, last_id INTEGER NOT NULL DEFAULT 0);
