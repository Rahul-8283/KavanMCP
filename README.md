# KavanMCP

**Your AI-Powered System Optimizer. Fast. Safe. Intelligent.**

KavanMCP is a security-first Model Context Protocol (MCP) server that empowers LLMs (like Claude and ChatGPT) to intelligently monitor, analyze, and optimize your local system performance. Say goodbye to manual Task Manager hunting—let AI find the resource hogs, propose solutions, and safely terminate unnecessary processes.

---

## The Vision

Modern laptops are powerful, but random background updaters, forgotten chat apps, and rogue processes can unexpectedly spike CPU usage and drain memory. 

KavanMCP connects your system directly to an LLM, allowing you to simply ask:
> *"Claude, my laptop is lagging. Find out what's causing it and safely clean it up."*

Instead of blindly killing tasks, KavanMCP introduces an **Ironclad 4-Tier Security Engine** to ensure that critical system processes and your active work are *never* touched without strict, multi-stage user confirmation.

---

## How It Works (The 4-Tier Gatekeeper)

KavanMCP acts as an intelligent bridge between the LLM and your Operating System, enforcing strict safety rules before any action is taken.

1. **Tier 1 (System Critical) HARD LOCKED:** Core OS processes (e.g., `explorer.exe`, `svchost.exe`, system drivers) are hardcoded into a whitelist. The LLM is physically blocked from even suggesting their termination.
2. **Tier 2 (Essential Work Apps) Single Confirmation:** Active workspace apps (like VS Code or your browser). Requires explicit, single user confirmation.
3. **Tier 3 (Background Helpers) Dual Confirmation:** Unused apps or background updaters. Requires a strict two-step confirmation (Ask -> Confirm Details -> Execute).
4. **Tier 4 (Suspicious Anomalies) High-Risk Alert:** Unrecognized processes hogging CPU/RAM. Triggers an elevated warning, dual confirmation, and detailed audit logging.

---

## End-to-End Tech Stack

<div align="center">
  <img src="https://img.shields.io/badge/Python_3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/FastMCP-8A2BE2?style=for-the-badge" alt="FastMCP" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Pydantic_v2-E92063?style=for-the-badge&logo=pydantic&logoColor=white" alt="Pydantic" />
  <img src="https://img.shields.io/badge/psutil-2C2D72?style=for-the-badge&logo=linux&logoColor=white" alt="psutil" />
  <img src="https://img.shields.io/badge/pywin32-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="pywin32" />
  <img src="https://img.shields.io/badge/Tauri_2.0-FFC131?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri" />
  <img src="https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
</div>

<br/>

Built for speed, low overhead, and cross-platform compatibility.

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Core Framework** | **Python 3.11+ & FastMCP** | Async-native, lightweight MCP server logic. |
| **System Inspection** | **`psutil` & `pywin32`** | Low-latency monitoring of CPU, RAM, Disk I/O, and process trees. |
| **Database / Audit** | **SQLite (`aiosqlite`)** | Zero-config local database for audit trails and 24-hour rollback history. |
| **Data Validation** | **Pydantic v2** | Strict input/output schema validation for LLM tool calls. |

---

## Project Architecture

### Basic Data Flow

```mermaid
flowchart LR
    Claude["LLM Client<br/>(Claude/ChatGPT)"] <-->|FastMCP Protocol| Server["FastMCP Server<br/>(Tools & Handlers)"]
    Server <--> Security["Security Engine<br/>(Tiers 1-4)"]
    Security <--> OS["OS Hooks<br/>(psutil/Win32)"]
    Server <--> DB[("SQLite<br/>Audit DB")]
```

### End-to-End Architecture

