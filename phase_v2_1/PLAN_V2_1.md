# KavanMCP V2.1 Plan: History, Trends and Undo

## 1. Objective & Overview

### 1.1 The Goal of V2.1
V2 shows what the machine is doing right now. V2.1 adds memory: Kavan records what happened, so you can look back, spot patterns and undo mistakes.

Four features ship in V2.1:

1. **Alert History**: every alert that fired, kept and searchable, instead of a toast that disappears after five seconds.
2. **24-Hour Performance Graphs**: CPU, memory and disk trends over time, so a daily spike becomes visible.
3. **Rollback Manager**: a "Recently Killed" list with a one-click restart for each entry.
4. **Full Settings**: app whitelist, start with Windows, history retention and sound options.

### 1.2 What V2.1 Does Not Change
- The 4-tier security engine and the confirm-then-execute kill flow stay as they are. The one exception is the whitelist, covered in §6.1.
- The existing seven MCP tools keep their names and behaviour.
- The dashboard, gauges and process table stay as redesigned in V2.0.1.

### 1.3 Corrections to the Original Brief
The brief for V2.1 assumed four things that are not true in the code today. Each one adds work, and the build order in §8 accounts for it.

| The brief assumed | What the code does today | Consequence |
|---|---|---|
| Alert data is already in the database | Alerts are never stored. `build_alerts()` in `mcp-server/ws_server.py` only sends them over the WebSocket. The database holds kills, blocks and rollbacks. | Step 1 must store alerts as well as metrics. |
| An alert names the process that caused it, and alert types include "memory leak" and "suspicious process" | Only three alerts exist: CPU, memory or disk over its threshold. They are system-wide and name no process. | Step 1 captures the top process when an alert starts. New alert types are an open decision (§9.3). |
| The Rollback Manager is only a UI layer | There is no REST endpoint to list kills or to roll one back. A kill record does not store its tier. Rollback finds its target by name, not by a specific kill. | Step 4 needs backend work before the UI. |
| Graphs need recharts to be added | `recharts` is already in `desktop/package.json`. It has been unused since the V2.0.1 redesign replaced the gauge charts. | Nothing to install. |

---

## 2. Step 1: Backend Data Layer

Alert History and the graphs both read from data that does not exist yet. This step creates it and has no UI.

### 2.1 Metrics History
`metrics_broadcaster()` in `ws_server.py` already samples CPU, memory and disk every 2 seconds. Storing every sample would write 43,200 rows a day, so samples are averaged in memory and written once a minute.

New table, defined in `mcp-server/database/models.py` and created in `init_db()`:

```sql
CREATE TABLE IF NOT EXISTS metrics_history (
    minute      DATETIME PRIMARY KEY,  -- UTC, truncated to the minute
    cpu_avg     REAL NOT NULL,
    cpu_max     REAL NOT NULL,
    ram_avg     REAL NOT NULL,
    ram_max     REAL NOT NULL,
    disk_avg    REAL NOT NULL,
    samples     INTEGER NOT NULL       -- how many 2 s samples the row covers
);
```

- The peak (`*_max`) is stored beside the average because a one-minute average hides a ten-second spike, and spikes are what the graphs are for.
- 1,440 rows a day. At 7 days that is about 10,000 rows, which SQLite reads in milliseconds.
- A row with few `samples` means the backend was not running for the whole minute. The graph draws a gap for missing minutes instead of joining the line across them.

### 2.2 Alert Events
While a metric stays over its threshold, the same alert is re-sent every 3 seconds (`ALERT_COOLDOWN`). Storing each one would fill the history with duplicates. V2.1 stores one row per **episode**: from the moment a metric crosses its threshold to the moment it drops back.

