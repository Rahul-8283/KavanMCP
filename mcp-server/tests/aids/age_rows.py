"""Moves every history row back in time, to test retention and the date filters.

    set KAVAN_DATA_DIR=C:\\Temp\\kavan-test
    python age_rows.py --days 20

Refuses to run without KAVAN_DATA_DIR, so it can never touch the real database.
"""
import argparse
import os
import sqlite3
import sys

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, SERVER_DIR)


def main() -> int:
    if not os.environ.get("KAVAN_DATA_DIR"):
        print("Refusing to run: set KAVAN_DATA_DIR to a scratch folder first.", file=sys.stderr)
        return 2

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=float, required=True)
    args = parser.parse_args()

    from database import db

    shift = f"-{args.days} days"
    conn = sqlite3.connect(db.DB_PATH)
    conn.execute("UPDATE metrics_history SET minute = datetime(minute, ?)", (shift,))
    conn.execute("UPDATE alert_events SET started_at = datetime(started_at, ?), "
                 "ended_at = CASE WHEN ended_at IS NULL THEN NULL ELSE datetime(ended_at, ?) END", (shift, shift))
    conn.execute("UPDATE audit_log SET timestamp = datetime(timestamp, ?)", (shift,))
    conn.commit()
    conn.close()
    print(f"moved all history back {args.days} days in {db.DB_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
