"""Phase 3: GET /api/metrics/history, the data behind the performance graphs."""
import os
import sqlite3
import sys
import time

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import settings_manager
from database import db
from routes.history import _coverage, bucket_for
from utils.timefmt import minute_text
from ws_server import app

client = TestClient(app, base_url="http://127.0.0.1:8000")

URL = "/api/metrics/history"
MINUTE = 60
HOUR = 3600
DAY = 24 * HOUR
FULL_MINUTE = 30  # samples in a minute sampled every 2 seconds

# Fixed windows in the past, so nothing depends on when the tests run
SIX_HOURS = {"from": "2026-10-01T08:00:00Z", "to": "2026-10-01T14:00:00Z"}  # 5-minute buckets
ONE_DAY = {"from": "2026-10-01T00:00:00Z", "to": "2026-10-02T00:00:00Z"}  # 15-minute buckets


@pytest.fixture(autouse=True)
def empty_history():
    """Every test starts with no recorded metrics. The database is the session's throwaway one."""
    conn = sqlite3.connect(db.DB_PATH)
    conn.execute("DELETE FROM metrics_history")
    conn.commit()
    conn.close()


def record(minute: str, cpu=30.0, cpu_max=40.0, ram=60.0, ram_max=62.0, disk=47.0, samples=FULL_MINUTE):
    """Stores one minute. `minute` is 'YYYY-MM-DD HH:MM:SS' in UTC."""
    conn = sqlite3.connect(db.DB_PATH)
    conn.execute("INSERT INTO metrics_history VALUES (?, ?, ?, ?, ?, ?, ?)",
                 (minute, cpu, cpu_max, ram, ram_max, disk, samples))
    conn.commit()
    conn.close()


def history(**params) -> dict:
    response = client.get(URL, params=params)
    assert response.status_code == 200, response.text
    return response.json()


# --- Merging minutes into buckets (section 2.2) ---

def test_the_bucket_average_is_weighted_by_samples():
    record("2026-10-01 10:00:00", cpu=60.0, samples=30)
    record("2026-10-01 10:01:00", cpu=20.0, samples=10)

    points = history(**ONE_DAY)["points"]

    assert len(points) == 1
    # 30 samples at 60 and 10 at 20: three parts to one, not the plain mean of 40
    assert points[0]["cpu_avg"] == pytest.approx(50.0)


def test_the_bucket_peak_is_the_largest_peak():
    record("2026-10-01 10:00:00", cpu_max=40.0)
    record("2026-10-01 10:01:00", cpu_max=95.0)

    point = history(**ONE_DAY)["points"][0]

    assert point["cpu_max"] == 95.0, "averaging the peaks would hide the spike"


def test_a_ten_second_spike_survives_at_the_widest_bucket():
    """One minute whose peak hit 99 is still 99 when two hours are merged into one point."""
    for minute in range(120):
        record(minute_text(time.time() - 3 * DAY + minute * MINUTE), cpu=20.0, cpu_max=99.0 if minute == 57 else 25.0)

    points = history(range="7d")["points"]

    assert max(point["cpu_max"] for point in points) == 99.0
    assert max(point["cpu_avg"] for point in points) == pytest.approx(20.0)


def test_nothing_is_invented_between_two_recorded_periods():
    record("2026-10-01 10:00:00")
    record("2026-10-01 12:00:00")

    body = history(**ONE_DAY)

    assert body["bucket_seconds"] == 15 * MINUTE
    assert [point["t"] for point in body["points"]] == ["2026-10-01T10:00:00Z", "2026-10-01T12:00:00Z"]


def test_only_minutes_inside_the_window_are_returned():
    record("2026-10-01 07:59:00")
    record("2026-10-01 08:00:00")
    record("2026-10-01 13:59:00")
    record("2026-10-01 14:00:00")

    points = history(**SIX_HOURS)["points"]

    assert [point["t"] for point in points] == ["2026-10-01T08:00:00Z", "2026-10-01T13:55:00Z"]


# --- Choosing the bucket (section 2.1) ---

@pytest.mark.parametrize("preset, bucket, buckets_in_range", [
    ("1h", MINUTE, 60),
    ("6h", 5 * MINUTE, 72),
    ("24h", 15 * MINUTE, 96),
    ("7d", 2 * HOUR, 84),
])
def test_each_preset_range_has_its_bucket_size(preset, bucket, buckets_in_range):
    body = history(range=preset)

    assert body["bucket_seconds"] == bucket
    # The window is widened to bucket boundaries, so it holds the range and at most one more bucket
    span = _epoch(body["to"]) - _epoch(body["from"])
    assert span / bucket in (buckets_in_range, buckets_in_range + 1)


def test_with_no_parameters_the_range_is_24_hours():
    assert history()["bucket_seconds"] == 15 * MINUTE


def test_a_90_minute_window_gets_one_minute_buckets():
    body = history(**{"from": "2026-10-01T10:00:00Z", "to": "2026-10-01T11:30:00Z"})

    assert body["bucket_seconds"] == MINUTE


