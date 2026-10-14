"""Puts TERMINATED rows into the test database, so restore tests need no real kill."""
import asyncio
import json
import sqlite3
import sys
import uuid

from database import db

# A file that exists, so a restore passes the "executable is still there" check
EXISTING_EXE = sys._base_executable


def unique_name() -> str:
    return f"kill-{uuid.uuid4().hex[:8]}.exe"


def add_kill(name: str | None = None, path: str | None = EXISTING_EXE, argv: list[str] | None = None,
             tier: int | None = 3, age_hours: int = 0) -> str:
    """Records a kill the way terminate_process does and returns its audit id."""
    audit_id = asyncio.run(db.log_termination(
        name or unique_name(), 1234, path, 10.0, 1.0, "test",
        command_line=json.dumps(argv) if argv is not None else None, tier=tier))
    if age_hours:
        _execute("UPDATE audit_log SET timestamp = datetime('now', ?) WHERE id = ?", (f"-{age_hours} hours", audit_id))
    return audit_id


def read_row(audit_id: str) -> dict:
    conn = sqlite3.connect(db.DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM audit_log WHERE id = ?", (audit_id,)).fetchone()
    conn.close()
    return dict(row)


def row_ids(action_type: str) -> list[str]:
    conn = sqlite3.connect(db.DB_PATH)
    ids = [r[0] for r in conn.execute("SELECT id FROM audit_log WHERE action_type = ? ORDER BY rowid", (action_type,))]
    conn.close()
    return ids


def _execute(statement: str, params: tuple) -> None:
    conn = sqlite3.connect(db.DB_PATH)
    conn.execute(statement, params)
    conn.commit()
    conn.close()
