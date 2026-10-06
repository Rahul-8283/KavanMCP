# CLAUDE.md — KavanMCP Development Guide

## Project Overview

**KavanMCP** is a dual-interface AI-powered system optimizer for Windows. It intelligently monitors, analyzes, and safely terminates resource-hogging processes with a strict 4-Tier security engine to prevent catastrophic system failures.

### Core Value Proposition
- **Dual Interface:** Claude Desktop (AI agent via MCP) + Tauri Desktop App (real-time GUI dashboard)
- **Zero-Lock Concurrency:** Both interfaces read/write to the same SQLite audit database simultaneously
- **Ironclad Safety:** 4-Tier gating ensures Tier 1 (system critical) processes are physically un-killable
- **Offline & Local:** No cloud, no API keys, no telemetry. Everything runs on localhost.

---

## Architecture at a Glance

### Three-Layer Stack

```
┌─────────────────────────────────────────────────────┐
│ Layer A: Claude Desktop (stdio) → MCP Tools         │
│ Layer B: Tauri Desktop App (React) → HTTP/WebSocket │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│ Layer C: FastMCP Backend (Python)                   │
│ • 7 MCP Tools (analyze, list, explain, kill...)     │
│ • FastAPI/WebSocket server on 127.0.0.1:8000        │
│ • psutil system inspection + pywin32 deep hooks     │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│ SQLite Audit Database (process.db)                  │
│ • Termination log with 24h rollback history         │
│ • System baselines for anomaly detection            │
└─────────────────────────────────────────────────────┘
```

### Directory Structure

```
KavanMCP/
├── mcp-server/                          # Python FastMCP backend
│   ├── main.py                          # Entry point; boots server + WS + TTL sweeper
│   ├── server.py                        # 7 MCP tool definitions
│   ├── ws_server.py                     # FastAPI app (metrics, kill endpoints)
│   ├── handlers/
│   │   ├── approval_handler.py          # PENDING_APPROVALS TTL state
│   │   ├── classification_handler.py    # 4-Tier classification logic
│   │   ├── termination_handler.py       # psutil.kill() + rollback
│   │   └── alert_handler.py             # Threshold evaluation
│   ├── tools/
│   │   ├── analyze_system.py            # Resource analysis
│   │   ├── list_processes.py            # Process enumeration
│   │   ├── confirm_termination.py       # 2-step kill gate
│   │   ├── execute_termination.py       # Physical termination
│   │   ├── audit_tools.py               # Audit log viewing
│   │   └── rollback_tool.py             # Process resurrection
│   ├── config/
│   │   ├── whitelist.py                 # Tier 1 process loading
│   │   └── settings_manager.py          # Threshold config (JSON file)
│   ├── database/
│   │   ├── db.py                        # SQLite async helpers
│   │   └── models.py                    # SQL schema definitions
│   ├── integrations/
│   │   ├── monitor.py                   # psutil metrics polling
│   │   └── windows.py                   # pywin32 deep inspection
│   ├── utils/
│   │   ├── logger.py                    # Structured logging
│   │   ├── error_handlers.py            # Safe MCP tool wrapper
│   │   └── schemas.py                   # Pydantic validation
│   ├── tests/                           # Unit tests (approval, classification, DB)
│   └── resources/
│       └── tier_1_processes.json        # Hardcoded Tier 1 whitelist
│
├── desktop/                             # React + Tauri frontend
│   ├── src-tauri/                       # Rust / Tauri core
│   │   ├── src/
│   │   │   ├── main.rs                  # Tauri window init (mostly empty)
│   │   │   └── lib.rs                   # Tauri plugin setup
│   │   └── tauri.conf.json              # Tauri config (window, capabilities, icons)
│   │
│   ├── src/
│   │   ├── App.tsx                      # Root component; hook initialization
│   │   ├── main.tsx                     # React entry
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx            # Gauges + process table view
│   │   │   └── Settings.tsx             # Threshold sliders + theme toggle
│   │   ├── components/
│   │   │   ├── common/
│   │   │   │   ├── ErrorBoundary.tsx    # React error catch-all
│   │   │   │   ├── Toast.tsx            # Single alert component
│   │   │   │   └── ToastContainer.tsx   # Toast queue renderer
│   │   │   ├── dashboard/
│   │   │   │   ├── GaugeCard.tsx        # CPU/RAM/Disk gauge (Recharts)
│   │   │   │   ├── ProcessTable.tsx     # Virtualized process table
│   │   │   │   └── TierBadge.tsx        # Tier 1-4 visual labels
│   │   │   └── layout/
│   │   │       ├── Header.tsx           # Top bar + status dot
│   │   │       ├── Sidebar.tsx          # Navigation rail
│   │   │       └── MainLayout.tsx       # Shell wrapper
│   │   ├── context/
│   │   │   ├── MetricsContext.tsx       # CPU/RAM/Disk state (updates 2s)
│   │   │   ├── ProcessContext.tsx       # Process list + loading
│   │   │   ├── ConfigContext.tsx        # Theme + thresholds
│   │   │   └── ToastContext.tsx         # Alert queue
│   │   ├── hooks/
│   │   │   ├── useWebSocketConnection.ts # WS lifecycle + reconnect backoff
│   │   │   ├── useProcessManager.ts     # Fetch/update/kill processes
│   │   │   ├── useTrayIntegration.ts    # System tray icon swapping
│   │   │   └── useWindowLifecycle.ts    # Hide-on-close behavior
│   │   ├── services/
│   │   │   └── api.ts                   # Axios instance + API contract
│   │   └── styles/
│   │       └── index.css                # Tailwind + CSS variables
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── docs/
│   ├── PRD_v2.md                        # Product Requirements Document
│   ├── TRD_v2.md                        # Technical Requirements Document
│   └── API_v1.md                        # REST/MCP API reference
│
├── phases_v2/
│   ├── Phase0_v2.md — Phase10_v2.md     # 11-phase development blueprint
│   └── custom_titlebar.md               # Borderless window plan
│
├── .gitignore
├── CLAUDE.md                            # This file
└── README.md
```

