"""A real, end-to-end check of the history recorder: real CPU, a real backend, a scratch database.

    python live_alert_check.py [--burn-seconds 60] [--port 8011]

It starts the backend on a scratch folder, lets it record, runs real CPU burns, and compares what Kavan
stored with the burn's own log (the independent record of what the machine really did):

  1. Recording without a window: a row of metrics per minute, each holding about 30 samples.
  2. One CPU burn is one alert row, starting and ending within a few seconds of the log.
  3. The top process recorded is one of the burn's own processes.
  4. A burn with no window is noticed as a suspicious process.
  5. After the backend is killed mid-alert and restarted, nothing is left ongoing.

It uses every core for a minute and runs for about ten, so run it by hand on a machine that is not busy, and
never as part of the test suite. Exit code 0 means every check passed.
"""
import argparse
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request
from datetime import datetime, timezone

AIDS = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.dirname(os.path.dirname(AIDS))
FAILURES: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    if not ok:
        FAILURES.append(label)
    print(f"{'PASS' if ok else 'FAIL'}  {label}{'  -> ' + detail if detail else ''}", flush=True)


def epoch(text: str) -> float:
    return datetime.strptime(text, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp()


def rows(data_dir: str, sql: str, *params):
    conn = sqlite3.connect(os.path.join(data_dir, "process.db"), timeout=30)
    conn.row_factory = sqlite3.Row
    out = [dict(r) for r in conn.execute(sql, params)]
    conn.close()
    return out


def post(port: int, body: str) -> None:
    request = urllib.request.Request(f"http://127.0.0.1:{port}/api/update_thresholds", data=body.encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
    urllib.request.urlopen(request, timeout=10).read()


def start_backend(data_dir: str, port: int) -> subprocess.Popen:
    env = {**os.environ, "KAVAN_DATA_DIR": data_dir}
    process = subprocess.Popen([sys.executable, os.path.join(AIDS, "serve_scratch.py"), "--port", str(port)], env=env,
                               cwd=SERVER, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               creationflags=subprocess.CREATE_NO_WINDOW)
    deadline = time.time() + 90
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/api/get_config", timeout=2).read()
            return process
        except OSError:
            time.sleep(1)
    process.kill()
    raise SystemExit("the backend did not start")


def burn_times(log: str) -> tuple[float, float, str]:
    with open(log, encoding="utf-8") as handle:
        text = handle.read()
    start = re.search(r"cpu_burn start (\S+ \S+)", text)
    stop = re.search(r"cpu_burn stop (\S+ \S+)", text)
    return epoch(start.group(1)), epoch(stop.group(1)), text


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--burn-seconds", type=int, default=60)
    parser.add_argument("--port", type=int, default=8011)
    args = parser.parse_args()

    data_dir = tempfile.mkdtemp(prefix="kavan-live-")
    log = os.path.join(data_dir, "burn.log")
    backend = start_backend(data_dir, args.port)
    try:
        # 1. Recording without a window
        post(args.port, '{"cpu_threshold": 75, "ram_threshold": 99, "disk_threshold": 99}')
        print("recording for 3 minutes with no window open...", flush=True)
        time.sleep(190)
        minutes = rows(data_dir, "SELECT minute, samples FROM metrics_history ORDER BY minute")
        complete = [m for m in minutes[1:-1]]  # the first and last minute are partial
        check("1: about one metrics row per minute was recorded", 2 <= len(minutes) <= 5, f"{len(minutes)} rows")
        check("1: each full minute holds about 30 samples", bool(complete) and all(26 <= m["samples"] <= 31 for m in complete),
              str([m["samples"] for m in minutes]))

        # 2 to 3. One burn, one alert
        cores = os.cpu_count() or 4
        burn = subprocess.Popen([sys.executable, os.path.join(AIDS, "cpu_burn.py"), "--seconds", str(args.burn_seconds),
                                 "--cores", str(cores), "--log", log], creationflags=subprocess.CREATE_NO_WINDOW)
        print(f"burning {cores} cores for {args.burn_seconds}s...", flush=True)
        burn.wait()
        time.sleep(45)  # an episode closes 30 seconds after the value drops
        started, stopped, _ = burn_times(log)
        cpu_alerts = rows(data_dir, "SELECT * FROM alert_events WHERE metric = 'cpu' ORDER BY started_at")
        check("2: the burn is exactly one cpu alert", len(cpu_alerts) == 1, f"{len(cpu_alerts)} rows")
        if cpu_alerts:
            alert = cpu_alerts[0]
            begin, end = epoch(alert["started_at"]), epoch(alert["ended_at"]) if alert["ended_at"] else None
            check("2: it started within 5 seconds of the burn's logged start", abs(begin - started) <= 5, f"{begin - started:+.1f}s")
            check("2: it ended within 5 seconds of the burn's logged stop", end is not None and abs(end - stopped) <= 5,
                  f"{(end - stopped) if end else 'still open'}")
            check("2: its peak is over the threshold", alert["peak_value"] > 75, str(alert["peak_value"]))
            check("3: the top process recorded is the burn's own python", (alert["top_process"] or "").lower() == "python.exe",
                  f"{alert['top_process']} pid {alert['top_process_pid']}")

        # 4. A burn with no window
        before = rows(data_dir, "SELECT COUNT(*) AS n FROM alert_events WHERE metric = 'process'")[0]["n"]
        windowless_log = os.path.join(data_dir, "windowless.log")
        subprocess.run([sys.executable, os.path.join(AIDS, "cpu_burn.py"), "--seconds", "200", "--cores", "2", "--windowless",
                        "--log", windowless_log], check=False, creationflags=subprocess.CREATE_NO_WINDOW)
        print("a windowless burn for 200s, waiting for the process watch to notice it...", flush=True)
        time.sleep(260)
        suspicious = rows(data_dir, "SELECT * FROM alert_events WHERE metric = 'process' ORDER BY started_at")
        check("4: the windowless burn raised a suspicious-process alert", len(suspicious) > before, f"{len(suspicious)} rows")
        if len(suspicious) > before:
            check("4: it names python.exe", any((r["top_process"] or "").lower() == "python.exe" for r in suspicious[before:]))
            # Only the burn's own rows: other busy programs on the machine keep their own alerts open while they work
            burn_rows = [r for r in suspicious[before:] if (r["top_process"] or "").lower() == "python.exe"]
            check("4: its alert ended once the burn stopped", all(r["ended_at"] is not None for r in burn_rows),
                  f"{sum(r['ended_at'] is None for r in burn_rows)} of {len(burn_rows)} still open")

        # 5. A crash during an alert
        post(args.port, '{"cpu_threshold": 1}')
        time.sleep(12)
        ongoing = rows(data_dir, "SELECT COUNT(*) AS n FROM alert_events WHERE ended_at IS NULL")[0]["n"]
        check("5: an alert is ongoing when the backend is killed", ongoing >= 1, f"{ongoing} ongoing")
        backend.kill()
        backend.wait()
        time.sleep(3)
        backend = start_backend(data_dir, args.port)
        time.sleep(5)
        stale = rows(data_dir, "SELECT * FROM alert_events WHERE ended_at IS NULL AND started_at < datetime('now', '-8 seconds')")
        check("5: after a restart no old alert is left ongoing", len(stale) == 0, f"{len(stale)} stale")
        post(args.port, '{"cpu_threshold": 99}')
    finally:
        backend.kill()
        backend.wait()

    print("ALL PASSED" if not FAILURES else f"{len(FAILURES)} FAILED: {FAILURES}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    raise SystemExit(main())
