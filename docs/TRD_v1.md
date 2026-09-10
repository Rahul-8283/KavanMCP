# Technical Requirements Document (TRD)
## KavanMCP - Version 1.0 (FastMCP Server)

**Date:** September 2026
**Document Status:** Active / V1 Draft
**Product Name:** KavanMCP
**Focus:** Technical Architecture & Implementation for V1 Server

---

## 1. Introduction
This Technical Requirements Document (TRD) outlines the architectural decisions, technology stack, data schemas, and API contracts necessary to implement KavanMCP Version 1.0. 

KavanMCP is a local daemon that implements the Model Context Protocol (MCP) using the `FastMCP` Python framework. It provides LLMs with deterministic, safe, and heavily gated tools to interact with the host operating system's process manager.

---

## 2. System Architecture

The KavanMCP system is structured into five distinct abstraction layers to ensure absolute isolation between the LLM request and the raw OS system calls:

1. **Protocol Layer (FastMCP):** Handles standard I/O (stdio) and Server-Sent Events (SSE) communication conforming strictly to the MCP specification.
2. **Tool Routing Layer:** Pydantic-validated entry points exposing functions (`analyze_system`, `list_processes`) to the LLM.
3. **Business Logic & Security Layer:** The core decision engine. Matches requested PIDs against the `tier_1_processes.json` whitelist and evaluates risk anomalies.
4. **Data Persistence Layer:** An asynchronous SQLite integration (`aiosqlite`) acting as the immutable audit ledger.
5. **OS Integration Layer:** Cross-platform metrics (`psutil`) and deep Windows-native hooks (`pywin32`) to interact directly with the kernel process list.

---

## 3. Technology Stack

### 3.1 Core Technologies
- **Runtime:** Python 3.11+
- **MCP Framework:** `FastMCP` (Provides lightweight async decorators for MCP tool registration).
- **Data Validation:** `Pydantic v2` (Ensures that LLMs do not hallucinate malformed input parameters).
- **Database:** `SQLite3` with `aiosqlite` (Zero-configuration async local persistence).

### 3.2 Operating System Integrations
- **Metrics & Enumeration:** `psutil` (Used for calculating CPU percentages, RAM footprint, thread counts, and disk I/O per process).
- **Deep Inspection:** `pywin32` (Used exclusively on Windows to fetch executable arguments, inspect loaded DLLs, verify parent/child relationships, and handle elevated privilege token checks).

---

## 4. Data Models & Database Schemas

### 4.1 SQLite Database (`data/process.db`)

**Table: `audit_log`**
The primary ledger for all termination actions. This table is strictly append-only.
- `id` (TEXT, Primary Key, UUIDv4)
- `timestamp` (DATETIME, ISO8601 UTC)
- `process_name` (TEXT, e.g., 'discord.exe')
- `pid` (INTEGER)
- `executable_path` (TEXT)
- `action_type` (TEXT) - Enum: `TERMINATED`, `ROLLBACK`, `BLOCKED`
- `memory_freed_mb` (REAL)
- `cpu_freed_pct` (REAL)
- `llm_reasoning` (TEXT)
- `user_approved` (BOOLEAN)

**Table: `process_baselines`**
Used by the anomaly detection engine to understand "normal" operation.
- `process_name` (TEXT, Primary Key)
- `avg_cpu_pct` (REAL)
- `avg_memory_mb` (REAL)
- `last_updated` (DATETIME)

### 4.2 Static Configurations (`config/`)
- `tier_1_processes.json`: Hardcoded list of strictly forbidden executables (`explorer.exe`, `lsass.exe`, `svchost.exe`, `System`). Loaded into memory on startup as an `O(1)` hash set.
- `settings.py`: Environment loader determining log levels, database paths, and polling frequency.

---

## 5. API & FastMCP Tool Specifications

All MCP tools must enforce strict asynchronous execution to prevent blocking the LLM client stream.

### 5.1 System Analysis Tools
- **`analyze_system()` -> `SystemReportSchema`**
  - Evaluates global CPU/Memory pressure.
  - Returns the Top 5 processes mapped to their respective security Tier (1-4).
- **`list_processes(filter_name: Optional[str])` -> `List[ProcessSchema]`**
  - Returns active processes excluding Tier 1 (unless explicitly requested).

### 5.2 Deep Inspection Tools
- **`explain_process(pid: int)` -> `ProcessDeepDiveSchema`**
  - Invokes `pywin32` to read command-line launch arguments.
  - Identifies parent process (to prevent killing a child that crashes a necessary parent).

### 5.3 Execution & Safety Gates
- **`confirm_termination(pids: List[int])` -> `ConfirmationSchema`**
  - *Logic:* PIDs are validated against the Whitelist. Valid PIDs are inserted into a global `PendingApprovals` memory dictionary with a 300-second TTL.
  - *Returns:* A strict warning prompt string that the LLM is instructed to display to the user.
- **`execute_termination(pids: List[int])` -> `ExecutionResultSchema`**
  - *Logic:* Validates that `pids` exist in `PendingApprovals`. If missing or expired, execution is blocked.
  - If valid, invokes `psutil.Process(pid).kill()`.
  - On `psutil.NoSuchProcess`, returns gracefully.
  - On `psutil.AccessDenied`, throws a handled exception requesting elevation.
  - Upon success, records metrics to the `audit_log` table.

---

## 6. Security Implementation Details

### 6.1 The Tier 1 Hard-Block
The whitelist block is implemented at the absolute lowest abstraction layer within `termination_handler.py`. Before ANY operating system call is constructed, the binary name is lowercased and checked against the `tier_1_processes.json` set. This physically decouples the LLM's intent from the OS capability.

### 6.2 Administrator Elevation
For KavanMCP to function properly against background services, it must be launched with elevated privileges.
- `main.py` will run a startup check via `ctypes.windll.shell32.IsUserAnAdmin()`.
- If false, the server will log a `WARNING` but continue to operate in a degraded mode (can only kill user-owned processes).

### 6.3 LLM Hallucination Mitigation
LLMs may occasionally hallucinate PIDs (Process IDs) or provide an outdated PID.
- Every tool utilizing a `pid` performs an immediate `psutil.pid_exists()` check. 
- If false, it returns an explicit natural language string to the LLM explaining the process is no longer running, preventing a stack trace.

---

## 7. Performance Targets
- **Memory Footprint:** The daemon must consume `< 60MB` of RAM.
- **CPU Overhead:** Polling system metrics must utilize `< 1%` CPU.
- **Latency:**
  - `analyze_system` must return in `< 250ms`.
  - Database writes must be non-blocking (`asyncio.create_task()` or `aiosqlite`).

---

## 8. Deployment & CI/CD
- **Environment:** Managed via standard Python virtual environment (`venv`).
- **Dependencies:** Locked via `requirements.txt`.
- **Scripts:** Batch files provided for Windows environments (`install_deps.bat`, `run_server.bat`).

---
*End of TRD - KavanMCP V1*
