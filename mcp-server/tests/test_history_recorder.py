"""Phase 1: the metrics aggregator, the alert episode trackers, and what they store."""
import asyncio
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db
from handlers.history_recorder import (
    EPISODE_CLOSE_SECONDS,
    SAMPLE_GAP_SECONDS,
    EpisodeTracker,
    MinuteAggregator,
)
from handlers.process_watch import (
    PROCESS_WATCH_INTERVAL,
    ProcessWatcher,
    find_top_process,
)
from utils.timefmt import minute_text, utc_text

# A time that is exactly on a minute boundary, so sample counts per minute are predictable
MINUTE_START = 1791189000.0
SAMPLE_INTERVAL = 2.0
SAMPLES_PER_MINUTE = 30

THRESHOLDS = {"cpu_threshold": 90, "ram_threshold": 90, "disk_threshold": 95}
QUIET = {"cpu": 10.0, "ram": 20.0, "disk": 30.0}


def sample(cpu=10.0, ram=20.0, disk=30.0) -> dict:
    return {"cpu": cpu, "ram": ram, "disk": disk}


def process(pid, name="miner.exe", cpu=50.0, memory_mb=100.0, is_headless=True) -> dict:
    return {"pid": pid, "name": name, "cpu_percent": cpu, "memory_mb": memory_mb, "is_headless": is_headless}


@pytest.fixture
def history_db(tmp_path, monkeypatch):
    """A throwaway database. The real audit ledger is never touched."""
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "process.db"))
    monkeypatch.setattr(db, "DATA_DIR", str(tmp_path))
    asyncio.run(db.init_db())
    return str(tmp_path / "process.db")


def rows(path, sql):
    conn = sqlite3.connect(path)
    try:
        return conn.execute(sql).fetchall()
    finally:
        conn.close()


# --- The minute aggregator (section 3) ---

def test_a_full_minute_of_samples_becomes_one_row():
    aggregator = MinuteAggregator()

    within = [aggregator.add(sample(cpu=float(i)), MINUTE_START + SAMPLE_INTERVAL * i)
              for i in range(SAMPLES_PER_MINUTE)]
    finished = aggregator.add(sample(), MINUTE_START + 60)

    assert within == [None] * SAMPLES_PER_MINUTE, "no row until the minute is over"
    assert finished["minute"] == minute_text(MINUTE_START)
    assert finished["samples"] == SAMPLES_PER_MINUTE
    assert finished["cpu_avg"] == pytest.approx(14.5)  # mean of 0..29
    assert finished["cpu_max"] == 29.0
    assert finished["ram_avg"] == pytest.approx(20.0)


def test_a_spike_survives_in_the_peak_but_not_the_average():
    aggregator = MinuteAggregator()

    for i in range(SAMPLES_PER_MINUTE):
        aggregator.add(sample(cpu=99.0 if i == 7 else 5.0), MINUTE_START + SAMPLE_INTERVAL * i)
    row = aggregator.add(sample(), MINUTE_START + 60)

    assert row["cpu_max"] == 99.0
    assert row["cpu_avg"] < 10.0


def test_flush_returns_the_partial_minute_once(history_db):
    aggregator = MinuteAggregator()
    aggregator.add(sample(cpu=40.0), MINUTE_START)
    aggregator.add(sample(cpu=60.0), MINUTE_START + SAMPLE_INTERVAL)

    partial = aggregator.flush()

    assert partial["samples"] == 2
    assert partial["cpu_avg"] == pytest.approx(50.0)
    assert aggregator.flush() is None, "a flushed minute is not written twice"


def test_two_partial_rows_for_one_minute_merge_into_a_weighted_average(history_db):
    minute = minute_text(MINUTE_START)
    first = {"minute": minute, "cpu_avg": 60.0, "cpu_max": 70.0, "ram_avg": 50.0,
             "ram_max": 50.0, "disk_avg": 40.0, "samples": 30}
    second = {**first, "cpu_avg": 20.0, "cpu_max": 90.0, "samples": 10}

    asyncio.run(db.record_metrics_minute(first))
    asyncio.run(db.record_metrics_minute(second))

    stored = rows(history_db, "SELECT cpu_avg, cpu_max, samples FROM metrics_history")
    assert len(stored) == 1, "one row per minute, whatever the restart"
    cpu_avg, cpu_max, samples = stored[0]
    assert cpu_avg == pytest.approx((60.0 * 30 + 20.0 * 10) / 40)
    assert cpu_max == 90.0, "the larger peak wins"
    assert samples == 40


