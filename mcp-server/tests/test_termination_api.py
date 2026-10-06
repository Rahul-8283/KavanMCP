import os
import subprocess
import sys
import time
from unittest.mock import patch

import psutil
import pytest
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.whitelist import TIER_1_WHITELIST
from handlers.approval_handler import PENDING_APPROVALS
from ws_helpers import next_metrics_update
from ws_server import app

client = TestClient(app, base_url="http://127.0.0.1:8000")

CONFIRM = "/api/confirm_termination"
EXECUTE = "/api/execute_termination"
MISSING_PID = 4294967000  # Far above any real PID on Windows


@pytest.fixture(autouse=True)
def clean_pending_approvals():
    PENDING_APPROVALS.clear()
    yield
    PENDING_APPROVALS.clear()


@pytest.fixture
def dummy_process():
    """A real, harmless tier-3 process (python.exe) for the kill to act on."""
    proc = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(120)"])
    yield proc
    if proc.poll() is None:
        proc.kill()
    proc.wait()


def _post(path, pid):
    return client.post(path, json={"pid": pid})


def _code(response):
    return response.json()["detail"]["code"]


def _find_tier1_pid():
    for proc in psutil.process_iter(["pid", "name"]):
        name = (proc.info["name"] or "").lower()
        if name in TIER_1_WHITELIST:
            return proc.info["pid"]
    return None


def test_confirm_rejects_tier1_process():
    pid = _find_tier1_pid()
    if pid is None:
        pytest.skip("No Tier 1 process visible to this session")

    response = _post(CONFIRM, pid)

    assert response.status_code == 403
    assert _code(response) == "tier1_blocked"
    assert pid not in PENDING_APPROVALS


def test_confirm_missing_pid_returns_404():
    response = _post(CONFIRM, MISSING_PID)

    assert response.status_code == 404
    assert _code(response) == "not_found"


def test_confirm_then_execute_kills_process(dummy_process):
    staged = _post(CONFIRM, dummy_process.pid)
    assert staged.status_code == 200
    assert staged.json()["status"] == "pending"
    assert staged.json()["tier"] == 3

    killed = _post(EXECUTE, dummy_process.pid)

    assert killed.status_code == 200
    assert killed.json()["status"] == "success"
    assert killed.json()["freed_mb"] > 0
    assert dummy_process.wait(timeout=10) is not None  # Process is really gone
    assert dummy_process.pid not in PENDING_APPROVALS


def test_execute_without_confirm_is_blocked(dummy_process):
    response = _post(EXECUTE, dummy_process.pid)

    assert response.status_code == 409
    assert _code(response) == "not_approved"
    assert dummy_process.poll() is None  # Still alive


def test_approval_is_single_use(dummy_process):
    _post(CONFIRM, dummy_process.pid)
    assert _post(EXECUTE, dummy_process.pid).status_code == 200

    # A second execute (e.g. double-click or replay) must not kill again
    second = _post(EXECUTE, dummy_process.pid)
    assert second.status_code == 409
    assert _code(second) == "not_approved"


def test_recycled_pid_is_not_killed(dummy_process):
    _post(CONFIRM, dummy_process.pid)
    # Simulate the PID now belonging to a different process than the one confirmed
    PENDING_APPROVALS[dummy_process.pid]["create_time"] = 0.0

    response = _post(EXECUTE, dummy_process.pid)

    assert response.status_code == 409
    assert _code(response) == "pid_reused"
    assert dummy_process.poll() is None  # Not killed


def test_expired_approval_is_blocked(dummy_process):
    _post(CONFIRM, dummy_process.pid)
    PENDING_APPROVALS[dummy_process.pid]["timestamp"] = time.time() - 301

    response = _post(EXECUTE, dummy_process.pid)

    assert response.status_code == 409
    assert _code(response) == "not_approved"
    assert dummy_process.poll() is None


def test_execute_on_already_closed_process_reports_not_found(dummy_process):
    _post(CONFIRM, dummy_process.pid)
    dummy_process.kill()
    dummy_process.wait()

    response = _post(EXECUTE, dummy_process.pid)

    assert response.status_code == 404
    assert _code(response) == "not_found"
    assert response.json()["detail"]["message"] == "Process already closed."


def test_access_denied_maps_to_403_with_admin_message():
    from handlers import termination_handler

    with patch.object(termination_handler, "_terminate_blocking",
                      return_value={"status": "access_denied", "error": termination_handler.ACCESS_DENIED_MESSAGE}), \
         patch("handlers.approval_handler.psutil.Process") as fake_proc:
        fake_proc.return_value.name.return_value = "someapp.exe"
        fake_proc.return_value.create_time.return_value = 123.0
        from handlers.approval_handler import request_approval
        request_approval(MISSING_PID, "someapp.exe", 3, create_time=123.0)

        response = _post(EXECUTE, MISSING_PID)

    assert response.status_code == 403
    assert _code(response) == "access_denied"
    assert response.json()["detail"]["message"] == "Permission Denied. Please restart KavanMCP as Administrator."


