# Product Requirements Document (PRD)
## KavanMCP - Version 1.0 (FastMCP Server)

**Date:** September 2026
**Document Status:** Active / V1 Draft
**Product Name:** KavanMCP
**Focus:** AI-Powered System Optimization via Model Context Protocol (MCP)

---

## 1. Executive Summary
Modern operating systems frequently suffer from background bloat—rogue updaters, forgotten applications, and memory leaks that quietly consume CPU and RAM. While users can open Task Manager to hunt these down, it requires technical knowledge and manual effort. 

**KavanMCP** solves this by acting as an intelligent, local bridge between the Operating System and Large Language Models (LLMs) like Claude or ChatGPT. By running a FastMCP server locally, users can converse with their AI assistant to diagnose system lag, identify resource hogs, and safely terminate unnecessary processes—all protected by an ironclad, multi-tier security engine that prevents accidental system crashes.

---

## 2. Goals & Objectives
1. **Seamless Diagnostics:** Allow LLMs to fetch high-fidelity, low-latency system metrics (CPU, RAM, Disk I/O) on demand.
2. **Absolute Safety:** Implement a rigorous classification system that physically prevents the LLM or user from accidentally terminating critical OS components.
3. **User Agency:** Enforce a double-confirmation workflow for all high-risk or optional process terminations.
4. **Auditability:** Maintain a 100% accurate, local SQLite ledger of every action taken, allowing for 24-hour rollback capabilities.
5. **Zero Cloud Telemetry:** All system data remains strictly local; the only data sent out is the text prompt via the user's chat client.

---

## 3. Scope Definition

### 3.1 In Scope for V1
- **Core Server:** A lightweight, Python-based `FastMCP` server daemon.
- **System Integration:** Deep OS hooks using `psutil` (cross-platform metrics) and `pywin32` (Windows-specific deep inspection).
- **Security Engine:** The proprietary 4-Tier Process Classification System.
- **Stateful Approvals:** A dual-confirmation manager that tracks pending terminations.
- **Audit Logging:** Local SQLite integration (`aiosqlite`) tracking all terminations and baselines.
- **Tool Exposing:** MCP tools specifically designed for LLM consumption (`analyze_system`, `list_processes`, etc.).

### 3.2 Out of Scope for V1 (Deferred to V2)
- **Tauri Desktop GUI:** Visual system tray, real-time graphs, and native desktop notifications.
- **Remote Telemetry:** Monitoring PCs over a network.
- **Auto-Kill Daemons:** The system will *not* kill processes autonomously in V1. An explicit LLM request + user confirmation is always required.

---

## 4. User Personas
- **The Developer / Power User:** Has 4 IDE windows, 50 browser tabs, and multiple Docker containers running. Wants to quickly ask the AI "what is eating my RAM right now?" and instantly clear out dead background processes without breaking their active build.
- **The Cautious Professional:** Experiences laptop overheating and fan noise. Doesn't understand Task Manager well enough to know if `svchost.exe` or `UpdateTask.exe` is safe to close. Relies on KavanMCP to safely curate and explain what can be stopped.

---

## 5. Functional Requirements (FR)

### FR1: Real-Time System Monitoring
- **FR1.1:** The server must query global CPU utilization, RAM usage, and active thread counts.
- **FR1.2:** The server must retrieve individual process metrics (PID, Name, Executable Path, CPU%, Memory MB).
- **FR1.3:** Metrics must be formatted into clean, token-efficient JSON for LLM consumption.

### FR2: The 4-Tier Security & Classification Engine
- **FR2.1 (Tier 1 - Critical):** The system must load a static whitelist (e.g., `explorer.exe`, `lsass.exe`, `System`). These processes are **HARD LOCKED**. Any request to terminate them must be intercepted and rejected by the server before executing OS commands.
- **FR2.2 (Tier 2 - Essential):** The system must identify user workspace apps (VS Code, browsers) and require a single, explicit confirmation to close.
- **FR2.3 (Tier 3 - Optional):** The system must identify background tasks and updaters. These require a **Dual Confirmation** workflow.
- **FR2.4 (Tier 4 - Suspicious):** The system must flag anomalies (e.g., high CPU usage with no visible UI window) and append a high-risk warning to the LLM prompt.