# --- The episode tracker (section 4) ---

def run_samples(tracker, values, count, start=MINUTE_START, config=None):
    """Feeds `count` identical samples, 2 seconds apart, and returns every change."""
    changes = []
    for i in range(count):
        changes.extend(tracker.update(values, config or THRESHOLDS, start + SAMPLE_INTERVAL * i))
    return changes


def test_a_sustained_breach_is_one_episode():
    tracker = EpisodeTracker()

    changes = run_samples(tracker, sample(cpu=95.0), 40)

    starts = [c for c in changes if c.kind == "started"]
    assert len(starts) == 1, "40 samples over the threshold, one episode"
    assert starts[0].episode.metric == "cpu"
    assert not [c for c in changes if c.kind == "ended"]


def test_a_brief_dip_does_not_end_the_episode():
    tracker = EpisodeTracker()
    tracker.update(sample(cpu=95.0), THRESHOLDS, MINUTE_START)

    # Below for 10 seconds, which is under EPISODE_CLOSE_SECONDS, then over again
    run_samples(tracker, sample(cpu=50.0), 5, start=MINUTE_START + SAMPLE_INTERVAL)
    changes = run_samples(tracker, sample(cpu=95.0), 5, start=MINUTE_START + 12)

    assert not [c for c in changes if c.kind in ("started", "ended")], "the same episode continues"
    assert len(tracker.open_episodes()) == 1


def test_an_episode_ends_dated_to_the_moment_the_value_dropped():
    tracker = EpisodeTracker()
    tracker.update(sample(cpu=95.0), THRESHOLDS, MINUTE_START)
    dropped_at = MINUTE_START + SAMPLE_INTERVAL

    changes = run_samples(tracker, sample(cpu=50.0), 20, start=dropped_at)

    ended = [c for c in changes if c.kind == "ended"]
    assert len(ended) == 1
    assert ended[0].episode.ended_at == dropped_at, "not the time the close timer expired"
    assert not tracker.open_episodes()


def test_the_close_timer_runs_from_the_drop_and_waits_the_full_period():
    tracker = EpisodeTracker()
    tracker.update(sample(cpu=95.0), THRESHOLDS, MINUTE_START)
    dropped_at = MINUTE_START + SAMPLE_INTERVAL

    # Samples arrive every 2 seconds, so the timer accumulates over several of them
    while_waiting = run_samples(tracker, sample(cpu=50.0), int(EPISODE_CLOSE_SECONDS / SAMPLE_INTERVAL),
                                start=dropped_at)
    on_time = tracker.update(sample(cpu=50.0), THRESHOLDS, dropped_at + EPISODE_CLOSE_SECONDS)

    assert not while_waiting, "the timer starts when the value drops, not when the episode opened"
    assert [c.kind for c in on_time] == ["ended"]
    assert on_time[0].episode.ended_at == dropped_at


def test_a_rising_peak_promotes_the_episode_to_critical():
    tracker = EpisodeTracker()
    tracker.update(sample(cpu=91.0), THRESHOLDS, MINUTE_START)
    episode = tracker.open_episodes()[0]
    assert episode.level == "warning"

    changes = tracker.update(sample(cpu=97.0), THRESHOLDS, MINUTE_START + SAMPLE_INTERVAL)

    assert [c.kind for c in changes] == ["peaked"]
    assert episode.peak_value == 97.0
    assert episode.level == "critical"
    assert episode.peak_changed is True


def test_a_sleep_ends_the_episode_at_the_last_real_sample():
    tracker = EpisodeTracker()
    tracker.update(sample(cpu=95.0), THRESHOLDS, MINUTE_START)
    last_real = MINUTE_START + SAMPLE_INTERVAL
    tracker.update(sample(cpu=96.0), THRESHOLDS, last_real)

    changes = tracker.update(sample(cpu=10.0), THRESHOLDS, last_real + 5 * 60)

    ended = [c for c in changes if c.kind == "ended"]
    assert len(ended) == 1, "a machine that slept through a spike must not record an hours-long alert"
    assert ended[0].episode.ended_at == last_real
    assert not tracker.open_episodes()


