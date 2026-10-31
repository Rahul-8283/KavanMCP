"""Phase 8 §2.3: the manual-test aids do what they say, and cannot touch a real database."""
import os
import sqlite3
import subprocess
import sys

import pytest

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AIDS = os.path.join(SERVER_DIR, "tests", "aids")
sys.path.insert(0, AIDS)


def run(script, *args, data_dir=None, timeout=120):
    env = {k: v for k, v in os.environ.items() if k not in ("KAVAN_DATA_DIR", "KAVAN_SETTINGS_PATH")}
    if data_dir is not None:
        env["KAVAN_DATA_DIR"] = str(data_dir)
    return subprocess.run([sys.executable, os.path.join(AIDS, script), *args], capture_output=True, text=True,
                          check=False, env=env, cwd=SERVER_DIR, timeout=timeout)


def query(data_dir, sql, *params):
    conn = sqlite3.connect(os.path.join(data_dir, "process.db"))
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return rows


@pytest.mark.parametrize("script, args", [("seed_history.py", ["--days", "1"]), ("age_rows.py", ["--days", "1"])])
def test_the_history_aids_refuse_to_run_without_a_scratch_folder(script, args):
    result = run(script, *args)

    assert result.returncode == 2
    assert "KAVAN_DATA_DIR" in result.stderr


def test_seed_history_builds_the_documented_pattern(tmp_path):
    result = run("seed_history.py", "--days", "2", data_dir=tmp_path)
    assert result.returncode == 0, result.stderr

    minutes = query(tmp_path, "SELECT COUNT(*) FROM metrics_history")[0][0]
    peak = query(tmp_path, "SELECT MAX(cpu_max) FROM metrics_history")[0][0]
    average_at_peak = query(tmp_path, "SELECT cpu_avg FROM metrics_history WHERE cpu_max = 99.0")[0][0]
    alerts = query(tmp_path, "SELECT id FROM alert_events ORDER BY started_at")

    # Two days is 2880 minutes, less the three-hour hole
    assert 2880 - 3 * 60 - 5 <= minutes <= 2880 - 3 * 60 + 5, minutes
    assert peak == 99.0 and average_at_peak < 50, "a 10-second spike hides inside a minute whose average is low"
    assert len(alerts) == 5 and {a[0].split("-")[1] for a in alerts} == {"1d", "5d", "10d", "20d", "25d"}


def test_seed_history_can_add_enough_alerts_to_pass_the_500_row_limit(tmp_path):
    run("seed_history.py", "--days", "1", "--extra-alerts", "520", data_dir=tmp_path)

    assert query(tmp_path, "SELECT COUNT(*) FROM alert_events")[0][0] == 525


def test_age_rows_moves_every_history_row_back(tmp_path):
    run("seed_history.py", "--days", "1", data_dir=tmp_path)
    before = query(tmp_path, "SELECT MIN(started_at), MAX(started_at) FROM alert_events")[0]

    result = run("age_rows.py", "--days", "20", data_dir=tmp_path)
    after = query(tmp_path, "SELECT MIN(started_at), MAX(started_at) FROM alert_events")[0]

    assert result.returncode == 0, result.stderr
    assert after[0] < before[0] and after[1] < before[1]
    # Seeded 1 to 25 days ago, so after 20 more days none is newer than 20 days
    assert query(tmp_path, "SELECT COUNT(*) FROM alert_events WHERE started_at > datetime('now', '-20 days')")[0][0] == 0
    assert query(tmp_path, "SELECT COUNT(*) FROM alert_events")[0][0] == 5, "aging moves rows, it never deletes them"


def test_cpu_burn_logs_its_start_and_stop(tmp_path):
    log = tmp_path / "burn.log"

    result = run("cpu_burn.py", "--seconds", "2", "--cores", "1", "--log", str(log))

    assert result.returncode == 0, result.stderr
    lines = log.read_text(encoding="utf-8").splitlines()
    assert lines[0].startswith("cpu_burn start ") and lines[-1].startswith("cpu_burn stop ")


def test_mem_hold_logs_its_start_and_stop(tmp_path):
    log = tmp_path / "mem.log"

    result = run("mem_hold.py", "--mb", "16", "--seconds", "1", "--log", str(log))

    assert result.returncode == 0, result.stderr
    lines = log.read_text(encoding="utf-8").splitlines()
    assert lines[0].startswith("mem_hold start ") and "mb=16" in lines[0] and lines[-1].startswith("mem_hold stop ")


def test_the_soak_plan_has_the_events_the_spec_lists():
    import soak_schedule

    labels = [label for _, label, _ in soak_schedule.build_plan(24)]

    assert sum(label.startswith("cpu-burn") for label in labels) == 8, "a 2-minute burn every 3 hours"
    assert sum(label.startswith("mem-hold") for label in labels) == 4, "a 2-minute hold every 6 hours"
    assert labels.count("cpu-spike-10s") == 1 and labels.count("windowless-burn") == 1
    assert [at for at, _, _ in soak_schedule.build_plan(24)] == sorted(at for at, _, _ in soak_schedule.build_plan(24))


def test_the_soak_scale_shrinks_durations_but_not_memory():
    import soak_schedule

    shrunk = soak_schedule.scaled_args(["hold.py", "--mb", "3000", "--seconds", "120"], 0.01)

    assert shrunk == ["hold.py", "--mb", "3000", "--seconds", "1"]
