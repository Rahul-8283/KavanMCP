# Technical Requirements Document (TRD) - KavanMCP V2

## 1. Introduction
This document defines the technical architecture, technology stack, and engineering requirements for KavanMCP V2. The V2 update introduces a real-time Tauri-based desktop GUI that communicates with the existing Python FastMCP backend via HTTP REST and WebSockets. The goal is to provide a zero-latency, highly responsive user interface without duplicating business logic or introducing external dependencies.

---

## 2. Technology Stack

### 2.1 Frontend (Desktop Application)
- **Framework:** Tauri 2.0 (Rust bindings for OS integration)
- **UI Library:** React 18 (TypeScript)
- **Build Tool:** Vite
- **Styling:** TailwindCSS (for rapid, utility-first styling)
- **Data Visualization:** Recharts or Chart.js (for SVG-based CPU/RAM/Disk gauges)
- **HTTP Client:** Axios (configured with interceptors for error handling)
- **State Management:** React Context API (global state for metrics, processes, and config)

### 2.2 Backend (Existing Core)
- **Framework:** FastMCP (Python 3.11+)
- **System APIs:** `psutil` (metrics), `pywin32` (deep inspection)
- **Database:** SQLite (managed via `aiosqlite`)
- **Validation:** Pydantic V2
- **Enhancement Required:** Addition of FastAPI standard WebSocket endpoints alongside FastMCP.

---

## 3. Architecture & Data Flow

The V2 architecture operates on a decoupled client-server model entirely confined to `localhost`.

### 3.1 The "Two-Channel" Communication Model
The Tauri frontend communicates with the Python backend through two distinct network channels:
1. **WebSocket Channel (`ws://localhost:8000/ws`):**
   - Strictly utilized for high-frequency, unidirectional data pushing (Server -> Client).
   - Transmits global CPU/RAM/Disk metrics every 2000ms.
   - Pushes asynchronous OS alerts (e.g., threshold breaches).
2. **HTTP REST Channel (`http://localhost:8000/api/*`):**
   - Utilized for discrete, user-initiated actions and large data fetching.
   - Examples: Requesting the full list of running processes, submitting a process PID for termination, updating config files.

### 3.2 Database Concurrency (Zero-Lock Strategy)
Both the Claude Desktop MCP instance (via `stdio`) and the Tauri App (via HTTP) rely on `mcp-server/data/process.db`. 
- SQLite handles concurrency automatically via WAL (Write-Ahead Logging) mode.
- The Python backend must ensure database connections are opened asynchronously (`aiosqlite`) and closed immediately after execution to prevent `database is locked` exceptions.

---

## 4. API Specifications

To support the React frontend, the FastMCP server must expose standard HTTP/WS routes alongside its MCP tools.

### 4.1 WebSocket Endpoints
**Endpoint:** `WS /ws`
**Payload (Server to Client):**
```json
{
  "type": "metrics_update",
  "data": {
    "cpu_percent": 14.5,
    "ram_percent": 62.3,
    "disk_percent": 45.1,
    "timestamp": 1718293041
  }
}
```
**Alert Payload (Server to Client):**
```json
{
  "type": "threshold_alert",
  "level": "critical",
  "message": "CPU exceeded 90% threshold. Offending process: Discord.exe (24%)"
}
```

### 4.2 REST Endpoints
**1. GET `/api/list_processes`**
- **Returns:** JSON array of active processes including PID, name, memory_mb, cpu_percent, and security tier.
- **Latency Requirement:** < 100ms response time.

**2. POST `/api/confirm_termination`**
- **Body:** `{ "pid": 1234 }`
- **Returns:** JSON object with safety checks and potential memory savings. Adds PID to TTL cache.

**3. POST `/api/execute_termination`**
- **Body:** `{ "pid": 1234 }`
- **Returns:** Success status and exact freed resources. Requires prior confirmation in TTL cache.

**4. POST `/api/update_thresholds`**
- **Body:** `{ "cpu": 85, "ram": 90, "disk": 95 }`
- **Action:** Overwrites local `config.json` and updates live backend state.

