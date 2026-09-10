# Phase 4: SQLite Database & Audit Trail

**Project:** KavanMCP (V1)
**Phase:** 4
**Status:** Ready for Execution
**Focus:** Data Persistence, Immutable Ledgers, and Accountability

---

## 1. Executive Overview

When an LLM is granted the authority to terminate operating system processes, maintaining a rigorous audit log is not optional—it is a critical safety requirement. 

Phase 4 focuses entirely on persistence. We will construct a zero-configuration, locally stored SQLite database to act as the immutable ledger for KavanMCP. Every time a process is flagged, blocked, or terminated, the action will be recorded with exact timestamps, memory footprints, and the LLM's stated rationale. This database will also serve as the foundation for the "24-Hour Rollback" capability introduced in later phases.

To ensure the FastMCP server remains highly responsive, all database interactions will utilize the asynchronous `aiosqlite` library.

---

## 2. Goals & Objectives

1. **Schema Initialization:** Programmatically create the local `data/process.db` file and instantiate the required tables upon server startup.
2. **Asynchronous CRUD:** Build non-blocking Python wrappers to write audit events to the database without delaying the MCP protocol stdio loop.
3. **Audit Tracking:** Log every successful termination, every blocked attempt (e.g., trying to kill Tier 1 processes), and memory/CPU freed.
4. **Tool Exposure:** Create an MCP tool that allows the LLM to query the recent history of what it has previously killed.

---

## 3. Step-by-Step Implementation Guide

### Step 3.1: Defining the SQL Schemas (`database/models.py`)

We start by defining the exact structure of our SQLite tables using raw SQL or a lightweight query builder.
- **Action:** Create `mcp-server/database/models.py`.
- **Implementation Note:**
  ```sql
  CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      process_name TEXT NOT NULL,
      pid INTEGER NOT NULL,
      executable_path TEXT,
      action_type TEXT NOT NULL, -- 'TERMINATED', 'BLOCKED', 'ROLLBACK'
      memory_freed_mb REAL,
      cpu_freed_pct REAL,
      llm_reasoning TEXT,
      user_approved BOOLEAN
  );

  CREATE TABLE IF NOT EXISTS system_baselines (
      process_name TEXT PRIMARY KEY,
      avg_cpu_pct REAL,
      avg_memory_mb REAL,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```

### Step 3.2: Database Initialization & Connection Engine (`database/db.py`)

The server needs a reliable way to connect to SQLite asynchronously.
- **Action:** Create `mcp-server/database/db.py`.
- **Implementation Note:**
  - Define an `init_db()` asynchronous function. This will be called from `main.py` right before the FastMCP server starts listening.
  - The function should execute the schema strings from `models.py`.
  - Ensure the `.db` file is saved directly into the `mcp-server/data/` directory.

### Step 3.3: Asynchronous CRUD Wrappers (`database/db.py`)

We need Pythonic wrappers to interact with the tables.
- **Action:** Implement the write and read functions in `db.py`.
- **Implementation Note:**
  ```python
  import aiosqlite
  import uuid
  from typing import List, Dict

  DB_PATH = "data/process.db"

  async def log_termination(process_name: str, pid: int, path: str, mem_mb: float, cpu_pct: float, reasoning: str) -> None:
      async with aiosqlite.connect(DB_PATH) as db:
          await db.execute(
              "INSERT INTO audit_log (id, process_name, pid, executable_path, action_type, memory_freed_mb, cpu_freed_pct, llm_reasoning, user_approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
              (str(uuid.uuid4()), process_name, pid, path, 'TERMINATED', mem_mb, cpu_pct, reasoning, True)
          )
          await db.commit()

  async def get_recent_logs(limit: int = 50) -> List[Dict]:
      # Return the last N rows as a list of dictionaries
      pass
  ```

### Step 3.4: The MCP Audit Tool (`tools/audit_tools.py`)

If a user asks Claude "What did you close earlier today?", Claude needs a way to look it up.
- **Action:** Create `mcp-server/tools/audit_tools.py`.
- **Implementation Note:**
  - Write a function `view_audit_log(hours_back: int = 24)` that calls `get_recent_logs`.
  - Filter the logs based on the timestamp.
  - Return the rows as a serialized JSON string to the LLM.

### Step 3.5: Integrating with FastMCP (`server.py`)

- **Action:** Update `mcp-server/server.py`.
- **Implementation Note:**
  - Import `view_audit_log` and decorate it with `@mcp.tool()`.

---

## 4. Deliverables for Phase 4

By the end of Phase 4, the following artifacts must be physically present and functional:

1. `mcp-server/database/models.py` containing the `CREATE TABLE` strings.
2. `mcp-server/database/db.py` containing the `aiosqlite` connection logic, `init_db`, and CRUD wrappers.
3. `mcp-server/tools/audit_tools.py` containing the LLM-facing audit lookup tool.
4. `mcp-server/main.py` updated to run `await init_db()` before starting the server.
5. `mcp-server/server.py` updated to expose the `view_audit_log` tool.

---

## 5. Testing & Verification Plan

### Gate 1: Automatic Initialization
- Delete the `data/process.db` file if it exists.
- Run `run_server.bat`.
- **Validation:** Verify that `data/process.db` is instantly recreated, and you can open it with a SQLite viewer (like DB Browser) to see the empty `audit_log` table.

### Gate 2: Asynchronous Write Test
- Write a quick unit test script that loops 100 times, firing `await log_termination(...)` concurrently using `asyncio.gather()`.
- **Validation:** Assert that exactly 100 rows appear in the database and no "database is locked" SQLite errors are thrown.

### Gate 3: Live LLM Verification
- Connect Claude Desktop to the FastMCP server.
- Prompt: *"Claude, check the audit log and tell me what actions have been taken recently."*
- **Validation:** Claude should successfully invoke `view_audit_log` and accurately report the contents of the local database.

---

## 6. Proceeding to Next Phase

With our persistence layer fully operational, we have a safe place to record actions. We are now ready to build the logic that precedes the actual termination. In **Phase 5: The Dual Confirmation Engine**, we will construct the stateful safety gates that guarantee user approval before any process is killed.
