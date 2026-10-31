<div align="center">
  <img src="desktop/public/kavan_logo.svg" alt="Kavan logo" width="160" />
  <h1>KavanMCP</h1>
  <p><strong>AI-Powered System Optimizer · Dual-Interface · Ironclad Safety</strong></p>
  <p>Find what is slowing your Windows PC, understand why, and end it safely, from a desktop app or by asking Claude.</p>
  <p>
    <a href="https://github.com/Rahul-8283/KavanMCP/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=flat-square" alt="License: Apache 2.0" /></a>
    <img src="https://img.shields.io/badge/version-2.1.5-blue?style=flat-square" alt="Version 2.1.5" />
    <img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?style=flat-square&logo=windows" alt="Windows 10 and 11" />
    <img src="https://img.shields.io/badge/Backend%20tests-641%20passing-brightgreen?style=flat-square" alt="641 backend tests" />
    <img src="https://img.shields.io/badge/Desktop%20tests-81%20passing-brightgreen?style=flat-square" alt="81 desktop tests" />
    <a href="https://kavanmcp.vercel.app"><img src="https://img.shields.io/badge/website-kavanmcp.vercel.app-black?style=flat-square" alt="Website" /></a>
  </p>
  <p>
    <a href="https://kavanmcp.vercel.app"><strong>Website</strong></a> ·
    <a href="#getting-started"><strong>Getting started</strong></a> ·
    <a href="#architecture"><strong>Architecture</strong></a> ·
    <a href="#security-model"><strong>Security</strong></a> ·
    <a href="docs/RELEASE_NOTES_V2_1_5.md"><strong>Release notes</strong></a>
  </p>
</div>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="web/shots-src/dashboard-dark.png" />
    <img src="web/shots-src/dashboard-light.png" alt="The Kavan dashboard: CPU, memory and disk gauges above a table of running processes with security tier badges, and a context menu open on one process." width="900" />
  </picture>
</p>

---

## Table of contents

