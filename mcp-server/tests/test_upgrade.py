"""Phase 8 §6: a V2.0.1 database and settings file carry over to V2.1 with nothing lost."""
import asyncio
import json
import os
import sqlite3
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db
from ws_server import app

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# The audit table exactly as V2.0.1 created it
V2_0_1_SCHEMA = """
CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    process_name TEXT NOT NULL,
    pid INTEGER NOT NULL,
    executable_path TEXT,
    action_type TEXT NOT NULL,
    memory_freed_mb REAL,
    cpu_freed_pct REAL,
    llm_reasoning TEXT,
    user_approved BOOLEAN,
    command_line TEXT
);
CREATE TABLE system_baselines (
    process_name TEXT PRIMARY KEY,
    avg_cpu_pct REAL,
    avg_memory_mb REAL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""

# The same table before command_line was added, which is what V2.0 databases look like
V2_0_SCHEMA = V2_0_1_SCHEMA.replace(",\n    command_line TEXT", "")

OLD_COLUMNS = ("id", "timestamp", "process_name", "pid", "executable_path", "action_type", "memory_freed_mb",
               "cpu_freed_pct", "llm_reasoning", "user_approved")
EXE = sys.executable
RECENT = "datetime('now', '-3 hours')"

ROWS = [
    ("old-kill-1", "Discord.exe", 4001, EXE, "TERMINATED", 344.0, 0.9, "User confirmed termination via KavanMCP UI", 1, '["x.exe", "--profile", "work"]'),
    ("old-kill-2", "Mystery.exe", 4002, None, "TERMINATED", 12.0, 0.0, "Claude: it was idle", 1, None),
    ("old-blocked", "lsass.exe", 600, None, "BLOCKED", None, None, "LLM attempted to terminate a Tier 1 Critical OS Component.", 0, None),
    ("old-rollback", "Discord.exe", 5001, EXE, "ROLLBACK", None, None, None, 1, None),
]


def build_old_database(path, schema=V2_0_1_SCHEMA):
    conn = sqlite3.connect(path)
    conn.executescript(schema)
    has_command_line = "command_line" in schema
    for row in ROWS:
        columns = ["id", "process_name", "pid", "executable_path", "action_type", "memory_freed_mb", "cpu_freed_pct",
                   "llm_reasoning", "user_approved"] + (["command_line"] if has_command_line else [])
        values = list(row[:9]) + ([row[9]] if has_command_line else [])
        conn.execute(f"INSERT INTO audit_log ({', '.join(columns)}, timestamp) VALUES ({', '.join('?' * len(values))}, {RECENT})", values)
    conn.commit()
    conn.close()


def dump_old_columns(path):
    conn = sqlite3.connect(path)
    rows = conn.execute(f"SELECT {', '.join(OLD_COLUMNS)} FROM audit_log ORDER BY id").fetchall()
    conn.close()
    return rows


def columns_of(path, table):
    conn = sqlite3.connect(path)
    names = [row[1] for row in conn.execute(f"PRAGMA table_info({table})")]
    conn.close()
    return names


def tables_of(path):
    conn = sqlite3.connect(path)
    names = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    conn.close()
    return names


@pytest.fixture
def old_db(tmp_path, monkeypatch):
    path = str(tmp_path / "v201.db")
    build_old_database(path)
    monkeypatch.setattr(db, "DB_PATH", path)
    monkeypatch.setattr(db, "DATA_DIR", str(tmp_path))
    return path


def test_a_v2_0_1_database_opens_with_every_audit_row_intact(old_db):
    before = dump_old_columns(old_db)

    asyncio.run(db.init_db())

    assert dump_old_columns(old_db) == before, "an existing audit row must never change"
    assert {"metrics_history", "alert_events"} <= tables_of(old_db)
    assert {"tier", "rolled_back_at", "command_line"} <= set(columns_of(old_db, "audit_log"))


def test_the_new_columns_are_null_on_the_old_rows(old_db):
    asyncio.run(db.init_db())

    conn = sqlite3.connect(old_db)
    values = conn.execute("SELECT tier, rolled_back_at FROM audit_log").fetchall()
    conn.close()

    assert len(values) == len(ROWS) and set(values) == {(None, None)}


def test_migrating_twice_is_harmless(old_db):
    asyncio.run(db.init_db())
    once = (dump_old_columns(old_db), columns_of(old_db, "audit_log"), tables_of(old_db))

    asyncio.run(db.init_db())

    assert (dump_old_columns(old_db), columns_of(old_db, "audit_log"), tables_of(old_db)) == once


def test_a_v2_0_database_without_command_line_migrates_too(tmp_path, monkeypatch):
    path = str(tmp_path / "v20.db")
    build_old_database(path, V2_0_SCHEMA)
    monkeypatch.setattr(db, "DB_PATH", path)
    monkeypatch.setattr(db, "DATA_DIR", str(tmp_path))
    before = dump_old_columns(path)

    asyncio.run(db.init_db())

    assert dump_old_columns(path) == before
    assert {"command_line", "tier", "rolled_back_at"} <= set(columns_of(path, "audit_log"))


def test_old_kills_show_in_the_kills_list_with_an_unknown_tier(old_db):
    asyncio.run(db.init_db())

    response = TestClient(app, base_url="http://127.0.0.1:8000").get("/api/kills", params={"hours": 24})
    kills = {kill["id"]: kill for kill in response.json()["kills"]}

    assert response.status_code == 200
    assert set(kills) == {"old-kill-1", "old-kill-2"}, "only kills are listed, never the blocked or rollback rows"
    assert kills["old-kill-1"]["tier"] is None and kills["old-kill-1"]["can_restore"] is True
    assert kills["old-kill-2"]["can_restore"] is False and kills["old-kill-2"]["restore_blocked_reason"] == "no_path"


def test_an_old_kill_is_restored_with_its_recorded_arguments(old_db, fake_popen):
    asyncio.run(db.init_db())

    response = TestClient(app, base_url="http://127.0.0.1:8000").post("/api/rollback", json={"id": "old-kill-1"})

    assert response.status_code == 200
    # The audited executable, with only the arguments from the old record: the "x.exe" in it is not launched
    assert fake_popen.call_args.args[0] == [EXE, "--profile", "work"]


def test_the_migrated_database_still_works_for_the_v2_0_1_backend(old_db):
    """Going back: the queries V2.0.1 ran, against a V2.1-migrated database."""
    asyncio.run(db.init_db())
    conn = sqlite3.connect(old_db)

    conn.execute(
        "INSERT INTO audit_log (id, process_name, pid, executable_path, action_type, memory_freed_mb, cpu_freed_pct, "
        "llm_reasoning, user_approved, command_line) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("back-1", "Spotify.exe", 7, EXE, "TERMINATED", 90.0, 1.0, "V2.0.1 wrote this", True, '["s.exe"]'))
    conn.execute(
        "INSERT INTO audit_log (id, process_name, pid, action_type, llm_reasoning, user_approved) VALUES (?, ?, ?, ?, ?, ?)",
        ("back-2", "lsass.exe", 600, "BLOCKED", "blocked by V2.0.1", False))
    latest = conn.execute(
        "SELECT * FROM audit_log WHERE action_type = 'TERMINATED' AND process_name = ? COLLATE NOCASE "
        "ORDER BY timestamp DESC LIMIT 1", ("spotify.exe",)).fetchone()
    recent = conn.execute("SELECT * FROM audit_log WHERE timestamp >= datetime('now', ?) ORDER BY timestamp DESC LIMIT ?",
                          ("-24 hours", 50)).fetchall()
    conn.commit()
    conn.close()

    assert latest is not None and len(recent) >= len(ROWS)


def test_the_extra_tables_do_not_disturb_the_old_ones(old_db):
    asyncio.run(db.init_db())

    assert "system_baselines" in tables_of(old_db), "the old table stays where it was"


def test_changing_a_setting_does_not_modify_a_tracked_file():
    """Settings live under data/, which git ignores, and the old tracked file is gone from git."""
    tracked = subprocess.run(["git", "ls-files", "mcp-server/config/settings.json"], capture_output=True, text=True,
                             cwd=REPO, check=False).stdout.strip()
    ignored = subprocess.run(["git", "check-ignore", "-q", "mcp-server/data/settings.json"], cwd=REPO, check=False).returncode

    assert tracked == "", "mcp-server/config/settings.json must no longer be tracked"
    assert ignored == 0, "mcp-server/data/settings.json must be ignored by git"


def test_a_v2_0_1_settings_file_in_data_loads_with_the_new_defaults(tmp_path, monkeypatch):
    from config import settings_manager

    current = tmp_path / "settings.json"
    current.write_text(json.dumps({"cpu_threshold": 72, "ram_threshold": 81, "disk_threshold": 93, "theme": "light",
                                   "sound_alerts": False}), encoding="utf-8")
    monkeypatch.setattr(settings_manager, "CONFIG_PATH", str(current))

    config = settings_manager.load_config()

    assert (config["cpu_threshold"], config["ram_threshold"], config["disk_threshold"]) == (72, 81, 93)
    assert (config["sound_volume"], config["sound_choice"], config["alert_retention_days"]) == (50, "chime", 30)
    assert config["never_kill"] == [] and config["never_alert"] == []
