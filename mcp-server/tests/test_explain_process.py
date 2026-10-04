import asyncio
import json
import os
import subprocess
import sys
import threading
import time

import psutil

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools.explain_process import explain_process_logic


def test_explains_a_live_process_with_command_line_and_parent():
    child = subprocess.Popen([sys._base_executable, "-c", "import time; time.sleep(30)"],
                             creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        time.sleep(1.0)  # Let interpreter startup finish; that burst alone reads as high CPU
        report = json.loads(explain_process_logic(child.pid))
    finally:
        child.kill()
        child.wait()

    assert report["pid"] == child.pid
    assert report["name"].lower().startswith("python")
    assert "time.sleep(30)" in report["command_line"]
    assert report["executable_path"].lower().endswith("python.exe")
    assert report["parent"]["pid"] == os.getpid()
    assert report["is_headless"] is True
    assert report["tier"] == 3
    assert report["loaded_module_count"] > 0


def test_notes_flag_tier_1_and_self():
    explorer = next((p for p in psutil.process_iter(["name"]) if (p.info["name"] or "").lower() == "explorer.exe"), None)
    own = json.loads(explain_process_logic(os.getpid()))

    assert any("KavanMCP itself" in n for n in own["notes"])
    if explorer:
        report = json.loads(explain_process_logic(explorer.pid))
        assert report["tier"] == 1
        assert any("prohibited" in n for n in report["notes"])


def test_unknown_pid_is_reported_not_raised():
    assert json.loads(explain_process_logic(4294967000))["status"] == "not_found"


def test_tool_is_registered_and_runs_off_the_event_loop():
    from server import explain_process, mcp

    names = {t.name for t in asyncio.run(mcp.list_tools())}
    assert "explain_process" in names

    fn = getattr(explain_process, "fn", explain_process)
    report = json.loads(asyncio.run(fn(os.getpid())))
    assert report["pid"] == os.getpid()


def test_deep_info_reads_command_line_from_a_worker_thread():
    """WMI needs COM initialised per thread; MCP tools call this from worker threads."""
    from integrations.windows import get_deep_process_info

    result = {}
    worker = threading.Thread(target=lambda: result.update(get_deep_process_info(os.getpid())))
    worker.start()
    worker.join(30)

    assert result["CommandLine"] and "pytest" in result["CommandLine"]
