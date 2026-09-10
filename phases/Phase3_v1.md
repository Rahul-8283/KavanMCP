# Phase 3: The Classification Engine & Security Tiers

**Project:** KavanMCP (V1)
**Phase:** 3
**Status:** Ready for Execution
**Focus:** Process Classification, Whitelisting, and Anomaly Detection

---

## 1. Executive Overview

Phase 3 introduces the core security brain of KavanMCP. While Phase 2 gave us the ability to "see" processes, Phase 3 gives the server the ability to "judge" them. 

We will implement the strict **4-Tier Classification System**. This engine guarantees that neither the LLM nor the user can accidentally terminate critical Windows operating system components. By classifying processes before they are ever presented to the LLM for termination, we create a foolproof, deterministic safety net.

---

## 2. Goals & Objectives

1. **Static Whitelisting (Tier 1):** Create and load a hardcoded list of critical OS components that are strictly untouchable.
2. **Dynamic Classification:** Build the `classification_handler` to categorize any given process into Tiers 1 through 4 based on name, behavior, and user preference.
3. **Anomaly Detection (Tier 4):** Implement logic to flag processes that are consuming abnormal amounts of CPU or memory, especially if they lack a visible UI (headless).
4. **Tool Augmentation:** Update the `analyze_system` and `list_processes` tools from Phase 2 to append these Tier classifications to the data they return to Claude.

---

## 3. Step-by-Step Implementation Guide

### Step 3.1: Defining the Tier 1 Whitelist (`resources/tier_1_processes.json`)

We start by defining the absolute non-negotiables of the Windows Operating System.
- **Action:** Create `mcp-server/resources/tier_1_processes.json`.
- **Implementation Note:**
  ```json
  [
    "explorer.exe",
    "svchost.exe",
    "csrss.exe",
    "wininit.exe",
    "services.exe",
    "lsass.exe",
    "smss.exe",
    "system",
    "system idle process",
    "spoolsv.exe",
    "taskmgr.exe"
  ]
  ```

### Step 3.2: The Whitelist Loader (`config/whitelist.py`)

File I/O is slow. We need this whitelist available instantly for every process check.
- **Action:** Create `mcp-server/config/whitelist.py`.
- **Implementation Note:** 
  - Load the JSON file into a Python `set()` at server startup. 
  - Sets provide `O(1)` lookup time, ensuring our classification engine adds zero latency to system polling. Ensure all strings in the set are lowercase.

### Step 3.3: The Classification Logic (`handlers/classification_handler.py`)

This is the core decision matrix.
- **Action:** Create `mcp-server/handlers/classification_handler.py`.
- **Implementation Note:** Write a function `classify_process(process_name, cpu_percent, memory_mb, is_headless) -> int`.
  - **Tier 1 (Critical):** If `process_name.lower()` is in the Whitelist set, return `1`.
  - **Tier 2 (Essential):** If the process matches user-defined essential apps (e.g., `Code.exe`, `devenv.exe`, `chrome.exe`), return `2`.
  - **Tier 4 (Suspicious):** If `cpu_percent > 25.0` AND the process is flagged as headless/background, return `4`.
  - **Tier 3 (Optional):** If none of the above match, return `3` (Standard background task/updater).

### Step 3.4: Anomaly Detection Engine (`handlers/alert_handler.py`)

We need to provide the LLM with context on *why* something might be bad.
- **Action:** Create `mcp-server/handlers/alert_handler.py`.
- **Implementation Note:**
  - Create an `evaluate_anomalies(process_list)` function.
  - Iterate through processes and append warning flags:
    - `"HIGH_CPU_WARNING"` if a single process uses > 40% CPU.
    - `"MEMORY_LEAK_WARNING"` if a non-essential process uses > 2GB RAM.
  - These tags will be injected into the JSON payload sent to Claude.

### Step 3.5: Augmenting Phase 2 Tools

Claude needs to see the Tier classification when analyzing the system.
- **Action:** Update `tools/analyze_system.py` and `tools/list_processes.py`.
- **Implementation Note:**
  - Pass the output of `get_all_processes()` through the `classification_handler`.
  - Update `ProcessSchema` (from Phase 2) to include `tier: int` and `anomaly_flags: List[str]`.
  - Now, when Claude calls `analyze_system`, it sees:
    `{"name": "chrome.exe", "tier": 2, "cpu": 5.0}`
    `{"name": "unknown_miner.exe", "tier": 4, "anomaly_flags": ["HIGH_CPU_WARNING"]}`

---

## 4. Deliverables for Phase 3

By the end of Phase 3, the following artifacts must be physically present and functional:

1. `mcp-server/resources/tier_1_processes.json` containing the OS whitelist.
2. `mcp-server/config/whitelist.py` for `O(1)` memory loading.
3. `mcp-server/handlers/classification_handler.py` containing the Tier 1-4 decision tree.
4. `mcp-server/handlers/alert_handler.py` containing threshold logic.
5. Updated schemas and MCP tools that now output Tier data to the LLM.

---

## 5. Testing & Verification Plan

### Gate 1: Whitelist Integrity Test
- Write a unit test that passes `explorer.exe`, `EXPLORER.EXE`, and `System` to the `classify_process` function.
- **Validation:** Assert that all return strictly `Tier 1`.

### Gate 2: Anomaly Triggering
- Create a dummy Python script that runs an infinite `while True:` loop (spiking one CPU core to 100%).
- Run `analyze_system()` via the MCP interface.
- **Validation:** Assert that the dummy script is identified, classified as `Tier 4`, and possesses the `HIGH_CPU_WARNING` flag.

### Gate 3: Live LLM Prompt Test
- Connect Claude Desktop to the server.
- Prompt: *"Claude, list my processes and tell me what Tier they belong to."*
- **Validation:** Claude should successfully articulate which of your processes are Tier 1 (untouchable) and which are Tier 3 (optional).

---

## 6. Proceeding to Next Phase

With the system now intelligently classifying processes and enforcing boundaries, we move to **Phase 4: SQLite Database & Audit Trail**. In Phase 4, we will build the local ledger to track historical baselines and prepare for recording process terminations.