def test_a_gap_just_inside_the_limit_is_not_treated_as_a_sleep():
    tracker = EpisodeTracker()
    tracker.update(sample(cpu=95.0), THRESHOLDS, MINUTE_START)

    changes = tracker.update(sample(cpu=95.0), THRESHOLDS, MINUTE_START + SAMPLE_GAP_SECONDS)

    assert not [c for c in changes if c.kind == "ended"]


def test_each_metric_tracks_its_own_episode():
    tracker = EpisodeTracker()

    changes = tracker.update(sample(cpu=95.0, ram=95.0), THRESHOLDS, MINUTE_START)

    assert sorted(c.episode.metric for c in changes) == ["cpu", "ram"]
    assert len(tracker.open_episodes()) == 2


def test_a_metric_with_no_threshold_is_not_tracked():
    tracker = EpisodeTracker()

    changes = tracker.update(sample(cpu=99.0), {"cpu_threshold": None}, MINUTE_START)

    assert changes == []


def test_an_episode_keeps_the_threshold_it_started_with():
    tracker = EpisodeTracker()
    tracker.update(sample(cpu=95.0), THRESHOLDS, MINUTE_START)

    # The user raises the limit above the current value, so the episode ends by the normal rule
    raised = {**THRESHOLDS, "cpu_threshold": 99}
    changes = run_samples(tracker, sample(cpu=95.0), 20, start=MINUTE_START + SAMPLE_INTERVAL, config=raised)

    ended = [c for c in changes if c.kind == "ended"]
    assert len(ended) == 1
    assert ended[0].episode.threshold == 90, "the limit in force when it started"


# --- What gets stored (sections 2 and 4.3) ---

def test_an_episode_is_stored_with_the_readings_from_its_start(history_db):
    readings = {"cpu": 93.0, "ram": 71.0, "disk": 47.0}
    top = {"name": "chrome.exe", "pid": 2303, "value": 64.2}

    event_id = asyncio.run(db.open_alert_event("cpu", "warning", 90, utc_text(MINUTE_START), 93.0, readings, top))
    asyncio.run(db.close_alert_event(event_id, utc_text(MINUTE_START + 268), 97.4, "critical"))

    stored = rows(history_db, "SELECT metric, level, threshold, started_at, ended_at, peak_value, "
                              "cpu_at_start, ram_at_start, disk_at_start, top_process, top_process_pid, "
                              "top_process_value, muted FROM alert_events")
    assert stored == [("cpu", "critical", 90.0, "2026-10-05 08:30:00", "2026-10-05 08:34:28", 97.4,
                       93.0, 71.0, 47.0, "chrome.exe", 2303, 64.2, 0)]


def test_the_top_process_can_be_filled_in_after_the_episode_opens(history_db):
    event_id = asyncio.run(db.open_alert_event("cpu", "warning", 90, utc_text(MINUTE_START), 93.0, QUIET))

    assert rows(history_db, "SELECT top_process FROM alert_events") == [(None,)]

    asyncio.run(db.set_alert_top_process(event_id, "python.exe", 4242, 96.1))

    assert rows(history_db, "SELECT top_process, top_process_pid, top_process_value FROM alert_events") == [
        ("python.exe", 4242, 96.1)]


