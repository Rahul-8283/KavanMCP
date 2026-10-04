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
