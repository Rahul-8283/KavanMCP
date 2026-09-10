# Phase 5: The Dual Confirmation Engine

**Project:** KavanMCP (V1)
**Phase:** 5
**Status:** Ready for Execution
**Focus:** Stateful Memory, Safety Gates, and Human-in-the-Loop Workflows

---

## 1. Executive Overview

KavanMCP's defining feature is that it never acts unilaterally. While LLMs are incredibly intelligent, they can hallucinate or misinterpret user intent. If Claude decides that `discord.exe` is consuming too much RAM, it cannot simply execute a kill command. 

Phase 5 builds the **Stateful Approval Manager**. This engine introduces a mandatory pause into the termination workflow. Before executing a kill, the LLM must first "propose" the termination via the `confirm_termination` tool. The server evaluates the process against our Phase 3 Classification Engine, places the process into a temporary holding state, and returns a strict warning that the LLM must show the user. Only after the user confirms can the LLM proceed to Phase 6 (Execution).

---

## 2. Goals & Objectives

1. **Stateful Caching:** Implement an in-memory, thread-safe dictionary to track PIDs (Process IDs) that are awaiting user approval.
2. **Tier Enforcement:** Seamlessly integrate the Phase 3 Classification Engine so that Tier 1 requests are instantly blocked before even entering the pending state.
3. **Time-To-Live (TTL):** Build an asynchronous garbage collector to automatically expire and remove pending requests after 5 minutes (preventing stale approvals).
4. **Tool Registration:** Build and expose the `confirm_termination` MCP tool to the LLM.

---

## 3. Step-by-Step Implementation Guide

### Step 3.1: The Approval State Manager (`handlers/approval_handler.py`)

We need a central place to store and validate pending requests.
- **Action:** Create `mcp-server/handlers/approval_handler.py`.
- **Implementation Note:**
  ```python
  import time
  from typing import Dict, List

  # Global state dictionary
  # Format: { pid: {"name": str, "tier": int, "timestamp": float} }
  PENDING_APPROVALS: Dict[int, Dict] = {}

  APPROVAL_TIMEOUT_SECONDS = 300 # 5 minutes

  def request_approval(pid: int, name: str, tier: int) -> str:
      PENDING_APPROVALS[pid] = {
          "name": name,
          "tier": tier,
          "timestamp": time.time()
      }
      return f"Process {name} (PID: {pid}) [Tier {tier}] is now pending approval. You MUST ask the user for confirmation before calling execute_termination."
  
  def is_approved(pid: int) -> bool:
      if pid not in PENDING_APPROVALS:
          return False
      if time.time() - PENDING_APPROVALS[pid]["timestamp"] > APPROVAL_TIMEOUT_SECONDS:
          del PENDING_APPROVALS[pid] # Expired
          return False
      return True
  ```

### Step 3.2: Integrating the Classification Engine

When a request comes in, we must judge it before approving it to wait.
- **Action:** Write the core `handle_confirmation_request(pids: List[int])` logic.
- **Implementation Note:**
  - Iterate through the requested `pids`.
  - Verify `psutil.pid_exists(pid)`.
  - Pass the PID to `classify_process()` (from Phase 3).
  - **If Tier 1:** Immediately reject. Call `log_blocked_action()` (from Phase 4) and return a strict refusal string to the LLM.
  - **If Tier 2, 3, or 4:** Call `request_approval()` and append the warning to the return string.

### Step 3.3: The `confirm_termination` MCP Tool (`tools/confirm_termination.py`)

This is the actual tool the LLM will call.
- **Action:** Create `mcp-server/tools/confirm_termination.py`.
- **Implementation Note:**
  - Create the async function `confirm_termination_logic(pids: List[int])`.
  - Wrap the `handle_confirmation_request` function.
  - Format the response carefully. LLMs behave based on the text they receive. The return string MUST explicitly instruct the LLM: *"Do not execute the termination yet. Present this list to the user and ask: 'Are you sure you want to close these applications?'"*

### Step 3.4: Background TTL Sweeper (`server.py`)

We cannot let `PENDING_APPROVALS` grow infinitely if the user walks away from their computer without confirming.
- **Action:** Implement an `asyncio` background task.
- **Implementation Note:**
  - In `main.py` or `server.py`, use `asyncio.create_task(ttl_sweeper())`.
  - The sweeper should run `while True:`, sleep for 60 seconds, and iterate through `PENDING_APPROVALS`.
  - Any entry older than `APPROVAL_TIMEOUT_SECONDS` is deleted.

### Step 3.5: Registering the Tool (`server.py`)

- **Action:** Update `mcp-server/server.py`.
- **Implementation Note:**
  - Import `confirm_termination_logic`.
  - Decorate it with `@mcp.tool()`.

---

## 4. Deliverables for Phase 5

By the end of Phase 5, the following artifacts must be physically present and functional:

1. `mcp-server/handlers/approval_handler.py` containing the global memory cache and validation logic.
2. `mcp-server/tools/confirm_termination.py` exposing the LLM tool.
3. Updates to `server.py` to register the new tool and launch the background TTL garbage collector.

---

## 5. Testing & Verification Plan

### Gate 1: Tier 1 Hard-Block Validation
- Write a unit test or use Claude Desktop to request confirmation to terminate `explorer.exe` (a known Tier 1 process).
- **Validation:** The server must refuse to add it to `PENDING_APPROVALS`, and the returned string must state that the action is strictly prohibited. Furthermore, the action must appear in the SQLite `audit_log` as `BLOCKED`.

### Gate 2: Pending State & TTL Expiration
- Call `confirm_termination` on a safe, benign process (e.g., a dummy Python script or `notepad.exe`).
- **Validation 1:** Assert that the PID appears in the `PENDING_APPROVALS` dictionary.
- Wait for 5 minutes (or artificially manipulate the timestamp).
- **Validation 2:** Assert that the TTL sweeper correctly removes the PID from the dictionary.

### Gate 3: Live LLM Double-Confirm Flow
- Connect Claude Desktop.
- Prompt: *"Close notepad."*
- **Validation:** Claude should NOT attempt to use an execution tool (which doesn't exist yet anyway). It should call `confirm_termination`, receive the warning, and reply to you saying: *"I have flagged Notepad for termination. Are you sure you want to proceed?"*

---

## 6. Proceeding to Next Phase

Phase 5 establishes the safety net. Now that we have a mechanism to hold processes in a "ready" state pending human approval, we can finally build the execution mechanism. 

In **Phase 6: Safe Process Termination & Rollback**, we will write the `execute_termination` tool, hook it into Windows `taskkill`, and build the ability to restart killed processes if the user makes a mistake.
