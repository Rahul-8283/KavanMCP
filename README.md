<div align="center">
  <img src="desktop/public/kavan_logo.svg" alt="KavanMCP Logo" width="160" />
  <h1>KavanMCP</h1>
  <p><strong>AI-Powered System Optimizer · Dual-Interface · Ironclad Safety</strong></p>
  <p>
    <a href="https://github.com/Rahul-8283/KavanMCP/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" /></a>
    <a href="https://github.com/Rahul-8283/KavanMCP/commit/598af3a"><img src="https://img.shields.io/badge/last%20commit-2026--10--24%20%C2%B7%20598af3a-blue?style=flat-square" alt="Last Commit" /></a>
    <img src="https://img.shields.io/badge/V2-Production%20Grade-blue?style=flat-square" alt="V2 Production Grade" />
    <img src="https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows" alt="Windows" />
    <img src="https://img.shields.io/badge/Tests-195%20passing-brightgreen?style=flat-square" alt="Tests" />
  </p>
</div>

---

## What is KavanMCP?

KavanMCP is a **dual-interface AI-powered system optimizer** for Windows. It lets you monitor, analyze, and safely terminate resource-hogging processes — either through a real-time desktop dashboard or by asking Claude AI in plain English.

Instead of manually hunting down processes in Task Manager, you can simply say:

> *"Claude, my laptop is lagging. Find what's causing it and safely clean it up."*

KavanMCP bridges your OS directly to an AI agent through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/), while simultaneously running a Tauri desktop GUI that gives you visual control over the same data. Both interfaces share a single SQLite audit database — concurrent writes are safe by design (WAL mode).

The **Ironclad 4-Tier Security Engine** ensures that no critical system process can ever be killed, even if Claude recommends it.

---

## Tech Stack

<div align="center">

