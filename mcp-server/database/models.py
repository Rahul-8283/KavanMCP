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
    user_approved BOOLEAN
);
"""

CREATE_SYSTEM_BASELINES_TABLE = """
CREATE TABLE IF NOT EXISTS system_baselines (
    process_name TEXT PRIMARY KEY,
    avg_cpu_pct REAL,
    avg_memory_mb REAL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""