```sql
CREATE TABLE IF NOT EXISTS alert_events (
    id              TEXT PRIMARY KEY,
    metric          TEXT NOT NULL,      -- 'cpu', 'ram', 'disk'
    level           TEXT NOT NULL,      -- 'warning', 'critical' (highest reached)
    threshold       REAL NOT NULL,      -- the user's threshold when it started
    started_at      DATETIME NOT NULL,
    ended_at        DATETIME,           -- NULL while the episode is still open
    peak_value      REAL NOT NULL,
    cpu_at_start    REAL NOT NULL,      -- all three readings at that moment
    ram_at_start    REAL NOT NULL,
    disk_at_start   REAL NOT NULL,
    top_process     TEXT,               -- name of the largest consumer of that metric
    top_process_pid INTEGER,
    top_process_value REAL
);
```

- **Which process caused it.** When an episode starts, the backend takes one process scan with the existing `get_all_processes()` in `integrations/monitor.py` and records the largest CPU consumer (for a CPU alert) or memory consumer (for a memory alert). The scan takes about 1.5 seconds, so it runs in a worker thread with `asyncio.to_thread`, as the dashboard scan already does. Disk alerts record no process.
- This is the top consumer at that moment, which is strong evidence but not proof of cause. The UI labels it "Top process", not "Caused by".
- An episode left open by a crash is closed at the next start-up with `ended_at` set to the last recorded minute.

### 2.3 Where the Writing Happens
- Only the server instance that owns port 8000 runs the broadcaster (see `port_in_use()` in `ws_server.py`). Recording lives in the broadcaster, so a second instance started by Claude Desktop never double-writes.
- Metrics are recorded even when no window is connected. The broadcaster already samples every cycle regardless of clients.
- New database functions go in `mcp-server/database/db.py` and use the existing `_connect()` helper, which sets the busy timeout that stopped audit rows being lost in V2.0.1.

### 2.4 Retention
A prune runs once at start-up and then once an hour:
- `metrics_history`: keep 7 days.
- `alert_events`: keep the number of days chosen in Settings (§6.3).

### 2.5 Definition of Done
- After the backend runs for 10 minutes, `metrics_history` has about 10 rows.
- Holding CPU over the threshold for 30 seconds produces exactly one `alert_events` row, closed with an `ended_at` after CPU drops.
- A database from V2.0.1 opens without error and gains the new tables.
- Tests cover: minute aggregation, one row per episode, crash recovery of an open episode, pruning.

---

## 3. Step 2: Alert History Panel

### 3.1 API
`GET /api/alerts`

| Query parameter | Meaning | Default |
|---|---|---|
| `from`, `to` | ISO timestamps bounding `started_at` | last 24 hours |
| `metric` | `cpu`, `ram` or `disk` | all |
| `level` | `warning` or `critical` | all |
| `limit` | maximum rows | 500 |

Returns rows newest first. Filtering happens in SQL, not after fetching, which is the bug fixed for the audit log in V2.0.1.

### 3.2 UI
- A new **Alerts** page. The sidebar entry that was removed in V2.0.1 (it did nothing) returns, now working. Add `'alerts'` to `View` and `VIEW_META` in `desktop/src/components/layout/views.ts` and to `NAV_ITEMS` in `Sidebar.tsx`.
- A table with columns: time, type, severity, peak value against threshold, duration, top process.
- Filters above the table: a date range, type and severity. They follow the tier filter in `ProcessTable.tsx`.
- Selecting a row shows the three readings at the moment the alert started.
- An alert still in progress is marked "Ongoing" and sorted first.
- Empty state: "No alerts in this period."

### 3.3 Live Updates
The page loads once and then adds rows as they happen. The existing `threshold_alert` WebSocket message gains the episode `id`, so the page can add or update a row without re-fetching the list.

### 3.4 Definition of Done
- An alert that fires while the page is open appears without a refresh.
- Each filter narrows the list, and combining filters works.
- Alerts from before an app restart are still listed.

---

## 4. Step 3: Performance Graphs

### 4.1 API
`GET /api/metrics/history?range=24h`

