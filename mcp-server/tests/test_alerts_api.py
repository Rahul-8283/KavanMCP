"""Phase 2: GET /api/alerts, and the WebSocket messages that keep the history page current."""
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
from database import db
from handlers.history_recorder import Episode, EpisodeTracker, MinuteAggregator
from utils.timefmt import utc_text
from ws_server import app

client = TestClient(app, base_url="http://127.0.0.1:8000")

HOUR = 3600
DAY = 24 * HOUR
# On a minute boundary, so the aggregator's minute rolls over at a predictable sample
MINUTE_START = 1791189000.0


@pytest.fixture(autouse=True)
def empty_history():
    """Every test starts with no alerts. The database itself is the session's throwaway one."""
    conn = sqlite3.connect(db.DB_PATH)
    conn.execute("DELETE FROM alert_events")
    conn.commit()
    conn.close()


def add_alert(started_ago: float, metric="cpu", level="warning", duration=60.0, name=None) -> str:
    """Stores one alert that started `started_ago` seconds ago. duration None leaves it ongoing."""
    alert_id = str(uuid.uuid4())
    now = time.time()
    ended = None if duration is None else utc_text(now - started_ago + duration)
    conn = sqlite3.connect(db.DB_PATH)
    conn.execute(
        "INSERT INTO alert_events (id, metric, level, threshold, started_at, ended_at, peak_value, cpu_at_start, "
        "ram_at_start, disk_at_start, top_process, top_process_pid, top_process_value) "
        "VALUES (?, ?, ?, 90, ?, ?, 95, 93.1, 71.0, 47.2, ?, ?, ?)",
        (alert_id, metric, level, utc_text(now - started_ago), ended, name, 2303 if name else None, 64.2 if name else None),
    )
    conn.commit()
    conn.close()
    return alert_id


def listed(**params) -> list[str]:
    response = client.get("/api/alerts", params=params)
    assert response.status_code == 200, response.text
    return [alert["id"] for alert in response.json()["alerts"]]


# --- The endpoint (section 2) ---

def test_only_alerts_that_started_inside_the_window_are_returned():
    inside = add_alert(started_ago=2 * HOUR)
    add_alert(started_ago=40 * HOUR)
    add_alert(started_ago=10 * DAY)

    start = utc_text(time.time() - 3 * HOUR).replace(" ", "T") + "Z"
    assert listed(**{"from": start}) == [inside]


def test_with_no_parameters_the_window_is_the_last_24_hours():
    recent = add_alert(started_ago=23 * HOUR)
    add_alert(started_ago=25 * HOUR)

    assert listed() == [recent]


def test_each_filter_narrows_and_they_combine():
    cpu_critical = add_alert(HOUR, metric="cpu", level="critical")
    cpu_warning = add_alert(2 * HOUR, metric="cpu", level="warning")
    ram_critical = add_alert(3 * HOUR, metric="ram", level="critical")

    assert sorted(listed(metric="cpu")) == sorted([cpu_critical, cpu_warning])
    assert sorted(listed(level="critical")) == sorted([cpu_critical, ram_critical])
    assert listed(metric="cpu", level="critical") == [cpu_critical]
    assert listed(metric="disk") == []


def test_more_than_the_limit_returns_the_limit_and_says_so():
    now = time.time()
    conn = sqlite3.connect(db.DB_PATH)
    conn.executemany(
        "INSERT INTO alert_events (id, metric, level, threshold, started_at, ended_at, peak_value, cpu_at_start, "
        "ram_at_start, disk_at_start) VALUES (?, 'cpu', 'warning', 90, ?, ?, 95, 1, 1, 1)",
        [(str(uuid.uuid4()), utc_text(now - 60 - i), utc_text(now - i)) for i in range(600)],
    )
    conn.commit()
    conn.close()

    body = client.get("/api/alerts", params={"limit": 500}).json()

    assert len(body["alerts"]) == 500
    assert body["truncated"] is True
    # Exactly the limit is not truncation
    assert client.get("/api/alerts", params={"limit": 600}).json()["truncated"] is False


