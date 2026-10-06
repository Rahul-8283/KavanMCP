import os
import uuid
from contextlib import asynccontextmanager

import aiosqlite

from database.models import (
    AUDIT_LOG_MIGRATIONS,
    CREATE_ALERT_EVENTS_INDEX,
    CREATE_ALERT_EVENTS_TABLE,
    CREATE_AUDIT_LOG_TABLE,
    CREATE_METRICS_HISTORY_TABLE,
    CREATE_SYSTEM_BASELINES_TABLE,
)
from utils.logger import logger

# Resolve the absolute path to the data directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "process.db")

# How long a writer waits for another connection's lock before giving up. The Tauri backend
# and Claude's own server process share this file, so writers must queue rather than fail.
BUSY_TIMEOUT_SECONDS = 30


@asynccontextmanager
async def _connect():
    """Opens a connection configured for concurrent use of the shared audit database."""
    async with aiosqlite.connect(DB_PATH, timeout=BUSY_TIMEOUT_SECONDS) as db:
        # With WAL, NORMAL stays crash-consistent and avoids an fsync on every commit,
        # which is what made bursts of writes exceed the busy timeout.
        await db.execute("PRAGMA synchronous=NORMAL")
        yield db

async def init_db():
    """
    Asynchronously initializes the SQLite database and creates necessary tables.
    """
    try:
        # Ensure the data directory exists
        os.makedirs(DATA_DIR, exist_ok=True)
        
        # Connect to the SQLite database (creates it if it doesn't exist)
        async with _connect() as db:
            await db.execute("PRAGMA journal_mode=WAL")
            await db.execute(CREATE_AUDIT_LOG_TABLE)
            await db.execute(CREATE_SYSTEM_BASELINES_TABLE)
            await db.execute(CREATE_METRICS_HISTORY_TABLE)
            await db.execute(CREATE_ALERT_EVENTS_TABLE)
            await db.execute(CREATE_ALERT_EVENTS_INDEX)

            # Bring a database created by an older version up to the current schema
            async with db.execute("PRAGMA table_info(audit_log)") as cursor:
                existing = {row[1] async for row in cursor}
            for column, statement in AUDIT_LOG_MIGRATIONS.items():
                if column not in existing:
                    await db.execute(statement)
            await db.commit()
            
        logger.info(f"Database successfully initialized at {DB_PATH}")
    except Exception as e:
        logger.critical(f"FATAL: Failed to initialize SQLite database: {e}")
        raise

# when a process is successfully killed
async def log_termination(process_name: str, pid: int, path: str, mem_mb: float, cpu_pct: float, reasoning: str,
                          command_line: str | None = None) -> None:
    """Logs a process termination event. command_line is the JSON-encoded argv, kept for rollback."""
    try:
        async with _connect() as db:
            await db.execute(
                "INSERT INTO audit_log (id, process_name, pid, executable_path, action_type, memory_freed_mb, cpu_freed_pct, llm_reasoning, user_approved, command_line) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), process_name, pid, path, 'TERMINATED', mem_mb, cpu_pct, reasoning, True, command_line)
            )
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to log termination for {process_name}: {e}")

# when LLM makes a mistakes to kill a high level Tier 1 running process
async def log_blocked_action(process_name: str, pid: int, reasoning: str) -> None:
    """Logs a blocked action event (e.g., trying to kill Tier 1 apps)."""
    try:
        async with _connect() as db:
            await db.execute(
                "INSERT INTO audit_log (id, process_name, pid, action_type, llm_reasoning, user_approved) VALUES (?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), process_name, pid, 'BLOCKED', reasoning, False)
            )
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to log blocked action for {process_name}: {e}")

async def get_last_terminated_process(pid_or_name: str) -> dict:
    """Finds the most recent terminated process matching a PID or name."""
    try:
        async with _connect() as db:
            db.row_factory = aiosqlite.Row
            
            if pid_or_name.isdigit():
                query = "SELECT * FROM audit_log WHERE action_type = 'TERMINATED' AND pid = ? ORDER BY timestamp DESC LIMIT 1"
                params = (int(pid_or_name),)
            else:
                query = "SELECT * FROM audit_log WHERE action_type = 'TERMINATED' AND process_name = ? COLLATE NOCASE ORDER BY timestamp DESC LIMIT 1"
                params = (pid_or_name,)
                
            async with db.execute(query, params) as cursor:
                row = await cursor.fetchone()
                if row:
                    return dict(row)
    except Exception as e:
        logger.error(f"Failed to query last terminated process for {pid_or_name}: {e}")
    return {}

