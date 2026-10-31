"""Phase 8 §9: every claim about the API boundary, the rollback endpoint, the whitelist and the inputs,
tested from the outside, the way an attacker or a hostile web page would."""
import asyncio
import json
import os
import sqlite3
import subprocess
import sys
import time

import pytest
from fastapi.testclient import TestClient
from fastmcp import Client

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from kill_helpers import EXISTING_EXE, add_kill, read_row, row_ids
from starlette.websockets import WebSocketDisconnect

from config.settings_manager import ACTIVE_CONFIG
from database import db
from handlers.approval_handler import PENDING_APPROVALS
from server import mcp
from ws_server import app

client = TestClient(app, base_url="http://127.0.0.1:8000")


def all_routes() -> list[tuple[str, str]]:
    """Every HTTP route the app serves, from its own schema, so a new route is covered without editing this file."""
    return sorted((method.upper(), path) for path, methods in app.openapi()["paths"].items() for method in methods)


def send(method, path, **kwargs):
    return client.request(method, path, **kwargs)


def tables_snapshot() -> dict:
    conn = sqlite3.connect(db.DB_PATH)
    counts = {name: conn.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
              for name in ("audit_log", "alert_events", "metrics_history")}
    conn.close()
    return counts


@pytest.fixture(autouse=True)
def clean_approvals():
    PENDING_APPROVALS.clear()
    yield
    PENDING_APPROVALS.clear()


# --- 9.1 The API boundary: every route, every hostile request ---

def test_the_route_list_covers_the_routes_this_release_added():
    paths = {path for _, path in all_routes()}

    assert {"/api/alerts", "/api/metrics/history", "/api/kills", "/api/rollback", "/api/update_thresholds"} <= paths


@pytest.mark.parametrize("method, path", all_routes())
@pytest.mark.parametrize("origin", [
    "https://evil.example",
    "null",                              # a sandboxed iframe or a local file
    "http://localhost:1420.evil.example",  # begins like the app's origin, but is not it
    "http://localhost:1421",             # right host, wrong port
    "http://evil.example@localhost:1420",
    "",
])
def test_a_request_from_a_foreign_origin_is_refused_on_every_route(method, path, origin):
    response = send(method, path, headers={"Origin": origin}, json={} if method == "POST" else None)

    assert response.status_code == 403, f"{method} {path} from {origin!r}: {response.status_code}"
    assert response.json()["detail"]["code"] == "forbidden_origin"


@pytest.mark.parametrize("method, path", all_routes())
@pytest.mark.parametrize("host", ["evil.example:8000", "127.0.0.1:8000.evil.example", "localhost", "127.0.0.1:9999", ""])
def test_a_request_with_a_foreign_host_is_refused_on_every_route(method, path, host):
    """DNS rebinding: a hostile page that has become same-origin with 127.0.0.1 still sends the wrong Host."""
    response = send(method, path, headers={"Host": host}, json={} if method == "POST" else None)

    assert response.status_code == 403, f"{method} {path} with Host {host!r}: {response.status_code}"


@pytest.mark.parametrize("method, path", all_routes())
def test_a_local_client_with_no_origin_is_still_allowed(method, path):
    """curl and the MCP processes send no Origin. The check refuses foreign web pages, not local programs."""
    response = send(method, path, json={} if method == "POST" else None)

    assert response.status_code != 403


@pytest.mark.parametrize("origin", ["http://localhost:1420", "http://tauri.localhost", "https://tauri.localhost", "tauri://localhost"])
def test_the_apps_own_origins_are_allowed(origin):
    assert client.get("/api/get_config", headers={"Origin": origin}).status_code == 200


def test_a_websocket_from_a_foreign_origin_is_closed():
    with pytest.raises(WebSocketDisconnect) as closed,             client.websocket_connect("/ws", headers={"Origin": "https://evil.example"}):
        pass

    assert closed.value.code == 1008


def test_a_foreign_origin_cannot_read_the_response_either():
    """CORS: a browser only shows a page the response when the server names that page's origin."""
    response = client.options("/api/get_config", headers={"Origin": "https://evil.example",
                                                          "Access-Control-Request-Method": "GET"})

    assert response.headers.get("access-control-allow-origin") != "https://evil.example"
    assert response.headers.get("access-control-allow-origin") != "*"


