import asyncio
import os
import sqlite3
import subprocess
import sys
import time

import psutil
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db
from handlers.approval_handler import PENDING_APPROVALS
from handlers.termination_handler import _relaunch_argv, rollback_process
from kill_helpers import EXISTING_EXE, add_kill, read_row, unique_name
from tools.rollback_tool import rollback_last_action_logic
from ws_server import app

client = TestClient(app, base_url="http://127.0.0.1:8000")

SCRIPT = "import sys, time; open(sys.argv[1], 'a').write('x'); time.sleep(60)"


def _wait_for(predicate, timeout=15.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(0.1)
    return False


def _marker_text(path):
    return path.read_text() if path.exists() else ""


def test_rollback_relaunches_with_the_original_arguments(tmp_path):
    marker = tmp_path / "marker.txt"
    # The real interpreter, not the venv launcher, so the audited path and argv belong to one process
    child = subprocess.Popen([sys._base_executable, "-c", SCRIPT, str(marker)],
                             creationflags=subprocess.CREATE_NO_WINDOW)
    relaunched_pid = None
    try:
        assert _wait_for(lambda: _marker_text(marker) == "x")

        assert client.post("/api/confirm_termination", json={"pid": child.pid}).status_code == 200
        assert client.post("/api/execute_termination", json={"pid": child.pid}).status_code == 200
        child.wait(timeout=10)

        result = asyncio.run(rollback_process(str(child.pid)))
        assert result["status"] == "success", result

        conn = sqlite3.connect(db.DB_PATH)
        relaunched_pid = conn.execute(
            "SELECT pid FROM audit_log WHERE action_type = 'ROLLBACK' ORDER BY rowid DESC LIMIT 1"
        ).fetchone()[0]
        conn.close()

        # Only a relaunch that received the marker path as its argument can append to it
        assert _wait_for(lambda: _marker_text(marker) == "xx"), "relaunched process did not get its arguments"
    finally:
        PENDING_APPROVALS.clear()
        for pid in (child.pid, relaunched_pid):
            if pid and psutil.pid_exists(pid):
                try:
                    psutil.Process(pid).kill()
                except psutil.Error:
                    pass


def test_relaunch_argv_always_uses_the_audited_executable():
    exe = "C:/Apps/tool.exe"

    assert _relaunch_argv(exe, '["C:/Other/evil.exe", "--port", "9000"]') == [exe, "--port", "9000"]
    assert _relaunch_argv(exe, None) == [exe]          # Record from before arguments were captured
    assert _relaunch_argv(exe, "not json") == [exe]
    assert _relaunch_argv(exe, '{"a": 1}') == [exe]
    assert _relaunch_argv(exe, '["x", 5]') == [exe]


def test_init_db_migrates_a_database_from_the_previous_schema(tmp_path, monkeypatch):
    old = tmp_path / "old.db"
    conn = sqlite3.connect(old)
    conn.execute(
        "CREATE TABLE audit_log (id TEXT PRIMARY KEY, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, "
        "process_name TEXT NOT NULL, pid INTEGER NOT NULL, executable_path TEXT, action_type TEXT NOT NULL, "
        "memory_freed_mb REAL, cpu_freed_pct REAL, llm_reasoning TEXT, user_approved BOOLEAN)"
    )
    conn.execute("INSERT INTO audit_log (id, process_name, pid, action_type) VALUES ('a', 'kept.exe', 1, 'TERMINATED')")
    conn.commit()
    conn.close()
    monkeypatch.setattr(db, "DB_PATH", str(old))

    asyncio.run(db.init_db())
    asyncio.run(db.init_db())  # Running the migration twice must be harmless
    asyncio.run(db.log_termination("new.exe", 2, "C:/new.exe", 1.0, 0.0, "test", command_line='["C:/new.exe", "-v"]'))

    conn = sqlite3.connect(old)
    rows = conn.execute("SELECT process_name, command_line FROM audit_log ORDER BY pid").fetchall()
    conn.close()
    assert rows == [("kept.exe", None), ("new.exe", '["C:/new.exe", "-v"]')]


def test_init_db_upgrades_a_v2_0_1_database_and_keeps_its_history(tmp_path, monkeypatch):
    """V2.0.1 has the command_line column but neither of the two V2.1 columns."""
    old = tmp_path / "v201.db"
    conn = sqlite3.connect(old)
    conn.execute(
        "CREATE TABLE audit_log (id TEXT PRIMARY KEY, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, "
        "process_name TEXT NOT NULL, pid INTEGER NOT NULL, executable_path TEXT, action_type TEXT NOT NULL, "
        "memory_freed_mb REAL, cpu_freed_pct REAL, llm_reasoning TEXT, user_approved BOOLEAN, command_line TEXT)"
    )
    conn.execute("INSERT INTO audit_log (id, process_name, pid, action_type, command_line) "
                 "VALUES ('a', 'kept.exe', 1, 'TERMINATED', '[\"C:/kept.exe\", \"-v\"]')")
    conn.commit()
    conn.close()
    monkeypatch.setattr(db, "DB_PATH", str(old))

    asyncio.run(db.init_db())
    asyncio.run(db.init_db())

    conn = sqlite3.connect(old)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(audit_log)")}
    kept = conn.execute("SELECT process_name, command_line, tier, rolled_back_at FROM audit_log").fetchall()
    conn.close()
    assert {"tier", "rolled_back_at"} <= columns
    assert kept == [("kept.exe", '["C:/kept.exe", "-v"]', None, None)]
    # An old, unrestored kill can still be found for a restore
    assert asyncio.run(db.get_last_terminated_process("kept.exe"))["id"] == "a"


def test_the_mcp_tool_restores_the_newer_kill_and_then_the_older(fake_popen):
    name = unique_name()
    older = add_kill(name=name, argv=[EXISTING_EXE, "--older"])
    newer = add_kill(name=name, argv=[EXISTING_EXE, "--newer"])

    first = asyncio.run(rollback_last_action_logic(name))
    second = asyncio.run(rollback_last_action_logic(name))

    assert '"success"' in first and '"success"' in second
    assert [call.args[0] for call in fake_popen.call_args_list] == [
        [EXISTING_EXE, "--newer"], [EXISTING_EXE, "--older"]]
    assert read_row(newer)["rolled_back_at"] is not None
    assert read_row(older)["rolled_back_at"] is not None


def test_the_mcp_tool_reports_when_nothing_is_left_to_restore(fake_popen):
    name = unique_name()
    add_kill(name=name)
    asyncio.run(rollback_last_action_logic(name))
    fake_popen.reset_mock()

    result = asyncio.run(rollback_last_action_logic(name))

    assert '"error"' in result
    assert "not already been restored" in result
    fake_popen.assert_not_called()


def test_the_mcp_tool_keeps_its_response_shape(fake_popen):
    name = unique_name()
    add_kill(name=name)

    import json
    result = json.loads(asyncio.run(rollback_last_action_logic(name)))

    assert result == {"status": "success", "message": f"Successfully rolled back (relaunched) {name}."}


def test_restoring_by_id_over_the_api_relaunches_the_real_process_once(tmp_path):
    marker = tmp_path / "marker.txt"
    child = subprocess.Popen([sys._base_executable, "-c", SCRIPT, str(marker)],
                             creationflags=subprocess.CREATE_NO_WINDOW)
    relaunched_pid = None
    try:
        assert _wait_for(lambda: _marker_text(marker) == "x")
        assert client.post("/api/confirm_termination", json={"pid": child.pid}).status_code == 200
        audit_id = client.post("/api/execute_termination", json={"pid": child.pid}).json()["audit_id"]
        child.wait(timeout=10)

        first = client.post("/api/rollback", json={"id": audit_id})
        second = client.post("/api/rollback", json={"id": audit_id})

        assert first.status_code == 200, first.text
        relaunched_pid = first.json()["new_pid"]
        assert second.status_code == 409
        assert _wait_for(lambda: _marker_text(marker) == "xx"), "relaunched process did not get its arguments"
        time.sleep(1.0)
        assert _marker_text(marker) == "xx", "the refused second restore started another copy"
    finally:
        PENDING_APPROVALS.clear()
        for pid in (child.pid, relaunched_pid):
            if pid and psutil.pid_exists(pid):
                try:
                    psutil.Process(pid).kill()
                except psutil.Error:
                    pass
