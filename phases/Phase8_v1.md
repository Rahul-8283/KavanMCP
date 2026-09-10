# Phase 8: Final Hardening & Documentation

**Project:** KavanMCP (V1)
**Phase:** 8
**Status:** Ready for Execution
**Focus:** Error Handling, Performance Profiling, and V1 Handoff

---

## 1. Executive Overview

Phase 8 is the final stage of the V1 KavanMCP Server build. By now, the server can monitor the OS, classify processes, cache human approvals, and execute/rollback terminations. However, operating systems are inherently chaotic environments. Processes crash, permissions change dynamically, and unexpected errors occur. 

If our FastMCP server throws a raw Python exception (stack trace) back to Claude, the LLM often becomes confused or attempts to "debug" the Python code itself instead of helping the user. This phase ensures that every possible error is caught and translated into a polite, structured message that the AI can understand. Additionally, we will polish the codebase, run performance benchmarks to ensure we meet our Non-Functional Requirements, and finalize the developer documentation.

---

## 2. Goals & Objectives

1. **Global Exception Handling:** Wrap all MCP tools in a safety net that catches OS-level errors and returns actionable, natural-language JSON to the LLM.
2. **Codebase Polish:** Enforce strict Python type hinting and run standard linting (`ruff` or `black`) across the entire `mcp-server/` directory.
3. **Performance Profiling:** Conduct a memory-leak test to prove the server idles at `< 60MB` of RAM and `< 1%` CPU as defined in the TRD.
4. **API Documentation:** Generate `docs/API.md` mapping out the exact JSON schemas our tools consume and return.
5. **V2 Preparation:** Tag the `v1.0.0` release and ensure the repository is perfectly structured for the future Tauri GUI integration.

---

## 3. Step-by-Step Implementation Guide

### Step 3.1: Global Exception Handling (`utils/error_handlers.py`)

We must sanitize errors before they reach the LLM.
- **Action:** Create `mcp-server/utils/error_handlers.py`.
- **Implementation Note:**
  - Create a decorator `@safe_mcp_tool`.
  - Wrap the inner function in a broad `try...except Exception as e:`.
  - Log the raw stack trace to `logs/server.log` for the developer.
  - Return a structured error to Claude:
    ```json
    {
      "status": "error",
      "error_type": "OS_Access_Denied",
      "message": "The system blocked this action.",
      "llm_instruction": "Tell the user they need to restart KavanMCP as an Administrator."
    }
    ```
  - Apply this decorator to every function in `tools/*.py`.

### Step 3.2: Codebase Polish & Linting

A professional tool requires a professional codebase.
- **Action:** Enforce styling and typing.
- **Implementation Note:**
  - Ensure every function definition has exact type hints (e.g., `def classify_process(name: str) -> int:`).
  - Run `pip install ruff` and execute `ruff check . --fix` inside the `mcp-server/` directory to automatically resolve unused imports and styling errors.

### Step 3.3: Finalizing Documentation (`docs/API.md`)

Future developers (or the future V2 Tauri GUI) need to know how to talk to this server.
- **Action:** Create `mcp-server/docs/API.md`.
- **Implementation Note:**
  - Document the 5 core tools: `analyze_system`, `list_processes`, `explain_process`, `confirm_termination`, and `execute_termination`.
  - Provide example JSON request payloads and example JSON response payloads for each tool.

### Step 3.4: Performance Profiling

We must prove we met our NFRs (Non-Functional Requirements).
- **Action:** Conduct the 1-Hour Burn-In Test.
- **Implementation Note:**
  - Launch `run_server.bat`.
  - Write a script that hits the `analyze_system` tool every 2 seconds for 1 hour.
  - Monitor `python.exe` in Windows Task Manager.
  - **Pass Criteria:** Memory footprint remains completely stable (flatline) under 60MB. If memory grows linearly, there is a leak in `aiosqlite` connections or the `PENDING_APPROVALS` dictionary that must be fixed.

---

## 4. Deliverables for Phase 8

By the end of Phase 8, the following artifacts must be physically present and functional:

1. `mcp-server/utils/error_handlers.py` containing the LLM-friendly exception decorator.
2. `mcp-server/docs/API.md` containing the final API contract.
3. A perfectly linted codebase with zero `ruff` warnings.
4. A verified memory profile proving `< 60MB` RAM utilization.

---

## 5. Deployment & V2 Preparation

Once Phase 8 is complete, **Version 1.0 of KavanMCP is finished.**

### The Git Release
- Run `git add .`
- Run `git commit -m "chore: finalized V1 hardening and docs"`
- Run `git tag v1.0.0`
- Run `git push origin main --tags`

### Looking Ahead to V2
The foundation built here is strictly backend/LLM-focused. Phase 8 leaves the server in a state where it is fully ready to act as a "Sidecar Daemon" for the future **Phase V2: Tauri GUI Dashboard**. When V2 development begins, the Tauri (Rust/React) app will simply spawn this `mcp-server` executable in the background and communicate with it using the exact same APIs we perfected here.