def test_cors_allows_tauri_origin_only():
    allowed = client.options(EXECUTE, headers={
        "Origin": "http://localhost:1420",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    blocked = client.options(EXECUTE, headers={
        "Origin": "https://evil.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })

    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:1420"
    assert "access-control-allow-origin" not in blocked.headers


def test_server_refuses_to_stage_itself_or_its_launcher():
    for pid in (os.getpid(), os.getppid()):
        response = _post(CONFIRM, pid)

        assert response.status_code == 403
        assert _code(response) == "self_protected"
        assert pid not in PENDING_APPROVALS


def test_execute_refuses_own_pid_even_if_an_approval_exists():
    from handlers.approval_handler import request_approval

    me = psutil.Process(os.getpid())
    request_approval(me.pid, me.name(), 3, create_time=me.create_time())

    response = _post(EXECUTE, me.pid)

    assert response.status_code == 403
    assert _code(response) == "self_protected"


def test_foreign_origin_cannot_stage_a_kill(dummy_process):
    response = client.post(CONFIRM, json={"pid": dummy_process.pid}, headers={"Origin": "https://evil.example"})

    assert response.status_code == 403
    assert _code(response) == "forbidden_origin"
    assert dummy_process.pid not in PENDING_APPROVALS


def test_dns_rebinding_host_is_rejected(dummy_process):
    """A rebound page is same-origin, so the only tell is a Host that is not localhost."""
    response = client.post(CONFIRM, json={"pid": dummy_process.pid}, headers={"Host": "evil.example:8000"})

    assert response.status_code == 403
    assert dummy_process.pid not in PENDING_APPROVALS


def test_tauri_origin_and_originless_local_clients_are_allowed(dummy_process):
    from_app = client.post(CONFIRM, json={"pid": dummy_process.pid}, headers={"Origin": "http://tauri.localhost"})
    PENDING_APPROVALS.clear()
    from_cli = client.post(CONFIRM, json={"pid": dummy_process.pid})

    assert from_app.status_code == 200
    assert from_cli.status_code == 200


def test_websocket_rejects_foreign_origin():
    from starlette.websockets import WebSocketDisconnect

    # The test client ignores base_url for sockets, so the local address is spelled out
    ws_url = "ws://127.0.0.1:8000/ws"

    with TestClient(app, base_url="http://127.0.0.1:8000") as live:  # Runs the lifespan, so metrics flow
        with pytest.raises(WebSocketDisconnect):
            with live.websocket_connect(ws_url, headers={"Origin": "https://evil.example"}):
                pass

        with live.websocket_connect(ws_url, headers={"Origin": "http://localhost:1420"}) as ws:
            assert next_metrics_update(ws)["data"]["cpu_percent"] >= 0


def test_kill_that_does_not_take_effect_is_not_reported_or_audited():
    from handlers import termination_handler

    class Unkillable:
        def name(self): return "stubborn.exe"
        def memory_info(self): return type("M", (), {"rss": 50 * 1024 * 1024})()
        def cpu_percent(self, interval=None): return 1.0
        def exe(self): return "C:/stubborn.exe"
        def cmdline(self): return ["C:/stubborn.exe"]
        def terminate(self): pass
        def kill(self): pass
        def wait(self, timeout=None): raise psutil.TimeoutExpired(timeout)

    with patch.object(termination_handler.psutil, "Process", return_value=Unkillable()), \
         patch.object(termination_handler, "log_termination") as audit:
        import asyncio
        result = asyncio.run(termination_handler.terminate_process(MISSING_PID, "test"))

    assert result["status"] == "error"
    assert "did not exit" in result["error"]
    audit.assert_not_called()


def test_lowest_layer_refuses_tier_1_before_any_os_call():
    """TRD 6.1. Uses a fake process: a real Tier 1 process must never be at risk in a test."""
    from handlers import termination_handler

    calls = []

    class FakeCritical:
        def name(self): return "LSASS.EXE"
        def terminate(self): calls.append("terminate")
        def kill(self): calls.append("kill")

    with patch.object(termination_handler.psutil, "Process", return_value=FakeCritical()), \
         patch.object(termination_handler, "log_termination") as audit:
        import asyncio
        result = asyncio.run(termination_handler.terminate_process(MISSING_PID, "direct call, no approval"))

    assert result["status"] == "tier1_blocked"
    assert calls == []
    audit.assert_not_called()
