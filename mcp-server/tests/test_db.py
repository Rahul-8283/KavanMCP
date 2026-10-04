import asyncio
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    """Every test gets its own database; the real audit ledger is never touched."""
    path = str(tmp_path / "process.db")
    monkeypatch.setattr(db, "DB_PATH", path)
    monkeypatch.setattr(db, "DATA_DIR", str(tmp_path))
    asyncio.run(db.init_db())
    return path


def _rows(path, sql):
    conn = sqlite3.connect(path)
    try:
        return conn.execute(sql).fetchall()
    finally:
        conn.close()


def test_init_creates_tables_in_wal_mode(temp_db):
    tables = {r[0] for r in _rows(temp_db, "SELECT name FROM sqlite_master WHERE type='table'")}

    assert {"audit_log", "system_baselines"} <= tables
    assert _rows(temp_db, "PRAGMA journal_mode")[0][0].lower() == "wal"


def test_100_concurrent_writes_all_land(temp_db):
    async def burst():
        await asyncio.gather(*[
            db.log_termination(f"proc_{i}.exe", 1000 + i, "C:\\Temp\\proc.exe", 10.0, 1.0, "test")
            for i in range(100)
        ])

    asyncio.run(burst())

    assert _rows(temp_db, "SELECT COUNT(*) FROM audit_log")[0][0] == 100


def test_rollback_is_written_to_the_audit_log(temp_db):
    asyncio.run(db.log_rollback("notepad.exe", 4321, "C:\\Windows\\notepad.exe"))

    rows = _rows(temp_db, "SELECT process_name, pid, action_type FROM audit_log")
    assert rows == [("notepad.exe", 4321, "ROLLBACK")]


def test_last_terminated_lookup_ignores_name_case(temp_db):
    asyncio.run(db.log_termination("Notepad.exe", 77, "C:\\Windows\\notepad.exe", 5.0, 0.0, "test"))

    by_name = asyncio.run(db.get_last_terminated_process("notepad.exe"))
    by_pid = asyncio.run(db.get_last_terminated_process("77"))

    assert by_name["pid"] == 77
    assert by_pid["process_name"] == "Notepad.exe"


def test_blocked_action_is_not_returned_as_terminated(temp_db):
    asyncio.run(db.log_blocked_action("explorer.exe", 5, "blocked"))

    assert asyncio.run(db.get_last_terminated_process("explorer.exe")) == {}


def test_recent_logs_filters_by_time_window_before_limit(temp_db):
    conn = sqlite3.connect(temp_db)
    conn.execute(
        "INSERT INTO audit_log (id, timestamp, process_name, pid, action_type) "
        "VALUES ('old', datetime('now', '-30 hours'), 'old.exe', 1, 'TERMINATED')"
    )
    conn.commit()
    conn.close()

    async def fill():
        await asyncio.gather(*[
            db.log_termination(f"p{i}.exe", i, None, 1.0, 0.0, "test") for i in range(150)
        ])

    asyncio.run(fill())

    last_day = asyncio.run(db.get_recent_logs(limit=500, hours_back=24))
    last_two_days = asyncio.run(db.get_recent_logs(limit=500, hours_back=48))

    assert len(last_day) == 150  # More than the old 100-row cap, and the 30h-old row is excluded
    assert len(last_two_days) == 151


def test_view_audit_log_rejects_non_positive_window(temp_db):
    import json

    from tools.audit_tools import view_audit_log_logic

    result = json.loads(asyncio.run(view_audit_log_logic(0)))

    assert result["status"] == "error"
