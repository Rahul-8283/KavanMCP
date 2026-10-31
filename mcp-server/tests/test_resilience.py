"""Phase 8 §8: a crash, a sleep, a time zone change, a damaged settings file and a failing database each
leave the data consistent and the app usable."""
import asyncio
import json
import os
import sqlite3
import stat
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ws_server
from config import settings_manager
from config.settings_manager import ACTIVE_CONFIG
from database import db
from handlers.history_recorder import EpisodeTracker, MinuteAggregator

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
START = 1_790_000_040.0  # on a minute boundary


@pytest.fixture
def recorder(monkeypatch):
    """A fresh tracker and aggregator, a captured socket, and thresholds that a test can cross."""
    sent: list[dict] = []

    async def collect(message):
        sent.append(message)

    monkeypatch.setattr(ws_server.manager, "active_connections", [object()])
    monkeypatch.setattr(ws_server.manager, "broadcast", collect)
    monkeypatch.setattr(ws_server, "episodes", EpisodeTracker())
    monkeypatch.setattr(ws_server, "aggregator", MinuteAggregator())
    monkeypatch.setattr(ws_server, "last_alert_time", {})
    monkeypatch.setitem(ACTIVE_CONFIG, "cpu_threshold", 101)
    monkeypatch.setitem(ACTIVE_CONFIG, "ram_threshold", 101)
    monkeypatch.setitem(ACTIVE_CONFIG, "disk_threshold", 90)
    monkeypatch.setitem(ACTIVE_CONFIG, "never_alert", [])
    conn = sqlite3.connect(db.DB_PATH)
    conn.execute("DELETE FROM alert_events")
    conn.execute("DELETE FROM metrics_history")
    conn.commit()
    conn.close()
    return sent


def cycle(disk: float, at: float):
    asyncio.run(ws_server.run_cycle({"cpu": 1.0, "ram": 1.0, "disk": disk}, at, {}))


def stored(sql):
    conn = sqlite3.connect(db.DB_PATH)
    conn.row_factory = sqlite3.Row
    out = [dict(r) for r in conn.execute(sql)]
    conn.close()
    return out


async def run_samples(samples):
    for at, disk in samples:
        await ws_server.run_cycle({"cpu": 1.0, "ram": 1.0, "disk": disk}, at, {})


# --- Test 3: sleep ---

def test_a_sleep_ends_the_alert_at_the_last_sample_and_leaves_a_gap_not_a_long_alert(recorder):
    """Disk stays at 95% across a 10-minute sleep. The alert must not become a 10-minute alert."""
    before_sleep = [(START + i * 2, 95.0) for i in range(8)]                 # 16 seconds over the limit
    after_wake = [(START + 16 + 600 + i * 2, 95.0) for i in range(8)]        # the machine wakes 10 minutes later
    ending = [(START + 16 + 600 + 16 + i * 2, 50.0) for i in range(20)]       # then it recovers

    asyncio.run(run_samples(before_sleep + after_wake + ending))

    alerts = stored("SELECT started_at, ended_at, peak_value FROM alert_events WHERE metric = 'disk' ORDER BY started_at")
    assert len(alerts) == 2, "the sleep splits it into two episodes"
    first_end = sqlite3.connect(":memory:").execute("SELECT strftime('%s', ?)", (alerts[0]["ended_at"],)).fetchone()[0]
    assert int(first_end) <= START + 16, "the first alert ended at the last sample before the sleep"
    second_start = sqlite3.connect(":memory:").execute("SELECT strftime('%s', ?)", (alerts[1]["started_at"],)).fetchone()[0]
    assert int(second_start) >= START + 600, "the second began only when the machine woke"


def test_a_sleep_leaves_no_metrics_rows_for_the_minutes_it_was_asleep(recorder):
    awake_first = [(START + i * 2, 20.0) for i in range(30)]
    awake_after = [(START + 600 + i * 2, 20.0) for i in range(30)]
    flush = [(START + 700, 20.0)]

    asyncio.run(run_samples(awake_first + awake_after + flush))

    minutes = [r["minute"] for r in stored("SELECT minute FROM metrics_history ORDER BY minute")]
    # The minute still in progress when the last sample arrives is not stored until it is complete
    assert len(minutes) == 2
    gap = sqlite3.connect(":memory:").execute("SELECT (strftime('%s', ?) - strftime('%s', ?))", (minutes[1], minutes[0])).fetchone()[0]
    assert gap >= 9 * 60, "no row was invented for the time the machine slept"


# --- Test 8: the database fails while the backend runs ---

def test_a_failing_database_does_not_stop_the_gauges(recorder, monkeypatch, tmp_path):
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "missing-folder" / "process.db"))

    cycle(95.0, START)                    # the write fails, the gauge message must still go out
    cycle(95.0, START + 2)

    gauges = [m for m in recorder if m["type"] == "metrics_update"]
    assert len(gauges) == 2, "the gauges keep updating while the database is broken"


def test_recording_resumes_when_the_database_comes_back(recorder, monkeypatch, tmp_path):
    good_path = db.DB_PATH
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "missing-folder" / "process.db"))
    asyncio.run(run_samples([(START + i * 2, 20.0) for i in range(30)]))   # a whole minute is lost

    monkeypatch.setattr(db, "DB_PATH", good_path)
    asyncio.run(run_samples([(START + 60 + i * 2, 20.0) for i in range(31)]))

    assert len(stored("SELECT minute FROM metrics_history")) >= 1, "recording resumed with the next completed minute"


