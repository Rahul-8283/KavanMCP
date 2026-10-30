"""Phase 6 §4: an app on the never-alert list is recorded but never announced."""
import asyncio
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ws_server
from config.settings_manager import ACTIVE_CONFIG
from database import db
from handlers.history_recorder import EpisodeTracker, MinuteAggregator
from handlers.process_watch import ProcessWatcher

MINUTE_START = 1_790_000_000.0


@pytest.fixture
def announced(monkeypatch):
    messages = []

    async def collect(message):
        messages.append(message)

    monkeypatch.setattr(ws_server.manager, "active_connections", [object()])
    monkeypatch.setattr(ws_server.manager, "broadcast", collect)
    monkeypatch.setattr(ws_server, "episodes", EpisodeTracker())
    monkeypatch.setattr(ws_server, "aggregator", MinuteAggregator())
    monkeypatch.setattr(ws_server, "last_alert_time", {})
    monkeypatch.setitem(ACTIVE_CONFIG, "cpu_threshold", 90)
    monkeypatch.setitem(ACTIVE_CONFIG, "ram_threshold", 101)
    monkeypatch.setitem(ACTIVE_CONFIG, "disk_threshold", 90)
    monkeypatch.setitem(ACTIVE_CONFIG, "never_alert", [])
    return messages


def top_process(monkeypatch, result=None, error=None):
    async def lookup(metric):
        if error:
            raise error
        return result

    monkeypatch.setattr(ws_server, "lookup_top_process", lookup)


def run_episode(metric: str, value: float, cycles: int = 6):
    """One episode of a metric held over its limit, then a settle so the scan can finish."""
    last = {}

    async def go():
        for offset in range(cycles):
            values = {"cpu": 1.0, "ram": 1.0, "disk": 1.0}
            values[metric] = value
            await ws_server.run_cycle(values, MINUTE_START + offset * 2, last)
        await asyncio.sleep(0.1)

    asyncio.run(go())


def stored_episode(metric: str) -> dict:
    conn = sqlite3.connect(db.DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM alert_events WHERE metric = ? ORDER BY rowid DESC LIMIT 1", (metric,)).fetchone()
    conn.close()
    return dict(row)


def threshold_alerts(messages):
    return [m for m in messages if m["type"] == "threshold_alert"]


def test_a_cpu_episode_on_a_listed_app_is_recorded_muted_and_silent(announced, monkeypatch):
    ACTIVE_CONFIG["never_alert"] = ["obs64.exe"]
    top_process(monkeypatch, {"name": "obs64.exe", "pid": 4000, "value": 38.5})

    run_episode("cpu", 97.0)

    assert threshold_alerts(announced) == [], "no toast at the start or on any repeat"
    assert stored_episode("cpu")["muted"] == 1
    assert stored_episode("cpu")["top_process"] == "obs64.exe"
    assert any(m["type"] == "alert_event" and m["alert"]["muted"] for m in announced), "the history still updates"


def test_an_episode_on_an_unlisted_app_is_announced_once_after_the_scan(announced, monkeypatch):
    ACTIVE_CONFIG["never_alert"] = ["obs64.exe"]
    top_process(monkeypatch, {"name": "chrome.exe", "pid": 5000, "value": 70.0})

    run_episode("cpu", 97.0)

    alerts = threshold_alerts(announced)
    assert len(alerts) >= 1
    assert alerts[0]["level"] == "critical"
    assert alerts[0]["episode_id"] == stored_episode("cpu")["id"]
    assert stored_episode("cpu")["muted"] == 0


def test_a_failed_scan_never_silences_the_alert(announced, monkeypatch):
    ACTIVE_CONFIG["never_alert"] = ["obs64.exe"]
    top_process(monkeypatch, error=OSError("access denied"))

    run_episode("cpu", 97.0)

    assert len(threshold_alerts(announced)) >= 1
    assert stored_episode("cpu")["muted"] == 0


def test_a_scan_that_finds_no_top_process_still_alerts(announced, monkeypatch):
    top_process(monkeypatch, None)

    run_episode("cpu", 97.0)

    assert len(threshold_alerts(announced)) >= 1


def test_a_disk_episode_is_never_muted(announced):
    ACTIVE_CONFIG["never_alert"] = ["obs64.exe", "chrome.exe", "code.exe"]

    run_episode("disk", 97.0)

    assert len(threshold_alerts(announced)) >= 1
    assert stored_episode("disk")["muted"] == 0


def test_a_suspicious_process_on_the_list_starts_muted():
    watcher = ProcessWatcher()
    listed = {"pid": 6000, "name": "xmrig_helper.exe", "cpu_percent": 60.0, "memory_mb": 10.0, "is_headless": True}
    readings = {"cpu": 1.0, "ram": 1.0, "disk": 1.0}
    original = list(ACTIVE_CONFIG.get("never_alert", []))
    ACTIVE_CONFIG["never_alert"] = ["xmrig_helper.exe"]
    try:
        watcher.update([listed], readings, MINUTE_START)
        changes = watcher.update([listed], readings, MINUTE_START + 60)
    finally:
        ACTIVE_CONFIG["never_alert"] = original

    started = [c for c in changes if c.kind == "started"]
    assert len(started) == 1
    assert started[0].episode.muted is True

