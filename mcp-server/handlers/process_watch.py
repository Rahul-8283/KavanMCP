"""
Process scans made for the alert history: which process was the largest consumer when a
system-wide alert started, and a timed watch that notices Tier 4 processes without
anyone having to open the dashboard.
"""
import asyncio
import os
import threading

from handlers.classification_handler import TIER_4_CPU_THRESHOLD, classify_process
from handlers.history_recorder import Episode, EpisodeChange, level_for
from handlers.protection import is_alert_muted
from integrations.monitor import get_all_processes

# One scan costs about 1.5 seconds of one core, so once a minute averages about 2.5% of a core.
PROCESS_WATCH_INTERVAL = 60
# A busy process can dip below the Tier 4 rule for a moment. One scan without it is not the end.
SCANS_MISSED_TO_END = 2
# Scans arrive about a minute apart. A longer silence means the machine slept.
PROCESS_WATCH_GAP_SECONDS = 3 * PROCESS_WATCH_INTERVAL

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


class ProcessWatcher:
    """
    Turns successive process scans into 'process' alert episodes: one for each Tier 4
    process, from the scan that first shows it to the scan where it was first gone.
    """

    def __init__(self):
        self._open: dict[tuple[int, str], Episode] = {}
        self._missed: dict[tuple[int, str], int] = {}
        self._primed = False
        self._last_scan: float | None = None

    def open_episodes(self) -> list[Episode]:
        return list(self._open.values())

    def _end(self, key: tuple[int, str], at: float) -> EpisodeChange:
        episode = self._open.pop(key)
        self._missed.pop(key, None)
        episode.end(at)
        return EpisodeChange("ended", episode)

    def update(self, processes: list[dict], readings: dict, now: float) -> list[EpisodeChange]:
        """
        Takes one scan and the system readings at that moment. Returns the episodes
        that started, peaked higher, or ended.
        """
        last_scan, self._last_scan = self._last_scan, now
        if not self._primed:
            # The first CPU reading of every process is 0.0. This scan only sets the baseline.
            self._primed = True
            return []

        changes: list[EpisodeChange] = []
        if now - last_scan > PROCESS_WATCH_GAP_SECONDS:
            for key, episode in list(self._open.items()):
                changes.append(self._end(key, episode.below_since if episode.below_since is not None else last_scan))

        own_pid = os.getpid()
        suspicious = {
            (proc["pid"], proc["name"]): proc
            for proc in processes
            if proc["pid"] != own_pid and classify_process(
                process_name=proc["name"], cpu_percent=proc["cpu_percent"],
                memory_mb=proc["memory_mb"], is_headless=proc["is_headless"]) == 4
        }

        for key, proc in suspicious.items():
            cpu = proc["cpu_percent"]
            episode = self._open.get(key)
            if episode is None:
                episode = Episode(
                    metric="process", threshold=TIER_4_CPU_THRESHOLD, started_at=now, peak_value=cpu,
                    level=level_for(cpu), readings=dict(readings), muted=is_alert_muted(proc["name"]),
                    top_process={"name": proc["name"], "pid": proc["pid"], "value": cpu},
                )
                self._open[key] = episode
                changes.append(EpisodeChange("started", episode))
            else:
                episode.below_since = None
                self._missed.pop(key, None)
                if episode.raise_peak(cpu):
                    changes.append(EpisodeChange("peaked", episode))

        for key in [key for key in self._open if key not in suspicious]:
            episode = self._open[key]
            if episode.below_since is None:
                episode.below_since = now
            self._missed[key] = self._missed.get(key, 0) + 1
            if self._missed[key] >= SCANS_MISSED_TO_END:
                changes.append(self._end(key, episode.below_since))

        return changes
