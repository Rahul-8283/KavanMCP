"""Phase 7 §3: the alert history is kept for the user's choice of days, applied at once."""
import asyncio
import os
import sqlite3
import sys
import time
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ws_server
from config import settings_manager
from database import db
from utils.timefmt import utc_text
from ws_server import app

client = TestClient(app, base_url="http://127.0.0.1:8000")
DAY = 86400
UPDATE = "/api/update_thresholds"


@pytest.fixture(autouse=True)
def isolated(monkeypatch, tmp_path):
    """No alerts left by other tests, and settings written to a throwaway file."""
    conn = sqlite3.connect(db.DB_PATH)
    conn.execute("DELETE FROM alert_events")
    conn.commit()
    conn.close()
    monkeypatch.setattr(settings_manager, "CONFIG_PATH", str(tmp_path / "settings.json"))
    monkeypatch.setitem(settings_manager.ACTIVE_CONFIG, "alert_retention_days", 30)


def add_alert(days_ago: float, ended: bool = True) -> str:
    alert_id = str(uuid.uuid4())
    started = time.time() - days_ago * DAY
    conn = sqlite3.connect(db.DB_PATH)
    conn.execute(
        "INSERT INTO alert_events (id, metric, level, threshold, started_at, ended_at, peak_value, cpu_at_start, "
        "ram_at_start, disk_at_start) VALUES (?, 'cpu', 'warning', 90, ?, ?, 95, 95, 50, 50)",
        (alert_id, utc_text(started), utc_text(started + 60) if ended else None),
    )
    conn.commit()
    conn.close()
    return alert_id


def stored_ids() -> set[str]:
    conn = sqlite3.connect(db.DB_PATH)
    ids = {row[0] for row in conn.execute("SELECT id FROM alert_events")}
    conn.close()
    return ids


def test_shortening_retention_deletes_older_alerts_at_once():
    five, ten, twenty = add_alert(5), add_alert(10), add_alert(20)

    response = client.post(UPDATE, json={"alert_retention_days": 7})

    assert response.status_code == 200
    assert response.json()["config"]["alert_retention_days"] == 7
    assert stored_ids() == {five}, "the 10 and 20 day alerts go without waiting for the hourly prune"
    assert ten not in stored_ids() and twenty not in stored_ids()


def test_an_open_episode_is_never_pruned():
    five, twenty_open = add_alert(5), add_alert(20, ended=False)
    add_alert(20)

    client.post(UPDATE, json={"alert_retention_days": 7})

    assert stored_ids() == {five, twenty_open}


def test_lengthening_retention_deletes_nothing(monkeypatch):
    monkeypatch.setitem(settings_manager.ACTIVE_CONFIG, "alert_retention_days", 7)
    kept = {add_alert(5), add_alert(10), add_alert(20)}

    response = client.post(UPDATE, json={"alert_retention_days": 30})

    assert response.status_code == 200
    assert stored_ids() == kept


def test_a_change_without_retention_does_not_prune(monkeypatch):
    calls = []

    async def spy(*args):
        calls.append(args)

    monkeypatch.setattr(ws_server, "prune_history", spy)
    client.post(UPDATE, json={"sound_volume": 40})

    assert calls == []


def test_the_retention_request_is_answered_before_the_prune_runs(monkeypatch):
    """The prune is a background task: the response is complete before it starts."""
    events: list[str] = []

    async def slow_prune(*args):
        events.append("prune started")
        await asyncio.sleep(0.2)
        events.append("prune finished")

    monkeypatch.setattr(ws_server, "prune_history", slow_prune)

    async def call():
        body = b'{"alert_retention_days": 7}'
        scope = {
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
            "scheme": "http", "path": UPDATE, "raw_path": UPDATE.encode(), "query_string": b"",
            "root_path": "", "headers": [(b"host", b"127.0.0.1:8000"), (b"content-type", b"application/json"),
                                         (b"content-length", str(len(body)).encode())],
            "client": ("127.0.0.1", 50000), "server": ("127.0.0.1", 8000),
        }
        sent = False

        async def receive():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            await asyncio.sleep(3600)

        async def send(message):
            if message["type"] == "http.response.body" and not message.get("more_body"):
                events.append("response sent")

        await app(scope, receive, send)

    asyncio.run(call())

    assert events == ["response sent", "prune started", "prune finished"]
