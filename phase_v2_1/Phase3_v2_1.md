# Phase 3: Performance Graphs

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 3
The gauges show the last two seconds. Phase 3 shows the last day. The objective is a **Trends** page with line charts of CPU, memory and disk over time, on which the user can zoom into a spike and see which alert it belongs to.

This is the feature that turns a vague feeling ("my laptop is slow in the afternoons") into something visible ("CPU hits 95% every day at 14:00"). Real-time gauges cannot show that, however good they are.

### 1.2 Where This Phase Sits
| | |
|---|---|
| Plan reference | `PLAN_V2_1.md` §4 (Step 3) |
| Depends on | Phase 1 (`metrics_history`), Phase 2 (`/api/alerts`, for the markers) |
| Unblocks | Nothing. It is the last of the history features |
| Layer | One backend endpoint, then the desktop UI |

### 1.3 What Exists Today
- **Data.** Phase 1 writes one row per minute to `metrics_history`, with averages, peaks and a sample count. Nothing reads it yet.
- **Charts.** `recharts` is already a dependency in `desktop/package.json`. It has been unused since V2.0.1 replaced the gauge charts with plain SVG, so today it is not in the app bundle at all.
- **Colour.** Every colour in the app is a CSS variable in `styles/index.css` (`--ink`, `--crimson`, `--line` and so on), with a dark and a light value. The gauges already draw their SVG strokes from these variables.

### 1.4 Decisions This Phase Assumes
| Decision | Assumed answer |
|---|---|
| `PLAN_V2_1.md` §9.4 History window | 7 days of one-minute data are available |
| `PLAN_V2_1.md` §9.5 Navigation | Trends is its own page, not a section of the Dashboard |

---

## 2. Backend: Reading History

### 2.1 Bucketing
A day is 1,440 one-minute rows. Drawing all of them makes a slow, noisy chart, so the server merges minutes into larger buckets and returns roughly 60 to 100 points whatever the range.

| Span requested | Bucket | Points |
|---|---|---|
| up to 2 hours | 1 minute | up to 120 |
| up to 12 hours | 5 minutes | up to 144 |
| up to 48 hours | 15 minutes | up to 192 |
| longer | 2 hours | 84 for 7 days |

The four preset ranges land on 60, 72, 96 and 84 points.

### 2.2 Query Function
`db.py` gains `get_metrics_history(start, end, bucket_seconds)`:

```sql
SELECT
    CAST(strftime('%s', minute) AS INTEGER) / :bucket * :bucket AS bucket_start,
    SUM(cpu_avg  * samples) / SUM(samples) AS cpu_avg,
    MAX(cpu_max)                           AS cpu_max,
    SUM(ram_avg  * samples) / SUM(samples) AS ram_avg,
    MAX(ram_max)                           AS ram_max,
    SUM(disk_avg * samples) / SUM(samples) AS disk_avg,
    SUM(samples)                           AS samples
FROM metrics_history
WHERE minute >= :start AND minute < :end
GROUP BY bucket_start
ORDER BY bucket_start;
```

- **The average is weighted by `samples`.** A minute with 5 samples must not count as much as a minute with 30. This is why Phase 1 stores the count.
- **The peak is the maximum of the peaks.** Averaging peaks would hide exactly the spikes the chart is for.
- **A bucket with no rows is simply absent.** The server never invents a value for a period it has no data for.

### 2.3 Endpoint
`GET /api/metrics/history`, added to `mcp-server/routes/history.py` beside `/api/alerts`.

| Parameter | Type | Default | Rule |
|---|---|---|---|
| `range` | `1h`, `6h`, `24h`, `7d` | `24h` | Ignored when `from` and `to` are given |
| `from`, `to` | ISO 8601 timestamps | none | Both or neither. `to` later than `from`. Span at least 10 minutes and at most 7 days |

Response:

```json
{
  "from": "2026-10-04T10:15:00Z",
  "to": "2026-10-05T10:15:00Z",
  "bucket_seconds": 900,
  "recording_since": "2026-10-04T17:23:00Z",
  "thresholds": { "cpu": 90, "ram": 90, "disk": 95 },
  "points": [
    { "t": "2026-10-04T17:15:00Z", "cpu_avg": 31.2, "cpu_max": 88.0,
      "ram_avg": 61.0, "ram_max": 64.2, "disk_avg": 47.2, "coverage": 0.53 }
  ]
}
```

| Field | Meaning |
|---|---|
| `bucket_seconds` | The bucket the server chose. The client needs it to place gaps |
| `recording_since` | The oldest minute in the table, or `null` if it is empty. Lets the UI explain a mostly empty chart on the first day |
| `thresholds` | The current alert thresholds, so the chart needs no second request to draw its limit lines |
| `coverage` | `samples` divided by the number of samples a full bucket would hold. 1.0 means the backend ran for the whole bucket |

---

## 3. Frontend: Data Layer

### 3.1 API Client
`services/api.ts` gains `MetricsHistory`, `MetricsPoint` and `fetchMetricsHistory(range | { from, to })`.