def test_the_limit_applies_after_filtering_not_before():
    """The V2.0.1 audit-log bug: rows were capped first and filtered second."""
    wanted = add_alert(23 * HOUR, metric="disk")
    for i in range(5):
        add_alert(i * 60 + 60, metric="cpu")

    assert listed(metric="disk", limit=1) == [wanted]


def test_an_ongoing_alert_is_listed_first_whatever_its_start_time():
    newest_closed = add_alert(started_ago=60)
    oldest_ongoing = add_alert(started_ago=20 * HOUR, duration=None)
    older_closed = add_alert(started_ago=2 * HOUR)

    assert listed() == [oldest_ongoing, newest_closed, older_closed]


def test_the_response_has_the_documented_shape():
    add_alert(started_ago=HOUR, metric="cpu", level="critical", duration=268.0, name="chrome.exe")
    add_alert(started_ago=2 * HOUR, metric="disk", duration=None)

    ongoing, closed = client.get("/api/alerts").json()["alerts"]

    assert closed["ended_at"].endswith("Z") and closed["started_at"].endswith("Z")
    assert closed["duration_seconds"] == 268
    assert closed["readings"] == {"cpu": 93.1, "ram": 71.0, "disk": 47.2}
    assert closed["top_process"] == {"name": "chrome.exe", "pid": 2303, "value": 64.2}
    assert closed["muted"] is False
    assert (ongoing["ended_at"], ongoing["duration_seconds"], ongoing["top_process"]) == (None, None, None)


@pytest.mark.parametrize("params", [
    {"metric": "gpu"},
    {"level": "fatal"},
    {"limit": 0},
    {"limit": 1001},
    {"from": "not-a-date"},
    {"from": "2026-10-05T00:00:00Z", "to": "2026-10-04T00:00:00Z"},
    {"from": "2026-10-05T00:00:00Z", "to": "2026-10-05T00:00:00Z"},
])
def test_a_bad_request_is_a_400_not_a_500(params):
    assert client.get("/api/alerts", params=params).status_code == 400


def test_a_request_from_a_foreign_origin_is_refused():
    response = client.get("/api/alerts", headers={"Origin": "https://evil.example"})

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "forbidden_origin"


def test_the_app_origin_and_origin_less_local_clients_are_allowed():
    assert client.get("/api/alerts", headers={"Origin": "http://tauri.localhost"}).status_code == 200
    assert client.get("/api/alerts").status_code == 200