---

## 5. Frontend Engineering Requirements

### 5.1 React Component Structure
The React tree should be highly modularized to prevent unnecessary re-renders when high-frequency WebSocket data arrives.
- `<AppShell />`: Global wrapper containing Sidebar and TopNav.
- `<Dashboard />`: Subscribes to the Metrics Context. Renders `<GaugeChart />` components.
- `<ProcessManager />`: Contains `<ProcessTable />`, `<SortHeader />`, and `<TierFilter />`.
- `<ToastProvider />`: Global overlay mapping through an array of active toast alerts.

### 5.2 Client-Side Data Processing
To keep the backend lightweight, the frontend is responsible for all data manipulation of the process list.
- **Sorting:** The `Array.prototype.sort()` algorithm must be applied to the process array in React state upon clicking column headers.
- **Filtering:** Filtering by Tier (1-4) is handled via `Array.prototype.filter()`.
- **Performance:** If the process array exceeds 500 items, the `<ProcessTable />` must utilize virtualization (e.g., `react-window`) to prevent DOM bloat and lagging scroll performance.

### 5.3 Custom Hooks
- `useWebSocket(url)`: Manages WebSocket connection, lifecycle (onOpen, onClose, onError), and automatic exponential backoff reconnection.
- `useMetrics()`: Provides access to the latest streamed metrics.
- `useProcesses()`: Manages the fetching, loading state, and error handling for the process list.

---

## 6. Tauri OS Integration Requirements

The Rust layer of Tauri will be utilized strictly for native OS integrations.

### 6.1 System Tray (`tauri.conf.json`)
- **Icons:** The app requires 3 `.ico` assets (`tray-green.ico`, `tray-yellow.ico`, `tray-red.ico`).
- **Dynamic Updates:** React will invoke Tauri APIs to swap the tray icon based on current CPU thresholds.
- **Tooltip:** React will invoke Tauri APIs to update the tray hover text dynamically (e.g., "CPU: 45% | RAM: 60%").

### 6.2 Native Notifications (Toasts)
- Instead of purely HTML/CSS toasts, critical alerts (e.g., Tier 4 process detection) should trigger a native OS notification via the `@tauri-apps/api/notification` module.

### 6.3 Window Management
- **Background Mode:** When the user clicks "Close" (X), the window should hide rather than exit the process.
- **Restoration:** Clicking the System Tray icon should restore and focus the hidden window.

---

## 7. Security & Error Handling

### 7.1 Backend Hardening
- **Tier 1 Immutability:** The REST API `execute_termination` must validate the PID against the hardcoded whitelist just like the MCP tool. It must return a `403 Forbidden` if an attempt is made to bypass this via a rogue HTTP request.
- **Elevation Checks:** The UI must detect if the backend is lacking Administrator privileges. If a kill request returns `psutil.AccessDenied`, the UI must display a specific error modal instructing the user to restart the application as Admin.

### 7.2 Connection Resiliency
- If the Python backend crashes or is manually terminated, the React UI must not crash. 
- The `useWebSocket` hook must attempt reconnections every 3 seconds.
- The UI should display a global "Backend Disconnected" banner disabling all interactive elements until the connection is restored.

---

## 8. Build & Deployment Pipeline

### 8.1 Development Mode
- **Backend:** `python main.py` (runs Uvicorn/FastAPI on port 8000).
- **Frontend:** `npm run tauri dev` (starts Vite dev server and opens Tauri window).

### 8.2 Production Build
1. The React app is compiled to static assets (`dist` folder).
2. Tauri bundles the web assets into a native `.exe`.
3. *Note:* In production, the Python backend must be bundled into a standalone executable (e.g., using PyInstaller) and shipped alongside the Tauri app as a "sidecar" binary. Tauri will automatically spawn this Python sidecar when the application boots.

---

## 9. Next Steps
1. Initialize the Tauri project (`Phase 0`).
2. Update the existing FastMCP server file to support standard FastAPI routing (HTTP/WS).
3. Establish the React Context and Axios/WebSocket hooks.