async def log_rollback(process_name: str, pid: int, executable_path: str) -> None:
    """Logs a rollback event into the audit database. pid is the relaunched process."""
    try:
        async with _connect() as db:
            await db.execute(
                "INSERT INTO audit_log (id, process_name, pid, executable_path, action_type, user_approved) VALUES (?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), process_name, pid, executable_path, 'ROLLBACK', True)
            )
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to log rollback for {process_name}: {e}")

async def get_recent_logs(limit: int = 50, hours_back: float | None = None) -> list[dict]:
    """
    Retrieves the most recent audit logs as a list of dictionaries.
    hours_back restricts the result to that time window before the limit is applied.
    """
    logs = []
    query = "SELECT * FROM audit_log"
    params: tuple = ()
    if hours_back is not None:
        # timestamp is stored by SQLite's CURRENT_TIMESTAMP, which is UTC like datetime('now')
        query += " WHERE timestamp >= datetime('now', ?)"
        params = (f"-{hours_back} hours",)
    query += " ORDER BY timestamp DESC LIMIT ?"
    try:
        async with _connect() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(query, (*params, limit)) as cursor:
                async for row in cursor:
                    logs.append(dict(row))
    except Exception as e:
        logger.error(f"Failed to fetch recent logs: {e}")
    return logs

# A restart in the middle of a minute produces a second partial row for the same key,
# so the write merges with what is stored: weighted averages, larger peaks, summed samples.
RECORD_METRICS_MINUTE = """
INSERT INTO metrics_history (minute, cpu_avg, cpu_max, ram_avg, ram_max, disk_avg, samples)
VALUES (:minute, :cpu_avg, :cpu_max, :ram_avg, :ram_max, :disk_avg, :samples)
ON CONFLICT(minute) DO UPDATE SET
    cpu_avg = (cpu_avg * samples + excluded.cpu_avg * excluded.samples) / (samples + excluded.samples),
    ram_avg = (ram_avg * samples + excluded.ram_avg * excluded.samples) / (samples + excluded.samples),
    disk_avg = (disk_avg * samples + excluded.disk_avg * excluded.samples) / (samples + excluded.samples),
    cpu_max = MAX(cpu_max, excluded.cpu_max),
    ram_max = MAX(ram_max, excluded.ram_max),
    samples = samples + excluded.samples
"""

async def record_metrics_minute(row: dict) -> bool:
    """Stores one minute of metrics, as produced by MinuteAggregator. Returns False if the write failed."""
    try:
        async with _connect() as db:
            await db.execute(RECORD_METRICS_MINUTE, row)
            await db.commit()
        return True
    except Exception as e:
        logger.error(f"Failed to record metrics for {row.get('minute')}: {e}")
        return False

async def open_alert_event(metric: str, level: str, threshold: float, started_at: str, peak_value: float,
                           readings: dict, top_process: dict | None = None) -> str | None:
    """
    Stores the start of an alert episode and returns its id, or None if the write failed.
    readings holds cpu, ram and disk at that moment; top_process holds name, pid and value.
    """
    event_id = str(uuid.uuid4())
    top = top_process or {}
    try:
        async with _connect() as db:
            await db.execute(
                "INSERT INTO alert_events (id, metric, level, threshold, started_at, peak_value, cpu_at_start, "
                "ram_at_start, disk_at_start, top_process, top_process_pid, top_process_value) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (event_id, metric, level, threshold, started_at, peak_value, readings["cpu"], readings["ram"],
                 readings["disk"], top.get("name"), top.get("pid"), top.get("value"))
            )
            await db.commit()
        return event_id
    except Exception as e:
        logger.error(f"Failed to store the start of a {metric} alert: {e}")
        return None

async def _update_alert_event(event_id: str, assignments: str, params: tuple, action: str) -> bool:
    try:
        async with _connect() as db:
            await db.execute(f"UPDATE alert_events SET {assignments} WHERE id = ?", (*params, event_id))
            await db.commit()
        return True
    except Exception as e:
        logger.error(f"Failed to {action} for alert {event_id}: {e}")
        return False

async def update_alert_event(event_id: str, peak_value: float, level: str) -> bool:
    """Stores a higher peak, and the level it reached, for an open episode."""
    return await _update_alert_event(event_id, "peak_value = ?, level = ?", (peak_value, level), "store the peak")

async def set_alert_top_process(event_id: str, name: str, pid: int, value: float) -> bool:
    """Records the largest consumer of the metric at the time the episode started."""
    return await _update_alert_event(event_id, "top_process = ?, top_process_pid = ?, top_process_value = ?",
                                     (name, pid, value), "store the top process")

