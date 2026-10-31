"""Fills the scratch database with synthetic history that has a known pattern.

    set KAVAN_DATA_DIR=C:\\Temp\\kavan-test
    python seed_history.py --days 7 [--extra-alerts 600]

The pattern, so the views can be checked without waiting a week:
  * CPU follows a daily sine wave between about 10% and 40%, memory between 55% and 65%.
  * One minute holds a 10-second spike: its peak is 99% while its average stays low.
  * A three-hour hole, about 20 hours ago, where the backend was "off".
  * Alerts 1, 5, 10, 20 and 25 days ago, so retention and the date filters have something to cut.
  * --extra-alerts adds that many more in the last 24 hours, to test the 500-row notice.

Refuses to run without KAVAN_DATA_DIR, so it can never touch the real database.
"""
import argparse
import asyncio
import math
import os
import sqlite3
import sys
import time
import uuid

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, SERVER_DIR)

MINUTE, HOUR, DAY = 60, 3600, 86400


def main() -> int:
    if not os.environ.get("KAVAN_DATA_DIR"):
        print("Refusing to run: set KAVAN_DATA_DIR to a scratch folder first.", file=sys.stderr)
        return 2

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--days", type=float, default=7)
    parser.add_argument("--extra-alerts", type=int, default=0)
    args = parser.parse_args()

    from database import db
    from utils.timefmt import minute_text, utc_text

    asyncio.run(db.init_db())
    now = time.time()
    hole_from, hole_to = 20 * HOUR, 17 * HOUR
    spike_ago = 9 * HOUR

    rows = []
    for minutes_ago in range(int(args.days * DAY / MINUTE), 1, -1):
        ago = minutes_ago * MINUTE
        if hole_to < ago <= hole_from:
            continue
        hour_of_day = ((now - ago) % DAY) / HOUR
        cpu = 25 + 15 * math.sin(hour_of_day / 24 * 2 * math.pi) + 2 * math.sin(minutes_ago / 7)
        cpu_max = cpu + 6
        if abs(ago - spike_ago) < MINUTE:
            cpu_max = 99.0
        ram = 60 + 5 * math.sin(minutes_ago / 400)
        rows.append((minute_text(now - ago), round(cpu, 2), round(cpu_max, 2), round(ram, 2), round(ram + 1.5, 2), 47.2, 30))

    conn = sqlite3.connect(db.DB_PATH)
    conn.executemany("INSERT OR REPLACE INTO metrics_history VALUES (?,?,?,?,?,?,?)", rows)

    def alert(label: str, metric: str, ago: float, minutes: float) -> None:
        started = now - ago
        conn.execute(
            "INSERT INTO alert_events (id, metric, level, threshold, started_at, ended_at, peak_value, cpu_at_start, "
            "ram_at_start, disk_at_start, top_process, top_process_pid, top_process_value) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (f"{label}-{uuid.uuid4().hex[:6]}", metric, "warning", 90, utc_text(started),
             utc_text(started + minutes * MINUTE), 93.0, 93.0, 61.0, 47.0, "chrome.exe", 1234, 70.0))

    for days_ago in (1, 5, 10, 20, 25):
        alert(f"seed-{days_ago}d", "cpu", days_ago * DAY, 6)
    for index in range(args.extra_alerts):
        alert(f"extra-{index}", "cpu", 600 + index * 60, 1)

    conn.commit()
    conn.close()
    print(f"seeded {len(rows)} minutes and {5 + args.extra_alerts} alerts into {db.DB_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