---

## Git Workflow & Commit Discipline

### Before Any Commit: Ask First

1. **Show your plan.** In the conversation, describe what you're about to change.
2. **Wait for approval.** Do not commit until the user acknowledges.
3. **Example:**
   ```
   I'm about to:
   - Add /api/confirm_termination endpoint to ws_server.py
   - Implement POST handler with PID validation
   - Wire up Toast on error in ProcessTable.tsx
   
   Is this aligned with Phase 8 goals?
   ```

### Conventional Commit Format

Every commit message must follow this pattern (no task numbers, no "task 1-2" style):

```
type(scope): description

Optional body paragraph(s)

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

#### Valid Types
- `feat:` — New feature or component
- `fix:` — Bug fix
- `chore:` — Dependencies, config, tooling
- `style:` — CSS, Tailwind, design tokens
- `refactor:` — Code restructure, no behavior change
- `docs:` — Documentation only
- `phase(N):` — Phase-level milestone (e.g., `phase(8): implement kill flow`)

#### Examples
```bash
# Feature
git commit -m "feat(ws_server): add /api/confirm_termination endpoint

Implements Step 1 of Phase 8 kill flow. Validates PID, checks approval TTL, 
rejects Tier 1 processes.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"

# Bug fix
git commit -m "fix(MetricsContext): prevent NaN when WebSocket disconnects

Gracefully fall back to '--%' display instead of crashing.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"

# Phase milestone
git commit -m "phase(6): complete toast alert system

- Implement ToastContext + auto-dismissal
- Wire WebSocket alerts to toast queue
- Add native Tauri notifications

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

### Push Immediately After Each Commit

```bash
git commit -m "feat: ..."
git push origin BRANCH_NAME  # Push right away; no batching
```

### Pull Requests (GitHub)

