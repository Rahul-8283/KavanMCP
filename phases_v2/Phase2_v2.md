# Phase 2: Live Metrics Dashboard (WebSocket & Gauges)

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 2
Phase 2 brings the application to life. The objective is to establish the real-time WebSocket connection between the React UI and the Python FastMCP server, and visualize the incoming data using dynamic CPU, RAM, and Disk gauges.

By the end of Phase 2, the user will see a fully functional dashboard that updates every 2 seconds. The gauges will animate smoothly as metrics fluctuate, and their colors will dynamically shift from Green to Yellow to Red based on hardcoded system health thresholds.

### 1.2 Architectural Philosophy (Push over Poll)
We strictly avoid using `setInterval` in React to poll the `GET /metrics` REST endpoint. Polling wastes CPU cycles and network overhead. Instead, the backend will maintain an open WebSocket pipe and *push* the metrics to the UI. The UI simply listens and re-renders.

---

## 2. Backend Enhancements (FastAPI WebSockets)

While most of the logic is frontend-heavy, Phase 2 requires exposing a new WebSocket endpoint on the existing FastMCP server.

### 2.1 The `ws://localhost:8000/ws` Route
The Python backend (`main.py` or a dedicated router) must implement a FastAPI WebSocket endpoint.
- Upon client connection, the server accepts the socket and adds it to an active `ConnectionManager`.
- A background `asyncio` task runs an infinite loop, querying `psutil` for global CPU, RAM, and Disk metrics every 2.0 seconds.
- The server broadcasts the JSON payload to all connected WebSocket clients.

### 2.2 Expected JSON Payload
```json
{
  "type": "metrics_update",
  "data": {
    "cpu_percent": 24.5,
    "ram_percent": 58.2,
    "disk_percent": 41.0,
    "timestamp": "2026-09-19T14:00:00Z"
  }
}
```

---

## 3. Frontend Implementation: The WebSocket Hook

The placeholder `useWebSocketConnection.ts` from Phase 1 must now be fully implemented.

### 3.1 Hook Responsibilities
- **Connection Lifecycle:** Utilize the native browser `WebSocket` API to connect to the backend on mount. Cleanly close the socket on unmount to prevent memory leaks.
- **State Dispatch:** On `message` events, parse the JSON. If `type === "metrics_update"`, dispatch the `data` payload to the global `MetricsContext`.
- **Auto-Reconnection:** If the `onclose` event fires unexpectedly (e.g., Python server crashes), the hook must implement an exponential backoff algorithm (try reconnecting in 1s, then 2s, then 4s, up to 10s max interval).
- **Status Export:** The hook must export a `connectionStatus` enum (`CONNECTING`, `CONNECTED`, `DISCONNECTED`) so the App Shell can render a visual indicator (e.g., a green dot in the Header).

---

## 4. Frontend Implementation: Data Visualization (Gauges)

The core visual elements of the Dashboard are the three circular gauges representing system resources.

### 4.1 The `<GaugeCard />` Component
To adhere to DRY (Don't Repeat Yourself) principles, a single generic `<GaugeCard />` component will be created, accepting props:
- `title` (e.g., "CPU Usage")
- `value` (e.g., 24.5)
- `icon` (Lucide icon to display next to the title)

### 4.2 Recharts Integration
The `recharts` library will be utilized to render the SVG gauge.
- Use a `PieChart` or `RadialBarChart` configured as a half-circle or full-circle gauge.
- The chart must be highly responsive to its container width using `<ResponsiveContainer />`.
- SVG transitions/animations must be enabled so that when the value jumps from 40% to 80%, the needle/bar sweeps smoothly rather than snapping instantly.

### 4.3 Threshold Color Logic
Inside the `<GaugeCard />`, a utility function will dynamically determine the SVG `fill` color based on the `value` prop:
- **< 70%:** `text-emerald-500` (Healthy)
- **70% - 90%:** `text-amber-500` (Warning)
- **> 90%:** `text-rose-500` (Critical)

---

## 5. Dashboard Layout & Composition

### 5.1 The `<Dashboard />` Page
The main page component orchestrates the layout.
- Utilizes CSS Grid (`grid-cols-1 md:grid-cols-3`) to place the three Gauges side-by-side on large screens, or stacked on small screens.
- Consumes the `useContext(MetricsContext)` to extract `cpu`, `ram`, and `disk`.
- Passes these raw values down as props to the three `<GaugeCard />` instances.

### 5.2 The "Last Updated" Ticker
- Below the gauges, display a small, muted text element reading: `Last updated: [timestamp]`.
- This provides visual confirmation to the user that the stream is actively alive, even if the CPU metric happens to sit exactly at 24.5% for several ticks.

---

## 6. Edge Cases & Safety Precautions

### 6.1 Rendering Optimization
- Because the `MetricsContext` updates every 2 seconds, the `<Dashboard />` component will re-render rapidly. 
- Ensure that heavy SVG elements or unrelated UI components within the Dashboard are wrapped in `React.memo()` if unnecessary re-renders cause CPU spikes inside the Tauri window.
- The UI must remain entirely smooth; if dragging the Tauri window stutters during a metric update, the rendering logic is too heavy.

### 6.2 NaN / Offline Handling
- If the WebSocket disconnects, the Gauges should gracefully fall back to displaying `--%` or `0%` in a grayed-out state, rather than crashing or displaying `NaN`.

---

## 7. Definition of Done (Success Criteria)

Phase 2 is considered complete when the following criteria are met:

1. **Backend Broadcasting:** The Python server successfully runs the `asyncio` background task and pushes JSON metrics to connected WebSocket clients every 2 seconds.
2. **Dashboard Rendering:** The React `<Dashboard />` page displays three distinct gauges for CPU, RAM, and Disk.
3. **Live Animation:** The gauges smoothly update and animate every 2 seconds as new WebSocket data arrives.
4. **Threshold Colors:** Using a CPU stress tool (or hardcoding dummy data), verify that the gauges properly transition from Green to Yellow (at 70%) to Red (at 90%).
5. **Reconnection Logic:** Killing the Python server manually forces the UI to display a "Disconnected" state. Restarting the Python server results in the UI automatically reconnecting within 10 seconds without requiring a manual page refresh.

Once these checks pass, the real-time heartbeat of the application is established, and we are ready for **Phase 3: Process Manager - Data Fetching & Display**.
