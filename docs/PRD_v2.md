# Product Requirements Document (PRD) - KavanMCP V2

## 1. Executive Summary
Kavan V2 represents the next major evolutionary step for the KavanMCP project. While Version 1 successfully established a secure, AI-driven process management backend (FastMCP) controlled entirely via the Claude Desktop text interface, Version 2 introduces a dedicated, real-time Desktop Application built with Tauri and React.

The objective of V2 is to transform Kavan from a purely "reactive" conversational tool into a "proactive" dual-interface platform. It provides users with immediate, glanceable system health metrics, passive background alerting, and instant UI-driven execution capabilities, all while maintaining the strict 4-Tier Security Engine that prevents catastrophic system failures.

---

## 2. Problem Statement & Motivation
In V1, users must actively prompt the LLM to discover system issues (e.g., "Why is my laptop slow?"). This introduces conversational friction and delays execution. 
- **Lack of Passive Awareness:** Users do not know when their CPU or RAM spikes unless they manually ask Claude or open the native Windows Task Manager.
- **High Latency for Simple Actions:** If a user already knows that `Discord.exe` is hogging memory, forcing them to type a request to Claude rather than just clicking a "Kill" button is inefficient.
- **Limited Visual Data:** Text-based LLM outputs cannot efficiently convey live, oscillating metrics (like a bouncing CPU gauge).

**The Solution:** A lightweight Tauri desktop application that runs in the background, pushes metrics via WebSockets to visually rich dashboards, and allows instant user intervention, while seamlessly sharing the same SQLite audit database as the Claude agent.

---

## 3. Product Principles
1. **Push Over Poll:** The desktop application must not aggressively poll the backend for metrics. All real-time data must be pushed from the FastMCP server via WebSockets to minimize CPU overhead.
2. **Zero-Lock Concurrency:** The Tauri UI and the Claude MCP instance must be able to read and write to the same `process.db` SQLite file simultaneously without corrupting the audit trail.
3. **Local-First & Offline:** Absolutely no external API keys, telemetry, or cloud databases. 
4. **Ironclad Safety:** The desktop UI must enforce the exact same Tier 1 (System Critical) process protections as the LLM. 
5. **Client-Side Heavy:** The UI must handle heavy data manipulation (sorting/filtering large process lists) to keep the Python backend optimized for system calls.

---

## 4. System Architecture
The V2 architecture relies on a decoupled, three-node ecosystem.

### 4.1 The Core Engine (FastMCP Server)
- **Technology:** Python 3.11+, FastMCP, `psutil`, `pywin32`.
- **Role:** The singular source of truth. It exposes a REST API (`localhost:8000`) and a WebSocket endpoint (`ws://localhost:8000/ws`). It handles the physical termination of processes and manages the SQLite database.
- **Execution:** Runs automatically in the background as a Windows Startup Task.

### 4.2 Interface A: Claude Desktop (Active AI)
- **Connection:** JSON-RPC over `stdio`.
- **Role:** Acts as the intelligent safety net. The user asks abstract questions ("What is slowing down my PC?"), and Claude reasons through the data using the MCP tools to execute commands.

### 4.3 Interface B: Tauri Desktop App (Real-Time GUI)
- **Technology:** Rust (Tauri Core), React, TypeScript, TailwindCSS.
- **Connection:** HTTP/WebSockets to the FastMCP Server.
- **Role:** Provides real-time visual dashboards, OS-level toast notifications, system tray presence, and 1-click manual overrides.

---

## 5. Core Feature Specifications (V2.0)

### 5.1 Real-Time Metrics Dashboard
- **Description:** A visual hub displaying animated gauges for CPU, RAM, and Disk utilization.
- **Data Source:** WebSocket stream pushing updates every 2 seconds.
- **UI/UX:** Gauges dynamically change color based on usage thresholds:
  - **Green:** Normal operation (<70% utilization)
  - **Yellow:** Warning state (70% - 90% utilization)
  - **Red:** Critical state (>90% utilization)