1. [Overview](#overview)
2. [Why Kavan exists](#why-kavan-exists)
3. [How it works at a glance](#how-it-works-at-a-glance)
4. [See it in action](#see-it-in-action)
5. [Key features](#key-features)
6. [Architecture](#architecture)
7. [Security model](#security-model)
8. [Tech stack](#tech-stack)
9. [Design decisions](#design-decisions)
10. [Project structure](#project-structure)
11. [Getting started](#getting-started)
12. [Configuration](#configuration)
13. [MCP tool reference](#mcp-tool-reference)
14. [REST and WebSocket API reference](#rest-and-websocket-api-reference)
15. [Data and privacy](#data-and-privacy)
16. [Testing](#testing)
17. [The website](#the-website)
18. [Releasing](#releasing)
19. [Roadmap](#roadmap)
20. [Troubleshooting](#troubleshooting)
21. [Documentation index](#documentation-index)
22. [Contributing](#contributing)
23. [License](#license)

---

## Overview

**KavanMCP** (Kavan for short) is a **dual-interface system optimizer for Windows**. It watches your CPU, memory and disk, records what was using them whenever something spikes, and lets you end the right program safely, either by clicking in a real-time desktop dashboard or by asking Claude in plain English.

> *"Claude, my laptop is lagging. Find what's causing it and safely clean it up."*

Two interfaces share one backend and one database:

| Interface | What it is | Best for |
|---|---|---|
| **Kavan desktop app** | A Tauri window and system tray with live gauges, a process table, alert history, trend charts and one-click Undo | Glanceable awareness and instant manual action |
| **Claude Desktop (MCP)** | Seven tools that let Claude look at your system, propose what to close, and act only after you confirm | Asking abstract questions such as "what is slowing my PC?" |

Both are guarded by the same **Ironclad 4-Tier Security Engine**, so no critical Windows process can ever be ended, whether the request comes from you, a script, or an AI.

| At a glance | |
|---|---|
| Version | **2.1.5** |
| Platform | Windows 10 and 11, 64-bit |
| Interfaces | Tauri desktop app, Claude Desktop over the Model Context Protocol |
| MCP tools | 7 |
| API | 9 REST endpoints and 1 WebSocket |
| Database | SQLite in WAL mode, 4 tables |
| Tests | 641 backend and 81 desktop |
| Installer size | About 2.3 MB |
| Privacy | Local only: no cloud, no account, no API key, no telemetry in the app |

---

## Why Kavan exists

The Windows Task Manager shows you hundreds of processes and no answer. When the machine slows down, you have to notice it, open a tool, sort a list, recognise a program name, guess whether it is safe to end, and hope you do not close something that matters. And the moment the spike passes, the evidence is gone.

An AI assistant can reason about that data, but a chat window alone cannot show a live gauge, and giving an AI the power to end processes is only acceptable if it can never end the wrong one.

Kavan was built around those gaps:

```mermaid
flowchart LR
    A["The PC feels slow"] --> B{"Which program<br/>is the cause?"}
    B -->|Task Manager| C["Hundreds of processes<br/>and no answer"]
    B -->|Kavan| D["The cause was recorded<br/>and shown on a graph"]
    D --> E["The tier tells you<br/>how risky it is to end"]
    E --> F["Confirm once.<br/>Undo any time."]
```

| Problem | How Kavan answers it |
|---|---|
| You only find out about a spike if you happen to be looking | Passive monitoring that records history even with the window closed, and native alerts |
| A spike passes and the cause is gone | Every alert stores its peak, the readings at that moment, and the program that was using the most |
| It is hard to tell what is safe to end | Every process is sorted into one of four security tiers |
| Giving an AI control of your PC is risky | A two-step confirm for every kill, and hard locks that no request can bypass |
| Ending the wrong program costs time | One-click restore, from the toast or the Recently Killed page |
| Privacy tools should not phone home | Everything stays on your machine |

### Design principles

| Principle | What it means in practice |
|---|---|
| **Push over poll** | The backend pushes metrics over a WebSocket every 2 seconds. The desktop app never polls for them |
| **Zero-lock concurrency** | The desktop app and Claude's process read and write the same SQLite file at once without corruption (WAL mode) |
| **Local-first** | No external API, no cloud database, no account |
| **Ironclad safety** | The UI enforces exactly the same Tier 1 protection as the backend and as Claude |
| **Human in the loop** | Kavan never ends anything on its own. Every kill is confirmed by a person |
| **Client-side heavy** | Sorting and filtering large process lists happen in the UI, so the backend stays focused on system calls |

---

## How it works at a glance

```mermaid
mindmap
  root((Kavan))
    Watch
      CPU memory and disk every 2 s
      One history row per minute
      Suspicious process scan
    Explain
      Alert history
      Top program for every alert
      Trends from 1 hour to 7 days
    Act
      Right click to terminate
      Two step confirmation
      Undo and Restore
    Protect
      Four security tiers
      Tier 1 can never be ended
      Never kill list
    Connect
      Claude Desktop through MCP
      Seven tools
      Tray and native alerts
```

A typical session:

```mermaid
journey
    title A typical Kavan session
    section Notice
      The PC feels slow: 2: User
      Kavan raises an alert and names the top program: 5: Kavan
    section Understand
      Open Alerts to see what caused it: 4: User
      Open Trends and zoom into the spike: 4: User
    section Act
      Confirm the kill: 4: User
      Kavan records the kill in the audit log: 5: Kavan
    section Recover
      Restore the program if it was a mistake: 5: User
```

---

## See it in action

Captured from the real 2.1.5 app, with synthetic data. The images follow your GitHub theme.

### Alert history

What started it, how high it went, and what was using the most. Open a row to see the readings at that moment, and use **Show on graph** to jump to the chart.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="web/shots-src/alerts-dark.png" />
    <img src="web/shots-src/alerts-light.png" alt="The Alerts page, with one alert expanded to show its CPU, memory and disk readings and the program that was using the most." width="900" />
  </picture>
</p>

### Performance trends

Charts from 1 hour to 7 days. Drag the strip at the bottom to zoom into a spike.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="web/shots-src/trends-dark.png" />
    <img src="web/shots-src/trends-light.png" alt="The Trends page: CPU, memory and disk charts zoomed into a spike, with each limit as a dashed line and the CPU alert shaded in red." width="900" />
  </picture>
</p>

### Recently killed

End the wrong program by mistake? Restore it in one click.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="web/shots-src/killed-dark.png" />
    <img src="web/shots-src/killed-light.png" alt="The Recently Killed page: programs Kavan ended, each with its tier and a Restore button." width="900" />
  </picture>
</p>

### Settings

Thresholds, protected apps, sounds, retention and startup.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="web/shots-src/settings-dark.png" />
    <img src="web/shots-src/settings-light.png" alt="The Settings page: alert thresholds, protected apps, history length, theme, alert sound and start with Windows." width="900" />
  </picture>
</p>

---

## Key features

| Feature | Detail |
|---|---|
| 🔴 **Tier 1 hard lock** | `explorer.exe`, `lsass.exe`, `svchost.exe` and the rest of a 20-name whitelist cannot be ended. The UI disables the Confirm button and the backend rejects the request at four independent layers |
| 🛡️ **PID reuse protection** | Staging stores the process `create_time`. If a different process recycles the same PID before execution, the kill is aborted |
| 🎯 **Single-use approvals** | An approval is consumed the moment it is used, so double-clicks and replays cannot kill twice. It expires after 5 minutes |
| ⚡ **Non-blocking backend** | Long psutil scans run in worker threads (`asyncio.to_thread`), so the event loop never freezes on a heavy process list |
| 📊 **Real-time dashboard** | CPU, memory and disk gauges updated every 2 seconds, colour-coded against your limits |
| 📋 **Virtualised process table** | `@tanstack/react-virtual` renders 800+ processes smoothly, with only the visible rows in the DOM |
| 🔊 **Alert sounds** | Four built-in sounds (chime, pulse, bell, soft), a volume slider and a Test button. A breach sounds once when it starts, not on every repeat |
| 🛡️ **Protected apps** | A never-terminate list is enforced in the backend, at the kill gates and in front of the OS call, so neither the app nor Claude can end a listed process. A never-alert list keeps a program's alerts in the history, marked muted, without a toast or sound |
| ↩️ **Undo and Restore** | A killed program is relaunched from its stored executable path with its original arguments, at most once. The toast after a kill offers Undo, and the Recently Killed page lists the last 24 hours or 7 days |
| 🗃️ **Continuous history** | One row of CPU, memory and disk per minute and one row per alert episode, whether or not the window is open. Metrics are kept 7 days, alerts 7, 14 or 30 days |
| 📜 **Alert history** | Every alert with its start and end, peak, the readings at that moment, and the top process at the time. Filter by date, type and severity. Updates live without polling |
| 📈 **Performance trends** | Charts from 1 hour to 7 days with peak band, limit line and alert regions. Drag to pan and zoom, and zooming loads finer detail. A period with no data is drawn as a gap, never joined across |
| 🕵️ **Suspicious-process watch** | A scan once a minute raises an alert for any process with no window using over 25% CPU, even when the dashboard is closed |
| 🚀 **Start with Windows** | The app can start its own backend at sign-in, in the tray, and a second launch brings the first window forward |
| 🔔 **Native notifications** | Windows Action Center alerts fire on CPU and memory spikes even when the window is hidden |
| 🗂️ **System tray** | Left-click restores the window, right-click opens the menu, and the icon colour reflects the alert state |
| 🤝 **Dual-interface concurrency** | WAL mode lets the desktop backend and Claude's process read and write simultaneously without lock errors |

---

## Architecture

### System overview

```mermaid
graph TB
    subgraph User["User interfaces"]
        Claude["Claude Desktop<br/>MCP client"]
        GUI["Kavan desktop app<br/>Tauri window and tray"]
    end

    subgraph Backend["Python backend on 127.0.0.1:8000"]
        direction TB
        MCP["FastMCP server<br/>stdio transport"]
        API["FastAPI server<br/>HTTP and WebSocket"]
        Security["4-Tier security engine"]
        Approval["Approval cache<br/>5 minute TTL"]
        Terminator["Termination handler"]
        Recorder["History recorder<br/>and process watch"]
    end

    subgraph OS["Operating system"]
        psutil["psutil<br/>metrics and process info"]
        win32["pywin32<br/>window detection"]
        Kill["Process termination<br/>terminate then kill"]
    end

    subgraph Data["Persistence"]
        DB[("SQLite WAL<br/>process.db")]
        Config["data/settings.json<br/>thresholds and protected apps"]
        Whitelist["tier_1_processes.json<br/>hard locked whitelist"]
    end

    Claude -->|"stdio pipes"| MCP
    GUI -->|"HTTP REST"| API
    GUI <-->|"WebSocket<br/>real-time metrics"| API

    MCP --> Security
    API --> Security
    Security --> Whitelist
    Security --> Approval
    Approval --> Terminator
    Terminator --> Kill

    MCP --> psutil
    API --> psutil
    Recorder --> psutil
    psutil --> OS
    win32 --> OS

    Terminator --> DB
    Recorder --> DB
    MCP --> DB
    API --> Config
```

### Runtime topology: who runs where

Claude Desktop starts its own copy of `main.py` for the MCP transport, and the Kavan app starts a second one in dashboard-only mode. **Only one process can own port 8000**, and that process is the one that serves the dashboard and records history. The other still provides the MCP tools, so nothing is recorded twice.

```mermaid
flowchart TB
    subgraph PC["Your Windows PC"]
        CD["Claude Desktop"]
        TA["Kavan desktop app<br/>Tauri window and tray"]
        subgraph PA["Process A: MCP instance"]
            M1["main.py<br/>FastMCP over stdio"]
        end
        subgraph PB["Process B: dashboard backend"]
            M2["main.py --dashboard-only<br/>FastAPI on 127.0.0.1:8000"]
        end
        DB[("process.db<br/>SQLite WAL")]
        ST["settings.json"]
    end
    CD -->|"starts, stdio"| M1
    TA -->|"starts hidden"| M2
    TA <-->|"HTTP and WebSocket"| M2
    M1 --> DB
    M2 --> DB
    M1 --> ST
    M2 --> ST
    M1 -.->|"port already taken: tools only"| M2
```

### Backend layers

```mermaid
flowchart TB
    subgraph Transport["Transport"]
        T1["server.py<br/>7 MCP tools"]
        T2["ws_server.py<br/>REST and WebSocket"]
        T3["routes<br/>history and kills"]
    end
    subgraph Domain["Handlers"]
        H1["classification_handler<br/>the 4 tier engine"]
        H2["approval_handler<br/>stage, expire, single use"]
        H3["termination_handler<br/>kill and rollback"]
        H4["history_recorder and process_watch<br/>minute rows, alert episodes, scans"]
        H5["protection<br/>never kill list and self protection"]
    end
    subgraph Infra["Infrastructure"]
        I1["integrations<br/>psutil and pywin32"]
        I2["config<br/>whitelist and settings"]
        I3["database<br/>aiosqlite in WAL mode"]
        I4["utils<br/>logger, schemas, errors, time"]
    end
    T1 --> H1
    T1 --> H2
    T1 --> H3
    T2 --> H1
    T2 --> H2
    T2 --> H3
    T2 --> H4
    T3 --> I3
    H1 --> I2
    H2 --> H5
    H3 --> I3
    H3 --> I1
    H4 --> I1
    H4 --> I3
    H5 --> I2
```

### Dual-interface data flow

```mermaid
sequenceDiagram
    participant U as User
    participant G as Tauri GUI
    participant A as FastAPI :8000
    participant M as FastMCP (stdio)
    participant S as Security engine
    participant DB as SQLite WAL

    par WebSocket stream
        A-->>G: metrics_update every 2 s
    and REST flow
        U->>G: Right-click, Terminate
        G->>A: POST /api/confirm_termination
        A->>S: stage_termination(pid)
        S-->>A: tier 3, status pending
        A-->>G: 200 OK
        G->>U: Show the confirm dialog
        U->>G: Click Confirm
        G->>A: POST /api/execute_termination
        A->>S: Verify create_time and tier
        A->>DB: Log the termination
        A-->>G: 200 success
        G-->>U: Row removed and a success toast
    and MCP flow
        U->>M: Close the calculator
        M->>S: confirm_termination for the pid
        S-->>M: Staged, awaiting confirmation
        M-->>U: Staged. Confirm?
        U->>M: Yes
        M->>S: execute_termination for the pid
        S->>DB: Log the termination
        M-->>U: Done. Freed 15 MB
    end
```

### Monitoring and history pipeline

The backend keeps recording whether or not the window is open.

```mermaid
flowchart LR
    subgraph Sample["Every 2 seconds"]
        S1["psutil<br/>CPU, memory, disk"]
    end
    S1 --> WS1["WebSocket<br/>metrics_update"]
    S1 --> AGG["MinuteAggregator<br/>30 samples per minute"]
    S1 --> EP["EpisodeTracker<br/>over a limit?"]
    AGG --> MH[("metrics_history")]
    EP --> AE[("alert_events")]
    EP --> WS2["WebSocket<br/>threshold_alert and alert_event"]
    subgraph Scan["Every minute"]
        PW["ProcessWatcher<br/>no window and over 25% CPU"]
    end
    PW --> AE
    PRUNE["history_pruner"] --> MH
    PRUNE --> AE
```

### Alert episode lifecycle

An alert is one **episode**, not one message per breach. Alerts repeat every 3 seconds while a value stays over its limit, so storing each would flood the history.

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Ongoing: A value goes over its limit
    Ongoing --> Ongoing: Peak and readings are updated
    Ongoing --> Closed: The value stays under the limit for 30 s
    Ongoing --> Closed: A process alert is missed by two scans
    Ongoing --> Closed: The backend restarts and closes orphaned episodes
    Closed --> Idle: Kept for 7, 14 or 30 days
    note right of Ongoing
        The first toast is held for about 2 s
        so it can name the program using the CPU right now
    end note
```

### WebSocket connection states in the app

```mermaid
stateDiagram-v2
    [*] --> Connecting
    Connecting --> Online: The socket opens
    Online --> Online: metrics_update every 2 s
    Online --> Offline: The socket closes or fails
    Offline --> Backoff: Wait, doubling each try
    Backoff --> Connecting: The timer ends
```

### Desktop app structure

```mermaid
flowchart TB
    BE["Backend<br/>WebSocket and REST"] --> HWS["useWebSocketConnection<br/>reconnect with backoff"]
    HWS --> MET["MetricsContext"]
    HWS --> AH["AlertHistoryContext"]
    HWS --> SND["alertSound<br/>one sound per alert"]
    HWS --> TST["ToastContext"]

    subgraph Contexts["Shared state"]
        CFG["ConfigContext"]
        MET
        PRC["ProcessContext"]
        AH
        NAV["NavigationContext"]
        TST
    end

    subgraph Pages["Pages"]
        PD["Dashboard"]
        PA["Alerts"]
        PT["Trends"]
        PK["Recently Killed"]
        PS["Settings"]
    end

    API["api.ts<br/>Axios client"] --> PRC
    API --> CFG
    API --> AH
    Contexts --> Pages
    HPM["useProcessManager<br/>kill cascade and Undo"] --> PD
    HKH["useKillHistory<br/>restore one at a time"] --> PK
```

### Tauri shell startup

```mermaid
sequenceDiagram
    participant W as Windows
    participant T as Kavan app
    participant B as Backend process

    W->>T: Start, or sign in with --minimized
    T->>T: Single instance check. A second launch focuses the first
    T->>T: Read the saved backend location
    alt Backend already answering on port 8000
        T->>T: Use it
    else Not answering
        T->>B: Start python main.py --dashboard-only, no console window
    end
    T->>B: Open the WebSocket and call the REST API
    Note over T,B: On quit, only the backend that Kavan started is stopped
```

### Settings persistence

```mermaid
flowchart LR
    UI["Settings page"] -->|"POST /api/update_thresholds"| V{"Valid<br/>per Pydantic?"}
    V -->|No| E["400, nothing saved<br/>the UI rolls back"]
    V -->|Yes| M["settings_manager<br/>merge with defaults"]
    M --> F[("data/settings.json")]
    M --> R{"Retention<br/>changed?"}
    R -->|Yes| PR["Prune old alerts now<br/>in a background task"]
    R -->|No| D["Done"]
```

### Database schema

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
        INTEGER tier "tier the user confirmed"
        DATETIME rolled_back_at "NULL if not restored"
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

`metrics_history` is kept for 7 days and closed alerts for 7, 14 or 30 days, as chosen in Settings. `system_baselines` is created but not written to yet (it is reserved for the V2.2 plan).

---

## Security model

Kavan gives an AI, and a UI, the ability to end processes. The security model exists so that this is only ever possible for the right processes, with a person's consent.

### The four tiers

```mermaid
flowchart TD
    Start(["Process identified"]) --> T1{"In the Tier 1<br/>whitelist?"}

    T1 -->|Yes| Block1["TIER 1: HARD BLOCK<br/>Termination forbidden<br/>Attempt is logged"]
    T1 -->|No| T2{"A known essential app?<br/>editor, browser, ..."}

    T2 -->|Yes| Tier2["TIER 2: Essential<br/>Warning and confirmation"]
    T2 -->|No| T4{"No visible window<br/>and over 25% CPU?"}

    T4 -->|Yes| Tier4["TIER 4: Unverified<br/>Flagged as suspicious"]
    T4 -->|No| Tier3["TIER 3: Optional<br/>Background helper"]

    Tier2 --> Gate["Approval cache<br/>5 minute TTL, single use"]
    Tier3 --> Gate
    Tier4 --> Gate

    Gate --> PID{"Same process?<br/>create_time matches"}
    PID -->|No| Block2["PID REUSE DETECTED<br/>Termination aborted"]
    PID -->|Yes| T1Check{"Re-check Tier 1<br/>defence in depth"}
    T1Check -->|Is Tier 1| Block3["CRITICAL BLOCK<br/>Logged and aborted"]
    T1Check -->|Safe| Execute["Execute<br/>terminate, wait 3 s, kill"]
    Execute --> Audit[("Audit log<br/>freed MB, CPU, pid,<br/>reasoning")]
```

| Tier | Name | Examples | What happens |
|---|---|---|---|
| **1** | System | `explorer.exe`, `lsass.exe`, `svchost.exe`, `csrss.exe`, `wininit.exe`, `services.exe`, `smss.exe`, `System`, `taskmgr.exe` | Can never be ended, by you or by Claude |
| **2** | Essential | Editors, browsers, chat and media apps | A clear warning, then your confirmation |
| **3** | Optional | Background helpers, updaters, other apps | Safe to end if you need the resources |
| **4** | Unverified | An unknown program with no window using over 25% CPU | Flagged as suspicious |

### Defence in depth

Tier 1 is enforced at **four independent layers**, so a bug in one does not open a hole:

```mermaid
flowchart LR
    L1["1. KillConfirmModal<br/>Confirm is disabled in the UI"] --> L2["2. stage_termination<br/>rejects, logs, never stages"]
    L2 --> L3["3. execute_approved_termination<br/>re-checks the tier"]
    L3 --> L4["4. _terminate_blocking<br/>checks again, right before the OS call"]
    L4 --> OS["Windows"]
```

### The local-only request guard

CORS alone is not enough: it only stops a browser from *reading* a response, the request still runs, and it does not apply to WebSockets. Kavan adds a guard that rejects foreign requests before they reach any route.

```mermaid
flowchart TD
    R(["Request to 127.0.0.1:8000"]) --> H{"Host is 127.0.0.1 or localhost<br/>on the right port?"}
    H -->|No| X1["403 forbidden_origin<br/>defeats DNS rebinding"]
    H -->|Yes| O{"Origin header present?"}
    O -->|"Yes, and not an app origin"| X1
    O -->|"No, or an app origin"| C["CORS check"]
    C --> RT["Route handler"]
    RT --> P{"PID is Kavan itself<br/>or the process that started it?"}
    P -->|Yes| X2["403 self_protected"]
    P -->|No| T{"Tier 1?"}
    T -->|Yes| X3["403 tier1_blocked<br/>attempt logged"]
    T -->|No| U{"On your never kill list?"}
    U -->|Yes| X4["403 user_protected<br/>attempt logged"]
    U -->|No| OK["Staged for confirmation"]
```

### The two-step kill

```mermaid
stateDiagram-v2
    [*] --> Idle: The user opens the app

    Idle --> ContextMenu: Right-click a process row
    ContextMenu --> Idle: Click outside or press Escape
    ContextMenu --> ConfirmModal: Click Terminate

    ConfirmModal --> Idle: Click Cancel
    ConfirmModal --> Staged: Click Confirm, POST /api/confirm_termination

    Staged --> Blocked: Tier 1, 403 tier1_blocked
    Staged --> Executing: POST /api/execute_termination

    Executing --> RowRemoved: 200 success, row removed
    Executing --> ErrorToast: 403 access_denied, not an administrator
    Executing --> WarningToast: 404 not_found, already closed
    Executing --> ErrorToast: 409 pid_reused, the PID was recycled

    RowRemoved --> Idle: Success toast with Undo
    ErrorToast --> Idle: Toast dismissed
    WarningToast --> Idle: Toast dismissed
    Blocked --> ConfirmModal: Confirm is disabled
```

### Approval lifecycle

```mermaid
stateDiagram-v2
    [*] --> Staged: confirm_termination saves the PID and its create_time
    Staged --> Executed: execute_termination consumes the approval
    Staged --> Expired: 5 minutes pass, swept every 60 s
    Executed --> [*]
    Expired --> [*]
```

### Undo: how a kill is restored

```mermaid
sequenceDiagram
    participant U as User
    participant G as Recently Killed page
    participant A as POST /api/rollback
    participant DB as audit_log
    participant OS as Windows

    U->>G: Click Restore
    G->>A: The id of the kill
    A->>DB: Read the TERMINATED row
    A->>DB: claim_rollback, one atomic UPDATE
    alt Already restored
        DB-->>A: No row changed
        A-->>G: 409 already_restored
    else Claimed
        A->>OS: Start the program with its recorded arguments
        alt Started
            A->>DB: Log the restore
            A-->>G: 200 restored
        else Could not start
            A->>DB: release_rollback, so it can be retried
            A-->>G: 422 or 500 with a reason
        end
    end
```

### Threat model

| Threat | Mitigation |
|---|---|
| A web page you have open calls the local API | The Host and Origin guard answers `403 forbidden_origin`. WebSockets are closed with code 1008 |
| DNS rebinding | The Host header must be `127.0.0.1` or `localhost` on the right port |
| An AI or a script ends a critical Windows process | Tier 1 is enforced at four independent layers |
| An AI ends something without your consent | Every kill is staged, then confirmed. Approvals expire after 5 minutes and work once |
| A PID is recycled between staging and execution | The `create_time` check returns `409 pid_reused` |
| Kavan ends itself or the process that started it | `protected_pids()` returns `403 self_protected` |
| You want a program left alone | The never-terminate list is refused at the gates and in front of the OS call |
| Double-clicks or replayed requests | Approvals are consumed on use. Restores are claimed atomically |
| A hand-edited settings file with bad values | Invalid entries fall back to their defaults before reaching the alert loop |
| Data leaving your PC | The app makes no external requests. See [Data and privacy](#data-and-privacy) |

### What Kavan does not do

- It is **not a sandbox or an antivirus**. Tiers 2 to 4 are heuristics, and you are always the one who confirms.
- Run with **Administrator rights**, Kavan can end more programs. A backend started at sign-in runs without them, so ending a privileged process returns "Permission Denied".
- **Restore starts the program again. It cannot bring back unsaved work.** A restored program runs with the rights of the backend.

---

## Tech stack

<div align="center">

### Backend
[![Python](https://img.shields.io/badge/Python_3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![FastMCP](https://img.shields.io/badge/FastMCP-8A2BE2?style=for-the-badge&logo=anthropic&logoColor=white)](https://gofastmcp.com)
[![SQLite](https://img.shields.io/badge/SQLite_WAL-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org)
[![Pydantic](https://img.shields.io/badge/Pydantic_v2-E92063?style=for-the-badge&logo=pydantic&logoColor=white)](https://docs.pydantic.dev)
[![uvicorn](https://img.shields.io/badge/uvicorn-499848?style=for-the-badge&logo=gunicorn&logoColor=white)](https://www.uvicorn.org)
[![psutil](https://img.shields.io/badge/psutil-2C2D72?style=for-the-badge&logo=linux&logoColor=white)](https://github.com/giampaolo/psutil)
[![pywin32](https://img.shields.io/badge/pywin32-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/mhammond/pywin32)
[![aiosqlite](https://img.shields.io/badge/aiosqlite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://github.com/omnilib/aiosqlite)
[![WebSockets](https://img.shields.io/badge/websockets-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://websockets.readthedocs.io)
[![HTTPX](https://img.shields.io/badge/httpx-0A0A0A?style=for-the-badge&logo=python&logoColor=white)](https://www.python-httpx.org)

### Desktop app
[![Tauri](https://img.shields.io/badge/Tauri_2-FFC131?style=for-the-badge&logo=tauri&logoColor=black)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)](https://rust-lang.org)
[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite_8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Recharts](https://img.shields.io/badge/Recharts_3-22B5BF?style=for-the-badge&logo=apacheecharts&logoColor=white)](https://recharts.org)
[![Axios](https://img.shields.io/badge/Axios-5A29E4?style=for-the-badge&logo=axios&logoColor=white)](https://axios-http.com)
[![Lucide](https://img.shields.io/badge/Lucide_React-F56040?style=for-the-badge&logo=lucide&logoColor=white)](https://lucide.dev)
[![TanStack Virtual](https://img.shields.io/badge/TanStack_Virtual-FF4154?style=for-the-badge&logo=reactquery&logoColor=white)](https://tanstack.com/virtual)

### Website
[![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)
[![Lenis](https://img.shields.io/badge/Lenis-111111?style=for-the-badge&logoColor=white)](https://lenis.darkroom.engineering)
[![sharp](https://img.shields.io/badge/sharp-99CC00?style=for-the-badge&logo=sharp&logoColor=black)](https://sharp.pixelplumbing.com)

### Testing, quality and delivery
[![Pytest](https://img.shields.io/badge/pytest-0A9EDC?style=for-the-badge&logo=pytest&logoColor=white)](https://pytest.org)
[![Vitest](https://img.shields.io/badge/Vitest_5-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev)
[![Ruff](https://img.shields.io/badge/Ruff-D7FF64?style=for-the-badge&logo=ruff&logoColor=black)](https://docs.astral.sh/ruff)
[![ESLint](https://img.shields.io/badge/ESLint_9-4B32C3?style=for-the-badge&logo=eslint&logoColor=white)](https://eslint.org)
[![Mermaid](https://img.shields.io/badge/Mermaid-FF3670?style=for-the-badge&logo=mermaid&logoColor=white)](https://mermaid.js.org)

</div>

### Full list of components

| Layer | Component | Role |
|---|---|---|
| **Backend** | Python 3.11+ | Runtime |
| | FastMCP | Exposes the 7 tools over the Model Context Protocol (stdio) |
| | FastAPI and uvicorn | REST API and WebSocket server on `127.0.0.1:8000` |
| | websockets | WebSocket transport used by uvicorn |
| | Pydantic v2 | Strict request validation |
| | psutil | Metrics and process enumeration |
| | pywin32 | Window detection and deep process inspection |
| | aiosqlite and SQLite (WAL) | The shared database, safe for two processes |
| | httpx | HTTP client used by the test suite |
| **Desktop** | Tauri 2 and Rust | Window, tray, backend start and stop, autostart, single instance |
| | Tauri plugins | `notification`, `opener`, `dialog`, `autostart`, `single-instance` |
| | serde and serde_json | Reading and writing the saved backend location |
| | Microsoft Edge WebView2 | Renders the UI inside the Tauri window on Windows |
| | React 19 and TypeScript | The UI |
| | Vite 8, PostCSS and Autoprefixer | Build and CSS pipeline |
| | Tailwind CSS 4 | Styling with shared design tokens for the dark and light themes |
| | Recharts 3 | Trend charts |
| | TanStack Virtual | Virtualised process and alert tables |
| | Axios | Typed REST client |
| | Lucide React | Icons |
| | Web Audio API | The four alert sounds, with no audio files |
| **Website** | Next.js 16 (static export) | The one-page site in `web/` |
| | Tailwind CSS 4, `next/font` | Styling and self-hosted fonts (Playfair Display, Inter, JetBrains Mono) |
| | Lenis | Smooth scrolling |
| | sharp | Turns screenshots into AVIF and WebP |
| | Vercel, Vercel Analytics, Speed Insights | Hosting, visit counts and page-speed figures for the website only |
| **Testing and quality** | pytest and pytest-asyncio | 641 backend tests |
| | Vitest | 81 desktop tests |
| | Ruff | Python lint |
| | ESLint and `tsc` | Lint and type checks for the desktop app and the website |
| **Delivery** | Tauri bundler, NSIS and WiX | The Windows setup `.exe` and `.msi` |
| | GitHub Releases | Where the installer is published |
| **Docs** | Mermaid | The diagrams in this README |

---

## Design decisions

| Decision | Why | Trade-off |
|---|---|---|
| **Two interfaces, one backend** | A chat window cannot show a live gauge, and a dashboard cannot reason about a vague problem. Sharing the backend means both obey the same rules | The backend must be safe for two clients at once |
| **SQLite in WAL mode** | Claude's process and the desktop backend write the same file at the same time without lock errors, and there is nothing to install or run | Fine for one machine, not for a shared server |
| **WebSocket push, not polling** | Constant polling from the UI costs CPU. A push every 2 seconds is cheaper and always fresh | The app needs reconnect logic, which it has |
| **Tauri, not Electron** | A small installer (about 2.3 MB), and a native tray and notifications | A Rust toolchain is needed to build it |
| **Stage, then execute** | Every kill needs a person to confirm, and a confirmation works once and expires. This is what makes it acceptable to let an AI propose kills | One extra step for the user |
| **Four layers for Tier 1** | A critical process must survive a bug in any single layer | Some duplicated checks, on purpose |
| **A Host and Origin guard on localhost** | A web page in your browser can otherwise reach `127.0.0.1:8000` and the kill endpoints | Non-browser local clients that send no Origin are allowed |
| **Alert episodes, not alert rows** | One breach is one row with a start, an end and a peak, instead of a row every 3 seconds | Slightly more tracking code |
| **Gaps drawn as gaps** | A period with no data (the PC was off) must not look like a flat line | The charts do a little extra work |
| **Client-side sorting and filtering** | Keeps the Python side focused on system calls | The UI holds the whole process list |
| **Virtualised tables** | 800+ processes would otherwise slow the DOM | A little more code in the table |
| **Local-first, no telemetry in the app** | A tool that sees your processes should not send them anywhere | No cloud features, by design |

---

## Project structure

```text
KavanMCP/
├── mcp-server/                      # Python backend
│   ├── main.py                      # Entry point: MCP server, FastAPI, TTL sweeper. --dashboard-only for the app
│   ├── server.py                    # The 7 MCP tool definitions (FastMCP)
│   ├── ws_server.py                 # FastAPI app: REST, WebSocket, request guard, history loops
│   ├── routes/
│   │   ├── history.py               # /api/alerts and /api/metrics/history
│   │   └── kills.py                 # /api/kills and /api/rollback
│   ├── handlers/
│   │   ├── approval_handler.py      # Pending approvals with a TTL
│   │   ├── classification_handler.py# The 4-tier classification
│   │   ├── termination_handler.py   # psutil kill, audit log, rollback
│   │   ├── protection.py            # Never-terminate list and self protection
│   │   ├── alert_handler.py         # Per-process anomaly flags
│   │   ├── history_recorder.py      # Minute aggregation and alert episode tracking
│   │   └── process_watch.py         # Timed scan: Tier 4 alerts, top-process lookup
│   ├── tools/                       # One file per MCP tool
│   ├── config/
│   │   ├── whitelist.py             # Tier 1 whitelist loader
│   │   └── settings_manager.py      # Settings file: validation, defaults, migration
│   ├── database/
│   │   ├── db.py                    # aiosqlite helpers and WAL setup
│   │   └── models.py                # SQL schema and migrations
│   ├── integrations/
│   │   ├── monitor.py               # psutil metrics
│   │   └── windows.py               # pywin32 window detection and deep inspection
│   ├── utils/                       # logger, Pydantic schemas, error wrapper, privileges, time formats
│   ├── resources/
│   │   └── tier_1_processes.json    # The hard-locked whitelist (20 names)
│   ├── scripts/                     # install_deps.bat, run_server.bat, check_admin.bat, test_runner.bat
│   ├── tests/                       # 641 tests, plus aids/ for manual runs
│   └── requirements.txt
│
├── desktop/                         # Tauri 2 and React 19 app
│   ├── src-tauri/
│   │   ├── src/lib.rs               # Commands, backend start and stop, autostart, single instance
│   │   ├── capabilities/default.json# Plugin permissions
│   │   ├── tauri.conf.json          # Window, tray, bundle and version
│   │   └── Cargo.toml
│   └── src/
│       ├── App.tsx                  # Providers and page lookup
│       ├── pages/                   # Dashboard, Alerts, Trends, RecentlyKilled, Settings
│       ├── components/              # dashboard, alerts, trends, rollback, settings, common, layout
│       ├── context/                 # Config, Metrics, Process, AlertHistory, Navigation, Toast
│       ├── hooks/                   # useWebSocketConnection, useProcessManager, useKillHistory, ...
│       ├── services/                # api.ts (Axios) and alertSound.ts (Web Audio)
│       ├── utils/                   # time.ts, series.ts, alertList.ts
│       └── styles/index.css         # Design tokens for both themes
│
├── web/                             # The Next.js website (static export)
│   ├── app/                         # layout, page, robots, sitemap, icons, global styles
│   ├── components/                  # sections/ (Nav, Hero, ...) and ui/ (Button, Card, ...)
│   ├── content/                     # release.json, site.ts, shots.ts
│   ├── scripts/                     # optimize-screenshots, make-icons, og.html
│   ├── shots-src/                   # Source screenshots (PNG)
│   └── public/                      # Optimised screenshots, logo, sharing image
│
├── docs/                            # PRD, TRD, API reference, release notes, website plan
├── phases/                          # V1 build plans
├── phases_v2/                       # V2 build plans (Phase0_v2.md to Phase10_v2.md)
├── phase_v2_1/                      # V2.1 plan and its 8 phase files
├── v2.2/                            # V2.2 plan (not built yet)
├── CLAUDE.md                        # Claude Code development guide
├── LICENSE                          # Apache License 2.0
└── README.md
```

---

## Getting started

### Prerequisites

| Requirement | Needed for | Notes |
|---|---|---|
| Windows 10 or 11, 64-bit | Everything | pywin32 and the tray require Windows |
| Python 3.11 or newer | The backend | `python --version` to check |
| Claude Desktop | The Claude features | Optional. The desktop app works fully without it |
| Administrator rights | Ending system-level programs | Optional. Kavan tells you when it is needed |
| Node.js 20 or newer | Building the app or the website | Only to build from source |
| Rust (stable) | Building the app | `rustup install stable`. Only to build from source |

### Option A: use the installer

1. Download `kavan_2.1.5_x64-setup.exe` from the [latest release](https://github.com/Rahul-8283/KavanMCP/releases/latest) and run it. Check the file against the SHA-256 shown on the release page and on the [website](https://kavanmcp.vercel.app).
2. The installer is not code-signed yet, so Windows may warn about an unknown publisher. Choose **More info**, then **Run anyway**, if you trust the source.
3. The installer does not include Python. Get the `mcp-server` folder from this repository and set up its environment once:

   ```powershell
   cd mcp-server
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```
4. Open Kavan, go to **Settings**, and under **Startup** choose that folder as the **Backend location**. Kavan then starts its own backend, and can start with Windows.

### Option B: run from source

**1. Clone and install the backend**

```powershell
git clone https://github.com/Rahul-8283/KavanMCP.git
cd KavanMCP/mcp-server

python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**2. Run the backend (elevated)**

Run it as Administrator so it can inspect privileged processes.

```powershell
# In an elevated PowerShell
python main.py
```

Or use the script:

```powershell
Start-Process -FilePath ".\scripts\run_server.bat" -Verb RunAs
```

`main.py` starts the MCP server on stdio and the FastAPI server on `http://127.0.0.1:8000`. To run only the dashboard backend, without the MCP transport (this is what the desktop app starts), use `python main.py --dashboard-only`.

**3. Run the desktop app in development**

```powershell
cd ../desktop
npm install
npm run tauri dev
```

**4. Connect Claude Desktop (optional)**

Add this to `%APPDATA%\Claude\claude_desktop_config.json`, with the paths changed to where `mcp-server` is on your PC:

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

Restart Claude Desktop. The Kavan tools appear automatically.

**5. Build the Windows installer**

```powershell
cd desktop
npm run tauri build
```

The first release build takes about ten minutes. The installers are written to `desktop\src-tauri\target\release\bundle\`:

- `nsis\kavan_2.1.5_x64-setup.exe`: the setup program
- `msi\kavan_2.1.5_x64_en-US.msi`: a Windows Installer package

---

## Configuration

Settings live in a JSON file that you can edit by hand, but the app is the normal way to change them. Invalid values fall back to their defaults instead of reaching the alert loop.

| Key | Default | Valid values | Meaning |
|---|---|---|---|
| `cpu_threshold` | `90` | Percent | CPU alert limit |
| `ram_threshold` | `90` | Percent | Memory alert limit |
| `disk_threshold` | `95` | Percent | Disk alert limit |
| `theme` | `"dark"` | `dark`, `light` | The app theme |
| `sound_alerts` | `true` | `true`, `false` | Play a sound when a limit is breached |
| `sound_volume` | `50` | 0 to 100 | Alert volume |
| `sound_choice` | `"chime"` | `chime`, `pulse`, `bell`, `soft` | Which sound plays |
| `alert_retention_days` | `30` | `7`, `14`, `30` | How long closed alerts are kept. A shorter choice applies at once |
| `never_kill` | `[]` | Program names | Programs neither the app nor Claude may end |
| `never_alert` | `[]` | Program names | Programs whose alerts are recorded quietly, marked muted |

### Where data lives

| Item | Default location | Override |
|---|---|---|
| Database (`process.db`) | `mcp-server/data/` | `KAVAN_DATA_DIR` |
| Settings (`settings.json`) | `mcp-server/data/` | `KAVAN_SETTINGS_PATH`, or move with `KAVAN_DATA_DIR` |
| Logs | `mcp-server/logs/` | |
| The saved backend location | The app's config folder | Settings, then Startup |

`settings.json` is not tracked by git. Settings from before 2.1 are copied across on first start.

---

## MCP tool reference

### `analyze_system`
Returns global CPU and memory totals and the top resource users, classified by tier.

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
// Both fields are optional
{ "filter_name": "chrome", "include_tier_1": false }
```

### `explain_process`
Deep inspection of one process before proposing to end it: command line, executable path, parent and children, third-party modules and safety notes.

```jsonc
{ "pid": 1204 }
```

### `confirm_termination`
**The stage gate.** Adds PIDs to the approval cache. Claude must show this list to you before calling `execute_termination`.

```jsonc
{ "pids": [9999, 8888] }
```

### `execute_termination`
**The kill gate.** Only runs PIDs staged by `confirm_termination` within the last 5 minutes.

```jsonc
{ "pids": [9999], "reasoning": "User confirmed; freeing memory." }
```

### `view_audit_log`
Returns the recent termination history from the database.

```jsonc
{ "hours_back": 24 }
```

### `rollback_last_action`
Relaunches the most recent kill of that name or PID that has not been restored yet, from its stored executable path and with its original arguments. A kill already restored through the REST API is skipped.

```jsonc
{ "process_identifier": "notepad.exe" }
```

---

## REST and WebSocket API reference

All endpoints are on `http://127.0.0.1:8000`. CORS is restricted to the Tauri window origins, and a request from any other web origin is refused before it reaches a route.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/list_processes` | All running processes with their tier |
| `GET` | `/api/get_config` | Current thresholds and preferences |
| `POST` | `/api/update_thresholds` | Partially update settings: thresholds, `theme`, `sound_alerts`, `sound_volume` (0 to 100), `sound_choice`, `alert_retention_days` (7, 14 or 30, applied at once), `never_kill`, `never_alert` |
| `POST` | `/api/confirm_termination` | Stage a PID. Tier 1 is rejected immediately |
| `POST` | `/api/execute_termination` | Run a staged kill, verifying `create_time`. The response carries `audit_id` |
| `GET` | `/api/alerts` | Alert history. Filters: `from`, `to`, `metric`, `level`, `limit` |
| `GET` | `/api/metrics/history` | CPU, memory and disk over time. `range` (`1h`, `6h`, `24h`, `7d`) or `from` and `to` |
| `GET` | `/api/kills` | Processes killed in the last `hours` (1 to 168, default 24), newest first, each with `tier`, `can_restore` and `restore_blocked_reason`. Also `backend_elevated` |
| `POST` | `/api/rollback` | Restore one kill by `{ "id": "<audit_id>" }`, at most once |
| `WS` | `/ws` | `metrics_update` every 2 s, `threshold_alert` when a limit is exceeded, `alert_event` when a stored alert starts, changes or ends |

### History bucketing

`/api/metrics/history` returns bucketed points, so a chart never gets more points than it can draw:

| Window | Bucket |
|---|---|
| Up to 2 hours | 60 seconds |
| Up to 12 hours | 5 minutes |
| Up to 48 hours | 15 minutes |
| Longer | 2 hours |

### Error codes returned in `detail.code`

| Code | HTTP | Meaning |
|---|---|---|
| `tier1_blocked` | 403 | A Tier 1 system process, always rejected |
| `self_protected` | 403 | The PID is Kavan itself or the process that started it |
| `user_protected` | 403 | On your never-terminate list. Remove it in Settings to allow the kill |
| `forbidden_origin` | 403 | The request came from a web origin other than the app |
| `access_denied` | 403 | Needs Administrator rights |
| `not_approved` | 409 | The PID was not staged, or the approval expired |
| `pid_reused` | 409 | A different process now holds this PID |
| `not_found` | 404 | The process already exited, or no kill has that id |
| `already_restored` | 409 | That kill was restored already |
| `no_path`, `exe_missing` | 422 | The kill has no recorded executable, or it is no longer on disk |
| `launch_failed` | 500 | Windows refused to start the program. The kill stays restorable, so it can be retried |
| `invalid_range`, `range_too_short`, `range_too_long` | 400 | A history window that is reversed, under 10 minutes or over 7 days |
| `error` | 500 | An unexpected failure |

---

## Data and privacy

Kavan is built so that the data about your machine stays on your machine.

| | |
|---|---|
| **The app and the backend** | Make no external requests. There is no cloud, no account, no API key and no telemetry |
| **The API** | Listens on `127.0.0.1` only, and refuses requests from web pages |
| **What is stored** | CPU, memory and disk history (7 days), alert episodes (7, 14 or 30 days), and a permanent audit log of every kill, block and restore |
| **Where** | A SQLite file and a settings file in the data folder |
| **Claude** | Reads what the MCP tools return. It sees process names and figures when you ask it to look, and nothing else |
| **The website** | A separate project in `web/`. It uses Vercel Analytics and Speed Insights for anonymous visit and page-speed figures, and stores only your theme in the browser |

To remove everything Kavan has stored, uninstall it and delete the `mcp-server/data` folder.

---

## Testing

```mermaid
flowchart TD
    subgraph Backend["Backend: 641 tests (pytest)"]
        B1["Unit<br/>approval, classification, database, monitor"]
        B2["API<br/>termination, kills, alerts, metrics"]
        B3["Security<br/>every route attacked: origins, hosts, hostile input"]
        B4["Resilience<br/>sleep, failing database, time zones, damaged settings"]
        B5["Upgrade<br/>a V2.0.1 database and settings carry over"]
    end
    subgraph Desktop["Desktop: 81 tests (Vitest)"]
        D1["Pure logic<br/>series, time, alert list, rows, wording, presets"]
        D2["Alert sound<br/>volume curve and once per alert"]
    end
    subgraph Manual["By hand: tests/aids"]
        M1["CPU burn and memory hold"]
        M2["Seed history and age rows"]
        M3["Live alert check<br/>real CPU, real backend"]
        M4["24 hour soak schedule"]
    end
    Backend --> Gate{"All green?"}
    Desktop --> Gate
    Gate -->|Yes| Merge["Safe to merge"]
    Manual -.-> Merge
```

### Run the tests

```powershell
# Backend (from mcp-server, with the virtual environment)
venv\Scripts\python.exe -m pytest -q
# 641 passed

# Backend lint
venv\Scripts\python.exe -m ruff check .

# Desktop (from desktop)
npm test
# 81 passed

# Website (from web)
npm run typecheck
npm run lint
npm run build
```

The manual aids in `mcp-server/tests/aids/` create real CPU load or seed a scratch database. They write only to a folder you point `KAVAN_DATA_DIR` at, and refuse to run without it, so they can never touch your real data.

---

## The website

The site in [`web/`](web) is a one-page Next.js pitch site, exported as static files and hosted on Vercel at [kavanmcp.vercel.app](https://kavanmcp.vercel.app).

```mermaid
flowchart LR
    SRC["shots-src<br/>PNG captures"] -->|"npm run shots<br/>sharp"| IMG["public/shots<br/>AVIF and WebP"]
    REL["content/release.json"] --> NEXT
    IMG --> NEXT["next build<br/>static export"]
    NEXT --> OUT["out/"]
    OUT --> V["Vercel"]
    V --> SITE["kavanmcp.vercel.app"]
```

Its download card has three states, chosen by `state` in `web/content/release.json`:

```mermaid
stateDiagram-v2
    [*] --> Soon
    Soon --> Preview: The repository is public
    Preview --> Ready: The installer is published and its details are filled in
    Ready --> Preview: Installer details are missing, so it falls back
    note right of Soon
        Soon: coming soon, no link that can fail
        Preview: source build steps
        Ready: download button, size and SHA-256
    end note
```

```powershell
cd web
npm install
npm run dev      # http://localhost:3000
npm run build    # writes the site to out/
```

Set `NEXT_PUBLIC_SITE_URL` when building for deployment, so the canonical link, sitemap and sharing tags use the right address. See [`web/README.md`](web/README.md) for details.

---

## Releasing

```mermaid
flowchart TD
    A["Bump the version<br/>app, Tauri config, Cargo, MCP server, website"] --> B["npm run tauri build"]
    B --> C["Setup exe and MSI"]
    C --> D["Test install and uninstall<br/>on a clean PC"]
    D --> E["SHA-256 of the exe"]
    E --> F["Tag v2.1.5<br/>GitHub Release with the exe attached"]
    E --> G["Update web/content/release.json"]
    G --> H["Redeploy the website"]
    F --> H
```

The version is set in `desktop/package.json` (and its lock file), `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml` (and `Cargo.lock`), and `mcp-server/server.py`, and is shown on the website through `web/content/release.json`.

---

## Roadmap

### Where the project has been

```mermaid
gantt
    title KavanMCP: completed phases
    dateFormat YYYY-MM-DD
    section V2 foundation
    Phase 0 · Tauri setup              :done, 2026-09-10, 1d
    Phase 1 · App shell and context    :done, 2026-09-11, 2d
    section V2 real-time data
    Phase 2 · WebSocket and gauges     :done, 2026-09-13, 2d
    Phase 3 · Process table            :done, 2026-09-15, 2d
    Phase 4 · Sort and filter          :done, 2026-09-17, 1d
    section V2 UX and config
    Phase 5 · Settings and thresholds  :done, 2026-09-18, 2d
    Phase 6 · Toast alerts             :done, 2026-09-20, 2d
    section V2 OS integration
    Phase 7 · Tray integration         :done, 2026-09-22, 3d
    Phase 8 · Kill flow                :done, 2026-09-25, 5d
    section V2 QA
    Phase 9 · Feature testing          :done, 2026-10-01, 2d
    Phase 10 · E2E and Claude sync     :done, 2026-10-04, 1d
    section V2.1 history
    Phase 1 · Metrics and alert storage :done, 2026-10-05, 1d
    Phase 2 · Alert history page       :done, 2026-10-06, 1d
    Phase 3 · Performance graphs       :done, 2026-10-06, 1d
    Phase 4 · Rollback backend         :done, 2026-10-13, 1d
    Phase 5 · Rollback UI              :done, 2026-10-24, 1d
    Phase 6 · Protected apps and startup :done, 2026-10-30, 1d
    Phase 7 · Sound and retention      :done, 2026-10-30, 1d
    Phase 8 · Complete testing         :done, 2026-10-31, 1d
    section 2.1.5
    Cleanup, website and release       :done, 2026-10-31, 1d
```

### What is planned

V2.2 is a plan only. None of it is available yet. See [`v2.2/PLAN_V2_2.md`](v2.2/PLAN_V2_2.md).

```mermaid
flowchart LR
    NOW["2.1.5<br/>Watch, explain, act, undo"] --> V22
    subgraph V22["V2.2: planned, not built"]
        direction TB
        A["Process baselines<br/>and anomaly detection"]
        B["Smart suggestions<br/>baseline-aware analysis"]
        C["Auto-kill policies<br/>rules you write"]
        D["Behaviour learning"]
        E["Scheduled optimization"]
    end
    classDef planned stroke-dasharray: 5 5
    class A,B,C,D,E planned
```

Tier 1 immunity, confirm-then-execute for Claude, and your never-kill and never-alert lists are not changed by anything on this roadmap.

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| The app shows **Offline** | The backend is not running | Set the **Backend location** in Settings, or start `python main.py` yourself |
| `403 access_denied` when ending a program | The backend does not have Administrator rights | Start the backend elevated. A backend started at sign-in runs without them |
| `409 not_approved` | The approval expired (5 minutes) or was already used | Stage the kill again |
| `409 pid_reused` | A different process took that PID | Refresh the list and stage the kill again |
| `403 user_protected` | The program is on your never-terminate list | Remove it in **Settings**, then **Protected apps** |
| Restore says **File missing** | The program's executable is no longer on disk | Reinstall the program |
| Windows warns about an unknown publisher | The installer is not code-signed yet | Choose **More info**, then **Run anyway** |
| `No Python found at ...` when setting the backend location | The folder has no `venv` | Create the virtual environment in `mcp-server` first |
| Port 8000 is already in use | Another Kavan instance owns it | This is normal when Claude Desktop and the app both run. One instance serves the dashboard, and the other provides tools only |
| `No module named pytest` | The system Python was used | Run `venv\Scripts\python.exe -m pytest -q` from `mcp-server` |

---

## Documentation index

| Document | What it covers |
|---|---|
| [`docs/PRD_v2.md`](docs/PRD_v2.md) | Product requirements for V2: the problem, principles and feature specifications |
| [`docs/TRD_v2.md`](docs/TRD_v2.md) | Technical requirements for V2 |
| [`docs/PRD_v1.md`](docs/PRD_v1.md), [`docs/TRD_v1.md`](docs/TRD_v1.md), [`docs/API_v1.md`](docs/API_v1.md) | The V1 backend |
| [`docs/RELEASE_NOTES_V2_1_5.md`](docs/RELEASE_NOTES_V2_1_5.md) | What changed in 2.1.5 |
| [`docs/RELEASE_NOTES_V2_1.md`](docs/RELEASE_NOTES_V2_1.md) | What changed in 2.1.0, including upgrade notes |
| [`docs/WEBSITE_PLAN.md`](docs/WEBSITE_PLAN.md) | The plan behind the website |
| [`phase_v2_1/PLAN_V2_1.md`](phase_v2_1/PLAN_V2_1.md) | The V2.1 plan and its phase files |
| [`v2.2/PLAN_V2_2.md`](v2.2/PLAN_V2_2.md) | The V2.2 plan (not built) |
| [`CLAUDE.md`](CLAUDE.md) | The development guide for Claude Code |
| [`web/README.md`](web/README.md) | How to edit, build and deploy the website |

---

## Contributing

Contributions and bug reports are welcome.

```mermaid
flowchart LR
    I["Open an issue<br/>or pick one"] --> BR["Create a branch<br/>from main"]
    BR --> CH["Make the change<br/>small commits"]
    CH --> CK["Run the checks<br/>pytest, ruff, npm test"]
    CK --> PR["Open a pull request"]
    PR --> RV["Review"]
    RV --> MG["Merge to main"]
    MG --> TG["Tag a release"]
```

- Use short, conventional commit messages, as the history does: `feat`, `fix`, `docs`, `test`, `refactor`, `style` and `chore`, with an optional scope such as `feat(web):`.
- Run `pytest` and `ruff check .` in `mcp-server`, and `npm test` in `desktop`, before opening a pull request. Add a test for any behaviour you change.
- **Never weaken the Tier 1 protection.** Any change that touches the security engine needs a test showing a Tier 1 process still cannot be ended.
- Do not commit secrets, personal data, or your own `settings.json`.
- Please report security problems privately, for example through GitHub Security Advisories on this repository, rather than in a public issue.

---

## License

Licensed under the **Apache License 2.0**. See [`LICENSE`](LICENSE).

---

<div align="center">
  <br/>
  <p>Built by <a href="https://github.com/Rahul-8283"><strong>Rahul L S</strong></a> · <a href="https://www.linkedin.com/in/rahul-ls">LinkedIn</a></p>
  <p><sub>KavanMCP v2.1.5 · Apache License 2.0</sub></p>
</div>