async def close_alert_event(event_id: str, ended_at: str, peak_value: float, level: str) -> bool:
    """Ends an episode."""
    return await _update_alert_event(event_id, "ended_at = ?, peak_value = ?, level = ?",
                                     (ended_at, peak_value, level), "store the end")

# The last minute of recorded metrics is the best evidence of when the backend was last alive.
CLOSE_ORPHANED_EPISODES = """
UPDATE alert_events
SET ended_at = MAX(started_at, COALESCE((SELECT MAX(minute) FROM metrics_history), started_at))
WHERE ended_at IS NULL
"""

async def close_orphaned_alert_events() -> int:
    """
    Ends the episodes a crash left open and returns how many. Called once at start-up by the
    instance that owns the dashboard port, never from init_db: the MCP-only instance runs that
    too, and would close episodes the live instance still has open.
    """
    try:
        async with _connect() as db:
            cursor = await db.execute(CLOSE_ORPHANED_EPISODES)
            await db.commit()
            return cursor.rowcount
    except Exception as e:
        logger.error(f"Failed to close orphaned alert episodes: {e}")
        return 0

async def prune_history(metrics_days: int, alert_days: int) -> None:
    """
    Drops history past its retention. An open episode is never pruned, however old:
    it is still in progress, and its row is the only record of it.
    """
    try:
        async with _connect() as db:
            await db.execute("DELETE FROM metrics_history WHERE minute < datetime('now', ?)",
                             (f"-{metrics_days} days",))
            await db.execute("DELETE FROM alert_events WHERE ended_at IS NOT NULL AND started_at < datetime('now', ?)",
                             (f"-{alert_days} days",))
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to prune history: {e}")

# Every condition is in the WHERE clause, so the limit is applied to rows that already match.
# Filtering after the fetch would return fewer rows than exist once the limit is reached.
SELECT_ALERT_EVENTS = """
SELECT * FROM alert_events
WHERE started_at >= ? AND started_at < ?
  AND (? IS NULL OR metric = ?)
  AND (? IS NULL OR level = ?)
ORDER BY (ended_at IS NULL) DESC, started_at DESC
LIMIT ?
"""

async def get_alert_events(start: str, end: str, metric: str | None, level: str | None, limit: int) -> list[dict]:
    """
    Alert episodes that started in [start, end): ongoing ones first, then newest first.
    Unlike the write functions this raises on failure. Returning an empty list would tell
    the user that nothing happened, when the truth is that the history could not be read.
    """
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(SELECT_ALERT_EVENTS, (start, end, metric, metric, level, level, limit)) as cursor:
            return [dict(row) async for row in cursor]

async def get_alert_event(event_id: str) -> dict | None:
    """One alert episode as stored, or None if there is no such row or it could not be read."""
    try:
        async with _connect() as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM alert_events WHERE id = ?", (event_id,)) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None
    except Exception as e:
        logger.error(f"Failed to read alert {event_id}: {e}")
        return None

# Minutes are merged into buckets aligned to the epoch. The average is weighted by the samples
# behind each minute, so a minute the backend only half covered counts for half. The peak is
# the largest peak: averaging peaks would hide the spikes the graphs exist to show.
# A bucket with no rows is simply absent. No value is ever invented for it.
SELECT_METRICS_HISTORY = """
SELECT
    CAST(strftime('%s', minute) AS INTEGER) / :bucket * :bucket AS bucket_start,
    SUM(cpu_avg * samples) / SUM(samples) AS cpu_avg,
    MAX(cpu_max) AS cpu_max,
    SUM(ram_avg * samples) / SUM(samples) AS ram_avg,
    MAX(ram_max) AS ram_max,
    SUM(disk_avg * samples) / SUM(samples) AS disk_avg,
    SUM(samples) AS samples
FROM metrics_history
WHERE minute >= :start AND minute < :end
GROUP BY bucket_start
ORDER BY bucket_start
"""

async def get_metrics_history(start: str, end: str, bucket_seconds: int) -> list[dict]:
    """
    Recorded metrics in [start, end), merged into buckets of bucket_seconds. bucket_start is
    in epoch seconds. Raises on failure, like get_alert_events: an empty chart would claim
    that nothing was recorded.
    """
    async with _connect() as db:
        db.row_factory = aiosqlite.Row
        params = {"bucket": bucket_seconds, "start": start, "end": end}
        async with db.execute(SELECT_METRICS_HISTORY, params) as cursor:
            return [dict(row) async for row in cursor]

async def get_oldest_metrics_minute() -> str | None:
    """The first minute ever recorded, or None while the history is empty."""
    async with _connect() as db:
        async with db.execute("SELECT MIN(minute) FROM metrics_history") as cursor:
            row = await cursor.fetchone()
            return row[0] if row else None