def test_an_unreadable_history_is_an_error_not_an_empty_list(monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", os.path.join(os.path.dirname(db.DB_PATH), "missing-dir", "x.db"))

    quiet = TestClient(app, base_url="http://127.0.0.1:8000", raise_server_exceptions=False)

    assert quiet.get("/api/alerts").status_code == 500


# --- The WebSocket messages (section 3) ---

@pytest.fixture
def announced(monkeypatch):
    """A window is 'connected': everything the server broadcasts is collected here."""
    messages: list[dict] = []

    async def collect(message):
        messages.append(message)

    monkeypatch.setattr(ws_server.manager, "active_connections", [object()])
    monkeypatch.setattr(ws_server.manager, "broadcast", collect)
    monkeypatch.setattr(ws_server, "episodes", EpisodeTracker())
    monkeypatch.setattr(ws_server, "aggregator", MinuteAggregator())
    # Disk has no per-process figure, so no process scan runs and the messages are deterministic
    monkeypatch.setitem(ws_server.ACTIVE_CONFIG, "cpu_threshold", 101)
    monkeypatch.setitem(ws_server.ACTIVE_CONFIG, "ram_threshold", 101)
    monkeypatch.setitem(ws_server.ACTIVE_CONFIG, "disk_threshold", 90)
    return messages


def run_disk_episode(announced_messages: list[dict]):
    """Disk over its limit, rising to 97, then back to normal: one episode from start to end."""
    last_alert_time: dict = {}
    samples = [(0, 92.0), (2, 97.0)] + [(t, 97.0) for t in range(4, 62, 2)] + [(t, 50.0) for t in range(62, 96, 2)]

    async def go():
        for offset, disk in samples:
            await ws_server.run_cycle({"cpu": 1.0, "ram": 1.0, "disk": disk}, MINUTE_START + offset, last_alert_time)

    asyncio.run(go())
    return announced_messages


def test_an_episode_announces_started_updated_and_ended_with_the_full_row(announced):
    run_disk_episode(announced)

    events = [m for m in announced if m["type"] == "alert_event"]

    assert [e["event"] for e in events] == ["started", "updated", "ended"]
    started, updated, ended = (e["alert"] for e in events)
    assert started["id"] == updated["id"] == ended["id"]
    assert (started["level"], started["peak_value"], started["ended_at"]) == ("warning", 92.0, None)
    assert (updated["level"], updated["peak_value"], updated["ended_at"]) == ("critical", 97.0, None)
    assert ended["ended_at"] is not None and ended["duration_seconds"] == 62
    for alert in (started, updated, ended):
        assert {"metric", "threshold", "readings", "top_process", "muted"} <= alert.keys()


def test_the_announced_row_is_the_stored_row(announced):
    run_disk_episode(announced)

    final = [m for m in announced if m["type"] == "alert_event"][-1]["alert"]
    response = client.get("/api/alerts", params={"from": "2026-01-01T00:00:00Z", "to": "2030-01-01T00:00:00Z"})

    assert response.json()["alerts"] == [final]


def test_a_threshold_alert_carries_its_episodes_id(announced):
    run_disk_episode(announced)

    event_id = next(m for m in announced if m["type"] == "alert_event")["alert"]["id"]
    alerts = [m for m in announced if m["type"] == "threshold_alert"]

    assert alerts, "the disk was over its limit, so alerts were raised"
    assert {a["episode_id"] for a in alerts} == {event_id}
    assert {a["metric"] for a in alerts} == {"disk"}
    assert {"level", "message", "timestamp"} <= alerts[0].keys(), "existing fields are unchanged"


def test_the_metrics_update_comes_first_every_cycle(announced):
    async def go():
        await ws_server.run_cycle({"cpu": 1.0, "ram": 1.0, "disk": 95.0}, MINUTE_START, {})

    asyncio.run(go())

    types = [m["type"] for m in announced]
    assert types[0] == "metrics_update"
    assert "threshold_alert" in types


def test_no_window_means_nothing_is_announced_but_the_history_is_still_written(monkeypatch):
    sent = []

    async def collect(message):
        sent.append(message)

    monkeypatch.setattr(ws_server.manager, "active_connections", [])
    monkeypatch.setattr(ws_server.manager, "broadcast", collect)
    monkeypatch.setattr(ws_server, "episodes", EpisodeTracker())
    monkeypatch.setattr(ws_server, "aggregator", MinuteAggregator())
    monkeypatch.setitem(ws_server.ACTIVE_CONFIG, "disk_threshold", 90)
    monkeypatch.setitem(ws_server.ACTIVE_CONFIG, "cpu_threshold", 101)
    monkeypatch.setitem(ws_server.ACTIVE_CONFIG, "ram_threshold", 101)

    asyncio.run(ws_server.run_cycle({"cpu": 1.0, "ram": 1.0, "disk": 95.0}, MINUTE_START, {}))

    assert sent == []
    assert len(listed(**{"from": "2026-01-01T00:00:00Z", "to": "2030-01-01T00:00:00Z"})) == 1


def test_a_suspicious_process_raises_one_alert_naming_it():
    episode = Episode(metric="process", threshold=25.0, started_at=MINUTE_START, peak_value=27.4, level="warning",
                      readings={}, top_process={"name": "updater_svc.exe", "pid": 6390, "value": 27.4}, id="ep-1")

    alert = ws_server.build_process_alert(episode, MINUTE_START)

    assert alert["type"] == "threshold_alert"
    assert alert["message"] == "Suspicious process: updater_svc.exe (PID 6390) is using 27% CPU with no window."
    assert (alert["metric"], alert["episode_id"], alert["level"]) == ("process", "ep-1", "warning")


def test_the_live_websocket_still_streams_metrics_with_the_new_cycle():
    from ws_helpers import next_metrics_update

    with (TestClient(app, base_url="http://127.0.0.1:8000") as live,
          live.websocket_connect("ws://127.0.0.1:8000/ws") as ws):
        message = next_metrics_update(ws)

    assert 0 <= message["data"]["cpu_percent"] <= 100
