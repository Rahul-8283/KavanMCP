import json
import os
import sys

import psutil
import pytest
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import settings_manager
from config.whitelist import TIER_1_WHITELIST
from handlers.approval_handler import PENDING_APPROVALS
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
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            message = ws.receive_json()

    assert message["type"] in ("metrics_update", "threshold_alert")
    if message["type"] == "metrics_update":
        data = message["data"]
        assert 0 <= data["cpu_percent"] <= 100
        assert 0 <= data["ram_percent"] <= 100


def test_threshold_update_persists_to_disk(restore_settings):
    response = TestClient(app).post(UPDATE, json={"cpu_threshold": 12, "theme": "dark"})

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

    client = TestClient(app)
    for name, pid in pids.items():
        PENDING_APPROVALS.clear()

        staged = client.post(CONFIRM, json={"pid": pid})
        assert staged.status_code == 403, name
        assert staged.json()["detail"]["code"] == "tier1_blocked", name

        executed = client.post(EXECUTE, json={"pid": pid})
        assert executed.status_code == 409, name
        assert executed.json()["detail"]["code"] == "not_approved", name

        assert psutil.pid_exists(pid), f"{name} was killed"

    PENDING_APPROVALS.clear()