### Backend
[![Python](https://img.shields.io/badge/Python_3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![FastMCP](https://img.shields.io/badge/FastMCP-8A2BE2?style=for-the-badge&logo=anthropic&logoColor=white)](https://gofastmcp.com)
[![SQLite](https://img.shields.io/badge/SQLite_WAL-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org)
[![Pydantic](https://img.shields.io/badge/Pydantic_v2-E92063?style=for-the-badge&logo=pydantic&logoColor=white)](https://docs.pydantic.dev)
[![psutil](https://img.shields.io/badge/psutil-2C2D72?style=for-the-badge&logo=linux&logoColor=white)](https://github.com/giampaolo/psutil)
[![pywin32](https://img.shields.io/badge/pywin32-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/mhammond/pywin32)
[![aiosqlite](https://img.shields.io/badge/aiosqlite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://github.com/omnilib/aiosqlite)
[![uvicorn](https://img.shields.io/badge/uvicorn-499848?style=for-the-badge&logo=gunicorn&logoColor=white)](https://www.uvicorn.org)

### Desktop GUI
[![Tauri](https://img.shields.io/badge/Tauri_2-FFC131?style=for-the-badge&logo=tauri&logoColor=black)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)](https://rust-lang.org)
[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite_8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Recharts](https://img.shields.io/badge/Recharts-22B5BF?style=for-the-badge&logo=apacheecharts&logoColor=white)](https://recharts.org)
[![Axios](https://img.shields.io/badge/Axios-5A29E4?style=for-the-badge&logo=axios&logoColor=white)](https://axios-http.com)
[![Lucide](https://img.shields.io/badge/Lucide_React-F56040?style=for-the-badge&logo=lucide&logoColor=white)](https://lucide.dev)
[![TanStack Virtual](https://img.shields.io/badge/TanStack_Virtual-FF4154?style=for-the-badge&logo=reactquery&logoColor=white)](https://tanstack.com/virtual)

### Testing & Tooling
[![Pytest](https://img.shields.io/badge/pytest-0A9EDC?style=for-the-badge&logo=pytest&logoColor=white)](https://pytest.org)
[![Ruff](https://img.shields.io/badge/Ruff-D7FF64?style=for-the-badge&logo=ruff&logoColor=black)](https://docs.astral.sh/ruff)

</div>

---

## Architecture

### High-Level System Overview

```mermaid
graph TB
    subgraph User["User Interfaces"]
        Claude["🤖 Claude Desktop\nMCP Client"]
        GUI["🖥️ KavanMCP\nTauri Desktop App"]
    end

    subgraph Backend["Python Backend (localhost:8000)"]
        direction TB
        MCP["FastMCP Server\nstdio transport"]
        API["FastAPI Server\nHTTP + WebSocket"]
        Security["4-Tier Security Engine"]
        Approval["Approval Cache\nTTL: 5 min"]
        Terminator["Termination Handler"]
    end

    subgraph OS["Operating System"]
        psutil["psutil\nMetrics & Process Info"]
        win32["pywin32\nDeep Inspection"]
        Kill["Process Termination\nSIGTERM → SIGKILL"]
    end

    subgraph Data["Persistence"]
        DB[("SQLite WAL\nprocess.db")]
        Config["settings.json\nThresholds & Theme"]
        Whitelist["tier_1_processes.json\nHard-locked Whitelist"]
    end

    Claude -->|"stdio pipes"| MCP
    GUI -->|"HTTP REST"| API
    GUI <-->|"WebSocket\nreal-time metrics"| API

    MCP --> Security
    API --> Security
    Security --> Whitelist
    Security --> Approval
    Approval --> Terminator
    Terminator --> Kill

    MCP --> psutil
    API --> psutil
    psutil --> OS
    win32 --> OS

    Terminator --> DB
    MCP --> DB
    API --> Config
```

### Dual-Interface Data Flow

```mermaid
sequenceDiagram
    participant U as User
    participant G as Tauri GUI
    participant A as FastAPI :8000
    participant M as FastMCP (stdio)
    participant S as Security Engine
    participant DB as SQLite WAL

    par WebSocket Stream
        A-->>G: metrics_update (CPU/RAM/Disk every 2s)
    and REST Flow
        U->>G: Right-click → Terminate
        G->>A: POST /api/confirm_termination {pid}
        A->>S: stage_termination(pid)
        S-->>A: tier=3, status=pending
        A-->>G: 200 OK
        G->>U: Show Kill Confirm Modal
        U->>G: Click Confirm
        G->>A: POST /api/execute_termination {pid}
        A->>S: verify create_time + tier check
        A->>DB: log_termination()
        A-->>G: 200 success
        G-->>U: Row removed + success toast
    and MCP Flow
        U->>M: "Kill the calculator"
        M->>S: confirm_termination([pid])
        S-->>M: staged, awaiting confirm
        M-->>U: "Staged. Confirm?"
        U->>M: "Yes"
        M->>S: execute_termination([pid])
        S->>DB: log_termination()
        M-->>U: "Done. Freed 15 MB"
    end
```

### The 4-Tier Security Decision Engine

```mermaid
flowchart TD
    Start([Process Identified]) --> T1{Is name in\nTier 1 Whitelist?}

    T1 -->|YES| Block1[🔴 HARD BLOCK\nTermination Forbidden\nLog + Return Error]
    T1 -->|NO| T2{Is it a known\nessential app?\nVSCode / Browser...}

    T2 -->|YES| Tier2[🟠 Tier 2\nEssential Work App\nSingle Confirmation]
    T2 -->|NO| T4{No visible window\nand over 25% CPU?}

    T4 -->|YES| Tier4[🔵 Tier 4\nSuspicious Anomaly\nHigh-Risk Alert + Dual Confirm]
    T4 -->|NO| Tier3[🟡 Tier 3\nBackground Helper\nDual Confirmation]

    Tier2 --> Gate[Approval Cache\nTTL 5 min\nSingle-use pop]
    Tier3 --> Gate
    Tier4 --> Gate

    Gate --> PID{PID still same\nprocess?\ncreate_time match}
    PID -->|NO| Block2[🔴 PID REUSE DETECTED\nTermination Aborted]
    PID -->|YES| T1Check{Re-check Tier 1\nDefence in depth}
    T1Check -->|IS Tier 1| Block3[🔴 CRITICAL BLOCK\nLog + Abort]
    T1Check -->|Safe| Execute[✅ Execute\nSIGTERM → wait 3s → SIGKILL]
    Execute --> Audit[(Audit Log\nfreed MB, CPU,\npid, reasoning)]
```

### Kill Flow State Machine

```mermaid
stateDiagram-v2
    [*] --> Idle: User opens app

    Idle --> ContextMenu: Right-click process row
    ContextMenu --> Idle: Click outside / Escape

    ContextMenu --> ConfirmModal: Click "Terminate"

    ConfirmModal --> Idle: Click "Cancel"
    ConfirmModal --> Staged: Click "Confirm"\nPOST /api/confirm_termination

    Staged --> Blocked: Tier 1 process\n→ 403 tier1_blocked
    Staged --> Executing: POST /api/execute_termination

    Executing --> RowRemoved: 200 success\nOptimistic UI delete
    Executing --> ErrorToast: 403 access_denied\n(non-admin)
    Executing --> WarningToast: 404 not_found\n(already closed)
    Executing --> ErrorToast: 409 pid_reused\n(recycled PID)

    RowRemoved --> Idle: Success toast shown
    ErrorToast --> Idle: Toast dismissed
    WarningToast --> Idle: Toast dismissed
    Blocked --> ConfirmModal: Button disabled

    note right of Staged
        Approval stored with
        process.create_time snapshot.
        TTL: 5 minutes.
        Single-use: dict.pop()
    end note
```

### SQLite Database Schema

```mermaid
erDiagram
    AUDIT_LOG {
        TEXT id PK
        DATETIME timestamp
        TEXT process_name
        INTEGER pid
        TEXT executable_path
        TEXT action_type "TERMINATED, BLOCKED or ROLLBACK"
        REAL memory_freed_mb
        REAL cpu_freed_pct
        TEXT llm_reasoning
        BOOLEAN user_approved
        TEXT command_line "original arguments, for rollback"
        INTEGER tier "tier the user confirmed. NULL for kills before V2.1"
        DATETIME rolled_back_at "when the kill was restored. NULL if not"
    }

    METRICS_HISTORY {
        DATETIME minute PK "UTC, one row per minute"
        REAL cpu_avg
        REAL cpu_max
        REAL ram_avg
        REAL ram_max
        REAL disk_avg
        INTEGER samples "30 in a full minute"
    }

    ALERT_EVENTS {
        TEXT id PK
        TEXT metric "cpu, ram, disk or process"
        TEXT level "warning or critical"
        REAL threshold
        DATETIME started_at
        DATETIME ended_at "NULL while ongoing"
        REAL peak_value
        REAL cpu_at_start
        REAL ram_at_start
        REAL disk_at_start
        TEXT top_process
        INTEGER top_process_pid
        REAL top_process_value
        INTEGER muted
    }

    SYSTEM_BASELINES {
        TEXT process_name PK
        REAL avg_cpu_pct
        REAL avg_memory_mb
        DATETIME last_updated
    }
```

`metrics_history` is kept for 7 days and closed alerts for 30. `system_baselines` is created but not yet written to.

### Phase Progression (V2 and V2.1 Roadmap)

```mermaid
gantt
    title KavanMCP V2 and V2.1 — Phase Completion
    dateFormat YYYY-MM-DD
    section Foundation
    Phase 0 · Tauri Setup          :done, 2026-09-10, 1d
    Phase 1 · App Shell + Context  :done, 2026-09-11, 2d
    section Real-time Data
    Phase 2 · WebSocket + Gauges   :done, 2026-09-13, 2d
    Phase 3 · Process Table        :done, 2026-09-15, 2d
    Phase 4 · Sort & Filter        :done, 2026-09-17, 1d
    section UX & Config
    Phase 5 · Settings + Thresholds:done, 2026-09-18, 2d
    Phase 6 · Toast Alerts         :done, 2026-09-20, 2d
    section OS Integration
    Phase 7 · Tray Integration     :done, 2026-09-22, 3d
    Phase 8 · Kill Flow            :done, 2026-09-25, 5d
    section QA
    Phase 9 · Feature Testing      :done, 2026-10-01, 2d
    Phase 10 · E2E + Claude Sync   :done, 2026-10-04, 1d
    section V2.1 History
    Phase 1 · Metrics + Alert Storage :done, 2026-10-05, 1d
    Phase 2 · Alert History Page      :done, 2026-10-06, 1d
    Phase 3 · Performance Graphs      :done, 2026-10-06, 1d
    Phase 4 · Rollback Manager Backend :done, 2026-10-13, 1d
    Phase 5 · Rollback Manager UI      :done, 2026-10-24, 1d
```

---

## Key Features

| Feature | Detail |
|---|---|
| 🔴 **Tier 1 Hard Lock** | `explorer.exe`, `lsass.exe`, `svchost.exe` and others are physically un-killable — the UI disables the Confirm button and the backend rejects the request at three independent gates |
| 🛡️ **PID Reuse Protection** | Approval stores the process `create_time` at staging time; if a different process recycles the same PID before execution, the kill is aborted |
| 🎯 **Single-Use Approvals** | `dict.pop()` semantics mean a confirmed PID can only be executed once — double-clicks and replay attacks are blocked |
| ⚡ **Non-Blocking Backend** | Long-running psutil scans run in worker threads via `asyncio.to_thread` so the event loop never freezes under a heavy process list |
| 📊 **Real-Time Dashboard** | WebSocket pushes CPU/RAM/Disk metrics every 2 seconds with threshold-triggered alerts and colour-coded gauges |
| 📋 **Virtualized Process Table** | `@tanstack/react-virtual` renders 800+ processes at 60fps — only visible rows are in the DOM |
| ⚙️ **Persistent Settings** | Thresholds and the sound toggle persist to `settings.json`, and the UI rolls back on failed saves; the theme is remembered by the app itself |
| 🔔 **Native Notifications** | Tauri Notification API fires Windows Action Center alerts on CPU/RAM spikes even when the window is hidden |
| 🗂️ **System Tray** | Left-click restores the window; right-click opens the menu; icon colour reflects the current alert state |
| ↩️ **Undo (Rollback)** | A killed process is relaunched from the audit log's stored executable path, with its original arguments. `GET /api/kills` lists recent kills with their tier and whether each can still be restored, and `POST /api/rollback` restores one exact kill by its id. A kill is restored once, whether from the API or from the `rollback_last_action` tool. In the app, the **Recently Killed** page lists the last 24 hours or 7 days with a one-click Restore on each row, and the toast after a kill offers **Undo** |
| 🗃️ **Continuous History** | The backend records one row of CPU/RAM/disk per minute and one row per alert episode, whether or not the window is open. Metrics are kept 7 days, alerts 30 |
| 📜 **Alert History** | Every alert with when it started and ended, its peak, the readings at that moment and the top process at the time. Filter by date, type and severity; updates live without polling |
| 📈 **Performance Trends** | CPU, memory and disk over 1 hour to 7 days, with the peak band, threshold line and alert regions. Drag the overview to pan and zoom; zooming loads finer detail. A period with no data is drawn as a gap |
| 🕵️ **Suspicious-Process Watch** | A scan once a minute raises an alert for any process with no window using over 25% CPU, without the dashboard being open |
| 🤝 **Dual-Interface Concurrency** | SQLite WAL mode allows the Tauri HTTP backend and Claude's stdio process to read/write simultaneously without lock errors |

---

## Project Structure

```text
KavanMCP/
├── mcp-server/                      # Python backend
│   ├── main.py                      # Entry point: boots MCP server + FastAPI + TTL sweeper
│   ├── server.py                    # 7 MCP tool definitions (FastMCP)
│   ├── ws_server.py                 # FastAPI app: REST + WebSocket, history recording loops
│   ├── routes/
│   │   ├── history.py               # /api/alerts and /api/metrics/history
│   │   └── kills.py                 # /api/kills and /api/rollback
│   ├── handlers/
│   │   ├── approval_handler.py      # PENDING_APPROVALS TTL cache
│   │   ├── classification_handler.py# 4-Tier classification logic
│   │   ├── termination_handler.py   # psutil kill + WAL audit log + rollback
│   │   ├── alert_handler.py         # Per-process anomaly flags
│   │   ├── history_recorder.py      # Minute aggregation + alert episode tracking
│   │   └── process_watch.py         # Timed scan: Tier 4 alerts, top-process lookup
│   ├── tools/
│   │   ├── analyze_system.py        # Resource analysis MCP tool
│   │   ├── list_processes.py        # Process enumeration MCP tool
│   │   ├── explain_process.py       # Deep inspection of one process
│   │   ├── confirm_termination.py   # Stage PIDs (MCP interface)
│   │   ├── execute_termination.py   # Execute staged kills (MCP interface)
│   │   ├── audit_tools.py           # Audit log viewer
│   │   └── rollback_tool.py         # Process resurrection
│   ├── config/
│   │   ├── whitelist.py             # Tier 1 whitelist loader
│   │   └── settings_manager.py      # Threshold config (settings.json)
│   ├── database/
│   │   ├── db.py                    # aiosqlite helpers + WAL init
│   │   └── models.py                # SQL schema definitions
│   ├── integrations/
│   │   ├── monitor.py               # psutil metrics polling
│   │   └── windows.py               # pywin32 window detection + deep inspection
│   ├── utils/
│   │   ├── logger.py                # File + stderr logging
│   │   ├── schemas.py               # Pydantic models
│   │   ├── error_handlers.py        # MCP tool error wrapper
│   │   ├── privileges.py            # is_admin()
│   │   └── timefmt.py               # UTC timestamp conversions
│   ├── tests/
│   │   ├── test_approval.py         # Approval cache
│   │   ├── test_classification.py   # Tier classification
│   │   ├── test_db.py               # Database helpers
│   │   ├── test_monitor.py          # Process scan
│   │   ├── test_explain_process.py  # explain_process tool
│   │   ├── test_rollback.py         # Rollback with original arguments, by id, and once
│   │   ├── test_kills_api.py        # /api/kills and /api/rollback
│   │   ├── kill_helpers.py          # Puts kill rows into the test database
│   │   ├── test_termination_api.py  # Kill flow and API boundary
│   │   ├── test_phase9_backend.py   # WebSocket + settings persistence
│   │   ├── test_phase10_backend.py  # WAL concurrency
│   │   ├── test_history_recorder.py # Aggregation, episodes, watch, retention
│   │   ├── test_alerts_api.py       # /api/alerts and alert_event messages
│   │   └── test_metrics_api.py      # /api/metrics/history
│   ├── resources/
│   │   └── tier_1_processes.json    # Hardcoded Tier 1 whitelist
│   └── requirements.txt
│
├── desktop/                         # Tauri + React frontend
│   ├── src-tauri/
│   │   ├── src/lib.rs               # Tauri commands (quit_app, etc.)
│   │   ├── capabilities/default.json# ACL permissions
│   │   └── tauri.conf.json          # Window, tray, icon config
│   └── src/
│       ├── App.tsx                  # Root: hook initialization, page lookup
│       ├── pages/
│       │   ├── Dashboard.tsx        # Gauges + process table
│       │   ├── Alerts.tsx           # Alert history
│       │   ├── Trends.tsx           # Performance graphs (loaded on demand)
│       │   ├── RecentlyKilled.tsx   # Kills of the last 24 hours or 7 days, with Restore
│       │   └── Settings.tsx         # Threshold sliders + toggles
│       ├── components/
│       │   ├── dashboard/
│       │   │   ├── GaugeCard.tsx            # SVG ring dial with a threshold zone
│       │   │   ├── ProcessTable.tsx          # Virtualized table + kill wiring
│       │   │   ├── ProcessContextMenu.tsx    # Right-click menu (portal)
│       │   │   ├── KillConfirmModal.tsx      # Tier-aware confirm dialog
│       │   │   └── TierBadge.tsx             # Tier 1-4 visual chips
│       │   ├── alerts/
│       │   │   ├── AlertTable.tsx           # Virtualized alert list
│       │   │   ├── AlertFilters.tsx         # Date, type and severity filters
│       │   │   ├── AlertDetail.tsx          # Expanded row + "Show on graph"
│       │   │   └── LevelBadge.tsx           # Warning / Critical chip
│       │   ├── trends/
│       │   │   ├── MetricChart.tsx          # One chart: line, peak band, limit, alerts
│       │   │   ├── OverviewStrip.tsx        # Brush for pan and zoom
│       │   │   └── ChartTooltip.tsx         # Bucket values + overlapping alerts
│       │   ├── rollback/
│       │   │   ├── KillTable.tsx            # Kill list with an expandable row
│       │   │   ├── RestoreCell.tsx          # Restore button, spinner, restored time or reason
│       │   │   ├── rows.ts                  # Pure row updates after a restore
│       │   │   └── wording.ts               # Restore failure codes to sentences
│       │   ├── common/
│       │   │   ├── Toast.tsx                # Single alert component
│       │   │   ├── ToastContainer.tsx        # Toast queue renderer
│       │   │   ├── EmptyState.tsx           # Loading / empty / failed state
│       │   │   ├── SegmentedControl.tsx     # Radio-group filter
│       │   │   ├── Switch.tsx               # Toggle
│       │   │   └── ErrorBoundary.tsx        # Crash fallback
│       │   └── layout/
│       │       ├── Header.tsx               # Top bar + status dot
│       │       ├── Sidebar.tsx              # Navigation rail
│       │       ├── MainLayout.tsx           # Page scaffold
│       │       └── views.ts                 # Page names and titles
│       ├── context/
│       │   ├── ConfigContext.tsx         # Settings with ref-based closure safety
│       │   ├── MetricsContext.tsx        # CPU/RAM/Disk live state
│       │   ├── ProcessContext.tsx        # Process list state
│       │   ├── AlertHistoryContext.tsx   # Alert list, filters, live updates
│       │   ├── NavigationContext.tsx     # Active page + cross-page target
│       │   └── ToastContext.tsx          # Toast queue state
│       ├── hooks/
│       │   ├── useWebSocketConnection.ts  # Reconnect with exponential backoff
│       │   ├── useProcessManager.ts       # Kill cascade logic, and Undo after a kill
│       │   ├── useKillHistory.ts          # Recent kills and restoring them one at a time
│       │   ├── useTrayIntegration.ts      # Global tray with offline awareness
│       │   └── useWindowLifecycle.ts      # Hide-on-close behaviour
│       ├── services/
│       │   └── api.ts               # Axios client + typed endpoints
│       ├── utils/
│       │   ├── time.ts              # Duration and date formatting
│       │   └── series.ts            # Gap filling and window statistics
│       └── styles/
│           └── index.css            # Design tokens for both themes
│
├── phases/                          # V1 build plans
├── phases_v2/                       # V2 build plans (Phase0_v2.md … Phase10_v2.md)
├── phase_v2_1/                      # V2.1 plan and its 8 phase files
│
├── docs/                            # PRD, TRD and API documents
├── CLAUDE.md                        # Claude Code development guide
├── kavan_logo.jpg
└── README.md
```

---

## Getting Started

### Prerequisites

| Requirement | Notes |
|---|---|
| Windows 10/11 | pywin32 and Tauri tray require Windows |
| Python 3.11+ | `python --version` to verify |
| Node.js 20+ | For the Tauri frontend |
| Rust (stable) | `rustup install stable` |
| Administrator rights | psutil deep inspection requires elevation |

### 1 · Clone & install backend dependencies

```powershell
git clone https://github.com/Rahul-8283/KavanMCP.git
cd KavanMCP/mcp-server

python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2 · Run the backend (elevated)

The server **must** run as Administrator to inspect privileged processes.

```powershell
# Open an elevated PowerShell, then:
python main.py
```

Or use the provided script:

```powershell
Start-Process -FilePath ".\scripts\run_server.bat" -Verb RunAs
```

The FastAPI server starts on `http://127.0.0.1:8000` and the FastMCP server listens on stdio.

### 3 · Run the desktop app (dev mode)

```powershell
cd ../desktop
npm install
npm run tauri dev
```

### 4 · Connect to Claude Desktop

Add to `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "KavanMCP": {
      "command": "C:\\path\\to\\KavanMCP\\mcp-server\\venv\\Scripts\\python.exe",
      "args": [
        "C:\\path\\to\\KavanMCP\\mcp-server\\main.py"
      ]
    }
  }
}
```

Restart Claude Desktop. KavanMCP tools will appear automatically.

### 5 · Run the test suite

```powershell
cd mcp-server
python -m pytest -q
# 195 passed
```

---

## MCP Tool Reference

### `analyze_system`
Returns global CPU/RAM totals and the top resource hogs classified by tier.

```jsonc
// Request
{}

// Response
{
  "total_cpu_percent": 15.2,
  "total_memory_gb": 15.8,
  "used_memory_gb": 7.1,
  "top_cpu_hogs": [
    { "pid": 1204, "name": "chrome.exe", "cpu_percent": 5.1, "memory_mb": 450.2,
      "tier": 2, "is_headless": false, "anomaly_flags": [] }
  ],
  "top_memory_hogs": [ /* same shape */ ]
}
```

### `list_processes`
Lists running processes with an optional name filter. Tier 1 processes are left out unless `include_tier_1` is true or a name is searched for.

```jsonc
// Request (both are optional)
{ "filter_name": "chrome", "include_tier_1": false }
```

### `explain_process`
Deep inspection of one process before proposing to terminate it: command line, executable path, parent and children, third-party modules and safety notes.

```jsonc
{ "pid": 1204 }
```

### `confirm_termination`
**Stage gate.** Adds PIDs to the approval cache. The LLM must present this list to the user before calling `execute_termination`.

```jsonc
{ "pids": [9999, 8888] }
```

### `execute_termination`
**Kill gate.** Only executes PIDs previously staged by `confirm_termination` within 5 minutes.

```jsonc
{ "pids": [9999], "reasoning": "User confirmed; freeing memory." }
```

### `view_audit_log`
Returns the recent termination history from the SQLite WAL database.

```jsonc
{ "hours_back": 24 }
```

### `rollback_last_action`
Relaunches the most recent kill of that name or PID that has not been restored yet, from its stored executable path and with its original arguments. A kill already restored through the REST API is skipped.

```jsonc
{ "process_identifier": "notepad.exe" }
```

---

## REST API Quick Reference

All endpoints are on `http://127.0.0.1:8000`. CORS is restricted to Tauri window origins, and a request from any other web origin is refused before it reaches a route.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/list_processes` | All running processes with tier classification |
| `GET` | `/api/get_config` | Current thresholds and UI preferences |
| `POST` | `/api/update_thresholds` | Partially update config (cpu/ram/disk/theme/sound) |
| `POST` | `/api/confirm_termination` | Stage a PID (rejects Tier 1 immediately) |
| `POST` | `/api/execute_termination` | Execute a staged kill (verifies create\_time). The response carries `audit_id`, the id of the kill's audit row |
| `GET` | `/api/alerts` | Alert history. Filters: `from`, `to`, `metric`, `level`, `limit` |
| `GET` | `/api/metrics/history` | CPU/RAM/disk over time. `range` (`1h`, `6h`, `24h`, `7d`) or `from` + `to` |
| `GET` | `/api/kills` | Processes killed in the last `hours` (1 to 168, default 24), newest first, each with `tier`, `can_restore` and `restore_blocked_reason`. Also `backend_elevated` |
| `POST` | `/api/rollback` | Restore one kill: `{ "id": "<audit_id>" }`. Starts the recorded program with its recorded arguments, at most once |
| `WS` | `/ws` | `metrics_update` every 2s, `threshold_alert` when a limit is exceeded, `alert_event` when a stored alert starts, changes or ends |

### Error codes returned in `detail.code`

| Code | HTTP | Meaning |
|---|---|---|
| `tier1_blocked` | 403 | Tier 1 system process — always rejected |
| `self_protected` | 403 | The PID is KavanMCP itself or the process that launched it |
| `forbidden_origin` | 403 | The request came from a web origin other than the app |
| `access_denied` | 403 | Needs Administrator rights |
| `not_approved` | 409 | PID not staged or approval expired |
| `pid_reused` | 409 | A different process now holds this PID |
| `not_found` | 404 | Process already exited, or no kill has that id |
| `already_restored` | 409 | That kill was restored already |
| `no_path`, `exe_missing` | 422 | The kill has no recorded executable, or it is no longer on disk |
| `launch_failed` | 500 | Windows refused to start the program. The kill stays restorable, so it can be retried |
| `invalid_range`, `range_too_short`, `range_too_long` | 400 | A history window that is reversed, under 10 minutes or over 7 days |
| `error` | 500 | Unexpected failure |

---

## Security Model

```mermaid
graph LR
    subgraph Tier1["🔴 Tier 1 — HARD LOCKED"]
        t1p["explorer.exe · lsass.exe\nsvchost.exe · csrss.exe\nwininit.exe · services.exe\nsmss.exe · System · taskmgr.exe"]
    end

    subgraph Tier2["🟠 Tier 2 — Single Confirmation"]
        t2p["VS Code · Visual Studio · Chrome\nEdge · Firefox · Slack\nDiscord · Spotify · OBS"]
    end

    subgraph Tier3["🟡 Tier 3 — Dual Confirmation"]
        t3p["Everything else:\nbackground helpers,\nupdaters, other apps"]
    end

    subgraph Tier4["🔵 Tier 4 — High-Risk Alert"]
        t4p["No visible window\nand over 25% CPU"]
    end

    Lock["🔒 Approval Cache\n5-min TTL · Single-use\nPID identity check"] --> Kill["🎯 Termination\nSIGTERM → SIGKILL"]

    Tier1 --> |REJECTED at API| Lock
    Tier2 --> Lock
    Tier3 --> Lock
    Tier4 --> Lock
```

Tier 1 is enforced at **four independent layers**:
1. `stage_termination` — rejects at the staging step, logs the attempt and never adds to the approval cache
2. `execute_approved_termination` — re-checks tier at the kill gate (defence in depth)
3. `_terminate_blocking` — checks once more directly in front of the OS call, so no caller can skip it
4. `KillConfirmModal` — disables the Confirm button in the UI so the request is never sent

---

<div align="center">
  <br/>
  <p>Built by <a href="https://github.com/Rahul-8283"><strong>Rahul L S</strong></a></p>
  <p><sub>KavanMCP V2 · Production Grade</sub></p>
</div>
