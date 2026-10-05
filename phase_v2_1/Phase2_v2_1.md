# Phase 2: Alert History Page

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 2
Phase 1 stores every alert. Phase 2 lets the user see them. The objective is a new **Alerts** page that lists every alert episode, can be filtered by date, type and severity, and updates while it is open.

By the end of this phase a user who was away from the machine can open Kavan and answer "what happened while I was gone?" without having seen a single toast.

### 1.2 Where This Phase Sits
| | |
|---|---|
| Plan reference | `PLAN_V2_1.md` §3 (Step 2) |
| Depends on | Phase 1 (`alert_events` table and the episode tracker) |
| Unblocks | Phase 3 (alert markers on the graphs), Phase 7 (one sound per episode) |
| Layer | Backend API and WebSocket, then the desktop UI |

### 1.3 What Exists Today
- **Backend.** `alert_events` is written by Phase 1 but nothing reads it. The `threshold_alert` WebSocket message carries `level`, `message` and `timestamp` and no identifier.
- **Frontend.** `useWebSocketConnection.ts` turns a `threshold_alert` into a toast, a native notification for critical alerts, and a beep. Nothing is kept.
- **Navigation.** The sidebar has two entries, Dashboard and Settings, defined by `NAV_ITEMS` in `Sidebar.tsx` and the `View` type in `components/layout/views.ts`. The "Alerts" entry that did nothing was removed in V2.0.1. This phase brings it back, working.
- **Reusable pieces.** `ProcessTable.tsx` contains a virtualized table, a segmented filter and an `EmptyState` component, all private to that file.

---

## 2. Backend: Reading Alerts

### 2.1 Query Function
`db.py` gains:

```python
async def get_alert_events(start: str, end: str, metric: str | None,
                           level: str | None, limit: int) -> list[dict]
```

- All filtering is in the SQL `WHERE` clause with bound parameters. Nothing is filtered in Python after fetching. This is the lesson from the audit-log bug fixed in V2.0.1, where rows were capped first and filtered second.
- Order: open episodes first, then newest first.

```sql
SELECT * FROM alert_events
WHERE started_at >= ? AND started_at < ?
  AND (? IS NULL OR metric = ?)
  AND (? IS NULL OR level = ?)
ORDER BY (ended_at IS NULL) DESC, started_at DESC
LIMIT ?;
```

- The function is asked for `limit + 1` rows, so the endpoint can tell whether more exist.

### 2.2 Endpoint
`GET /api/alerts`

| Parameter | Type | Default | Rule |
|---|---|---|---|
| `from` | ISO 8601 timestamp | 24 hours ago | |
| `to` | ISO 8601 timestamp | now | Must be later than `from` |
| `metric` | `cpu`, `ram`, `disk`, `process` | all | |
| `level` | `warning`, `critical` | all | |
| `limit` | integer | 500 | 1 to 1000 |

Parameters are declared with FastAPI types (`Literal[...]`, `Query(ge=1, le=1000)`), so a bad value is rejected before any code runs. The existing `validation_exception_handler` already turns that into a 400.

Response:

```json
{
  "alerts": [
    {
      "id": "0b9c2c7e-5a43-4d0f-9d5e-2f1a6f0d7c11",
      "metric": "cpu",
      "level": "critical",
      "threshold": 90,
      "started_at": "2026-10-05T08:30:12Z",
      "ended_at": "2026-10-05T08:34:40Z",
      "duration_seconds": 268,
      "peak_value": 97.4,
      "readings": { "cpu": 93.1, "ram": 71.0, "disk": 47.2 },
      "top_process": { "name": "chrome.exe", "pid": 2303, "value": 64.2 },
      "muted": false
    }
  ],
  "truncated": false
}
```

- `ended_at` and `duration_seconds` are `null` for an episode still in progress.
- `top_process` is `null` when none was recorded (disk alerts, or a scan that failed).
- `truncated` is `true` when more rows matched than `limit`. The UI says so instead of silently showing a partial list.
- Timestamps go out as ISO 8601 UTC through `to_iso_utc()` from `utils/timefmt.py`.

