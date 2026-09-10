# Phase 2: OS Integrations & System Monitoring (Read-Only)

**Project:** KavanMCP (V1)
**Phase:** 2
**Status:** Ready for Execution
**Focus:** System Inspection, Metrics Gathering, and Initial Tool Exposure

---

## 1. Executive Overview

With the foundational FastMCP server and environment configured in Phase 1, Phase 2 bridges the gap between the server logic and the underlying Windows Operating System. 

The primary objective of this phase is to establish safe, read-only "hooks" into the OS using `psutil` and `pywin32`. We will build the logic to poll system-wide metrics (CPU, Memory, Disk) and enumerate active processes. Crucially, we must ensure these operations are highly fault-tolerant—operating systems are volatile, and processes frequently spawn and die in milliseconds. 

Finally, this phase concludes by exposing our first two functional MCP tools to the LLM: `analyze_system` and `list_processes`.

---

## 2. Goals & Objectives

1. **Schema Enforcement:** Define strict Pydantic models for how system data is structured before sending it to the LLM.
2. **Global Monitoring:** Implement robust wrappers to fetch global CPU and RAM utilization accurately without blocking the main event loop.
3. **Process Enumeration:** Safely iterate over the OS process tree, handling strict `AccessDenied` or `NoSuchProcess` errors natively.
4. **Deep Inspection (Windows):** Utilize `pywin32` to bypass standard `psutil` limitations when fetching command-line arguments and elevated process details.
5. **Tool Registration:** Expose the read-only monitoring functions as officially registered `FastMCP` tools.

---

## 3. Step-by-Step Implementation Guide

### Step 3.1: Defining Pydantic Schemas (`utils/schemas.py`)

LLMs perform best when fed strict, predictable JSON structures. Before we extract data, we define the shape of that data.

- **Action:** Create `mcp-server/utils/schemas.py`.
- **Implementation Note:**
  ```python
  from pydantic import BaseModel
  from typing import List, Optional

  class ProcessSchema(BaseModel):
      pid: int
      name: str
      cpu_percent: float
      memory_mb: float
      status: str

  class SystemReportSchema(BaseModel):
      total_cpu_percent: float
      total_memory_gb: float
      used_memory_gb: float
      top_cpu_hogs: List[ProcessSchema]
      top_memory_hogs: List[ProcessSchema]
  ```

### Step 3.2: Building the Global Monitor (`integrations/monitor.py`)

We need a way to check the overall health of the laptop.
- **Action:** Write the `get_global_metrics()` function.
- **Implementation Note:** 
  - `psutil.cpu_percent(interval=0.1)` must be used. An interval of `None` returns instantaneous (and often inaccurate) CPU values. We use a tiny `0.1s` block to get an accurate reading without causing unacceptable latency.
  - RAM is fetched via `psutil.virtual_memory()`. Convert bytes to Gigabytes for the LLM.

### Step 3.3: Safe Process Enumeration (`integrations/monitor.py`)

Iterating over thousands of threads/processes is dangerous if not wrapped in `try/except` blocks, as ephemeral processes will die while you query them.
- **Action:** Write `get_all_processes()`.
- **Implementation Note:**
  ```python
  import psutil

  def get_all_processes():
      processes = []
      for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_info']):
          try:
              # Safe access using proc.info dict
              memory_mb = proc.info['memory_info'].rss / (1024 * 1024)
              processes.append({
                  "pid": proc.info['pid'],
                  "name": proc.info['name'],
                  "cpu_percent": proc.info['cpu_percent'],
                  "memory_mb": round(memory_mb, 2)
              })
          except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
              pass # Ignore processes that die during enumeration or are locked by the system
      return processes
  ```

### Step 3.4: Deep Windows Inspection (`integrations/windows.py`)