| `range` | Bucket size | Points returned |
|---|---|---|
| `1h` | 1 minute | 60 |
| `6h` | 5 minutes | 72 |
| `24h` | 15 minutes | 96 |
| `7d` | 2 hours | 84 |

Bucketing is done in SQL. Each point carries the average and the peak for its bucket. Around 100 points keeps the chart fast and readable. Zooming in requests a smaller range at a finer bucket, so detail is never lost.

### 4.2 UI
- A **Trends** section using `recharts`: one line chart each for CPU, memory and disk, sharing one time axis.
- The solid line is the average. A faint band above it shows the peak.
- The user's alert threshold is drawn as a horizontal crimson line, matching the red zone on the gauges.
- Alert episodes from Step 2 are marked on the chart. Clicking a marker opens that alert.
- Zoom by dragging a range. Pan by dragging the axis. A reset button returns to 24 hours.
- A gap in the line where the backend was not running.
- Chart colours come from the existing tokens in `desktop/src/styles/index.css`, so both themes work without extra styling.

### 4.3 Placement
A new **Trends** page beside Dashboard and Alerts. The dashboard is already full at the default window size, and the charts need the width.

### 4.4 Definition of Done
- After a day of running, the 24h chart shows a full day with no invented data across gaps.
- Zooming into a spike shows one-minute detail.
- A CPU alert appears as a marker at the right time on the CPU chart.
- The page renders in under a second with 7 days of data.

---

## 5. Step 4: Rollback Manager

### 5.1 Backend Changes
Kills are already logged by `log_termination()` in `database/db.py`, with the executable path and original arguments. Three things are missing.

1. **Tier.** Add `tier INTEGER` to `audit_log` through the existing `AUDIT_LOG_MIGRATIONS` mechanism in `database/models.py`, and pass it from `execute_approved_termination()`. Kills recorded before V2.1 show the tier as unknown.
2. **Rolled-back marker.** Add `rolled_back_at DATETIME` to `audit_log`. Without it the UI cannot tell which kills were already restored.
3. **Rollback by record.** `rollback_process()` in `handlers/termination_handler.py` looks up the latest kill by name or PID. Add a path that takes a specific audit row `id`, so clicking one row restores exactly that kill. The existing `_relaunch_argv()` is reused unchanged: it always launches the audited executable and takes only the arguments from the stored command line.

### 5.2 API
- `GET /api/kills?hours=24` returns terminated processes, newest first, each with `id`, `name`, `pid`, `tier`, `memory_freed_mb`, `timestamp`, `can_restore` and `rolled_back_at`.
- `POST /api/rollback` with `{ "id": "<audit row id>" }`.

`can_restore` is false when the executable path is missing from the record or no longer exists on disk. The UI disables the button and says why.

### 5.3 UI
- A **Recently Killed** page listing the last 24 hours: name, when, memory it was using, tier badge (the existing `TierBadge` component), and a **Restore** button.
- After a restore, the row shows "Restored at 14:02" and the button is disabled.
- Failures are shown in the row: "Executable not found" or "Could not relaunch".
- Restoring does not need the two-step confirmation that killing does. It only starts a program the user was already running.

### 5.4 Limits to State in the UI
A restore relaunches the program. It does not bring back unsaved work or the window's previous state. The page says so in one line.

### 5.5 Definition of Done
- Killing a process from the dashboard makes it appear in the list.
- Restore relaunches it with its original arguments, and the row updates.
- Restoring twice is not possible.
- A kill whose executable was deleted shows a disabled button with the reason.

---

## 6. Step 5: Full Settings

All new keys are validated in `mcp-server/config/settings_manager.py` (`_valid_entries`), which rejects bad values instead of saving them.

### 6.1 App Whitelist
Two separate lists, because they mean different things:
- **Never alert on**: alerts whose top process is on this list are still recorded but raise no toast or sound.
- **Never kill**: Kavan refuses to terminate these, from the UI and from Claude alike.