### 3.2 Filling Gaps
The server omits empty buckets. If the client plotted the points as they arrive, the line would run straight from 23:00 to 07:00 as though the machine had been measured all night. **New** `desktop/src/utils/series.ts`:

```ts
export function fillGaps(history: MetricsHistory): ChartPoint[]
```

It walks from `from` to `to` in steps of `bucket_seconds` and emits a point for every step, with `null` values where the server sent nothing. The charts are told not to connect across nulls, so a missing period is drawn as a break in the line. This is a pure function and is unit tested in Phase 8.

### 3.3 Keeping the Page Out of the Start-Up Bundle
`recharts` is large. The Trends page is loaded with `React.lazy()` and a `Suspense` fallback, so the library is fetched only when the page is first opened. The Dashboard's start-up cost stays what it is today.

---

## 4. Frontend: The Page

### 4.1 Navigation
- `views.ts`: add `'trends'`, titled "Performance Trends", described as "How CPU, memory and disk have behaved over time."
- `Sidebar.tsx`: add `{ view: 'trends', label: 'Trends', icon: <a line-chart icon> }` after Alerts.

### 4.2 Layout
```
Performance Trends                                                [Backend Active]
How CPU, memory and disk have behaved over time.

[1 hour | 6 hours | 24 hours | 7 days]      Showing 4 Oct 14:00 to 4 Oct 16:30   [Reset]

┌─ CPU ─────────────────────────────────────────── avg 34%   peak 97% ─┐
│ - - - - - - - - - - - - - - - - - - - - - - - - - - - - 90% limit    │
│        ╱╲      ▓▓▓▓                                                  │
│ ──────╱  ╲────╱▓▓▓▓╲──────────         ────────────────────          │
└──────────────────────────────────────────────────────────────────────┘
┌─ Memory ─────────────────────────────────────────────────────────────┐
┌─ Disk ───────────────────────────────────────────────────────────────┐

┌─ Overview: drag to move, pull the edges to zoom ─────────────────────┐
│ ▁▂▃▂▁▁▂▅█▅▂▁[▁▂▃▅▆▅▃▂]▁▁▂▂▁▁                                         │
└──────────────────────────────────────────────────────────────────────┘
```

New files: `pages/Trends.tsx`, `components/trends/MetricChart.tsx`, `components/trends/OverviewStrip.tsx`, `components/trends/ChartTooltip.tsx`.

### 4.3 The Three Charts
One `MetricChart` component, used three times. Each is a recharts `ComposedChart`:

| Element | recharts part | Appearance |
|---|---|---|
| Average | `Line` | Solid, in `var(--ink)`, no dots |
| Peak | `Area` beneath the line of `*_max` | A faint band in `var(--ink-faint)`. Disk has none |
| Alert threshold | `ReferenceLine` | Dashed, in `var(--crimson)`, labelled "90% limit" |
| Alert episodes | `ReferenceArea` from start to end | A wash in `var(--crimson-wash)` |
| Axes | `XAxis` as a time scale, `YAxis` fixed at 0 to 100 | Hairlines in `var(--line)`, labels in `var(--ink-faint)` |

- The Y axis is always 0 to 100. An axis that rescales to the data would make 12% look like a crisis.
- `connectNulls` is false, so the gaps from §3.2 are breaks.
- The three charts share a `syncId`, so hovering one shows a crosshair and tooltip at the same moment on all three.
- Animation is off. The data is historical and animating it only delays reading it.
- Each header shows the average and the peak for the visible window, in the tabular figures the gauges use.
- The colours are CSS variables, so the charts follow the theme with no extra code. This is the same approach as the dials in `GaugeCard.tsx`.

### 4.4 Tooltip
A custom `ChartTooltip` styled as a `.panel` on `var(--raised)`:

```
4 Oct, 14:15 to 14:30
CPU      avg 62.4%   peak 97.1%
Memory   avg 71.0%   peak 73.8%
Disk     47.2%
Recorded for 8 of 15 minutes        <- only when coverage is below 1
```

### 4.5 Zoom and Pan: Focus and Context
The plan asks for zoom and pan. The page uses the standard focus-and-context pattern, which gives both from one control and always shows where the user is.

- The **range buttons** (1 hour to 7 days) set the *context*: the total period loaded into the overview strip.
- The **overview strip** is a short chart of CPU over the whole context with a recharts `Brush` on it. The brushed window is the *focus*.
  - Dragging the window **pans**.
  - Pulling either edge **zooms**.
- The three charts show only the focus window.
- When the brush settles, after a 250 ms debounce, the page requests the focus window with `from` and `to`. The server answers with a finer bucket (§2.1). Zooming from 24 hours into 90 minutes therefore goes from 15-minute points to 1-minute points. Detail is never lost by zooming.
- The narrowest focus is 10 minutes.
- **Reset** returns the focus to the whole context.
- The line above the charts states the focus in words, for example "Showing 4 Oct 14:00 to 4 Oct 16:30".

### 4.6 Alert Markers
The page calls `fetchAlerts()` from Phase 2 for the focus window and draws each episode on the chart of its metric. `process` alerts are drawn on the CPU chart.

