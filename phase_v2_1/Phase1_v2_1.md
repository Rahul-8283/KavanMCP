# Phase 1: Metrics & Alert Storage

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 1
Phase 1 gives Kavan a memory. Today the backend samples CPU, memory and disk every 2 seconds, sends the numbers to the window and forgets them. Alerts are sent as toasts and are gone five seconds later. Nothing about the last hour, let alone the last day, survives.

By the end of this phase the backend records two things continuously, whether or not a window is open:

1. **Metrics history**: one row per minute with the average and peak of each metric.
2. **Alert events**: one row per alert episode, with when it started and ended, how high it went, and which process was the largest consumer at the time.

This phase has no UI. Phases 2 and 3 read what it writes. It is built first so that real history has already accumulated by the time those pages exist.

### 1.2 Where This Phase Sits
| | |
|---|---|
| Plan reference | `PLAN_V2_1.md` §2 (Step 1) |
| Depends on | Nothing |
| Unblocks | Phase 2 (Alert History), Phase 3 (Performance Graphs), Phase 7 (retention setting) |
| Layer | Backend only (`mcp-server/`) |

### 1.3 What Exists Today
All of this is in `mcp-server/ws_server.py`:

- `metrics_broadcaster()` loops every `BROADCAST_INTERVAL = 2.0` seconds and calls `collect_metrics()`, which returns `{"cpu", "ram", "disk"}`.
- `build_alerts()` compares each value with the user's threshold and returns a `threshold_alert` message, at most once per `ALERT_COOLDOWN = 3.0` seconds per metric. The level is `critical` at or above `CRITICAL_LEVEL = 95`, otherwise `warning`.
- Alerts are only built **when a window is connected** (`if manager.active_connections:`). With the app closed, a threshold breach leaves no trace at all.
- Only the instance that owns port 8000 runs this loop. A second instance started by Claude Desktop detects the port with `port_in_use()` and serves MCP tools only.

The database (`mcp-server/database/`) has `audit_log` and an unused `system_baselines` table. All access goes through `_connect()` in `db.py`, which sets a 30-second busy timeout.

### 1.4 Decisions This Phase Assumes
These follow the recommended defaults in `PLAN_V2_1.md` §9. If a decision changes, the section named here changes with it.

| Decision | Assumed answer | Affects |
|---|---|---|
| §9.3 Alert types | The three existing types, plus a new "suspicious process" type raised for Tier 4 processes. Memory-leak detection is deferred. | §5 |
| §9.4 History window | Metrics kept 7 days. Alerts kept 30 days until Phase 7 makes it a setting. | §7 |

---

## 2. Database Schema

Both tables are defined in `mcp-server/database/models.py` and created in `init_db()` beside the existing tables. `CREATE TABLE IF NOT EXISTS` makes this safe for a database created by V2.0.1.

### 2.1 Time Format
Every timestamp in the new tables is stored as UTC text in the form `YYYY-MM-DD HH:MM:SS`. This is the format SQLite's `CURRENT_TIMESTAMP` already writes into `audit_log`, so the same `datetime('now', '-24 hours')` comparisons used by `get_recent_logs()` work on the new tables. Local time is never stored. Conversion to the user's time zone happens in the UI.

A small helper module, `mcp-server/utils/timefmt.py`, owns the conversions so no other file formats a timestamp by hand:

| Function | Purpose |
|---|---|
| `utc_text(epoch: float) -> str` | Epoch seconds to the stored text form |
| `minute_text(epoch: float) -> str` | Same, truncated to the minute (`...:00`) |
| `to_iso_utc(text: str) -> str` | Stored text to ISO 8601 with a `Z`, for API responses (used from Phase 2) |

### 2.2 `metrics_history`
```sql
CREATE TABLE IF NOT EXISTS metrics_history (
    minute   DATETIME PRIMARY KEY,  -- UTC, truncated to the minute
    cpu_avg  REAL NOT NULL,
    cpu_max  REAL NOT NULL,
    ram_avg  REAL NOT NULL,
    ram_max  REAL NOT NULL,
    disk_avg REAL NOT NULL,
    samples  INTEGER NOT NULL       -- number of 2 s samples behind this row
);
```

- **Why one row per minute.** Raw 2-second samples would be 43,200 rows a day. One row per minute is 1,440 a day and about 10,000 for the full 7 days.
- **Why the peak is stored.** A one-minute average hides a ten-second spike, and spikes are what the graphs exist to show.
- **Why `samples` is stored.** A full minute has 30 samples. A row with fewer means the backend was not running for the whole minute. Phase 3 uses it to weight averages correctly when it merges minutes into larger buckets, and to show partial coverage.
- Disk has no peak column. It moves too slowly for a peak within a minute to differ from the average.