def test_a_failed_write_is_reported_rather_than_raised(history_db, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", os.path.join(history_db, "not-a-directory", "p.db"))

    assert asyncio.run(db.record_metrics_minute({"minute": minute_text(MINUTE_START), "cpu_avg": 1.0,
                                                 "cpu_max": 1.0, "ram_avg": 1.0, "ram_max": 1.0,
                                                 "disk_avg": 1.0, "samples": 1})) is False
    assert asyncio.run(db.open_alert_event("cpu", "warning", 90, utc_text(MINUTE_START), 93.0, QUIET)) is None
    assert asyncio.run(db.update_alert_event("whatever", 95.0, "critical")) is False


# --- The top process (section 4.4) ---

def test_the_top_process_is_the_largest_consumer_of_that_metric():
    processes = [process(1, "a.exe", cpu=10.0, memory_mb=4000.0), process(2, "b.exe", cpu=80.0, memory_mb=50.0)]

    assert find_top_process(processes, "cpu")["name"] == "b.exe"
    assert find_top_process(processes, "ram")["name"] == "a.exe"
    assert find_top_process(processes, "disk") is None, "disk has no per-process figure"
    assert find_top_process([], "cpu") is None


def test_an_idle_machine_names_no_top_cpu_process():
    assert find_top_process([process(1, cpu=0.0)], "cpu") is None


# --- The process watch (section 5) ---

def scan(watcher, processes, now):
    return watcher.update(processes, QUIET, now)


def test_the_first_scan_only_primes_the_cpu_readings():
    watcher = ProcessWatcher()

    changes = scan(watcher, [process(500, cpu=90.0)], MINUTE_START)

    assert changes == [], "every process reads 0.0% CPU until it has been seen twice"
    assert not watcher.open_episodes()


def test_a_tier_4_process_becomes_an_episode_and_ends_after_two_missed_scans():
    watcher = ProcessWatcher()
    suspicious = [process(500, cpu=90.0)]
    scan(watcher, suspicious, MINUTE_START)

    started = scan(watcher, suspicious, MINUTE_START + PROCESS_WATCH_INTERVAL)
    gone_once = scan(watcher, [], MINUTE_START + 2 * PROCESS_WATCH_INTERVAL)
    gone_twice = scan(watcher, [], MINUTE_START + 3 * PROCESS_WATCH_INTERVAL)

    assert [c.kind for c in started] == ["started"]
    assert started[0].episode.metric == "process"
    assert started[0].episode.top_process == {"name": "miner.exe", "pid": 500, "value": 90.0}
    assert gone_once == [], "one scan without it is not the end"
    assert [c.kind for c in gone_twice] == ["ended"]
    assert gone_twice[0].episode.ended_at == MINUTE_START + 2 * PROCESS_WATCH_INTERVAL


def test_a_process_that_dips_below_the_rule_for_one_scan_keeps_its_episode():
    watcher = ProcessWatcher()
    suspicious = [process(500, cpu=90.0)]
    scan(watcher, suspicious, MINUTE_START)
    scan(watcher, suspicious, MINUTE_START + PROCESS_WATCH_INTERVAL)

    scan(watcher, [process(500, cpu=5.0)], MINUTE_START + 2 * PROCESS_WATCH_INTERVAL)
    back = scan(watcher, suspicious, MINUTE_START + 3 * PROCESS_WATCH_INTERVAL)

    assert not [c for c in back if c.kind in ("started", "ended")]
    assert len(watcher.open_episodes()) == 1


def test_a_windowed_process_is_never_suspicious():
    watcher = ProcessWatcher()
    windowed = [process(500, "chrome.exe", cpu=90.0, is_headless=False)]
    scan(watcher, windowed, MINUTE_START)

    changes = scan(watcher, windowed, MINUTE_START + PROCESS_WATCH_INTERVAL)

    assert changes == []


def test_the_watch_never_reports_kavan_itself():
    watcher = ProcessWatcher()
    own = [process(os.getpid(), "python.exe", cpu=99.0)]
    scan(watcher, own, MINUTE_START)

    changes = scan(watcher, own, MINUTE_START + PROCESS_WATCH_INTERVAL)

    assert changes == []


def test_a_sleep_between_scans_ends_the_process_episode():
    watcher = ProcessWatcher()
    suspicious = [process(500, cpu=90.0)]
    scan(watcher, suspicious, MINUTE_START)
    last_real = MINUTE_START + PROCESS_WATCH_INTERVAL
    scan(watcher, suspicious, last_real)

    changes = scan(watcher, [], last_real + 8 * 3600)

    ended = [c for c in changes if c.kind == "ended"]
    assert len(ended) == 1
    assert ended[0].episode.ended_at == last_real


# --- Start-up, recovery and retention (sections 6 and 7) ---

def test_recovery_closes_an_orphaned_episode_at_the_last_recorded_minute(history_db):
    conn = sqlite3.connect(history_db)
    conn.execute("INSERT INTO metrics_history VALUES ('2026-10-05 08:40:00', 10,20,30,40,50, 30)")
    conn.execute("INSERT INTO alert_events (id, metric, level, threshold, started_at, peak_value, "
                 "cpu_at_start, ram_at_start, disk_at_start) "
                 "VALUES ('orphan', 'cpu', 'warning', 90, '2026-10-05 08:30:00', 95, 95, 10, 10)")
    conn.commit()
    conn.close()

    closed = asyncio.run(db.close_orphaned_alert_events())

    assert closed == 1
    assert rows(history_db, "SELECT ended_at FROM alert_events") == [("2026-10-05 08:40:00",)]
    assert asyncio.run(db.close_orphaned_alert_events()) == 0, "nothing left to close on the next start-up"


def test_recovery_of_an_episode_with_no_recorded_minutes_uses_its_own_start(history_db):
    conn = sqlite3.connect(history_db)
    conn.execute("INSERT INTO alert_events (id, metric, level, threshold, started_at, peak_value, "
                 "cpu_at_start, ram_at_start, disk_at_start) "
                 "VALUES ('orphan', 'cpu', 'warning', 90, '2026-10-05 08:30:00', 95, 95, 10, 10)")
    conn.commit()
    conn.close()

    asyncio.run(db.close_orphaned_alert_events())

    assert rows(history_db, "SELECT ended_at FROM alert_events") == [("2026-10-05 08:30:00",)]


def test_pruning_drops_old_history_but_never_an_open_episode(history_db):
    conn = sqlite3.connect(history_db)
    conn.executescript("""
        INSERT INTO metrics_history VALUES (datetime('now','-9 days'), 10,20,30,40,50, 30);
        INSERT INTO metrics_history VALUES (datetime('now','-2 days'), 10,20,30,40,50, 30);
        INSERT INTO alert_events (id,metric,level,threshold,started_at,ended_at,peak_value,
                                  cpu_at_start,ram_at_start,disk_at_start)
            VALUES ('old_closed','cpu','warning',90,datetime('now','-40 days'),datetime('now','-40 days'),95,95,10,10);
        INSERT INTO alert_events (id,metric,level,threshold,started_at,ended_at,peak_value,
                                  cpu_at_start,ram_at_start,disk_at_start)
            VALUES ('recent','cpu','warning',90,datetime('now','-2 days'),datetime('now','-2 days'),95,95,10,10);
        INSERT INTO alert_events (id,metric,level,threshold,started_at,peak_value,
                                  cpu_at_start,ram_at_start,disk_at_start)
            VALUES ('old_open','ram','warning',90,datetime('now','-40 days'),95,95,10,10);
    """)
    conn.commit()
    conn.close()

    asyncio.run(db.prune_history(metrics_days=7, alert_days=30))

    assert rows(history_db, "SELECT COUNT(*) FROM metrics_history") == [(1,)]
    assert rows(history_db, "SELECT id FROM alert_events ORDER BY id") == [("old_open",), ("recent",)]


def test_init_db_upgrades_a_database_from_the_previous_version(tmp_path, monkeypatch):
    """A V2.0.1 database gains the history tables and keeps its audit rows."""
    path = str(tmp_path / "process.db")
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE audit_log (id TEXT PRIMARY KEY, timestamp DATETIME, process_name TEXT NOT NULL, "
                 "pid INTEGER NOT NULL, executable_path TEXT, action_type TEXT NOT NULL, memory_freed_mb REAL, "
                 "cpu_freed_pct REAL, llm_reasoning TEXT, user_approved BOOLEAN)")
    conn.execute("INSERT INTO audit_log (id, process_name, pid, action_type) VALUES ('1', 'old.exe', 7, 'TERMINATED')")
    conn.commit()
    conn.close()

    monkeypatch.setattr(db, "DB_PATH", path)
    monkeypatch.setattr(db, "DATA_DIR", str(tmp_path))
    asyncio.run(db.init_db())
    asyncio.run(db.init_db())  # Running twice must be harmless

    tables = {r[0] for r in rows(path, "SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"audit_log", "metrics_history", "alert_events"} <= tables
    assert rows(path, "SELECT process_name FROM audit_log") == [("old.exe",)]
    assert {r[1] for r in rows(path, "PRAGMA table_info(audit_log)")} >= {"command_line"}