@pytest.mark.parametrize("span, bucket", [
    (10 * MINUTE, MINUTE), (2 * HOUR, MINUTE),
    (2 * HOUR + 1, 5 * MINUTE), (12 * HOUR, 5 * MINUTE),
    (12 * HOUR + 1, 15 * MINUTE), (48 * HOUR, 15 * MINUTE),
    (48 * HOUR + 1, 2 * HOUR), (7 * DAY, 2 * HOUR),
])
def test_bucket_boundaries(span, bucket):
    assert bucket_for(span) == bucket


def test_the_window_is_widened_to_bucket_boundaries():
    """A client steps from `from` to `to` by the bucket size, so every bucket must start on a step."""
    record("2026-10-01 10:07:00")

    body = history(**{"from": "2026-10-01T08:03:20Z", "to": "2026-10-01T13:58:10Z"})

    assert body["bucket_seconds"] == 5 * MINUTE
    assert (body["from"], body["to"]) == ("2026-10-01T08:00:00Z", "2026-10-01T14:00:00Z")
    start = _epoch(body["from"])
    assert all((_epoch(point["t"]) - start) % body["bucket_seconds"] == 0 for point in body["points"])
    assert body["points"][0]["t"] == "2026-10-01T10:05:00Z"


# --- Validation (section 2.3) ---

@pytest.mark.parametrize("params", [
    {"from": "2026-10-01T10:00:00Z"},
    {"to": "2026-10-01T10:00:00Z"},
    {"from": "2026-10-01T10:00:00Z", "to": "2026-10-01T10:02:00Z"},
    {"from": "2026-09-01T00:00:00Z", "to": "2026-10-01T00:00:00Z"},
    {"from": "2026-10-02T00:00:00Z", "to": "2026-10-01T00:00:00Z"},
    {"from": "2026-10-01T00:00:00Z", "to": "2026-10-01T00:00:00Z"},
    {"from": "yesterday", "to": "2026-10-01T00:00:00Z"},
    {"range": "2w"},
])
def test_a_bad_range_is_a_400_not_a_500(params):
    assert client.get(URL, params=params).status_code == 400


def test_the_shortest_and_longest_allowed_windows_are_accepted():
    assert client.get(URL, params={"from": "2026-10-01T10:00:00Z", "to": "2026-10-01T10:10:00Z"}).status_code == 200
    assert client.get(URL, params={"from": "2026-09-24T00:00:00Z", "to": "2026-10-01T00:00:00Z"}).status_code == 200


def test_an_exact_window_takes_priority_over_the_preset():
    body = history(range="7d", **{"from": "2026-10-01T10:00:00Z", "to": "2026-10-01T11:00:00Z"})

    assert body["bucket_seconds"] == MINUTE


def test_a_request_from_a_foreign_origin_is_refused():
    response = client.get(URL, headers={"Origin": "https://evil.example"})

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "forbidden_origin"


def test_an_unreadable_history_is_an_error_not_an_empty_chart(monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", os.path.join(os.path.dirname(db.DB_PATH), "missing-dir", "x.db"))

    quiet = TestClient(app, base_url="http://127.0.0.1:8000", raise_server_exceptions=False)

    assert quiet.get(URL).status_code == 500


# --- What else the response carries ---

def test_an_empty_history_returns_no_points_and_no_start():
    body = history()

    assert body["points"] == []
    assert body["recording_since"] is None


def test_recording_since_is_the_oldest_minute_whatever_the_window():
    record("2026-09-20 03:15:00")
    record("2026-10-01 10:00:00")

    body = history(**SIX_HOURS)

    assert body["recording_since"] == "2026-09-20T03:15:00Z"


def test_the_current_thresholds_come_with_the_history(monkeypatch):
    monkeypatch.setitem(settings_manager.ACTIVE_CONFIG, "cpu_threshold", 77)

    assert history()["thresholds"]["cpu"] == 77
    assert set(history()["thresholds"]) == {"cpu", "ram", "disk"}


def test_a_bucket_recorded_for_half_its_length_has_half_coverage():
    # A 5-minute bucket holds 150 samples. Two full minutes and half of a third make 75.
    record("2026-10-01 10:00:00", samples=30)
    record("2026-10-01 10:01:00", samples=30)
    record("2026-10-01 10:02:00", samples=15)

    point = history(**SIX_HOURS)["points"][0]

    assert point["coverage"] == 0.5


def test_a_fully_recorded_bucket_has_full_coverage():
    for minute in range(5):
        record(f"2026-10-01 10:0{minute}:00")

    assert history(**SIX_HOURS)["points"][0]["coverage"] == 1.0


def test_coverage_does_not_count_time_that_has_not_happened_yet():
    bucket_start = 1_791_189_000  # on a minute boundary
    seven_minutes_in = bucket_start + 7 * MINUTE + 20

    # Seven completed minutes of a 15-minute bucket, all fully recorded
    assert _coverage(7 * FULL_MINUTE, bucket_start, 15 * MINUTE, now=seven_minutes_in) == 1.0
    # The same samples are less than half of the bucket once it is over
    assert _coverage(7 * FULL_MINUTE, bucket_start, 15 * MINUTE, now=bucket_start + HOUR) == 0.47


def test_coverage_never_exceeds_one():
    # Timing jitter can put a 31st sample into a minute
    assert _coverage(31, 1_791_189_000, MINUTE, now=1_791_189_000 + HOUR) == 1.0


def _epoch(iso: str) -> float:
    from datetime import datetime

    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()