### FR3: The Dual-Confirmation Workflow
- **FR3.1:** When the LLM decides to terminate a Tier 3/4 process, it must first call a `confirm_termination` tool.
- **FR3.2:** The server places the PID in a temporary "Pending Approval" state with a 5-minute timeout.
- **FR3.3:** The server returns a structured warning message that the LLM must present to the user.
- **FR3.4:** Only after the user says "Yes, I am sure", the LLM calls `execute_termination`, which validates the pending state and executes the kill.

### FR4: Safe Process Termination
- **FR4.1:** The system must use OS-level kill signals (`taskkill /F` via `subprocess` or `psutil.kill()`).
- **FR4.2:** The system must verify if the termination was successful and calculate the exact amount of RAM/CPU freed.

### FR5: Local Audit Trail
- **FR5.1:** Every successful termination must be logged to a local SQLite database (`audit.db`).
- **FR5.2:** Log schema must include: Timestamp, PID, Process Name, Executable Path, Memory Freed, CPU Freed, and User Confirmation Status.

---

## 6. Non-Functional Requirements (NFR)

- **NFR1 (Latency):** System queries to `psutil` must execute in under 100 milliseconds to prevent LLM timeout.
- **NFR2 (Resource Efficiency):** The FastMCP Python daemon itself must idle at less than 50MB of RAM and < 1% CPU.
- **NFR3 (Cross-Platform readiness):** While deeply optimized for Windows (`pywin32`), core logic must fall back gracefully to `psutil` standard methods for future Linux/macOS portability.
- **NFR4 (Security):** The server must never expose an unprotected public HTTP endpoint. Communication is strictly via MCP local stdio or local SSE.

---

## 7. FastMCP Tool Specifications

The server will expose the following specific tools to the LLM:

1. **`analyze_system()`**
   - *Description:* Returns a global health check, including current CPU/RAM totals and the top 5 resource hogs grouped by Tier.
2. **`list_processes(filter_name: str = None)`**
   - *Description:* Allows the LLM to search for specific processes by name or list all non-essential processes.
3. **`explain_process(pid: int)`**
   - *Description:* Performs deep inspection on a single PID. Returns loaded DLLs, command-line launch arguments, and parent/child relationships to determine if it is safe to kill.
4. **`confirm_termination(pids: List[int])`**
   - *Description:* The strict safety gate. Moves PIDs into a pending state and returns the mandatory legal/safety warning the LLM must show the user.
5. **`execute_termination(pids: List[int])`**
   - *Description:* Executes the OS kill command *only* if the PIDs are in the pending approval state.

---

## 8. Edge Cases & Error Handling

| Scenario | Expected System Response |
| :--- | :--- |
| **Process closes itself naturally before LLM executes kill** | `execute_termination` returns a Graceful Ignore message indicating the PID no longer exists. |
| **LLM Hallucinates a PID** | Server validates PID existence. Returns an Error Validation to the LLM preventing execution. |
| **Missing Administrator Privileges** | Windows API throws `Access Denied`. Server catches exception and returns a prompt instructing the user to restart the FastMCP daemon as Administrator. |
| **Attempting to kill a Tier 1 Process** | Server immediately intercepts. Logs a "Blocked Critical Action" event. Returns a hard refusal to the LLM. |

---

## 9. Success Metrics
- **Performance:** System analysis returns to the LLM in under 1 second.
- **Reliability:** 0% rate of accidental Tier 1 process terminations.
- **Adoption:** Successful handshake and reliable operation via Claude Desktop.

---
*End of PRD - KavanMCP V1*
