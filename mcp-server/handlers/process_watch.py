"""
Process scans made for the alert history: which process was the largest consumer
when a system-wide alert started.
"""
import asyncio
import threading

from integrations.monitor import get_all_processes

# Which process field ranks the consumers of each system metric. Disk has no per-process figure.
TOP_PROCESS_FIELDS = {"cpu": "cpu_percent", "ram": "memory_mb"}

# A process's CPU reading is its average since the previous scan, so two history scans
# running at once would each cut the other's window to nothing.
_scan_lock = threading.Lock()


def _scan_blocking() -> list[dict]:
    with _scan_lock:
        return get_all_processes()


async def scan_processes() -> list[dict]:
    """One full process scan in a worker thread. It blocks for over a second."""
    return await asyncio.to_thread(_scan_blocking)


def find_top_process(processes: list[dict], metric: str) -> dict | None:
    """
    The largest consumer of `metric` as {"name", "pid", "value"}, or None when the metric
    has no per-process figure or no process is using any. This is the top consumer at that
    moment: strong evidence of the cause, not proof.
    """
    field = TOP_PROCESS_FIELDS.get(metric)
    if field is None or not processes:
        return None
    top = max(processes, key=lambda proc: proc[field])
    if top[field] <= 0:
        return None
    return {"name": top["name"], "pid": top["pid"], "value": round(top[field], 2)}


async def lookup_top_process(metric: str) -> dict | None:
    if metric not in TOP_PROCESS_FIELDS:
        return None
    return find_top_process(await scan_processes(), metric)