When creating/merging a PR:
1. **PR Title:** Follow conventional commit format with phase number at the **end**
   - ✅ `feat: kill flow & settings fixes & tray fixes (phase(8))`
   - ❌ `phase(8): kill flow & fixes` or `implement kill` or `Merge pull request #42...`

2. **PR Description:** Include summary, test plan, and co-author line
   ```markdown
   ## Summary
   - Adds right-click context menu to ProcessTable
   - Implements kill confirmation modal with Tier safety gates
   - Wires up confirm_termination API call
   
   ## Test Plan
   - [ ] Right-click a Tier 3 process and verify modal opens
   - [ ] Verify Tier 1 process has disabled Confirm button
   - [ ] Verify successful kill removes row from table optimistically
   - [ ] Verify 403 error shows Toast with Admin message
   
   Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
   ```

3. **Merge Commit:** Use the PR title as the merge message (GitHub auto-fills this correctly if you don't override it).

4. **After Merge:** Immediately sync your local checkout to the updated main branch
   ```bash
   git checkout main
   git fetch --all
   git pull origin main
   ```
   This ensures you're always working from the latest merged state before starting the next phase.

---

## Development Patterns & Standards

### Python Backend (FastMCP)

#### Admin Check
Always verify `is_admin()` at startup. Many tools require Administrator privileges.
```python
def is_admin() -> bool:
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except AttributeError:
        return False
```

#### Async First
Use `async`/`await` throughout. Database calls must use `aiosqlite`.
```python
async def confirm_termination_logic(pids: list[int]) -> str:
    results = []
    for pid in pids:
        tier = classify_process(...)  # Sync
        await log_blocked_action(...) # Async; always await
    return "\n".join(results)
```

#### Error Handling
Wrap MCP tools with the `@safe_mcp_tool` decorator to ensure exceptions don't crash the stdio connection.
```python
from utils.error_handlers import safe_mcp_tool

@mcp.tool()
@safe_mcp_tool
async def my_tool() -> str:
    # If this throws, the decorator catches it gracefully
    return "result"
```

#### Logging
Use the structured logger from `utils/logger.py`. Never use `print()`.
```python
from utils.logger import logger

logger.info("Starting termination process...")
logger.warning("Process is Tier 1; blocking.")
logger.error(f"Failed to kill PID {pid}: {e}")
```

#### Pydantic Validation
All REST API payloads use Pydantic for type safety.
```python
from pydantic import BaseModel, Field

class ConfigUpdate(BaseModel):
    cpu_threshold: Optional[int] = Field(None, ge=0, le=100)
    ram_threshold: Optional[int] = Field(None, ge=0, le=100)
```

### React Frontend (Tauri)

#### Context over Props
Use React Context for global state (Metrics, Processes, Config, Toast). Avoid prop-drilling.
```typescript
// Inside a component
const { cpu, ram } = useContext(MetricsContext);
const { addToast } = useToast();

addToast("CPU spike detected!", "warning");
```

#### Custom Hooks for Logic
Abstract complex lifecycle logic into custom hooks (e.g., `useWebSocketConnection`, `useProcessManager`).
```typescript
export function useProcessManager() {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshProcesses = async () => {
    setIsLoading(true);
    const data = await SystemAPI.fetchProcesses();
    setProcesses(data);
    setIsLoading(false);
  };

  return { processes, isLoading, refreshProcesses };
}
```

#### Optimistic Updates
When deleting a process, remove it from the UI immediately (before the API confirms).
```typescript
// User clicks confirm → API request fires in the background
setProcesses(p => p.filter(proc => proc.pid !== targetPid));

// If API fails, show a Toast error (but don't re-fetch all 500 processes)
```

#### Memoization
Wrap expensive computations in `useMemo` to prevent re-renders.
```typescript
const sortedAndFiltered = useMemo(() => {
  let data = processes;
  if (filterTier !== 'ALL') {
    data = data.filter(p => p.tier === filterTier);
  }
  return data.sort((a, b) => b.cpu_percent - a.cpu_percent);
}, [processes, filterTier]);
```

#### Tailwind + CSS Variables
Use Tailwind utility classes. For theme-aware colors, define CSS variables in `index.css`.
```css
:root {
  --bg-primary: #ffffff;
  --text-primary: #1f2937;
  --accent: #3b82f6;
}

[data-theme="dark"] {
  --bg-primary: #1f2937;
  --text-primary: #f3f4f6;
  --accent: #60a5fa;
}
```

#### Error Boundaries
Wrap pages/sections in `<ErrorBoundary />` to catch rendering crashes.
```typescript
<ErrorBoundary>
  <Dashboard />
</ErrorBoundary>
```

#### Debouncing Network Requests
For user interactions like sliders, debounce API calls to avoid request spam.
```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    SystemAPI.updateThresholds({ cpu_threshold: localValue });
  }, 500); // Wait 500ms after user stops dragging
  
  return () => clearTimeout(timer);
}, [localValue]);
```

---

## Security & Safety (The 4-Tier Engine)

### Tier Classification

1. **Tier 1 (System Critical):** Hardcoded whitelist in `resources/tier_1_processes.json`. Cannot be killed by LLM or GUI.
   - Example: `explorer.exe`, `svchost.exe`, `System`
   - UI Behavior: Confirm button **disabled**

2. **Tier 2 (Essential Apps):** Hardcoded in `handlers/classification_handler.py::TIER_2_ESSENTIAL`. Requires single confirmation.
   - Example: `code.exe`, `chrome.exe`, `discord.exe`
   - UI Behavior: Modal shows "WARNING: Essential process"

3. **Tier 3 (Background Tasks):** Default for unlisted processes. Requires dual confirmation.
   - Example: `python.exe`, `spotify.exe`, background updaters
   - UI Behavior: Modal shows "Safe to terminate"

4. **Tier 4 (Suspicious Anomalies):** High CPU (>25%) + headless. Reserved for unknown resource hogs.
   - UI Behavior: Modal shows "Unverified process. Termination recommended."
   - **Current Issue:** `is_headless=False` hardcoded in `approval_handler.py` → Tier 4 unreachable

### Kill Flow Safety Gates (Phase 8)

```
User Right-Clicks Process
  ↓
confirm_termination(pid)
  ↓ [Backend: Classify tier, check approval TTL, store in PENDING_APPROVALS]
  ↓
Modal Shows (Tier-Specific Warning)
  ↓
User Clicks "Confirm" (Button may be disabled for Tier 1)
  ↓
execute_termination(pid)
  ↓ [Backend: Verify PID still in PENDING_APPROVALS, call psutil.kill(), log to audit DB]
  ↓
Row Vanishes; Success Toast
```

### Approval TTL

The `PENDING_APPROVALS` dictionary stores PIDs for **5 minutes**. If a user confirms and waits 6 minutes to click execute, the approval expires and execution is blocked.

```python
APPROVAL_TIMEOUT_SECONDS = 300  # 5 minutes
```

---

## Phase Structure & Development Flow

### 11 Phases (V2 Roadmap)

| Phase | Component | Status |
|-------|-----------|--------|
| 0 | Tauri Setup | ✅ Done |
| 1 | App Shell + Context | ✅ Done |
| 2 | WebSocket + Gauges | ✅ Done |
| 3 | Process Table | ✅ Done |
| 4 | Sort/Filter | ✅ Done |
| 5 | Settings + Thresholds | ✅ Done |
| 6 | Toast Alerts | ✅ Done |
| 7 | Tray Integration | ✅ Done |
| 8 | Kill Flow | ✅ Done |
| 9 | Feature Testing | ❌ Not started |
| 10 | E2E + Claude Sync | ❌ Not started |

Each phase has detailed requirements in `phases_v2/Phase{N}_v2.md`.

### When Starting a Phase

1. **Read the phase document** (`phases_v2/Phase{N}_v2.md`).
2. **Identify missing pieces** (e.g., Phase 8 needed kill flow UI and endpoints).
3. **Ask for approval** on the specific changes.
4. **Use phase commits:** `feat: description of changes (phase(N))`
5. **Reference the DoD (Definition of Done)** at the end of the phase doc to verify completion.
6. **PR Title format:** Feature description first, phase marker at the end: `feat: title (phase(N))`

---

## Known Issues & Tech Debt

### Resolved on `feat/upgrade` (V1/V2 audit)

**Safety**
1. Tier 1 hard block now also sits in `_terminate_blocking`, directly in front of the OS call (TRD 6.1)
2. Whitelist fails closed: a built-in list is merged in, so a missing/corrupt JSON cannot leave it empty
3. Whitelist covers session-critical processes (`winlogon.exe`, `dwm.exe`, `Registry`, `lsaiso.exe`, …)
4. The server refuses to terminate its own process or the process that launched it (`self_protected`)
5. A forced kill that does not take effect is reported as an error instead of a success
6. Foreign web origins and DNS-rebinding hosts are rejected for both HTTP and WebSocket

**Correctness**
7. Tier 4 is reachable: headless state is computed from visible top-level windows and shared by the
   listing, `analyze_system` and the confirm gate, so all three agree on a tier
8. Rollback is written to the audit log (the insert violated NOT NULL and always failed) and
   relaunches with the original arguments, stored in `audit_log.command_line`
9. Audit log filters by time window in SQL instead of after a 100-row cap
10. Audit writes no longer lost to "database is locked" (busy timeout + `synchronous=NORMAL`)
11. Invalid settings are rejected rather than persisted; `payload.dict()` → `model_dump()`
12. Metrics keep streaming during a threshold alert; `on_event` → `lifespan`
13. `System Idle Process` is no longer reported as the top CPU consumer

**Completeness / performance**
14. `explain_process` implemented (PRD 7, TRD 5.2) — it was specified but missing
15. `list_processes` omits Tier 1 by default, per TRD 5.1
16. MCP scans run off the event loop; the scan itself is ~3x faster (dropped per-process `status`)
17. A second instance (Claude Desktop's own `main.py`) runs MCP-only when port 8000 is taken

### Remaining Known Issues

1. **No Frontend Tests:** The Python backend has 115 tests. There are no unit/integration tests for
   React components or hooks; the UI is still verified manually.
2. **Tier 2 List Hardcoded:** `TIER_2_ESSENTIAL` lives in `classification_handler.py`. The TRD
   describes user-defined essential apps, so it should move to JSON config like the Tier 1 list.
3. **`is_approved()` Unused in Production:** `take_approval()` superseded it; only tests call it now.
4. **Baselines Table Unused:** `system_baselines` is created but never written, so anomaly detection
   compares against fixed thresholds rather than a learned per-process baseline (TRD 4.1).

---

## Starting a New Task

### Template for "Show Your Plan"

```
I'm proposing to implement [Feature Name] as part of Phase [N].

Changes:
1. **Backend (Python):**
   - Add endpoint: `POST /api/endpoint_name`
   - Handler logic in [file]
   - Database changes: [schema updates]

2. **Frontend (React):**
   - New component: `<ComponentName />`
   - Update context: [which context]
   - Wire API in [hook/page]

3. **Testing:**
   - Manual test plan: [steps]
   - Affected files: [list]

Estimated scope: [small/medium/large]
Blocking issues: [any from Known Issues above?]

Ready to proceed?
```

---

## Quick Reference: Key Files

| Purpose | File | Notes |
|---------|------|-------|
| Backend entry | `mcp-server/main.py` | Boots server, WS, TTL sweeper |
| MCP tools | `mcp-server/server.py` | 6 tool definitions (analyze, list, confirm, execute, audit, rollback) |
| FastAPI app | `mcp-server/ws_server.py` | REST endpoints + WebSocket broadcaster |
| Tier logic | `mcp-server/handlers/classification_handler.py` | classify_process() function |
| Kill flow | `mcp-server/handlers/approval_handler.py`, `handlers/termination_handler.py` | PENDING_APPROVALS, terminate_process() |
| Tier 1 whitelist | `mcp-server/config/whitelist.py` | Loads `resources/tier_1_processes.json` |
| Database | `mcp-server/database/db.py` | Async SQLite helpers |
| React root | `desktop/src/App.tsx` | Hook initialization; provider wrapping |
| Pages | `desktop/src/pages/Dashboard.tsx`, `Settings.tsx` | High-level containers |
| Components | `desktop/src/components/` | Reusable UI fragments |
| Contexts | `desktop/src/context/` | Global state (Metrics, Process, Config, Toast) |
| Hooks | `desktop/src/hooks/` | Complex logic extraction (WS, Process Manager, Tray, Lifecycle) |
| API layer | `desktop/src/services/api.ts` | Axios instance + contract |
| Phase docs | `phases_v2/Phase{N}_v2.md` | Detailed phase requirements |

---

## Useful Commands

### Backend (Python)

```bash
# Install dependencies
cd mcp-server
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# Run locally (requires Admin on Windows)
python main.py

# Run tests
python -m pytest tests/test_approval.py -v
python -m pytest tests/test_classification.py -v

# Check logs
cat mcp-server/logs/kavan.log
```

### Frontend (Tauri + React)

```bash
# Install dependencies
cd desktop
npm install

# Dev server (hot reload)
npm run tauri dev

# Build release binary
npm run tauri build

# Type check
npx tsc --noEmit

# Lint
npx eslint src/ --fix
```

### Git

```bash
# Show pending changes
git status
git diff

# Create a new feature branch
git checkout -b feat/phase-8-kill-flow

# Commit with co-author
git commit -m "feat(ProcessTable): add right-click kill context menu

$(cat <<'EOF'

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"

# Push immediately
git push origin feat/phase-8-kill-flow
```

---

## Phase-Completion Docs Commit

The README header carries two hand-kept badges. The repository is private, so the live
shields.io `last-commit` badge cannot read it and showed "repo not found"; both badges are
static and are updated by hand.

**When a phase is finished** (all of its commits are pushed, before the PR), make one last
commit on the phase branch that updates only these:

1. **Tests badge** in `README.md`, and the `# N passed` line under "Run the test suite".
   Get the number from `cd mcp-server && python -m pytest -q`, never from memory.
   - All green: `Tests-N%20passing-brightgreen`
   - Any failure: `Tests-N%20passing%20%C2%B7%20F%20failing-yellow`. Never hide a failure.
2. **Last commit badge** in `README.md`: the date (`YYYY--MM--DD`, hyphens doubled for
   shields.io) and short hash of the phase's last commit *before* this docs commit, and the
   same hash in its link. The docs commit cannot name itself.
3. **`CLAUDE.md`**: the test count in "Remaining Known Issues", and the footer
   (Last Updated, Current Phase, Next Priority).

Commit message: `docs: update test count and last commit for <phase>`. No other changes.

---

## Final Reminders

1. **Always ask before committing.** Show the plan. Wait for approval.
2. **Use conventional commits.** No task numbers. Always co-author.
3. **Push immediately.** Don't batch pushes to end-of-phase.
4. **Reference phases.** Use `phase(N): description` for milestone commits.
5. **Read phase docs.** Each phase has a Definition of Done. Hit all checks before marking complete.
6. **Safety first.** The 4-Tier engine is sacred. Never weaken Tier 1 protections.
7. **Keep it simple.** Prefer composition over inheritance. Use React Context, not Redux.
8. **Test manually.** For a system utility, manual testing (stress, offline, edge cases) is essential.
9. **Close each phase with the docs commit** described in "Phase-Completion Docs Commit".

---

**Last Updated:** October 6, 2026 (V2.1 Phase 2, Alert History, complete on branch `v2_1_2`)
**Current Phase:** V2.1 Phase 2 (✅ Complete, PR pending). Plans are in `phase_v2_1/`
**Next Priority:** V2.1 Phase 3 (Performance Graphs)