@pytest.mark.skipif(sys.platform != "win32", reason="uses the Windows read-only file attribute")
def test_a_read_only_database_file_does_not_stop_the_gauges(recorder, monkeypatch, tmp_path):
    path = tmp_path / "readonly.db"
    monkeypatch.setattr(db, "DB_PATH", str(path))
    monkeypatch.setattr(db, "DATA_DIR", str(tmp_path))
    asyncio.run(db.init_db())
    for suffix in ("", "-wal", "-shm"):
        if os.path.exists(str(path) + suffix):
            os.chmod(str(path) + suffix, stat.S_IREAD)
    try:
        asyncio.run(run_samples([(START + i * 2, 95.0) for i in range(35)]))
    finally:
        for suffix in ("", "-wal", "-shm"):
            if os.path.exists(str(path) + suffix):
                os.chmod(str(path) + suffix, stat.S_IWRITE | stat.S_IREAD)

    assert len([m for m in recorder if m["type"] == "metrics_update"]) == 35


# --- Test 4: time zones ---

PROBE = ("import sys; sys.path.insert(0, '.'); from utils.timefmt import utc_text, minute_text, to_iso_utc; "
         "print(utc_text(1790000123.0), minute_text(1790000123.0), to_iso_utc(utc_text(1790000123.0)))")


@pytest.mark.parametrize("zone", ["UTC0", "PST8PDT", "IST-5:30", "JST-9", "NZST-12NZDT"])
def test_stored_times_do_not_depend_on_the_time_zone(zone):
    env = {k: v for k, v in os.environ.items() if k != "KAVAN_DATA_DIR"}
    env["TZ"] = zone

    out = subprocess.run([sys.executable, "-c", PROBE], capture_output=True, text=True, check=True, env=env,
                         cwd=SERVER_DIR).stdout.strip()

    assert out == "2026-09-21 14:15:23 2026-09-21 14:15:00 2026-09-21T14:15:23Z"


def test_every_time_the_api_sends_is_utc_with_a_z(recorder):
    from fastapi.testclient import TestClient

    asyncio.run(run_samples([(START + i * 2, 95.0) for i in range(6)] + [(START + 12 + i * 2, 50.0) for i in range(20)]))
    client = TestClient(ws_server.app, base_url="http://127.0.0.1:8000")

    alerts = client.get("/api/alerts", params={"from": "2026-01-01T00:00:00Z", "limit": 10}).json()["alerts"]

    assert alerts and all(a["started_at"].endswith("Z") and a["ended_at"].endswith("Z") for a in alerts)


# --- Test 7: a damaged settings file ---

def test_a_damaged_settings_file_keeps_the_good_values_and_defaults_the_rest(tmp_path, monkeypatch):
    path = tmp_path / "settings.json"
    path.write_text(json.dumps({
        "cpu_threshold": 61, "theme": "light",                    # good
        "sound_volume": 500, "sound_choice": "siren",             # invalid
        "never_kill": "notepad.exe", "never_alert": ["Code.EXE", 5, "C:\\x.exe"],   # not a list, and a mixed list
        "alert_retention_days": 10, "ram_threshold": "lots",
    }), encoding="utf-8")
    monkeypatch.setattr(settings_manager, "CONFIG_PATH", str(path))

    config = settings_manager.load_config()

    assert config["cpu_threshold"] == 61 and config["theme"] == "light", "good values are kept"
    assert config["sound_volume"] == 50 and config["sound_choice"] == "chime", "bad values take their defaults"
    assert config["alert_retention_days"] == 30 and config["ram_threshold"] == 90
    assert config["never_kill"] == [], "a value that is not a list becomes an empty list"
    assert config["never_alert"] == ["code.exe"], "only the valid names of a mixed list are kept"


@pytest.mark.parametrize("content", ["", "{", "[]", "null", '"text"', "\x00\x00", "{'a': 1}", "\ufeff{}", "{}"])
def test_an_unreadable_settings_file_gives_the_defaults_and_never_crashes(content, tmp_path, monkeypatch):
    path = tmp_path / "settings.json"
    path.write_text(content, encoding="utf-8")
    monkeypatch.setattr(settings_manager, "CONFIG_PATH", str(path))

    assert settings_manager.load_config() == settings_manager.DEFAULT_CONFIG


def test_the_backend_starts_with_a_damaged_settings_file(tmp_path):
    (tmp_path / "settings.json").write_text('{"sound_volume": 999, "never_kill": 7, "theme": 3', encoding="utf-8")
    env = {**os.environ, "KAVAN_DATA_DIR": str(tmp_path)}
    script = ("import sys; sys.path.insert(0, '.'); import ws_server; from config.settings_manager import ACTIVE_CONFIG as c; "
              "print(c['sound_volume'], c['never_kill'], c['theme'])")

    out = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, check=True, env=env, cwd=SERVER_DIR)

    assert out.stdout.strip().splitlines()[-1] == "50 [] dark"


# --- Test 6: the port is taken ---

def test_a_second_backend_serves_mcp_only_and_starts_no_dashboard(monkeypatch):
    started = []
    monkeypatch.setattr(ws_server, "port_in_use", lambda: True)
    monkeypatch.setattr(ws_server.uvicorn, "run", lambda *a, **k: started.append(a))

    ws_server.run_ws_server()

    assert started == [], "a second instance must not start a second dashboard"


# --- Test 1: a crash during an alert ---

def test_a_crash_leaves_no_alert_ongoing_forever(recorder):
    """The recorder dies with an episode open. On the next start, orphaned episodes are closed."""
    asyncio.run(run_samples([(START + i * 2, 95.0) for i in range(6)]))
    assert stored("SELECT COUNT(*) AS n FROM alert_events WHERE ended_at IS NULL")[0]["n"] == 1

    closed = asyncio.run(db.close_orphaned_alert_events())

    assert closed == 1
    row = stored("SELECT started_at, ended_at FROM alert_events")[0]
    assert row["ended_at"] is not None and row["ended_at"] >= row["started_at"]
