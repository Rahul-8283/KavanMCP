import os
import uuid

import aiosqlite

from database.models import CREATE_AUDIT_LOG_TABLE, CREATE_SYSTEM_BASELINES_TABLE
from utils.logger import logger

# Resolve the absolute path to the data directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "process.db")

async def init_db():
    """
    Asynchronously initializes the SQLite database and creates necessary tables.
    """
    try:
        # Ensure the data directory exists
        os.makedirs(DATA_DIR, exist_ok=True)
        
        # Connect to the SQLite database (creates it if it doesn't exist)
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("PRAGMA journal_mode=WAL")
            await db.execute(CREATE_AUDIT_LOG_TABLE)
            await db.execute(CREATE_SYSTEM_BASELINES_TABLE)
            await db.commit()
            
        logger.info(f"Database successfully initialized at {DB_PATH}")
    except Exception as e:
        logger.critical(f"FATAL: Failed to initialize SQLite database: {e}")
        raise

# when a process is successfully killed
async def log_termination(process_name: str, pid: int, path: str, mem_mb: float, cpu_pct: float, reasoning: str) -> None:
    """Logs a process termination event into the audit database."""
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "INSERT INTO audit_log (id, process_name, pid, executable_path, action_type, memory_freed_mb, cpu_freed_pct, llm_reasoning, user_approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), process_name, pid, path, 'TERMINATED', mem_mb, cpu_pct, reasoning, True)
            )
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to log termination for {process_name}: {e}")

# when LLM makes a mistakes to kill a high level Tier 1 running process
async def log_blocked_action(process_name: str, pid: int, reasoning: str) -> None:
    """Logs a blocked action event (e.g., trying to kill Tier 1 apps)."""
    try:
        async with aiosqlite.connect(DB_PATH) as db:
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
        async with aiosqlite.connect(DB_PATH) as db:
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
        async with aiosqlite.connect(DB_PATH) as db:
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
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(query, (*params, limit)) as cursor:
                async for row in cursor:
                    logs.append(dict(row))
    except Exception as e:
        logger.error(f"Failed to fetch recent logs: {e}")
    return logs