### 2.3 Where the Route Lives
`ws_server.py` is already about 290 lines and V2.1 adds five endpoints. New routes go in a router module and are attached to the same app:

- **New** `mcp-server/routes/history.py` with an `APIRouter`, holding `/api/alerts` now and `/api/metrics/history` in Phase 3.
- `ws_server.py` calls `app.include_router(history.router)`.

Middleware is applied to the app, not to a route, so every route on the router is covered by `LocalOnlyMiddleware` and CORS exactly as the existing ones are.

---

## 3. Backend: Live Updates

The page must not poll. Two changes to the WebSocket stream make that possible.

### 3.1 `threshold_alert` Gains Two Fields
```json
{
  "type": "threshold_alert",
  "level": "critical",
  "message": "CPU exceeded 90% threshold. Current: 96.3%.",
  "timestamp": 1791189012,
  "metric": "cpu",
  "episode_id": "0b9c2c7e-5a43-4d0f-9d5e-2f1a6f0d7c11"
}
```

Existing fields are unchanged, so the toast code keeps working untouched. `episode_id` lets a client tell the first alert of an episode from its repeats. Phase 7 uses that to play one sound per episode.

For a `process` episode the message reads, for example: `Suspicious process: updater_svc.exe (PID 6390) is using 27% CPU with no window.` It is sent once, when the episode starts.

### 3.2 New Message: `alert_event`
Sent whenever a stored row changes, carrying the row in the same shape as the API:

```json
{
  "type": "alert_event",
  "event": "started",
  "alert": { "id": "...", "metric": "cpu", "level": "warning", "ended_at": null, "...": "..." }
}
```

| `event` | Sent when |
|---|---|
| `started` | A row is inserted |
| `updated` | The peak or level changed (at most once a minute), or the top process was filled in |
| `ended` | `ended_at` was set |

The episode tracker from Phase 1 already produces these changes. This phase broadcasts them after each one is written.

---

## 4. Frontend: Data Layer

### 4.1 API Client
`desktop/src/services/api.ts` gains the types and one call:

```ts
export interface AlertEvent {
  id: string;
  metric: 'cpu' | 'ram' | 'disk' | 'process';
  level: 'warning' | 'critical';
  threshold: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  peak_value: number;
  readings: { cpu: number; ram: number; disk: number };
  top_process: { name: string; pid: number; value: number } | null;
  muted: boolean;
}

fetchAlerts: (filters: AlertFilters) => apiClient.get('/api/alerts', { params: ... })
```

### 4.2 `AlertHistoryContext`
The WebSocket is opened once, globally, in `App.tsx`. The Alerts page mounts and unmounts as the user moves between pages. Live events therefore need a home that outlives the page.

**New** `desktop/src/context/AlertHistoryContext.tsx`, added to the provider stack in `main.tsx`:

| Member | Purpose |
|---|---|
| `alerts` | The current list |
| `filters`, `setFilters` | Date range, type, severity |
| `isLoading`, `error` | Request state |
| `reload()` | Fetches with the current filters |
| `applyEvent(alert)` | Inserts or replaces a row by `id` |
| `ongoingCount` | Number of open episodes, for the sidebar marker |

- `useWebSocketConnection.ts` calls `applyEvent()` for each `alert_event` message.
- `applyEvent()` only inserts a new row if it matches the current filters and falls inside the current date range. A row already in the list is always updated, so an ongoing alert visibly ends.
- Changing a filter triggers one `reload()`. There is no client-side filtering of a stale list.

### 4.3 Time Helpers
**New** `desktop/src/utils/time.ts`:

| Function | Example output |
|---|---|
| `formatDuration(seconds)` | `4m 28s`, `1h 12m`, `8s` |
| `formatWhen(iso)` | `08:30:12` today, `Yesterday 22:14`, `2 Oct 22:14` older |
| `formatExact(iso)` | Full local date and time, for tooltips |

---

## 5. Frontend: The Page