def test_a_refused_request_does_not_run_the_action(fake_popen):
    """The request, not only the response, must be stopped: CORS alone lets the request run."""
    audit_id = add_kill()
    config_before = dict(ACTIVE_CONFIG)
    evil = {"Origin": "https://evil.example"}

    restore = client.post("/api/rollback", json={"id": audit_id}, headers=evil)
    settings = client.post("/api/update_thresholds", json={"cpu_threshold": 1, "never_kill": ["explorer.exe"]}, headers=evil)
    confirm = client.post("/api/confirm_termination", json={"pid": os.getpid()}, headers=evil)

    assert {restore.status_code, settings.status_code, confirm.status_code} == {403}
    assert read_row(audit_id)["rolled_back_at"] is None
    fake_popen.assert_not_called()
    assert dict(ACTIVE_CONFIG) == config_before
    assert os.getpid() not in PENDING_APPROVALS


# --- 9.2 The rollback endpoint ---

def test_the_rollback_endpoint_only_restores_a_recorded_kill(fake_popen):
    asyncio.run(db.log_blocked_action("lsass.exe", 600, "test"))
    blocked = row_ids("BLOCKED")[-1]
    restored = add_kill()
    client.post("/api/rollback", json={"id": restored})
    rollback_row = row_ids("ROLLBACK")[-1]
    fake_popen.reset_mock()

    for attempt in (blocked, rollback_row, "00000000-0000-0000-0000-000000000000"):
        response = client.post("/api/rollback", json={"id": attempt})
        assert response.status_code == 404, attempt

    fake_popen.assert_not_called()


@pytest.mark.parametrize("hostile_id", [
    "' OR 1=1 --",
    "x' OR '1'='1",
    "1; DROP TABLE audit_log; --",
    "%",
    "*",
    "\\u0000",
    "../../etc/passwd",
    "C:\\Windows\\System32\\calc.exe",
])
def test_a_hostile_rollback_id_restores_nothing_and_harms_nothing(hostile_id, fake_popen):
    add_kill()
    before = tables_snapshot()

    response = client.post("/api/rollback", json={"id": hostile_id})

    assert response.status_code == 404
    fake_popen.assert_not_called()
    assert tables_snapshot() == before, "the audit database must be exactly as it was"


@pytest.mark.parametrize("body", [{}, {"id": ""}, {"id": 5}, {"id": None}, {"id": ["a"]}, {"id": {"a": 1}}, {"id": "x" * 65}, []])
def test_a_malformed_rollback_body_is_a_400_and_starts_nothing(body, fake_popen):
    response = client.post("/api/rollback", json=body)

    assert response.status_code == 400
    fake_popen.assert_not_called()


def test_extra_fields_beside_the_id_cannot_choose_what_is_launched(fake_popen):
    audit_id = add_kill(argv=["recorded.exe", "--safe"])

    response = client.post("/api/rollback", json={
        "id": audit_id, "path": "C:/Windows/System32/cmd.exe", "executable_path": "C:/evil.exe",
        "command": "calc.exe", "args": ["/c", "del"], "command_line": '["evil.exe"]'})

    assert response.status_code == 200
    launched = fake_popen.call_args.args[0]
    assert launched[0] == EXISTING_EXE, "the executable is the audited one"
    assert launched[1:] == ["--safe"], "only the recorded arguments are used"


def test_a_recorded_command_line_naming_another_program_still_launches_the_audited_one(fake_popen):
    audit_id = add_kill(argv=["C:/Users/Public/evil.exe", "--steal"])

    client.post("/api/rollback", json={"id": audit_id})

    assert fake_popen.call_args.args[0] == [EXISTING_EXE, "--steal"]


# --- 9.3 The whitelist, through the real MCP protocol ---

async def _tool(name, arguments):
    async with Client(mcp) as mcp_client:
        result = await mcp_client.call_tool(name, arguments)
    return result.data if result.data is not None else json.loads(result.content[0].text)


@pytest.fixture
def dummy():
    proc = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(120)"], creationflags=subprocess.CREATE_NO_WINDOW)
    yield proc
    if proc.poll() is None:
        proc.kill()
    proc.wait()