Sometimes `psutil` cannot read the executable path of a background service. `pywin32` provides direct access to the Windows API.
- **Action:** Write `get_deep_process_info(pid)`.
- **Implementation Note:** 
  - Use `win32process` and `win32api` to open a handle to the process (`OpenProcess`).
  - Extract the exact `ExecutablePath` and `CommandLine` parameters. This is crucial for Phase 3 to determine if a generic `python.exe` is running a safe local script or a rogue background miner.

### Step 3.5: MCP Tool - `analyze_system` (`tools/analyze_system.py`)

This is the high-level diagnostic tool the LLM will call when the user says "My PC is lagging."
- **Action:** Build the `analyze_system` tool logic.
- **Implementation Note:**
  - Call `get_global_metrics()`.
  - Call `get_all_processes()`.
  - Sort the processes by `cpu_percent` (descending) and `memory_mb` (descending).
  - Slice the top 5 from each list.
  - Return the `SystemReportSchema` serialized to a JSON string.

### Step 3.6: MCP Tool - `list_processes` (`tools/list_processes.py`)

The LLM needs a way to hunt down specific processes.
- **Action:** Build the `list_processes` tool logic.
- **Implementation Note:**
  - Accept an optional `filter_name` argument (e.g., `"chrome"`).
  - Iterate through processes and return only those containing the filter string (case-insensitive).
  - Return a list of `ProcessSchema`.

### Step 3.7: Registering Tools in FastMCP (`server.py`)

Now that the tool logic is written, we must expose it to the MCP client.
- **Action:** Update `mcp-server/server.py`.
- **Implementation Note:**
  ```python
  from fastmcp import FastMCP
  from tools.analyze_system import analyze_system_logic
  from tools.list_processes import list_processes_logic

  mcp = FastMCP("KavanMCP")

  @mcp.tool()
  async def analyze_system() -> str:
      """Returns a high-level diagnostic of global CPU/RAM and top resource hogs."""
      return analyze_system_logic()

  @mcp.tool()
  async def list_processes(filter_name: str = None) -> str:
      """Lists active processes, optionally filtered by name."""
      return list_processes_logic(filter_name)
  ```

---

## 4. Deliverables for Phase 2

By the end of Phase 2, the following artifacts must be physically present and functional in the repository:

1. `mcp-server/utils/schemas.py` containing Pydantic models.
2. `mcp-server/integrations/monitor.py` containing `psutil` wrappers.
3. `mcp-server/integrations/windows.py` containing `pywin32` API hooks.
4. `mcp-server/tools/analyze_system.py` logic handler.
5. `mcp-server/tools/list_processes.py` logic handler.
6. `mcp-server/server.py` updated to decorate and expose the two new tools.

---

## 5. Testing & Verification Plan

Before progressing to Phase 3 (The Classification Engine), we must pass the following manual validation gates:

### Gate 1: Metric Accuracy Validation
- Write a temporary test script that calls `analyze_system_logic()` and prints the result to the console.
- Open Windows Task Manager side-by-side. Verify that the Top 5 memory hogs identified by KavanMCP loosely match the Top 5 shown in Task Manager. *(Note: Minor discrepancies are expected due to how Windows calculates shared vs private working sets).*

### Gate 2: Fault Tolerance Check
- Run the server while aggressively opening and closing heavily threaded applications (e.g., launching Chrome, immediately closing it). 
- Verify that `psutil.NoSuchProcess` exceptions are swallowed gracefully and do not crash the MCP server daemon.

### Gate 3: Live LLM Integration (Claude Desktop)
- Connect Claude Desktop to the local `main.py` entry point.
- Send the prompt: *"Claude, analyze my system performance right now."*
- Verify that Claude successfully invokes the `analyze_system` tool and replies with an accurate, formatted summary of your PC's current health.

---

## 6. Proceeding to Next Phase
Once the read-only integrations are tested and stable, we move to **Phase 3: The Classification Engine**. Phase 3 will introduce the 4-Tier security model, allowing the server to look at the processes discovered in Phase 2 and decide if they are "Hard Locked" (Tier 1) or "Optional" (Tier 3).
