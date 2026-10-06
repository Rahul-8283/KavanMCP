import json
import os
import sys

import psutil
import pytest
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ws_helpers import next_metrics_update

from config import settings_manager
from config.whitelist import TIER_1_WHITELIST
from handlers.approval_handler import PENDING_APPROVALS, protected_pids
from ws_server import app

CONFIRM = "/api/confirm_termination"
EXECUTE = "/api/execute_termination"
UPDATE = "/api/update_thresholds"


@pytest.fixture
def restore_settings():
    original = dict(settings_manager.load_config())
    yield
    settings_manager.update_config(original)


def test_websocket_streams_metrics_update():
    with TestClient(app, base_url="http://127.0.0.1:8000") as client:
        with client.websocket_connect("ws://127.0.0.1:8000/ws") as ws:
            message = next_metrics_update(ws)

    data = message["data"]
    assert 0 <= data["cpu_percent"] <= 100
    assert 0 <= data["ram_percent"] <= 100


def test_threshold_update_persists_to_disk(restore_settings):
    response = TestClient(app, base_url="http://127.0.0.1:8000").post(UPDATE, json={"cpu_threshold": 12, "theme": "dark"})

    assert response.status_code == 200
    with open(settings_manager.CONFIG_PATH, encoding="utf-8") as f:
        on_disk = json.load(f)
    assert on_disk["cpu_threshold"] == 12
    assert on_disk["theme"] == "dark"

    # A fresh load (what a reopened app does) returns the saved value
    assert settings_manager.load_config()["cpu_threshold"] == 12


def _tier1_pids():
    found = {}
    for proc in psutil.process_iter(["pid", "name"]):
        name = (proc.info["name"] or "").lower()
        if name in TIER_1_WHITELIST and name not in found:
            found[name] = proc.info["pid"]
    return found


def test_every_visible_tier1_process_is_unkillable_via_api():
    pids = _tier1_pids()
    if not pids:
        pytest.skip("No Tier 1 process visible to this session")

    client = TestClient(app, base_url="http://127.0.0.1:8000")
    for name, pid in pids.items():
        PENDING_APPROVALS.clear()

        staged = client.post(CONFIRM, json={"pid": pid})
        assert staged.status_code == 403, name
        # A Tier 1 process that launched this test run (explorer.exe, from a terminal) is also
        # KavanMCP's own ancestor, and the self-protection gate answers first. Either refusal is correct.
        expected = {"tier1_blocked", "self_protected"} if pid in protected_pids() else {"tier1_blocked"}
        assert staged.json()["detail"]["code"] in expected, name

        executed = client.post(EXECUTE, json={"pid": pid})
        assert executed.status_code == 409, name
        assert executed.json()["detail"]["code"] == "not_approved", name

        assert psutil.pid_exists(pid), f"{name} was killed"

    PENDING_APPROVALS.clear()


def test_non_json_body_is_a_400_not_a_server_error():
    client = TestClient(app, base_url="http://127.0.0.1:8000", raise_server_exceptions=False)

    response = client.post(CONFIRM, content='{"pid": 1}', headers={"Content-Type": "text/plain"})

    assert response.status_code == 400
    assert response.json()["detail"][0]["loc"] == ["body"]
    assert 1 not in PENDING_APPROVALS


def test_null_threshold_and_unknown_theme_are_not_persisted(restore_settings):
    client = TestClient(app, base_url="http://127.0.0.1:8000")
    before = settings_manager.load_config()

    null_threshold = client.post(UPDATE, json={"cpu_threshold": None})
    bad_theme = client.post(UPDATE, json={"theme": "banana"})
    out_of_range = client.post(UPDATE, json={"ram_threshold": 150})

    assert null_threshold.json()["status"] == "ignored"
    assert bad_theme.status_code == 400
    assert out_of_range.status_code == 400
    assert settings_manager.load_config() == before


def test_corrupt_settings_file_values_fall_back_to_defaults(restore_settings):
    with open(settings_manager.CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump({"cpu_threshold": None, "ram_threshold": "high", "disk_threshold": 80,
                   "theme": "banana", "sound_alerts": "yes", "unknown": 1}, f)

    config = settings_manager.load_config()

    assert config == {**settings_manager.DEFAULT_CONFIG, "disk_threshold": 80}


def test_alerts_repeat_only_after_the_cooldown():
    from ws_server import ALERT_COOLDOWN, build_alerts

    values = {"cpu": 97.0, "ram": 50.0, "disk": 10.0}
    config = {"cpu_threshold": 90, "ram_threshold": 90, "disk_threshold": 95}
    last_alert: dict = {}

    first = build_alerts(values, config, last_alert, now=100.0)
    during_cooldown = build_alerts(values, config, last_alert, now=100.0 + ALERT_COOLDOWN - 1)
    after_cooldown = build_alerts(values, config, last_alert, now=100.0 + ALERT_COOLDOWN)

    assert [m["type"] for m in first] == ["threshold_alert"]
    assert first[0]["level"] == "critical"
    assert during_cooldown == []
    assert [m["type"] for m in after_cooldown] == ["threshold_alert"]


def test_no_alert_at_or_below_threshold():
    from ws_server import build_alerts

    alerts = build_alerts({"cpu": 90.0, "ram": 10.0, "disk": 10.0},
                          {"cpu_threshold": 90, "ram_threshold": 90, "disk_threshold": 95}, {}, now=1.0)

    assert alerts == []