### 5.2 Interactive Process Manager
- **Description:** A comprehensive, tabular view of all active processes on the host machine.
- **Interactions:**
  - **Sorting:** Users can click column headers to sort by CPU %, RAM %, or Alphabetical Process Name (handled client-side).
  - **Filtering:** A dropdown to filter processes exclusively by their assigned Security Tier (1 through 4).
- **Data Rendering:** Each row must display the Process Name, PID, CPU usage, raw Memory usage (MB), and a visually distinct Badge indicating its Security Tier.

### 5.3 Quick-Kill Context Menu & Dual Confirmation
- **Description:** Enables instant process termination directly from the UI.
- **Flow:**
  1. User right-clicks a row in the Process Manager and selects "Terminate".
  2. A **Dual Confirmation Modal** appears, displaying the potential RAM/CPU savings.
  3. The modal dynamically renders warning text based on the Tier (e.g., blocking Tier 1 execution outright, warning heavily for Tier 2).
  4. Upon confirmation, the UI sends the execution command to the backend.

### 5.4 Customizable Alert Thresholds
- **Description:** User-defined sensitivity controls for passive background alerting.
- **UI/UX:** Dedicated settings panel with three interactive range sliders (0-100%) for CPU, RAM, and Disk.
- **Persistence:** Changes are immediately POSTed to the backend and saved to a persistent `config.json` to survive application reboots.

### 5.5 OS-Level Toast Notifications
- **Description:** Ephemeral, native-feeling popups that alert the user to resource spikes without requiring the main app window to be focused.
- **Logic:** Triggered dynamically when the WebSocket stream detects a metric crossing a user-defined threshold.
- **Behavior:** Toasts auto-dismiss after 5 seconds. Rapid successive alerts are queued to prevent screen clutter.

### 5.6 Background System Tray Integration
- **Description:** A persistent `.ico` in the Windows taskbar that communicates system health at a glance.
- **Behavior:**
  - The icon color mirrors the highest current threshold state (Green/Yellow/Red).
  - A flashing animation triggers specifically for Critical (>90%) CPU spikes.
  - Hovering over the icon displays a tooltip with exact live CPU and RAM percentages.
  - Clicking the icon toggles the visibility of the main Tauri application window.

---

## 6. Future Expansion Features (V2.1+)

While V2.0 focuses on real-time operational control, V2.1 will introduce historical context and advanced recovery tools:

1. **Alert History Panel:** A searchable, filterable audit log displaying a timeline of all threshold breaches and process terminations.
2. **24-Hour Performance Graphs:** Interactive line charts utilizing historical database aggregations to visualize prolonged CPU/RAM trends, helping users identify specific times of day when their machine struggles.
3. **Rollback Manager:** A dedicated UI interface for the existing `rollback_last_action` tool, allowing 1-click resurrection of accidentally terminated applications.
4. **Advanced Settings Profiles:** The ability to explicitly whitelist custom applications directly from the GUI, ensuring they are permanently elevated to Tier 1 protection.

---

## 7. Non-Functional Requirements (NFRs)

### 7.1 Performance
- The Desktop Application UI must not consume more than **35MB** of baseline RAM.
- WebSocket payloads must be ultra-lightweight JSON to prevent network-stack throttling on the host OS.
- Sorting a list of 1,000+ processes must execute in under **10ms** utilizing React Virtual DOM optimizations.

### 7.2 Security & Permissions
- The Tauri executable must elegantly handle OS `AccessDenied` rejections if the background Python server was not launched with Administrator privileges.
- Under no circumstances can the UI bypass the backend's hardcoded Tier 1 whitelist. If a user attempts to kill `explorer.exe` via the UI, the backend must violently reject the request and log the attempt.

### 7.3 Data Consistency
- The application must gracefully handle WebSocket disconnections (e.g., if the Python server crashes) and implement automatic exponential backoff for reconnections.
- Concurrent writes to the SQLite `process.db` from Claude (via stdio) and the Desktop App (via HTTP) must resolve safely without `database is locked` errors.
