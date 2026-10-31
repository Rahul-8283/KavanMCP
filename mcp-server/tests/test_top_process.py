"""Phase 8 §4.1: the process named in a CPU alert is the one using the CPU now, not a stale average."""
import asyncio
import os
import subprocess
import sys
import time

import psutil

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from handlers import process_watch


def reading_for(processes, pid):
    return next(p["cpu_percent"] for p in processes if p["pid"] == pid)


def test_a_cpu_alert_sees_a_process_that_started_after_the_last_scan():
    # The 60-second watch scanned a moment ago. Only then does a runaway program start.
    asyncio.run(process_watch.scan_processes())
    burner = subprocess.Popen([sys._base_executable, "-c", "while True: pass"], creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        time.sleep(2)

        stale = asyncio.run(process_watch.scan_processes())
        recent = asyncio.run(process_watch.scan_processes_recent())

        assert reading_for(stale, burner.pid) == 0.0, "the ordinary scan cannot see a process that is new to it"
        assert reading_for(recent, burner.pid) > 40, "the recent scan measures what it is doing now"
    finally:
        burner.kill()
        burner.wait()


def test_the_lookup_for_cpu_uses_the_recent_scan_and_for_memory_the_ordinary_one(monkeypatch):
    calls = []

    async def recent():
        calls.append("recent")
        return [{"name": "a.exe", "pid": 1, "cpu_percent": 50.0, "memory_mb": 10.0}]

    async def ordinary():
        calls.append("ordinary")
        return [{"name": "b.exe", "pid": 2, "cpu_percent": 5.0, "memory_mb": 900.0}]

    monkeypatch.setattr(process_watch, "scan_processes_recent", recent)
    monkeypatch.setattr(process_watch, "scan_processes", ordinary)

    cpu = asyncio.run(process_watch.lookup_top_process("cpu"))
    ram = asyncio.run(process_watch.lookup_top_process("ram"))
    disk = asyncio.run(process_watch.lookup_top_process("disk"))

    assert calls == ["recent", "ordinary"]
    assert cpu["name"] == "a.exe" and ram["name"] == "b.exe" and disk is None


def test_the_recent_scan_waits_one_second_between_resetting_and_reading():
    started = time.time()

    asyncio.run(process_watch.scan_processes_recent())

    assert time.time() - started >= process_watch.RECENT_CPU_WINDOW_SECONDS


def test_the_recent_scan_does_not_run_beside_another_scan():
    """Both take the same lock, or one would reset the other's counters in the middle of its window."""
    assert process_watch._scan_lock.acquire(timeout=1)
    try:
        started = time.time()
        waiter = asyncio.run(asyncio.wait_for(asyncio.to_thread(lambda: process_watch._scan_lock.acquire(timeout=0.3)), 2))
        assert waiter is False and time.time() - started < 2
    finally:
        process_watch._scan_lock.release()
    assert psutil.pid_exists(os.getpid())