### 5.1 Navigation
- `views.ts`: `View` becomes `'dashboard' | 'alerts' | 'settings'`, and `VIEW_META` gains the title "Alert History" with the description "Every alert Kavan has raised, including while the window was closed."
- `Sidebar.tsx`: add `{ view: 'alerts', label: 'Alerts', icon: Bell }` between Dashboard and Settings.
- A small crimson dot appears on the Alerts entry while `ongoingCount > 0`. In the collapsed sidebar it sits on the icon.
- `App.tsx` currently chooses between two pages with a ternary. It becomes a lookup from `View` to page component, which Phases 3 and 5 extend.

### 5.2 Shared Components
Two pieces move out of `ProcessTable.tsx` so the new page does not copy them. Behaviour and appearance stay identical, and `ProcessTable.tsx` is updated to import them.

| New file | Extracted from |
|---|---|
| `components/common/EmptyState.tsx` | The `EmptyState` function |
| `components/common/SegmentedControl.tsx` | The tier filter's `radiogroup` |

### 5.3 Layout
```
Alert History                                   Last updated 10:14:07   [Backend Active]
Every alert Kavan has raised...

┌──────────────────────────────────────────────────────────────────────────────────┐
│ Alerts  42      [24 hours | 7 days | 30 days | Custom]  [All|CPU|Memory|Disk|Process]  [All|Warning|Critical] │
├──────────────────────────────────────────────────────────────────────────────────┤
│ STARTED         TYPE     SEVERITY    PEAK / LIMIT    DURATION    TOP PROCESS     │
│ 08:30:12        CPU      ● CRITICAL  97.4% / 90%     Ongoing     chrome.exe      │
│ 07:02:44        Memory   ● WARNING   91.2% / 90%     4m 28s      Code.exe        │
│ Yesterday 22:14 Process  ● WARNING   38.6% / 25%     12m 03s     xmrig_helper.exe│
└──────────────────────────────────────────────────────────────────────────────────┘
```

New files: `pages/Alerts.tsx`, `components/alerts/AlertTable.tsx`, `components/alerts/AlertFilters.tsx`, `components/alerts/AlertDetail.tsx`, `components/alerts/LevelBadge.tsx`.

### 5.4 The Table
- Built like `ProcessTable.tsx`: a `.panel`, a header row and a body virtualized with `@tanstack/react-virtual`, sharing one grid template through a new `.alert-grid` class in `styles/index.css`.
- The API already sorts ongoing alerts first, then newest first. The table does not re-sort.

| Column | Content |
|---|---|
| Started | `formatWhen()`, with the exact time as a tooltip |
| Type | CPU, Memory, Disk or Process |
| Severity | `LevelBadge`: crimson for critical, amber for warning, in the style of `TierBadge` |
| Peak / Limit | `97.4% / 90%` in tabular figures |
| Duration | `formatDuration()`, or **Ongoing** in crimson with the live status dot |
| Top process | Name, or a dash when none was recorded |

- A muted alert (Phase 6) shows a small "Muted" tag beside its type. Phase 2 renders the tag. Nothing sets it until Phase 6.
- An ongoing row's duration ticks once a second on the client, from `started_at`.

### 5.5 Filters
- **Date range.** A segmented control with 24 hours, 7 days, 30 days and Custom. Custom reveals two `datetime-local` inputs. Presets are relative to now and are recomputed on every reload.
- **Type** and **Severity.** Segmented controls, each starting with "All".
- Any change reloads from the server. The count beside the title shows how many rows came back.

### 5.6 Detail
Selecting a row opens a detail panel beneath it. It shows what the brief asked for and the table has no room for:

- Exact start and end times.
- The three readings at the moment the alert started, CPU, memory and disk, so the user sees the whole machine and not just the metric that tripped.
- The top process with its PID and its own reading, labelled **Top process at the time**.
- For a process alert, the text "No visible window" to explain why it was flagged.

Only one row is expanded at a time. Escape closes it.