- Hovering a marked region adds the alert to the tooltip: "Critical CPU alert, 4m 28s, top process chrome.exe".
- Clicking it opens the Alerts page with that alert expanded.

The reverse link also exists. The alert detail panel from Phase 2 gains a **Show on graph** button, which opens Trends focused from 30 minutes before the alert to 30 minutes after it.

Both links need one page to tell another what to show. A small `NavigationContext` holds the active view and an optional target (`{ alertId }` or `{ from, to }`). It replaces the `activeView` state now held in `App.tsx`.

### 4.7 Staying Current
A new row arrives once a minute. While the page is visible and the focus window ends at "now", the page refetches every 60 seconds. If the user has panned into the past, it does not refetch, because nothing in that window can change. This is the only timed request in the app, and it stops when the page is left.

### 4.8 States
| State | What the user sees |
|---|---|
| Loading the page for the first time | The `Suspense` fallback, then chart skeletons |
| Request failed | `EmptyState` with a Retry button |
| No data at all | "Kavan has not recorded any history yet. The first points appear after a minute." |
| Recording started inside the range | The charts, plus a note: "Recording since 4 Oct, 17:23." |
| Backend was off for part of the range | A break in each line for that period |

---

## 5. Files Touched

| File | Change |
|---|---|
| `mcp-server/database/db.py` | Add `get_metrics_history()` and a query for the oldest minute |
| `mcp-server/routes/history.py` | Add `/api/metrics/history` |
| `desktop/src/services/api.ts` | `MetricsHistory`, `MetricsPoint`, `fetchMetricsHistory` |
| `desktop/src/utils/series.ts` | **New.** `fillGaps`, window statistics |
| `desktop/src/context/NavigationContext.tsx` | **New.** Active view and cross-page target |
| `desktop/src/App.tsx`, `main.tsx` | Use `NavigationContext`. Lazy-load Trends |
| `desktop/src/components/trends/*` | **New.** Chart, overview strip, tooltip |
| `desktop/src/pages/Trends.tsx` | **New** |
| `desktop/src/components/alerts/AlertDetail.tsx` | "Show on graph" button |
| `desktop/src/components/layout/views.ts`, `Sidebar.tsx` | New view and navigation entry |

---

## 6. Tests

### 6.1 Automated (backend)
New file `mcp-server/tests/test_metrics_api.py`.

| Test | Proves |
|---|---|
| Two minutes in one bucket, with 30 and 10 samples | The bucket average is weighted 3 to 1 |
| Minutes with peaks 40 and 95 in one bucket | The bucket peak is 95 |
| Rows at 10:00 and 12:00 only, 15-minute buckets | Two points come back. Nothing is invented between them |
| `range` of each preset | The bucket size of §2.1 |
| `from` and `to` 90 minutes apart | One-minute buckets |
| Only `from`, a span of 2 minutes, a span of 30 days, `to` before `from` | Each is a 400 |
| Empty table | An empty `points` list and `recording_since` of null |
| A bucket covered for half its length | `coverage` of 0.5 |
| A foreign `Origin` | 403 |

### 6.2 Manual (desktop)
1. Run the backend for an hour and open Trends at "1 hour". *Expected:* three charts with about 60 points each.
2. Run a CPU stress script for two minutes, then find it on the chart. *Expected:* the average rises, the peak band rises further, and a crimson region marks the alert.
3. Pull the brush edges in around the spike. *Expected:* the charts redraw with one-minute points.
4. Drag the brush. *Expected:* the charts follow, and the "Showing..." line updates.
5. Stop the backend for five minutes, restart, and view "1 hour". *Expected:* a break in each line, not a straight line across.
6. Click the alert region. *Expected:* the Alerts page opens with that alert expanded. Use **Show on graph** to come back.
7. Change the CPU threshold in Settings and return. *Expected:* the limit line has moved.
8. Switch theme with the page open. *Expected:* every colour follows.
9. Compare the last few minutes with Windows Task Manager. *Expected:* the same shape and level.

---

## 7. Definition of Done (Success Criteria)

Phase 3 is complete when all of these hold:

1. **A day is visible.** After 24 hours of running, the "24 hours" view shows the whole day for CPU, memory and disk.
2. **Spikes survive averaging.** A ten-second spike appears in the peak band at every zoom level.
3. **No invented data.** A period with the backend off is a visible gap.
4. **Zoom adds detail.** Zooming into a two-hour window shows one-minute points.
5. **Pan works.** Dragging the overview window moves all three charts together.
6. **Alerts are on the chart.** Each episode is marked at the right time on the right chart, and clicking it leads to its entry in Alert History.
7. **Thresholds are on the chart.** Each limit line matches the current setting.
8. **Fast.** The page opens in under a second with 7 days of data, and the Dashboard's start-up time has not grown.
9. **Both themes.** The charts are readable in dark and light without a chart-specific colour list.
10. **No regressions.** The existing tests pass.

Once these pass, the three history features are complete, and we are ready for **Phase 4: Rollback Manager Backend**.
