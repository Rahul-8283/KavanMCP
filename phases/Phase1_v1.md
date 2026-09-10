# Phase 1: Project Initialization & Core Framework

**Project:** KavanMCP (V1)
**Phase:** 1
**Status:** Ready for Execution
**Focus:** Foundational Boilerplate, Environment Setup, and Server Instantiation

---

## 1. Executive Overview

Phase 1 is the critical foundation for the KavanMCP project. Before any operating system hooks, LLM integrations, or security classifiers are built, we must establish a robust, scalable, and secure application skeleton. 

This phase focuses exclusively on setting up the Python environment, constructing the exact directory structure outlined in the TRD, defining strict dependencies, and successfully launching a barebones `FastMCP` server over `stdio`. Success in this phase means we have a running daemon that Claude or ChatGPT can connect to, even if no tools are exposed yet.

---

## 2. Goals & Objectives

1. **Environment Consistency:** Establish a strict `venv`-based Python environment to ensure cross-developer and cross-machine consistency.
2. **Structural Integrity:** Scaffold the complete `mcp-server/` directory tree so that future handlers and integrations have a dedicated, logical home.
3. **Core Dependency Lock:** Pin exactly the libraries required for V1 (`fastmcp`, `psutil`, `pywin32`, `pydantic`, `aiosqlite`).
4. **Server Bootstrap:** Write the core `main.py` and `server.py` entry points that handle FastMCP initialization.
5. **Privilege Awareness:** Implement the initial `ctypes` Windows API check to verify if the server is running with Administrator privileges.

---

## 3. Step-by-Step Implementation Guide

### Step 3.1: Python Virtual Environment Setup

KavanMCP heavily relies on specific OS-level bindings (`pywin32`). A global Python installation is highly discouraged. 

- **Action:** Create an isolated virtual environment at the project root.
- **Commands:**
  ```cmd
  cd KavanMCP/mcp-server
  python -m venv venv
  venv\Scripts\activate
  ```

### Step 3.2: Dependency Management (`requirements.txt`)

We must explicitly declare our dependencies. In Phase 1, we define the `requirements.txt` file inside the `mcp-server/` directory.

```text
# requirements.txt
fastmcp>=0.1.0       # The core Model Context Protocol framework
psutil>=5.9.8        # Cross-platform system and process utilities
pywin32>=306         # Windows API extensions for deep process inspection
pydantic>=2.6.0      # Strict schema validation for MCP tools
aiosqlite>=0.20.0    # Asynchronous SQLite for the audit ledger
pytest>=8.0.0        # Unit testing framework
```

- **Action:** Execute `pip install -r requirements.txt`.

### Step 3.3: Directory Tree Scaffolding

We will create the physical folders and `__init__.py` files required to make Python recognize the structure as a package.

- `config/`: Will hold settings and the tier 1 whitelist.
- `tools/`: Will house the FastMCP tool decorators.
- `handlers/`: Will contain the business logic.
- `utils/`: Logging and formatting helpers.
- `resources/`: Static JSON files.
- `database/`: SQLite wrappers and models.
- `integrations/`: Third-party OS wrappers (`psutil`/`pywin32`).
- `data/` and `logs/`: Runtime output folders (Must be added to `.gitignore`).
- `tests/`: Pytest suites.
- `scripts/`: Batch scripts for easy launching.

### Step 3.4: Logging Configuration (`utils/logger.py`)

Before the server starts, it needs to be able to log its state.
- **Action:** Implement a standard Python `logging` configuration that writes to both the console (`stdout`) and a rotating file inside the `logs/` directory.
- **Format:** `[%(asctime)s] [%(levelname)s] [%(module)s] - %(message)s`

### Step 3.5: Administrator Privilege Check

Because KavanMCP needs to inspect background tasks and potentially terminate anomalous processes, it works best with elevated privileges.
- **Action:** Create an initialization check using `ctypes`.
- **Implementation Note:**
  ```python
  import ctypes
  import os

  def is_admin() -> bool:
      try:
          return ctypes.windll.shell32.IsUserAnAdmin() != 0
      except AttributeError:
          return False # Fallback for non-Windows if needed
  ```

### Step 3.6: The FastMCP Server Definition (`server.py`)

This file is responsible for instantiating the MCP server object.
- **Action:** Create `server.py`.
- **Implementation Note:**
  ```python
  from fastmcp import FastMCP

  # Initialize the MCP Server
  mcp = FastMCP("KavanMCP", version="1.0.0")

  # Future phases will register tools here
  # @mcp.tool()
  # def dummy_tool(): pass
  ```

### Step 3.7: The Application Entry Point (`main.py`)

This file ties everything together. It initializes logging, checks for admin privileges, and starts the MCP stdio transport.
- **Action:** Create `main.py`.
- **Implementation Note:**
  - Start logger.
  - Print welcome banner.
  - Call `is_admin()`. If false, log a highly visible warning but do not crash.
  - Call `mcp.run()` from `server.py` to begin listening on stdio.

### Step 3.8: Developer Convenience Scripts (`scripts/`)

To ensure smooth development and testing, we will write Windows batch files.

1. **`install_deps.bat`**
   - Automatically creates the `venv` and runs `pip install`.
2. **`run_server.bat`**
   - Automatically activates the `venv` and executes `python main.py`.
3. **`check_admin.bat`**
   - A quick script to verify if the current command prompt session has elevated privileges before launching the server.

---

## 4. Deliverables for Phase 1

By the end of Phase 1, the following artifacts must be physically present and functional in the repository:

1. `mcp-server/requirements.txt` with locked dependencies.
2. The complete directory tree with empty `__init__.py` files.
3. `mcp-server/utils/logger.py` configured for rotating file logs.
4. `mcp-server/server.py` containing the `FastMCP` instance.
5. `mcp-server/main.py` containing the execution loop and admin check.
6. `mcp-server/scripts/run_server.bat` and related batch utilities.
7. `mcp-server/.gitignore` updated to ignore `venv/`, `__pycache__/`, `logs/`, and `data/`.

---

## 5. Testing & Verification Plan

Before progressing to Phase 2 (OS Integrations), we must pass the following manual validation gates:

### Gate 1: Environment Integrity
- Developer can clone the repository to a fresh Windows machine.
- Developer can run `scripts\install_deps.bat` without encountering pip resolution errors.

### Gate 2: Server Initialization
- Developer can run `scripts\run_server.bat`.
- The console outputs the startup banner and logging initialization.
- The `logs/` directory is automatically created (if missing), and `server.log` is populated.

### Gate 3: Privilege Warning
- If `run_server.bat` is executed in a standard (non-elevated) Command Prompt, the console explicitly prints a `WARNING` stating that KavanMCP is running in degraded mode and cannot inspect system-level tasks.
- If executed in an Administrator Command Prompt, the console prints a `SUCCESS` message stating that elevated permissions are granted.

### Gate 4: MCP Protocol Handshake
- The `FastMCP` server successfully binds to `stdio` and enters a waiting state, ready to receive JSON-RPC messages from an MCP client like Claude Desktop.

---

## 6. Proceeding to Next Phase
Once all 4 testing gates are passed, Phase 1 is officially closed. The foundation is now solid, and the architecture is ready to accept the `psutil` and `pywin32` OS integration logic in Phase 2.