### 2.3 `alert_events`
```sql
CREATE TABLE IF NOT EXISTS alert_events (
    id                TEXT PRIMARY KEY,
    metric            TEXT NOT NULL,      -- 'cpu', 'ram', 'disk', 'process'
    level             TEXT NOT NULL,      -- 'warning' or 'critical': the highest reached
    threshold         REAL NOT NULL,      -- the limit in force when the episode started
    started_at        DATETIME NOT NULL,
    ended_at          DATETIME,           -- NULL while the episode is open
    peak_value        REAL NOT NULL,
    cpu_at_start      REAL NOT NULL,
    ram_at_start      REAL NOT NULL,
    disk_at_start     REAL NOT NULL,
    top_process       TEXT,
    top_process_pid   INTEGER,
    top_process_value REAL,               -- that process's CPU % or memory MB
    muted             INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_alert_events_started ON alert_events (started_at);
```

- `muted` is not in the plan's schema. It is added now so Phase 6 (the "never alert on" whitelist) does not need a migration. Phase 1 always writes 0.
- For `metric = 'process'`, `threshold` is the Tier 4 CPU rule (25), `peak_value` is that process's highest CPU reading, and the `top_process` columns describe the process itself.

---

## 3. Recording Metrics

### 3.1 The Aggregator
A new module, `mcp-server/handlers/history_recorder.py`, holds the logic as plain classes with no database or network code. Time is passed in as an argument, the same way `build_alerts()` takes `now`, so tests never sleep.

```python
class MinuteAggregator:
    def add(self, values: dict, now: float) -> dict | None:
        """Adds one sample. Returns the finished row when `now` falls in a new minute."""
    def flush(self) -> dict | None:
        """Returns the partial row for the current minute, for shutdown."""
```

- `add()` keeps a running sum, maximum and count for the current minute.
- When a sample arrives in a later minute, the previous minute's row is returned and a new minute starts.
- A returned row has the columns of §2.2.

### 3.2 Writing the Row
`db.py` gains `record_metrics_minute(row)`. It must merge, not replace, because the backend can be restarted in the middle of a minute and then produces a second partial row for the same key:

```sql
INSERT INTO metrics_history (minute, cpu_avg, cpu_max, ram_avg, ram_max, disk_avg, samples)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(minute) DO UPDATE SET
    cpu_avg  = (cpu_avg  * samples + excluded.cpu_avg  * excluded.samples) / (samples + excluded.samples),
    ram_avg  = (ram_avg  * samples + excluded.ram_avg  * excluded.samples) / (samples + excluded.samples),
    disk_avg = (disk_avg * samples + excluded.disk_avg * excluded.samples) / (samples + excluded.samples),
    cpu_max  = MAX(cpu_max, excluded.cpu_max),
    ram_max  = MAX(ram_max, excluded.ram_max),
    samples  = samples + excluded.samples;
```

### 3.3 Wiring Into the Broadcaster
`metrics_broadcaster()` changes shape. Recording must happen every cycle, and broadcasting only when a window is connected:

```
every 2 seconds:
    values = collect_metrics()
    row = aggregator.add(values, now)            # always
    if row: await record_metrics_minute(row)
    events = episodes.update(values, config, now) # always (§4)
    persist events
    if a window is connected:
        broadcast metrics_update and any alerts   # unchanged behaviour
```

- A failed write is logged and the loop continues. Recording must never stop the gauges.
- On shutdown the `lifespan` handler calls `aggregator.flush()` and writes the partial minute. If the process is killed outright, at most the current minute is lost.

### 3.4 Sleep and Suspend
When a laptop sleeps, the loop stops and resumes with `time.time()` far ahead. Two rules keep the data honest:

- The aggregator needs nothing special. The next sample lands in a new minute, the old minute is written, and the minutes in between have no rows. Phase 3 draws those as a gap.
- If more than `SAMPLE_GAP_SECONDS = 10` passed since the previous sample, every open alert episode is closed at the time of the **previous** sample before the new sample is processed. Otherwise a machine that slept overnight during a spike would record an eight-hour alert.

---

## 4. Recording Alert Episodes

### 4.1 Why Episodes
While a metric stays over its threshold, `build_alerts()` re-sends the same alert every 3 seconds. Storing each would put twenty rows a minute into the history for a single event. An **episode** is one row covering the whole time a metric is over its limit.

