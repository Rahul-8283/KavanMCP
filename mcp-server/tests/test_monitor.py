import json
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from integrations.monitor import get_all_processes
from tools.analyze_system import analyze_system_logic


def test_idle_process_is_not_listed():
    processes = get_all_processes()

    assert processes
    assert all(p["pid"] != 0 for p in processes)


def test_idle_process_is_never_a_top_cpu_hog():
    analyze_system_logic()  # First pass primes psutil's per-process CPU counters
    report = json.loads(analyze_system_logic())

    names = [p["name"].lower() for p in report["top_cpu_hogs"]]
    assert "system idle process" not in names


def test_processes_report_headless_state():
    import subprocess

    from integrations.windows import get_windowed_pids

    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"],
                             creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        by_pid = {p["pid"]: p for p in get_all_processes()}
        windowed = get_windowed_pids()
    finally:
        child.kill()
        child.wait()

    assert by_pid[child.pid]["is_headless"] is True
    if windowed:  # An interactive desktop is available
        assert any(not p["is_headless"] for p in by_pid.values())


def test_listing_and_confirmation_agree_on_tier():
    """The tier shown in the process table must be the tier the kill flow stages."""
    import asyncio
    import subprocess

    from handlers.approval_handler import PENDING_APPROVALS, stage_termination
    from handlers.classification_handler import classify_process

    # The venv's python.exe is a launcher that idles while a child runs; spin the real interpreter
    spinner = subprocess.Popen([sys._base_executable, "-c", "while True: pass"],
                               creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        import time
        time.sleep(0.5)
        staged = asyncio.run(stage_termination(spinner.pid, source="test"))
    finally:
        PENDING_APPROVALS.clear()
        spinner.kill()
        spinner.wait()

    assert staged["status"] == "pending"
    # A windowless process pinning a core is the Tier 4 case from the V1 plan
    assert staged["tier"] == classify_process("python.exe", staged["cpu_percent"], 0.0, is_headless=True) == 4


def test_scan_tools_do_not_block_the_mcp_event_loop():
    """A heartbeat coroutine must keep ticking while the multi-second scan runs."""
    import asyncio

    from server import analyze_system, list_processes

    async def run(tool, *args):
        ticks = 0

        async def heartbeat():
            nonlocal ticks
            while True:
                await asyncio.sleep(0.05)
                ticks += 1

        beat = asyncio.create_task(heartbeat())
        started = asyncio.get_running_loop().time()
        await getattr(tool, "fn", tool)(*args)
        elapsed = asyncio.get_running_loop().time() - started
        beat.cancel()
        return ticks, elapsed

    for tool, args in ((analyze_system, ()), (list_processes, (None,))):
        ticks, elapsed = asyncio.run(run(tool, *args))
        # A blocked loop yields ~0 ticks; a free one ticks roughly every 50ms
        assert ticks >= (elapsed / 0.05) * 0.5, (tool, ticks, elapsed)
