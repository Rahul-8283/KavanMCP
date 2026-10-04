import os
import sqlite3
import subprocess
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db import DB_PATH

WRITER = """
import sqlite3, sys
path, tag = sys.argv[1], sys.argv[2]
conn = sqlite3.connect(path, timeout=5)
errors = 0
for i in range(300):
    try:
        conn.execute(
            "INSERT INTO audit_log (process_name, pid, reasoning) VALUES (?, ?, ?)",
            (f"{tag}-{i}", i, "phase10 concurrency"),
        )
        conn.commit()
    except sqlite3.OperationalError as e:
        errors += 1
        if "locked" not in str(e):
            raise
print(f"errors={errors}")
"""

READER = """
import sqlite3, sys
conn = sqlite3.connect(sys.argv[1], timeout=5)
for _ in range(300):
    conn.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT 3").fetchall()
"""


def test_live_database_uses_wal_mode():
    conn = sqlite3.connect(DB_PATH)
    try:
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
    finally:
        conn.close()

    assert mode.lower() == "wal", f"journal_mode is {mode}; Phase 10 needs WAL"


def test_two_writers_and_reader_do_not_hit_database_locked(tmp_path):
    db_file = str(tmp_path / "concurrency.db")
    conn = sqlite3.connect(db_file)
    conn.execute(
        "CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, process_name TEXT, "
        "pid INTEGER, reasoning TEXT)"
    )
    conn.execute("PRAGMA journal_mode=WAL")
    conn.commit()
    conn.close()

    procs = [
        subprocess.Popen([sys.executable, "-c", WRITER, db_file, "a"], stdout=subprocess.PIPE, text=True),
        subprocess.Popen([sys.executable, "-c", WRITER, db_file, "b"], stdout=subprocess.PIPE, text=True),
        subprocess.Popen([sys.executable, "-c", READER, db_file], stdout=subprocess.PIPE, text=True),
    ]
    outputs = [p.communicate(timeout=120)[0] for p in procs]

    assert all(p.returncode == 0 for p in procs)
    for out in outputs[:2]:
        assert "errors=0" in out, out

    check = sqlite3.connect(db_file)
    rows = check.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0]
    check.close()
    assert rows == 600


def test_second_instance_skips_the_http_server_when_the_port_is_taken(monkeypatch):
    """Phase 10 2.1: Claude Desktop launches its own main.py next to the standalone server."""
    import socket

    import ws_server

    holder = socket.socket()
    holder.bind(("127.0.0.1", 0))
    holder.listen(1)
    monkeypatch.setattr(ws_server, "PORT", holder.getsockname()[1])
    started = []
    monkeypatch.setattr(ws_server.uvicorn, "run", lambda *a, **k: started.append(True))
    try:
        ws_server.run_ws_server()
        assert started == []          # Port held by the first instance: do not try to bind
    finally:
        holder.close()

    ws_server.run_ws_server()
    assert started == [True]          # Port free: serve as usual
