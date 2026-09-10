# Phase 6: Safe Process Termination & Rollback

**Project:** KavanMCP (V1)
**Phase:** 6
**Status:** Ready for Execution
**Focus:** OS-Level Process Execution, Metric Capture, and Disaster Recovery

---

## 1. Executive Overview

Phase 6 introduces the actual "kill switch" to KavanMCP. Up until this point, our server has only been observing the operating system and classifying risk. Now, we will grant it the power to act.

Because we have spent the previous phases establishing a rigorous 4-Tier classification system (Phase 3) and an ironclad Stateful Approval Manager (Phase 5), we can implement termination logic with absolute confidence. 

Furthermore, this phase implements a critical safety net: **The Rollback Engine**. If a user accidentally confirms the termination of a background updater or application they actually needed, they can simply ask Claude to "undo it," and the server will utilize its SQLite audit logs to re-launch the application exactly as it was.

---

## 2. Goals & Objectives

1. **Stateful Execution:** Ensure that a kill command can *only* be executed if the targeted PID actively exists in the `PENDING_APPROVALS` dictionary.
2. **Graceful Termination:** Implement a two-step kill process via `psutil` (polite termination request, followed by a forceful kill if it hangs).
3. **Metric Capture:** Right before execution, snapshot the exact RAM and CPU usage of the process so it can be accurately logged to the SQLite database.
4. **Disaster Recovery (Rollback):** Build the logic to query the database for a recently killed process and re-launch it using `subprocess.Popen`.
5. **Tool Registration:** Expose the `execute_termination` and `rollback_termination` tools to the LLM.

---

## 3. Step-by-Step Implementation Guide

### Step 3.1: The Core Termination Logic (`handlers/termination_handler.py`)

This handles the physical interaction with the Windows kernel.
- **Action:** Create `mcp-server/handlers/termination_handler.py`.
- **Implementation Note:**
  ```python
  import psutil
  from database.db import log_termination

  async def terminate_process(pid: int, reasoning: str) -> dict:
      try:
          proc = psutil.Process(pid)
          
          # Snapshot metrics before death
          mem_mb = proc.memory_info().rss / (1024 * 1024)
          cpu_pct = proc.cpu_percent(interval=0.1)
          name = proc.name()
          path = proc.exe()
          
          # Attempt graceful termination first
          proc.terminate()
          try:
              proc.wait(timeout=3)
          except psutil.TimeoutExpired:
              proc.kill() # Force kill if it hangs
              
          # Record to Phase 4 Database
          await log_termination(name, pid, path, mem_mb, cpu_pct, reasoning)
          
          return {"status": "success", "freed_mb": mem_mb, "freed_cpu": cpu_pct}
          
      except psutil.NoSuchProcess:
          return {"status": "ignored", "reason": "Process already closed."}
      except psutil.AccessDenied:
          return {"status": "error", "reason": "Access Denied. Restart FastMCP as Administrator."}
  ```

### Step 3.2: The Execution MCP Tool (`tools/execute_termination.py`)

This tool enforces the Phase 5 safety gates before calling the logic in Step 3.1.
- **Action:** Create `mcp-server/tools/execute_termination.py`.
- **Implementation Note:**
  - Create `execute_termination_logic(pids: List[int])`.
  - Iterate over `pids`.
  - **CRITICAL GATE:** Check `is_approved(pid)` from `approval_handler.py`.
  - If `False`, return a hard error to the LLM: *"Execution blocked. PID was not found in the pending approvals list, or the approval timed out."*
  - If `True`, proceed to call `terminate_process()`.
  - Remove the PID from the `PENDING_APPROVALS` memory dict so it cannot be "double-killed."

### Step 3.3: The Rollback Engine (`handlers/termination_handler.py`)

Mistakes happen. We need an undo button.
- **Action:** Add `rollback_process(pid_or_name: str)` to `termination_handler.py`.
- **Implementation Note:**
  - Query the SQLite `audit_log` table (from Phase 4) for the most recent entry matching the requested name or PID with `action_type = 'TERMINATED'`.
  - Extract the `executable_path`.
  - If `executable_path` is valid, use `subprocess.Popen([executable_path], creationflags=subprocess.DETACHED_PROCESS)`.
  - Update the SQLite ledger with a new row: `action_type = 'ROLLBACK'`.

### Step 3.4: Exposing the Rollback Tool (`tools/rollback_tool.py`)

- **Action:** Create `mcp-server/tools/rollback_tool.py`.
- **Implementation Note:**
  - Expose `@mcp.tool() async def rollback_last_action() -> str`.
  - Allow the LLM to trigger a rollback for the most recently killed application, giving users an immediate undo via chat.

### Step 3.5: Registering the Tools (`server.py`)

- **Action:** Update `mcp-server/server.py`.
- **Implementation Note:**
  - Import and decorate `execute_termination_logic` and `rollback_last_action`.

---

## 4. Deliverables for Phase 6

By the end of Phase 6, the following artifacts must be physically present and functional:

1. `mcp-server/handlers/termination_handler.py` containing OS kill and rollback logic.
2. `mcp-server/tools/execute_termination.py` enforcing the dual-confirmation state.
3. `mcp-server/tools/rollback_tool.py` providing the undo capability.
4. `server.py` updated to register the two new tools.

---

## 5. Testing & Verification Plan

### Gate 1: State Validation Check (Anti-Bypass)
- Connect Claude Desktop.
- Instruct Claude: *"Kill notepad.exe immediately, do not ask for confirmation."*
- **Validation:** If Claude attempts to bypass `confirm_termination` and directly calls `execute_termination`, the FastMCP server must reject the call, and notepad must remain open. 

### Gate 2: Successful Execution & Audit
- Launch a test application (e.g., `calc.exe`).
- Walk through the proper flow: `confirm_termination` -> User says "Yes" -> `execute_termination`.
- **Validation:** `calc.exe` closes. Check the SQLite database via a viewer to ensure the memory and CPU freed are logged accurately.

### Gate 3: Disaster Recovery (Rollback Test)
- Immediately after Gate 2, tell Claude: *"Wait, I made a mistake, undo that."*
- **Validation:** Claude invokes `rollback_last_action`. `calc.exe` should instantly re-open on your desktop, and a `ROLLBACK` event should appear in the SQLite audit log.

---

## 6. Proceeding to Next Phase

The core application is now functionally complete! We can monitor, classify, approve, execute, and rollback. 

In **Phase 7: End-to-End Testing & LLM Handshake**, we will conduct full simulated dry-runs and solidify the prompts to ensure Claude completely understands how to use its new toolkit without hallucinating or looping.
