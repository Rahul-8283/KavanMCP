"""
Turns the 2-second metric samples into what the history tables store.
Plain logic only: no database or network code, and time is always passed in.
"""
from utils.timefmt import minute_text


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