```mermaid
flowchart TB
    subgraph Clients ["Client Interface Layer"]
        Claude["Claude Desktop / ChatGPT"]
        TauriUI["Tauri GUI Dashboard (V2)"]
    end

    subgraph FastMCPServer ["FastMCP Server Core (Python)"]
        ServerEntryPoint["Server Entry (server.py)"]
        
        subgraph ToolSet ["Exposed MCP Tools"]
            Tools["analyze_system, explain_process, etc"]
        end

        subgraph Handlers ["Logic & Security"]
            Process["Process Handler"]
            Security["Tier 1-4 Classification Engine"]
            Approval["Dual Confirmation Manager"]
        end
    end

    subgraph DataLayer ["Persistence"]
        SQLiteDB[(SQLite Audit DB)]
        JSONConfig["User Configs & Whitelist"]
    end

    subgraph OSLayer ["System Level"]
        PSUtil["psutil (Metrics)"]
        Win32API["pywin32 (Deep Inspection)"]
        TaskKill["Process Termination"]
    end

    Claude <-->|"MCP Protocol (stdio/SSE)"| ServerEntryPoint
    TauriUI <-->|"IPC / HTTP"| ServerEntryPoint
    
    ServerEntryPoint --> ToolSet
    ToolSet --> Handlers
    
    Handlers --> Security
    Security --> JSONConfig
    Security --> Approval
    
    Handlers --> Process
    Process --> PSUtil
    Process --> Win32API
    
    Approval --> TaskKill
    TaskKill --> SQLiteDB
    Handlers --> SQLiteDB
```

---

## Running the Server

To give KavanMCP the necessary permissions to deeply inspect background processes and system resources, it **must** be run with Administrator privileges.

From your terminal (inside the `mcp-server` directory), use the following PowerShell command to launch the server in a new elevated window:

```powershell
Start-Process -FilePath ".\scripts\run_server.bat" -Verb RunAs
```

---

## Folder Structure

```text
KavanMCP/
│
├── mcp-server/                          # V1: FastMCP Server
│   ├── config/
│   │   ├── __init__.py
│   │   ├── settings.py                  # Load config.json, env vars
│   │   └── whitelist.py                 # Tier 1 critical processes
│   │
│   ├── tools/                           # MCP Tool Definitions
│   │   ├── __init__.py
│   │   ├── analyze_system.py
│   │   ├── list_processes.py
│   │   ├── explain_process.py
│   │   ├── confirm_termination.py
│   │   └── execute_termination.py
│   │
│   ├── handlers/                        # Tool Implementation Logic
│   │   ├── __init__.py
│   │   ├── process_handler.py
│   │   ├── classification_handler.py
│   │   ├── termination_handler.py
│   │   └── alert_handler.py
│   │
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── formatters.py
│   │   ├── logger.py
│   │   └── validators.py
│   │
│   ├── resources/                       # Static Data
│   │   ├── __init__.py
│   │   ├── tier_1_processes.json
│   │   └── alert_templates.json
│   │
│   ├── database/
│   │   ├── __init__.py
│   │   ├── db.py                        # SQLite CRUD
│   │   └── models.py                    # Schema
│   │
│   ├── integrations/
│   │   ├── __init__.py
│   │   ├── windows.py                   # pywin32 wrappers
│   │   └── monitor.py                   # psutil wrappers
│   │
│   ├── data/                            # Runtime (git-ignored)
│   │   ├── process.db
│   │   ├── config.json
│   │   └── whitelist.json
│   │
│   ├── logs/                            # Logs (git-ignored)
│   │   └── audit_trail.log
│   │
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py
│   │   ├── test_tools.py
│   │   ├── test_handlers.py
│   │   └── fixtures.py
│   │
│   ├── docs/
│   │   ├── SETUP.md
│   │   ├── ARCHITECTURE.md
│   │   └── API.md
│   │
│   ├── scripts/
│   │   ├── install_deps.bat
│   │   ├── run_server.bat
│   │   └── check_admin.bat
│   │
│   ├── __init__.py
│   ├── main.py                          # CLI entry point
│   ├── server.py                        # FastMCP server setup
│   ├── requirements.txt
│   ├── setup.py
│   ├── .env
│   ├── .gitignore
│   └── README.md
│
├── desktop/                             # V2: Tauri Desktop App (later)
│   ├── src-tauri/
│   │   ├── main.rs
│   │   ├── Cargo.toml
│   │   └── src/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── App.tsx
│   ├── package.json
│   ├── tauri.conf.json
│   └── README.md
│
├── docs/                                # Project-level docs
│   ├── PROJECT_OVERVIEW.md
│   ├── ROADMAP.md
│   └── CONTRIBUTING.md
│
├── .gitignore
├── README.md                            # Root README
└── VERSION.md
```