def test_a_protected_process_is_refused_by_the_mcp_tool_over_the_protocol(dummy, monkeypatch):
    monkeypatch.setitem(ACTIVE_CONFIG, "never_kill", ["python.exe"])

    confirm = asyncio.run(_tool("confirm_termination", {"pids": [dummy.pid]}))
    execute = asyncio.run(_tool("execute_termination", {"pids": [dummy.pid]}))

    assert "protected list" in str(confirm)
    assert dummy.pid not in PENDING_APPROVALS
    assert json.loads(execute)[0]["status"] == "blocked" if isinstance(execute, str) else execute[0]["status"] == "blocked"
    time.sleep(0.3)
    assert dummy.poll() is None, "the protected process must still be running"


def test_a_protected_process_is_refused_by_the_rest_api_and_the_mcp_tool_alike(dummy, monkeypatch):
    monkeypatch.setitem(ACTIVE_CONFIG, "never_kill", ["python.exe"])

    rest = client.post("/api/confirm_termination", json={"pid": dummy.pid})
    tool = asyncio.run(_tool("confirm_termination", {"pids": [dummy.pid]}))

    assert rest.status_code == 403 and rest.json()["detail"]["code"] == "user_protected"
    assert rest.json()["detail"]["message"] in str(tool), "both callers get the same message"


def test_no_tool_offered_to_claude_can_write_a_setting_or_a_list():
    async def listing():
        async with Client(mcp) as mcp_client:
            return await mcp_client.list_tools()

    tools = asyncio.run(listing())
    forbidden = {"never_kill", "never_alert", "whitelist", "settings", "threshold", "volume", "retention"}

    assert len(tools) == 7
    for tool in tools:
        text = (tool.name + " " + json.dumps(tool.inputSchema)).lower()
        assert not any(word in text for word in forbidden), f"{tool.name} could reach a setting"


def test_the_whitelist_cannot_be_used_to_unprotect_a_system_process(monkeypatch):
    """Adding a Tier 1 name, then removing it, never changes what Tier 1 means."""
    from config.whitelist import TIER_1_WHITELIST

    name = min(TIER_1_WHITELIST)
    pid = next((p.pid for p in __import__("psutil").process_iter(["name"]) if (p.info["name"] or "").lower() == name), None)
    if pid is None:
        pytest.skip("no Tier 1 process is visible on this machine")

    for listed in ([name], [], [name.upper()]):
        monkeypatch.setitem(ACTIVE_CONFIG, "never_kill", listed)
        response = client.post("/api/confirm_termination", json={"pid": pid})
        assert response.status_code == 403
        assert response.json()["detail"]["code"] in {"tier1_blocked", "self_protected"}


# --- 9.4 Inputs ---

HOSTILE = ["abc", "", "0", "-1", "99999999999999999999", "1e9", "NaN", "null", "true", "'; DROP TABLE alert_events; --",
           "\" OR \"1\"=\"1", "%27", "\u202e", "x" * 5000, "2026-13-45T99:99:99Z", "../../x", "0x41"]


@pytest.mark.parametrize("value", HOSTILE)
@pytest.mark.parametrize("param", ["from", "to", "metric", "level", "limit"])
def test_every_alerts_parameter_survives_hostile_input(param, value):
    before = tables_snapshot()

    response = client.get("/api/alerts", params={param: value})

    assert response.status_code in (200, 400), f"{param}={value!r} gave {response.status_code}"
    assert tables_snapshot() == before


@pytest.mark.parametrize("value", HOSTILE)
@pytest.mark.parametrize("param", ["range", "from", "to"])
def test_every_history_parameter_survives_hostile_input(param, value):
    before = tables_snapshot()

    response = client.get("/api/metrics/history", params={param: value})

    assert response.status_code in (200, 400), f"{param}={value!r} gave {response.status_code}"
    assert tables_snapshot() == before


@pytest.mark.parametrize("value", HOSTILE)
def test_the_kills_window_survives_hostile_input(value):
    before = tables_snapshot()

    response = client.get("/api/kills", params={"hours": value})

    assert response.status_code in (200, 400), f"hours={value!r} gave {response.status_code}"
    assert tables_snapshot() == before


def test_repeated_and_unknown_parameters_are_harmless():
    before = tables_snapshot()

    responses = [client.get("/api/alerts?metric=cpu&metric=ram&metric=' OR 1=1"),
                 client.get("/api/alerts?unknown=1&limit=5&limit=bad"),
                 client.get("/api/metrics/history?range=1h&range=7d&evil=1"),
                 client.get("/api/kills?hours=1&hours=999")]

    assert all(r.status_code in (200, 400) for r in responses)
    assert tables_snapshot() == before


