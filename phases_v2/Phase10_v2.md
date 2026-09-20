# Phase 10: End-to-End Integration & Claude Sync Testing

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 10
Phase 10 is the final milestone before a production release. The objective is to validate the central premise of the V2 architecture: that a standalone GUI application (Tauri) and an AI agent (Claude) can operate simultaneously, seamlessly reading and writing to the exact same backend database without corrupting each other's data.

By the end of Phase 10, we will have proven that Kavan is a true "Dual-Interface" optimization platform. The user can switch fluidly between passive UI interactions and active conversational prompts without the system losing context.

---

## 2. Simultaneous Operation Testing

The first step is ensuring that multiple instances of the backend logic can coexist without fighting for OS resources.

### 2.1 The Boot Sequence
1. Start the FastMCP background server (`main.py`) via the terminal. It binds to `localhost:8000`.
2. Launch the compiled Tauri `.exe`. It connects to `localhost:8000` via HTTP/WebSockets.
3. Launch the Claude Desktop Client. 
   - *Note:* Because Claude reads the `claude_desktop_config.json`, it spins up its *own* separate instance of `main.py` communicating purely over `stdio` pipes.

### 2.2 Coexistence Validation
- **Expected Result:** The Tauri app successfully renders gauges, and Claude successfully responds to "Analyze my system" simultaneously. No port conflicts occur because Claude uses pipes, not TCP ports.

---

## 3. Database Concurrency (The SQLite Acid Test)

Because Claude and the FastMCP server are running as two separate Python processes, they are both attempting to read and write to the singular `mcp-server/data/process.db` SQLite file.

### 3.1 The "Cross-Fire" Test
- **Action:** Open the Tauri App. Rapidly terminate 3 processes using the right-click context menu.
- **Verification (Claude):** Open Claude and prompt: *"What are the last 3 processes that were killed, and who approved them?"*
- **Expected Result:** Claude instantly queries the `audit_log` table and accurately lists the 3 processes you just killed via the UI, proving that the SQLite WAL (Write-Ahead Logging) mode is successfully managing concurrent connections without throwing `database is locked` errors.

### 3.2 The Reverse Sync
- **Action:** Ask Claude to terminate a process (e.g., `calc.exe`). Approve it via Claude's chat.
- **Verification (Tauri):** Check the Tauri UI process list.
- **Expected Result:** `calc.exe` vanishes from the Tauri UI, proving the underlying host OS is accurately reflecting the AI's actions to the human GUI.

---

## 4. High-Stress Environment Validation

### 4.1 The CPU Spike Simulation
- **Action:** Launch a CPU-intensive script (or multiple heavy IDEs) while both Tauri and Claude are running.
- **Verification (Tauri):** The tray icon flashes red. A toast notification slides in immediately. The dashboard gauge hits 95% and turns red.
- **Verification (Claude):** Prompt Claude: *"My PC is lagging, what's causing it?"*
- **Expected Result:** Claude utilizes the `analyze_system` tool and returns the exact same mathematical CPU percentage that the Tauri gauge is currently displaying.

### 4.2 Offline / Edge Case Recovery
- **Action:** Force close Claude Desktop entirely.
- **Expected Result:** The Tauri application is completely unaffected. The background Python server on port 8000 continues streaming metrics without interruption.

---

## 5. Long-Running Stability

A system utility must not consume the resources it is designed to free.

### 5.1 Memory Leak Monitoring
- Leave the Tauri application running (minimized to the tray) for 60 consecutive minutes.
- **Expected Result:** The Tauri process RAM usage remains flatlined at ~35MB. The WebSocket connection does not bloat memory. The background Python server remains below 60MB.

---

## 6. Definition of Done (Success Criteria)

Phase 10 (and the entire V2 project) is considered complete when the following criteria are met:

1. **Simultaneous Execution:** Claude and Tauri operate side-by-side without crashing or blocking each other's execution.
2. **Zero-Lock Concurrency:** Killing a process in the UI instantly registers in Claude's database queries without throwing SQLite lock errors.
3. **Metric Parity:** The CPU and RAM percentages displayed in the Tauri gauges perfectly match the analysis data returned by Claude.
4. **Stress Resilience:** The Tauri app successfully fires native Toast notifications when a real CPU spike occurs, validating the proactive alerting architecture.
5. **Memory Verification:** The combined footprint of the FastMCP background server and the Tauri UI remains extremely lightweight over a prolonged 1-hour session.

Once these rigorous integration checks pass, **KavanMCP V2** is officially Production Ready!
