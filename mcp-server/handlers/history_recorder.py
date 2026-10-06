"""
Turns the 2-second metric samples into what the history tables store.
Plain logic only: no database or network code, and time is always passed in.
"""
from dataclasses import dataclass
from typing import Literal

from utils.timefmt import minute_text

CRITICAL_LEVEL = 95

# (metric key, config key, label shown to the user)
ALERT_METRICS = (
    ("cpu", "cpu_threshold", "CPU"),
    ("ram", "ram_threshold", "Memory"),
    ("disk", "disk_threshold", "Disk"),
)

# A metric hovering at its threshold must not open and close an episode on every sample
EPISODE_CLOSE_SECONDS = 30
# Samples arrive every 2 seconds. A longer silence means the machine slept or the loop stalled.
SAMPLE_GAP_SECONDS = 10


def level_for(value: float) -> str:
    return "critical" if value >= CRITICAL_LEVEL else "warning"


class MinuteAggregator:
    """Collects samples and hands back one metrics_history row per minute."""

    def __init__(self):
        self._minute: str | None = None
        self._reset()

    def _reset(self) -> None:
        self._sums = {"cpu": 0.0, "ram": 0.0, "disk": 0.0}
        self._peaks = {"cpu": 0.0, "ram": 0.0}
        self._samples = 0

    def _row(self) -> dict:
        return {
            "minute": self._minute,
            "cpu_avg": round(self._sums["cpu"] / self._samples, 2),
            "cpu_max": self._peaks["cpu"],
            "ram_avg": round(self._sums["ram"] / self._samples, 2),
            "ram_max": self._peaks["ram"],
            "disk_avg": round(self._sums["disk"] / self._samples, 2),
            "samples": self._samples,
        }

    def add(self, values: dict, now: float) -> dict | None:
        """Adds one sample. Returns the finished row when `now` falls in a new minute."""
        minute = minute_text(now)
        finished = None
        if self._minute is not None and minute != self._minute:
            finished = self._row()
            self._reset()
        self._minute = minute

        for metric in self._sums:
            self._sums[metric] += values[metric]
        for metric in self._peaks:
            self._peaks[metric] = max(self._peaks[metric], values[metric])
        self._samples += 1
        return finished

    def flush(self) -> dict | None:
        """Returns the partial row for the current minute, for shutdown."""
        if self._minute is None or self._samples == 0:
            return None
        row = self._row()
        self._minute = None
        self._reset()
        return row


@dataclass
class Episode:
    """One alert_events row: the whole time a metric stayed over its threshold."""
    metric: str
    threshold: float
    started_at: float
    peak_value: float
    level: str
    readings: dict  # cpu, ram and disk at the moment the episode started
    top_process: dict | None = None  # {"name", "pid", "value"}
    id: str | None = None  # set once the row is stored
    ended_at: float | None = None
    below_since: float | None = None  # when the value first dropped; the close timer
    peak_changed: bool = False  # the peak or level moved since it was last stored

    def raise_peak(self, value: float) -> bool:
        if value <= self.peak_value:
            return False
        self.peak_value = value
        self.level = level_for(value)
        self.peak_changed = True
        return True

    def end(self, at: float) -> None:
        self.ended_at = max(at, self.started_at)


@dataclass
class EpisodeChange:
    kind: Literal["started", "peaked", "ended"]
    episode: Episode


class EpisodeTracker:
    """Follows CPU, memory and disk against their thresholds. At most one open episode per metric."""

    def __init__(self):
        self._open: dict[str, Episode] = {}
        self._last_sample: float | None = None

    def open_episodes(self) -> list[Episode]:
        return list(self._open.values())

    def _close_all(self, at: float) -> list[EpisodeChange]:
        changes = []
        for episode in self._open.values():
            episode.end(episode.below_since if episode.below_since is not None else at)
            changes.append(EpisodeChange("ended", episode))
        self._open.clear()
        return changes

    def update(self, values: dict, config: dict, now: float) -> list[EpisodeChange]:
        """Returns the episodes that started, peaked higher, or ended on this sample."""
        changes: list[EpisodeChange] = []

        # After a sleep, nothing is known about the time in between: end every episode at the
        # last sample that was really taken, or a spike before sleep becomes an overnight alert.
        if self._last_sample is not None and now - self._last_sample > SAMPLE_GAP_SECONDS:
            changes.extend(self._close_all(self._last_sample))
        self._last_sample = now

        for metric, config_key, _ in ALERT_METRICS:
            threshold = config.get(config_key)
            value = values[metric]
            # The same comparison build_alerts uses, so the history and the toasts always agree
            over = threshold is not None and value > threshold
            episode = self._open.get(metric)

            if episode is None:
                if over:
                    episode = Episode(metric=metric, threshold=threshold, started_at=now, peak_value=value,
                                      level=level_for(value), readings=dict(values))
                    self._open[metric] = episode
                    changes.append(EpisodeChange("started", episode))
            elif over:
                episode.below_since = None
                if episode.raise_peak(value):
                    changes.append(EpisodeChange("peaked", episode))
            elif episode.below_since is None:
                episode.below_since = now
            elif now - episode.below_since >= EPISODE_CLOSE_SECONDS:
                episode.end(episode.below_since)
                del self._open[metric]
                changes.append(EpisodeChange("ended", episode))

        return changes