SETTING_ATTACKS = [
    {"cpu_threshold": "high"}, {"cpu_threshold": -1}, {"cpu_threshold": 101}, {"cpu_threshold": 1e9}, {"cpu_threshold": [90]},
    {"ram_threshold": {"a": 1}}, {"disk_threshold": "' OR 1=1"},
    {"theme": "neon"}, {"theme": 5}, {"theme": ["dark"]},
    {"sound_alerts": "yes"}, {"sound_alerts": 1}, {"sound_alerts": [True]},
    {"sound_volume": -1}, {"sound_volume": 101}, {"sound_volume": True}, {"sound_volume": "loud"}, {"sound_volume": 50.5},
    {"sound_volume": [50]}, {"sound_volume": 1e9},
    {"sound_choice": "siren"}, {"sound_choice": 3}, {"sound_choice": ["bell"]}, {"sound_choice": ""},
    {"alert_retention_days": 10}, {"alert_retention_days": 0}, {"alert_retention_days": "7"}, {"alert_retention_days": True},
    {"alert_retention_days": 7.5}, {"alert_retention_days": -7}, {"alert_retention_days": [7]},
    {"never_kill": "explorer.exe"}, {"never_kill": 5}, {"never_kill": {"a": "b"}}, {"never_alert": "x"}, {"never_alert": True},
    {"never_kill": [[1]]}, {"never_kill": [None]},
]


@pytest.mark.parametrize("body", SETTING_ATTACKS, ids=[json.dumps(b)[:60] for b in SETTING_ATTACKS])
def test_a_hostile_setting_is_never_saved(body, tmp_path, monkeypatch):
    from config import settings_manager

    monkeypatch.setattr(settings_manager, "CONFIG_PATH", str(tmp_path / "settings.json"))
    monkeypatch.setattr(settings_manager, "ACTIVE_CONFIG", dict(settings_manager.DEFAULT_CONFIG))
    before = dict(settings_manager.ACTIVE_CONFIG)

    response = client.post("/api/update_thresholds", json=body)

    assert response.status_code in (200, 400), response.status_code
    if response.status_code == 400:
        assert settings_manager.ACTIVE_CONFIG == before
    else:
        # Accepted only if the sanitiser kept nothing hostile
        for key, value in settings_manager.ACTIVE_CONFIG.items():
            assert value == before[key] or key in body and _is_clean(key, value), (key, value)


def _is_clean(key, value):
    if key in ("never_kill", "never_alert"):
        return isinstance(value, list) and all(isinstance(n, str) and n and "/" not in n and "\\" not in n and ":" not in n for n in value)
    return False


def test_a_non_json_settings_body_is_a_400():
    for content in (b"not json", b"[1,2", b"\xff\xfe", b""):
        response = client.post("/api/update_thresholds", content=content, headers={"Content-Type": "application/json"})
        assert response.status_code == 400, content


# --- 9.5 What was already true, through the same front doors ---

def test_a_tier_1_process_cannot_be_staged_or_killed_at_any_layer():
    import psutil

    from config.whitelist import TIER_1_WHITELIST

    found = {}
    for proc in psutil.process_iter(["pid", "name"]):
        name = (proc.info["name"] or "").lower()
        if name in TIER_1_WHITELIST and name not in found:
            found[name] = proc.info["pid"]
    if not found:
        pytest.skip("no Tier 1 process is visible on this machine")

    for pid in found.values():
        staged = client.post("/api/confirm_termination", json={"pid": pid})
        killed = client.post("/api/execute_termination", json={"pid": pid})
        assert staged.status_code == 403
        assert killed.status_code in (403, 409)
        assert pid not in PENDING_APPROVALS
        assert psutil.pid_exists(pid)


def test_kavan_cannot_be_made_to_kill_itself_or_its_launcher():
    import psutil

    own = [os.getpid(), *(p.pid for p in psutil.Process(os.getpid()).parents())]

    for pid in own:
        response = client.post("/api/confirm_termination", json={"pid": pid})
        assert response.status_code == 403, pid
        assert response.json()["detail"]["code"] in {"self_protected", "tier1_blocked"}
        assert pid not in PENDING_APPROVALS