"Never kill" changes the security engine, so it is enforced in the backend at the same layer as the Tier 1 block in `_terminate_blocking()`, not in the UI. The whitelist can only add protection. It can never remove a process from Tier 1.

Entries are chosen from the running process list, so names match exactly.

### 6.2 Start with Windows
A toggle using the official `tauri-plugin-autostart`. See §9.2 before building this: starting the window does not start the Python backend.

### 6.3 Alert Retention
A choice of 7, 14 or 30 days, read by the prune in §2.4.

### 6.4 Sound
- A volume slider. `playBeep()` in `desktop/src/hooks/useWebSocketConnection.ts` already sets a gain value, so this is a small change.
- A choice of three or four built-in sounds, generated in code like the current beep. No audio files are bundled.
- A "Test" button beside the choice.

### 6.5 Definition of Done
- Every setting survives an app restart.
- A whitelisted "never kill" app is refused from the dashboard and from Claude, with a clear message.
- Changing retention to 7 days removes older alerts at the next prune.

---

## 7. Cross-Cutting Requirements

- **Security.** Every new endpoint is covered by the existing `LocalOnlyMiddleware` in `ws_server.py`. No endpoint is added outside it.
- **Blocking work.** Database reads for history and any process scan run off the event loop, as the V2.0.1 fixes established.
- **Tests.** Each step adds tests under `mcp-server/tests/`. The suite uses the isolated database from `tests/conftest.py` and must never write to the real one.
- **MCP tools.** Optional for V2.1: `view_alert_history` and `view_metrics_trend`, so Claude can answer "what happened at 2pm?". They read the same tables as the UI.
- **Version.** The app is released as 2.1.0. The version fields in `desktop/package.json`, `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml` and `mcp-server/server.py` are updated together.
- **Docs.** New endpoints are added to the API document in `docs/`.

---

## 8. Build Order

| Order | Step | Depends on | Why this position |
|---|---|---|---|
| 1 | Backend data layer (§2) | nothing | Alerts and graphs both read it. Starting it first also means real history has accumulated by the time the UI is built. |
| 2 | Alert History (§3) | Step 1 | Simplest UI, and it proves the alert data is right. |
| 3 | Performance Graphs (§4) | Steps 1 and 2 | Needs metrics history, and draws alert markers from Step 2. |
| 4 | Rollback Manager (§5) | nothing | Independent of the others. Can be built in parallel with 2 and 3. |
| 5 | Full Settings (§6) | Steps 1 and 4 | Retention needs the tables. The whitelist touches the kill path. |

Each step is merged on its own after its Definition of Done is met.

---

## 9. Open Decisions

These need an answer before the step that depends on them. Each has a recommended default.

### 9.1 Whitelist and Safety (before Step 5)
Should "never kill" also bind Claude, or only the dashboard?
**Recommended:** it binds both. A protection that an AI request can bypass is not a protection.

### 9.2 Start with Windows (before Step 5)
The Tauri window and the Python backend are separate programs. Starting only the window at boot opens the app in the "Offline" state.
**Recommended:** decide first whether the desktop app should start the backend itself. If yes, that is its own piece of work and should be planned before the toggle. If no, the toggle should be left out of V2.1.

### 9.3 Alert Types (before Step 1)
"Memory leak" and "suspicious process" do not exist as alerts today.
**Recommended:** V2.1 ships the three existing types and adds one new type, "suspicious process", raised when a Tier 4 process is seen. Tier 4 detection already exists. Memory-leak detection needs per-process history over time and is deferred to a later version.

### 9.4 History Window (before Step 1)
**Recommended:** keep one-minute metrics for 7 days and alerts for the 7, 14 or 30 days chosen in Settings. Seven days of metrics is enough to see a daily pattern repeat and keeps the database small.

### 9.5 Navigation (before Step 2)
V2.1 adds three pages: Alerts, Trends and Recently Killed. With Dashboard and Settings that makes five sidebar entries.
**Recommended:** five separate entries. The sidebar has room, and each page answers a different question.