### 4.2 The Tracker
```python
class EpisodeTracker:
    def update(self, values: dict, config: dict, now: float) -> list[EpisodeChange]:
        """Returns the episodes that started, peaked higher, or ended on this sample."""
```

One open episode at most per metric. The rules:

| Situation | Result |
|---|---|
| Value rises above the threshold and no episode is open | **Start**: a new row with all three readings at that moment |
| Episode open, value higher than its recorded peak | **Peak** raised in memory. `level` becomes `critical` once the peak reaches 95 |
| Episode open, value at or below the threshold | A close timer starts. The episode stays open |
| Value goes back above the threshold before the timer ends | Timer cancelled. Same episode continues |
| Value stays at or below the threshold for `EPISODE_CLOSE_SECONDS = 30` | **End**: `ended_at` is the time the value first dropped, not 30 seconds later |

- **Why the 30-second wait.** A metric hovering at its threshold would otherwise open and close an episode on every sample and fill the history with one-second alerts.
- The comparison is `value > threshold`, the same one `build_alerts()` uses, so the history and the toasts always agree.
- An episode keeps the `threshold` it started with. If the user raises the threshold above the current value, the episode ends by the normal rule.
- `threshold` of `None` (a setting that failed validation) means that metric is not tracked, as today.

### 4.3 Persisting Changes
New functions in `db.py`:

| Function | When |
|---|---|
| `open_alert_event(...) -> str` | On **Start**. Returns the new `id` |
| `update_alert_event(id, peak_value, level)` | Once a minute, with the metrics flush, for each open episode whose peak changed |
| `set_alert_top_process(id, name, pid, value)` | When the process scan in §4.4 finishes |
| `close_alert_event(id, ended_at, peak_value, level)` | On **End** |

Peaks are written once a minute, not on every sample, to keep writes low. A crash loses at most a minute of peak movement.

### 4.4 Which Process Was Responsible
The brief asks for "which process caused it". A system-wide threshold alert does not know. Phase 1 records the largest consumer at the moment the episode starts.

- On **Start** for `cpu` or `ram`, a background task runs `get_all_processes()` from `integrations/monitor.py` through `asyncio.to_thread()` and stores the process with the highest `cpu_percent` (for CPU) or `memory_mb` (for memory). `disk` alerts record no process.
- The scan takes about 1.5 seconds. It runs as its own task, so the 2-second sampling loop never waits for it.
- **A psutil detail that matters.** A process's CPU reading is the average since the previous scan, and the first reading for a process is always 0.0. A scan with nothing before it would name the wrong process. The process watch in §5 scans every 60 seconds, so by the time an alert fires each reading covers at most the last minute, which is the window we want.
- The value stored is the raw per-process figure the dashboard shows. On a multi-core machine a process's CPU can exceed 100.
- This is the top consumer at that moment. It is strong evidence, not proof of cause. Phase 2 labels it "Top process".

---

## 5. Suspicious-Process Alerts

### 5.1 The Process Watch
Tier 4 means a process with no window using more than 25% CPU (`classify_process()` in `handlers/classification_handler.py`). Today that is only discovered when the dashboard or Claude happens to scan. Phase 1 adds a scan on a timer so it is noticed without anyone looking.

A new module, `mcp-server/handlers/process_watch.py`, runs from the broadcaster's `lifespan`:

- Every `PROCESS_WATCH_INTERVAL = 60` seconds, scan with `get_all_processes()` in a worker thread and classify each process.
- Each Tier 4 process opens an episode with `metric = 'process'`, keyed by PID and name.
- The episode's peak follows that process's CPU reading across scans.
- The episode ends when the process is absent from, or no longer Tier 4 in, **two consecutive** scans. One scan is not enough, because a busy process can dip below 25% for a moment.
- The first scan after start-up only primes the CPU readings (§4.4) and raises nothing.

### 5.2 Cost
One scan costs about 1.5 seconds of one core, measured in V2.0.1. Once a minute that averages about 2.5% of a single core. The interval is a named constant so it can be raised if that proves too much.

### 5.3 Existing Anomaly Flags
`evaluate_anomalies()` in `handlers/alert_handler.py` already tags processes with `HIGH_CPU_WARNING` and `MEMORY_LEAK_WARNING`. These are labels on a process list, not alerts, and `MEMORY_LEAK_WARNING` is a fixed 2 GB limit, not a detector of growth over time. Phase 1 leaves them as they are. They are not turned into alert events.

---

## 6. Start-Up, Ownership and Recovery