### 5.7 States
| State | What the user sees |
|---|---|
| First load | Spinner with "Loading alert history..." |
| Request failed | The `EmptyState` with the reason and a Retry button |
| Backend reconnects after a failed load | Reloads automatically, the way the Dashboard reloads its process list |
| No alerts in range | "No alerts in this period." |
| `truncated` is true | A notice above the table: "Showing the newest 500 alerts. Narrow the date range to see older ones." |

---

## 6. Files Touched

| File | Change |
|---|---|
| `mcp-server/database/db.py` | Add `get_alert_events()` |
| `mcp-server/routes/history.py` | **New.** `/api/alerts` |
| `mcp-server/ws_server.py` | Include the router. Add `metric` and `episode_id` to `threshold_alert`. Broadcast `alert_event` |
| `desktop/src/services/api.ts` | `AlertEvent`, `AlertFilters`, `fetchAlerts` |
| `desktop/src/context/AlertHistoryContext.tsx` | **New** |
| `desktop/src/main.tsx` | Add the provider |
| `desktop/src/hooks/useWebSocketConnection.ts` | Handle `alert_event` |
| `desktop/src/utils/time.ts` | **New** |
| `desktop/src/components/common/EmptyState.tsx`, `SegmentedControl.tsx` | **New**, extracted |
| `desktop/src/components/dashboard/ProcessTable.tsx` | Import the extracted components |
| `desktop/src/components/alerts/*` | **New.** Table, filters, detail, level badge |
| `desktop/src/pages/Alerts.tsx` | **New** |
| `desktop/src/components/layout/views.ts`, `Sidebar.tsx`, `desktop/src/App.tsx` | New view and navigation entry |
| `desktop/src/styles/index.css` | `.alert-grid` |

---

## 7. Tests

### 7.1 Automated (backend)
New file `mcp-server/tests/test_alerts_api.py`, using the test client with `base_url="http://127.0.0.1:8000"` as the existing API tests do.

| Test | Proves |
|---|---|
| Rows inside and outside the window | Only rows inside are returned |
| No parameters | The window defaults to the last 24 hours |
| `metric=cpu`, `level=critical`, and both together | Each filter narrows, and they combine |
| 600 rows with `limit=500` | 500 returned and `truncated` is true |
| One open episode among closed ones | The open one is first, whatever its start time |
| `metric=gpu`, `limit=0`, `to` earlier than `from` | Each is a 400, not a 500 |
| A request with a foreign `Origin` | 403, as for every other route |
| An episode starting, peaking and ending | Three `alert_event` messages in order, each with the full row |
| A `threshold_alert` during an episode | It carries that episode's `episode_id` |

### 7.2 Manual (desktop)
1. Open the Alerts page, then push CPU over its threshold. *Expected:* a row appears marked Ongoing, with no refresh.
2. Let CPU fall. *Expected:* about 30 seconds later the same row shows a duration and stops being Ongoing.
3. Quit the desktop app, cause an alert, reopen. *Expected:* the alert is listed.
4. Apply each filter alone and combined. *Expected:* the list and the count change to match.
5. Stop the backend and open the page. *Expected:* the error state. Restart the backend. *Expected:* the list loads by itself.
6. Check both themes and a narrow window. *Expected:* no clipped columns.

---

## 8. Definition of Done (Success Criteria)

Phase 2 is complete when all of these hold:

1. **The page exists.** "Alerts" is in the sidebar and opens the Alert History page.
2. **History survives.** Alerts raised before a restart of the app or the backend are still listed.
3. **Live.** An alert that starts or ends while the page is open updates without a refresh and without polling.
4. **Filtering is correct.** Date, type and severity each narrow the list, in any combination, and the filtering is done by the server.
5. **Each row answers the brief.** What fired, exactly when, the CPU, memory and disk readings at that moment, and the top process.
6. **Nothing is hidden silently.** A truncated result says so.
7. **Honest states.** Loading, empty, failed and reconnected states each look as described in §5.7.
8. **Protected like every other route.** A request from a foreign web origin is refused.
9. **No regressions.** Toasts, the native notification and the sound behave as before, and the existing tests pass.

Once these pass, the alert data is proven correct and visible, and we are ready for **Phase 3: Performance Graphs**.
