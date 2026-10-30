"""Phase 6 §3: processes on the user's never-kill list cannot be terminated, by anyone."""
import asyncio
import json
import os
import subprocess
import sys
import time
from unittest.mock import patch

import psutil
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from kill_helpers import read_row, row_ids

from config.settings_manager import ACTIVE_CONFIG
from config.whitelist import TIER_1_WHITELIST
from handlers import termination_handler
from handlers.approval_handler import PENDING_APPROVALS
from handlers.protection import is_user_protected
from server import mcp
from tools.execute_termination import execute_termination_logic
from ws_server import app

client = TestClient(app, base_url="http://127.0.0.1:8000")
MISSING_PID = 4294967000


@pytest.fixture(autouse=True)
def clean_approvals():
    PENDING_APPROVALS.clear()
    yield
    PENDING_APPROVALS.clear()


@pytest.fixture
def dummy():
    """A real, harmless python.exe (tier 3) for the kill to act on."""
    proc = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(120)"],
                            creationflags=subprocess.CREATE_NO_WINDOW)
    yield proc
    if proc.poll() is None:
        proc.kill()
    proc.wait()


@pytest.fixture
def protect(monkeypatch):
    """Adds names to the never-kill list for one test, then restores the list."""
    def add(*names):
        monkeypatch.setitem(ACTIVE_CONFIG, "never_kill", [n.lower() for n in names])
    return add


def _alive(proc) -> bool:
    return proc.poll() is None


def test_confirming_a_protected_process_is_refused_and_logged(dummy, protect):
    protect("python.exe")
    blocked_before = len(row_ids("BLOCKED"))

    response = client.post("/api/confirm_termination", json={"pid": dummy.pid})

    assert response.status_code == 403
    detail = response.json()["detail"]
    assert detail["code"] == "user_protected"
    assert detail["message"] == "python.exe is on your protected list. Remove it in Kavan's Settings to allow termination."
    assert dummy.pid not in PENDING_APPROVALS, "a refused process must not be staged"
    assert len(row_ids("BLOCKED")) == blocked_before + 1
    assert read_row(row_ids("BLOCKED")[-1])["process_name"] == "python.exe"


def test_a_process_protected_after_confirmation_is_still_refused(dummy, protect):
    assert client.post("/api/confirm_termination", json={"pid": dummy.pid}).status_code == 200

    protect("python.exe")
    response = client.post("/api/execute_termination", json={"pid": dummy.pid})

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "user_protected"
    time.sleep(0.3)
    assert _alive(dummy), "the process must survive a refused kill"


def test_the_lowest_gate_refuses_a_protected_process_before_any_os_call(dummy, protect):
    protect("python.exe")
    calls = []
    real_terminate = psutil.Process.terminate

    def spy(self):
        calls.append(self.pid)
        return real_terminate(self)

    with patch.object(psutil.Process, "terminate", spy):
        result = termination_handler._terminate_blocking(dummy.pid)

    assert result["status"] == "user_protected"
    assert calls == [], "terminate() must not be reached for a protected process"
    assert _alive(dummy)


def test_the_mcp_tool_reports_a_protected_process_as_blocked(dummy, protect):
    # Staged while it was not protected, so the refusal comes from the kill-time gate
    assert client.post("/api/confirm_termination", json={"pid": dummy.pid}).status_code == 200
    protect("python.exe")

    raw = asyncio.run(execute_termination_logic([dummy.pid]))
    result = json.loads(raw)[0]

    assert result["status"] == "blocked"
    assert "protected list" in result["error"]
    assert _alive(dummy)


def test_removing_a_name_allows_the_kill_on_the_next_request(dummy, protect):
    protect("python.exe")
    assert client.post("/api/confirm_termination", json={"pid": dummy.pid}).status_code == 403

    protect()  # the user removes it
    assert client.post("/api/confirm_termination", json={"pid": dummy.pid}).status_code == 200
    response = client.post("/api/execute_termination", json={"pid": dummy.pid})

    assert response.status_code == 200
    dummy.wait(timeout=10)


def test_protection_matches_names_case_insensitively(protect):
    protect("Python.EXE")

    assert is_user_protected("PYTHON.exe")
    assert not is_user_protected("pythonw.exe")


def test_a_tier_1_name_on_the_list_changes_nothing(protect):
    """Tier 1 is checked first and on its own: a protection entry cannot make a system process killable."""
    tier1 = min(TIER_1_WHITELIST)
    protect(tier1)

    class FakeCritical:
        def name(self):
            return tier1

        def terminate(self):
            raise AssertionError("terminate() reached for a Tier 1 process")

    with patch.object(termination_handler.psutil, "Process", return_value=FakeCritical()):
        result = termination_handler._terminate_blocking(MISSING_PID)

    assert result["status"] == "tier1_blocked"


def test_no_mcp_tool_can_write_a_setting():
    names = {tool.name for tool in asyncio.run(mcp.list_tools())}

    assert names == {
        "analyze_system", "list_processes", "explain_process", "view_audit_log",
        "confirm_termination", "execute_termination", "rollback_last_action",
    }


def test_a_protected_process_is_marked_and_keeps_its_real_tier(dummy, protect):
    from tools.list_processes import list_processes_logic

    protect("python.exe")
    listed = json.loads(list_processes_logic(filter_name="python.exe"))
    entry = next(item for item in listed if item["pid"] == dummy.pid)

    assert entry["protected"] is True
    assert entry["tier"] == 3, "protection is a separate fact, the tier does not change"


def test_an_unprotected_process_is_not_marked(dummy):
    from tools.list_processes import list_processes_logic

    listed = json.loads(list_processes_logic(filter_name="python.exe"))

    assert next(item for item in listed if item["pid"] == dummy.pid)["protected"] is False
