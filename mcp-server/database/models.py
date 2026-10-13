"""
Database schema definitions for the SQLite Audit Ledger.
We use raw SQL strings for speed and zero-dependency configuration.
"""

CREATE_AUDIT_LOG_TABLE = """
CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    process_name TEXT NOT NULL,
    pid INTEGER NOT NULL,
    executable_path TEXT,
    action_type TEXT NOT NULL, -- 'TERMINATED', 'BLOCKED', 'ROLLBACK'
    memory_freed_mb REAL,
    cpu_freed_pct REAL,
    llm_reasoning TEXT,
    user_approved BOOLEAN,
    command_line TEXT, -- JSON array of the original argv, used to relaunch on rollback
    tier INTEGER, -- TERMINATED rows: the tier the user confirmed. NULL for kills made before V2.1
    rolled_back_at DATETIME -- TERMINATED rows: when the kill was restored. NULL means not restored
);
"""

# Columns added after the first release. init_db adds any that an existing database lacks.
AUDIT_LOG_MIGRATIONS = {
    "command_line": "ALTER TABLE audit_log ADD COLUMN command_line TEXT",
    "tier": "ALTER TABLE audit_log ADD COLUMN tier INTEGER",
    "rolled_back_at": "ALTER TABLE audit_log ADD COLUMN rolled_back_at DATETIME",
}

CREATE_SYSTEM_BASELINES_TABLE = """
CREATE TABLE IF NOT EXISTS system_baselines (
    process_name TEXT PRIMARY KEY,
    avg_cpu_pct REAL,
    avg_memory_mb REAL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""

# One row per minute of system metrics. Timestamps are UTC text, like CURRENT_TIMESTAMP.
CREATE_METRICS_HISTORY_TABLE = """
CREATE TABLE IF NOT EXISTS metrics_history (
    minute DATETIME PRIMARY KEY, -- UTC, truncated to the minute
    cpu_avg REAL NOT NULL,
    cpu_max REAL NOT NULL,
    ram_avg REAL NOT NULL,
    ram_max REAL NOT NULL,
    disk_avg REAL NOT NULL,
    samples INTEGER NOT NULL -- number of samples behind this row; a full minute has 30
);
"""

# One row per alert episode: the whole time a metric stayed over its threshold.
CREATE_ALERT_EVENTS_TABLE = """
CREATE TABLE IF NOT EXISTS alert_events (
    id TEXT PRIMARY KEY,
    metric TEXT NOT NULL, -- 'cpu', 'ram', 'disk', 'process'
    level TEXT NOT NULL, -- 'warning' or 'critical': the highest reached
    threshold REAL NOT NULL, -- the limit in force when the episode started
    started_at DATETIME NOT NULL,
    ended_at DATETIME, -- NULL while the episode is open
    peak_value REAL NOT NULL,
    cpu_at_start REAL NOT NULL,
    ram_at_start REAL NOT NULL,
    disk_at_start REAL NOT NULL,
    top_process TEXT,
    top_process_pid INTEGER,
    top_process_value REAL, -- that process's CPU % or memory MB
    muted INTEGER NOT NULL DEFAULT 0
);
"""

CREATE_ALERT_EVENTS_INDEX = """
CREATE INDEX IF NOT EXISTS idx_alert_events_started ON alert_events (started_at);
"""