### 6.1 One Writer
Only the instance that owns port 8000 records. This falls out of the existing design: the recorder and the process watch are started from `lifespan`, which only runs when uvicorn starts, which only happens when `port_in_use()` is false. No extra locking is needed.

`init_db()` still creates the tables in every instance. That is idempotent and harmless.

### 6.2 Recovering From a Crash
If the backend dies during an episode, the row is left with `ended_at` NULL forever. At start-up the owning instance closes such rows:

```sql
UPDATE alert_events
SET ended_at = MAX(started_at, COALESCE((SELECT MAX(minute) FROM metrics_history), started_at))
WHERE ended_at IS NULL;
```

The last recorded minute is the best evidence of when the backend was last alive.

This runs in `lifespan`, **not** in `init_db()`. `init_db()` also runs in the second, MCP-only instance, which would otherwise close episodes that the live instance still has open.

---

## 7. Retention

`db.py` gains `prune_history(metrics_days, alert_days)`. It runs once at start-up, after recovery, and then every hour from the broadcaster's `lifespan`.

- `metrics_history`: rows older than `METRICS_RETENTION_DAYS = 7` are deleted.
- `alert_events`: closed rows older than the alert retention are deleted. Open episodes are never pruned.
- The alert retention is read with `ACTIVE_CONFIG.get("alert_retention_days", 30)`. Phase 7 adds that key to the settings, and this code needs no change then.

---

## 8. Files Touched

| File | Change |
|---|---|
| `mcp-server/database/models.py` | Add the two `CREATE TABLE` statements and the index |
| `mcp-server/database/db.py` | Create the tables in `init_db()`. Add the write functions of §3.2, §4.3, §6.2 and §7 |
| `mcp-server/utils/timefmt.py` | **New.** Timestamp helpers |
| `mcp-server/handlers/history_recorder.py` | **New.** `MinuteAggregator`, `EpisodeTracker` |
| `mcp-server/handlers/process_watch.py` | **New.** Timed scan, Tier 4 episodes, top-process lookup |
| `mcp-server/ws_server.py` | Record every cycle in `metrics_broadcaster()`. Start the watch, recovery and pruning from `lifespan` |

No endpoint, WebSocket message or frontend file changes in this phase.

---

## 9. Tests

New file `mcp-server/tests/test_history_recorder.py`, plus additions to `test_db.py`. All use the isolated database from `tests/conftest.py`.

| Test | Proves |
|---|---|
| Thirty samples in one minute, then one in the next | One row returned, with the right average, peak and `samples = 30` |
| Two partial rows written for the same minute | The stored row is their weighted average, with the larger peak and summed samples |
| A value over the threshold for 40 samples | Exactly one episode row |
| A value that dips below for 10 seconds and returns | Still one episode |
| A value below for 30 seconds | Episode ends, and `ended_at` is the time it first dropped |
| Peak reaches 95 during a `warning` episode | Stored `level` becomes `critical` |
| A 5-minute jump in `now` during an open episode | Episode closed at the previous sample's time |
| An open row at start-up | Closed by recovery, at the last recorded minute |
| Rows older than the limits, plus one open episode | Old rows deleted, open episode kept |
| A database created with the V2.0.1 schema | `init_db()` adds both tables and keeps existing `audit_log` rows |
| A Tier 4 process seen in two scans, then missing in two | One `process` episode, ended after the second miss |
| A failing database write inside the loop | The loop keeps sampling and broadcasting |

---

## 10. Definition of Done (Success Criteria)

Phase 1 is complete when all of these hold:

1. **Metrics are recorded.** After the backend has run for 10 minutes, `metrics_history` holds about 10 rows with about 30 samples each.
2. **Recording does not need a window.** With the desktop app closed, rows keep arriving.
3. **One alert, one row.** Holding CPU over its threshold for a minute produces exactly one `alert_events` row, which gains an `ended_at` about 30 seconds after CPU drops.
4. **No alert is lost while the app is closed.** A breach with no window connected is still recorded.
5. **The top process is named.** A CPU alert caused by a known busy script records that script as `top_process`.
6. **Crash safety.** Killing the backend during an alert and restarting it leaves no row with a NULL `ended_at`.
7. **No double writes.** With a second instance running for Claude Desktop, each minute still has exactly one row.
8. **Upgrade is clean.** A V2.0.1 database opens without error and keeps its audit history.
9. **Nothing regressed.** The existing 62 tests pass, and the gauges still update every 2 seconds.

Once these pass, the data layer is in place and we are ready for **Phase 2: Alert History Page**.
