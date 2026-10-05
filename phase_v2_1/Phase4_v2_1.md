# Phase 4: Rollback Manager Backend

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 4
If a user kills the wrong process today, the only way back is to ask Claude to run `rollback_last_action`, and to hope the name matches the right kill. The desktop app has no way to undo anything.

Phase 4 builds the backend the Rollback Manager needs: a way to **list** what was killed, and a way to **restore one specific kill** exactly once. It has no UI. Phase 5 puts the page on top of it.

### 1.2 Where This Phase Sits
| | |
|---|---|
| Plan reference | `PLAN_V2_1.md` §5.1 and §5.2 (Step 4, backend half) |
| Depends on | Nothing. It can be built in parallel with Phases 1 to 3 |
| Unblocks | Phase 5 (Rollback Manager UI) |
| Layer | Backend only (`mcp-server/`) |

### 1.3 What Exists Today
The brief describes this feature as "just a UI layer" over data that is already logged. The kill data is there, but three things the UI needs are not.

**What is already in place:**
- `log_termination()` in `database/db.py` writes an `audit_log` row with `action_type = 'TERMINATED'` for every kill. It stores the process name, PID, executable path, memory freed, CPU freed, the reasoning and, since V2.0.1, the original command line as a JSON array.
- `rollback_process(pid_or_name)` in `handlers/termination_handler.py` looks up the most recent kill matching a name or PID and relaunches it with `subprocess.Popen(..., creationflags=0x00000008)`, a detached process.
- `_relaunch_argv(exe_path, stored_command_line)` rebuilds the arguments. The executable always comes from the audited path. Only the arguments come from the stored command line, so a tampered record cannot redirect the launch to another program.
- `log_rollback()` writes a separate row with `action_type = 'ROLLBACK'`.

**What is missing:**

| Gap | Why it matters to the UI |
|---|---|
| No REST endpoint lists kills or performs a rollback | The desktop app cannot reach any of this. Only the MCP tool can |
| The kill row does not store the **tier** | The brief asks for "which tier it was" |
| Rollback finds its target **by name**, taking the latest match | With two kills of `chrome.exe` in the list, clicking the older one would restore the newer |
| Nothing marks a kill as **already restored** | The UI cannot disable the button, and a double click launches the program twice |
| The kill response does not return the audit row's `id` | The UI cannot offer "Undo" straight after a kill |

---

## 2. Schema Changes

### 2.1 Two New Columns
Added to `audit_log` through the existing migration mechanism: `AUDIT_LOG_MIGRATIONS` in `database/models.py`, which `init_db()` applies to any database that lacks a column.

```python
AUDIT_LOG_MIGRATIONS = {
    "command_line":   "ALTER TABLE audit_log ADD COLUMN command_line TEXT",
    "tier":           "ALTER TABLE audit_log ADD COLUMN tier INTEGER",
    "rolled_back_at": "ALTER TABLE audit_log ADD COLUMN rolled_back_at DATETIME",
}
```

Both are also added to `CREATE_AUDIT_LOG_TABLE` for new databases.

| Column | Set on | Meaning |
|---|---|---|
| `tier` | `TERMINATED` rows | The tier the process had when the kill was approved |
| `rolled_back_at` | `TERMINATED` rows | When that kill was restored. NULL means not restored |

### 2.2 Kills From Before V2.1
Rows written by V2 and V2.0.1 have a NULL `tier`. The API returns `null` and the UI shows the tier as unknown. No value is guessed after the fact: a process's tier depends on its CPU and on whether it had a window at that moment, which cannot be reconstructed.

---

## 3. Recording the Tier and Returning the Record

### 3.1 Where the Tier Comes From
The tier is already known at the right moment. `stage_termination()` classifies the process and stores the result in `PENDING_APPROVALS[pid]["tier"]`. `execute_approved_termination()` takes that entry with `take_approval()` before it kills. The value only needs passing along:

```
execute_approved_termination(pid, reasoning)
    entry = take_approval(pid)                    # has entry["tier"]
    ...
    terminate_process(pid, reasoning, tier=entry["tier"])
        log_termination(..., tier=tier)           # stored
```

- `tier` is a keyword argument with a default of `None` on both functions. Existing callers and the existing tests, which call `terminate_process(pid, reasoning)` directly, keep working.
- The tier stored is the one the user **saw and confirmed**. It is not re-classified at kill time.

### 3.2 Returning the Audit Id
`log_termination()` currently returns nothing. It changes to return the new row's `id`, or `None` if the write failed. `terminate_process()` adds it to its result as `audit_id`, and `POST /api/execute_termination` passes it through:

```json
{ "pid": 3589, "status": "success", "name": "Discord.exe",
  "path": "C:\\...\\Discord.exe", "freed_mb": 344.0, "freed_cpu": 0.9,
  "audit_id": "7d1f0c0e-6a55-4b1f-8e0a-3c1b7a5f2d90" }
```

This is an added field. Nothing that reads the response today breaks. Phase 5 uses it for an "Undo" action on the success toast.

---

## 4. Restoring One Specific Kill

### 4.1 New Database Functions
| Function | Purpose |
|---|---|
| `get_recent_kills(hours, limit)` | `TERMINATED` rows inside the window, newest first |
| `get_termination_by_id(audit_id)` | One `TERMINATED` row, or nothing |
| `claim_rollback(audit_id) -> bool` | Marks the row restored, if and only if it is not already |
| `release_rollback(audit_id)` | Clears the mark again after a failed launch |

### 4.2 Restore Exactly Once
A double click, or two windows, can send the same restore twice. The second must not start a second copy of the program. The guard is a single atomic statement, the same idea as the single-use approvals in `take_approval()`:

```sql
UPDATE audit_log
SET rolled_back_at = CURRENT_TIMESTAMP
WHERE id = ? AND action_type = 'TERMINATED' AND rolled_back_at IS NULL;
```

`claim_rollback()` returns true only when this changed one row. SQLite serialises writers, so of two simultaneous requests exactly one wins.

The order of operations is what makes it safe:

1. Look up the row. Not found: stop.
2. Check the executable. Missing: stop. Nothing has been claimed.
3. **Claim.** Lost the claim: stop with "already restored".
4. Launch.
5. Launch failed: **release** the claim, so the user can try again.
6. Launch succeeded: write the `ROLLBACK` row with `log_rollback()`, as today.

Claiming before launching, and not after, is deliberate. Claiming afterwards would leave a window in which two requests both launch.

### 4.3 Refactoring `rollback_process`
The relaunch logic is shared by two entry points, so it moves into one helper:

| Function | Used by | Finds the kill by |
|---|---|---|
| `_restore(row) -> dict` | Both of the below | It is given the row. Implements §4.2 |
| `rollback_by_id(audit_id)` | The new REST endpoint | Exact `id` |
| `rollback_process(pid_or_name)` | The existing `rollback_last_action` MCP tool | Latest match, as today |

`_relaunch_argv()` is reused unchanged.

### 4.4 A Behaviour Change for Claude
`get_last_terminated_process()` gains `AND rolled_back_at IS NULL`. The MCP tool therefore restores the most recent kill **that has not been restored yet**.

- **Before:** asking Claude to roll back `notepad.exe` twice launched Notepad twice.
- **After:** the second request restores the kill before that one, or reports that nothing is left to restore.

This is the correct behaviour for an undo, and it keeps the desktop app and Claude consistent: a kill restored from one is shown as restored in the other.

### 4.5 Result Statuses
`_restore()` returns a `status`, in the style of `execute_approved_termination()`:

| Status | Meaning | HTTP |
|---|---|---|
| `success` | The program was started | 200 |
| `not_found` | No kill has that id | 404 |
| `already_restored` | Someone restored it first | 409 |
| `no_path` | The kill was recorded without an executable path | 422 |
| `exe_missing` | The executable no longer exists on disk | 422 |
| `launch_failed` | Windows refused to start it | 500 |

`no_path` happens for real: `_terminate_blocking()` stores a NULL path when Windows denies access to `proc.exe()`. Such a process can be killed but never restored.

---

## 5. REST Endpoints

Both go in a **new** `mcp-server/routes/kills.py`, attached with `app.include_router()`, as the history routes were in Phase 2.

### 5.1 `GET /api/kills`
| Parameter | Type | Default | Rule |
|---|---|---|---|
| `hours` | integer | 24 | 1 to 168 |

```json
{
  "backend_elevated": true,
  "kills": [
    {
      "id": "7d1f0c0e-6a55-4b1f-8e0a-3c1b7a5f2d90",
      "name": "Discord.exe",
      "pid": 3589,
      "tier": 3,
      "killed_at": "2026-10-05T09:41:07Z",
      "memory_freed_mb": 344.0,
      "cpu_freed_pct": 0.9,
      "executable_path": "C:\\Users\\...\\Discord.exe",
      "reasoning": "User confirmed termination via KavanMCP UI",
      "rolled_back_at": null,
      "can_restore": true,
      "restore_blocked_reason": null
    }
  ]
}
```

- `can_restore` is computed by the server for each row: the path is recorded, the file exists, and the kill has not been restored.
- `restore_blocked_reason` is `no_path`, `exe_missing` or `already_restored` when `can_restore` is false. The UI turns it into words.
- The list is capped at 200 rows. Twenty-four hours of kills is normally a handful.
- `BLOCKED` and `ROLLBACK` rows are not included. This endpoint lists kills only.

### 5.2 `POST /api/rollback`
Request: `{ "id": "7d1f0c0e-6a55-4b1f-8e0a-3c1b7a5f2d90" }`

Success:

```json
{ "status": "success", "id": "7d1f0c0e-...", "name": "Discord.exe",
  "new_pid": 18244, "rolled_back_at": "2026-10-05T09:43:30Z" }
```

Failure uses the shape the kill endpoints already use, so `ApiError` in `desktop/src/services/api.ts` reads it with no change:

```json
{ "detail": { "code": "exe_missing", "message": "Discord.exe can no longer be found at its original location." } }
```

### 5.3 No Confirmation Step
Killing takes two requests, confirm then execute, because it destroys something. Restoring only starts a program the user was already running, so it is one request. The exactly-once guard in §4.2 covers the one real risk, a duplicate launch.

---

## 6. Security Notes

### 6.1 What the Endpoint Can Start
`POST /api/rollback` makes the backend start a program, so what it can start is tightly bounded:

- The request carries only an audit row `id`. It cannot name a path or pass arguments.
- The executable is the path Kavan itself recorded when it killed the process.
- Arguments come from the same record, through `_relaunch_argv()`.
- A row must have `action_type = 'TERMINATED'`. A `BLOCKED` or `ROLLBACK` row can never be restored.
- The route sits behind `LocalOnlyMiddleware`, so a web page cannot call it.

The endpoint can therefore only restart something this machine's own Kavan stopped.

### 6.2 Privilege of the Restored Process (Known Limitation)
A relaunched process inherits the privileges of the backend. If the backend runs as Administrator, which `main.py` recommends for full function, a restored program runs **elevated**, even if it was not elevated before it was killed.

This is true today for the MCP tool as well. It is not introduced by V2.1, but a one-click button makes it easier to meet. Phase 4 does not change the launch method. It reports the fact, so the UI can say so:

- `is_admin()` moves from `main.py` to `utils/privileges.py` so the route can call it.
- `GET /api/kills` returns it as `backend_elevated`.
- Phase 5 shows a line of warning when it is true.

Starting the program without elevation from an elevated backend is possible but loses the original arguments. It is left for a later version.

### 6.3 What a Restore Cannot Do
A restore starts the program again. It does not bring back unsaved work, open documents or the window's position. The API makes no claim otherwise, and Phase 5 states it on the page.

---

## 7. Files Touched

| File | Change |
|---|---|
| `mcp-server/database/models.py` | `tier` and `rolled_back_at` in the table and in `AUDIT_LOG_MIGRATIONS` |
| `mcp-server/database/db.py` | `log_termination()` takes `tier` and returns the id. Add the four functions of §4.1. `get_last_terminated_process()` skips restored kills |
| `mcp-server/handlers/termination_handler.py` | Pass `tier` through. Return `audit_id`. Add `_restore()` and `rollback_by_id()`. `rollback_process()` uses `_restore()` |
| `mcp-server/utils/privileges.py` | **New.** `is_admin()`, moved from `main.py` |
| `mcp-server/main.py` | Import `is_admin()` from its new home |
| `mcp-server/routes/kills.py` | **New.** `/api/kills`, `/api/rollback` |
| `mcp-server/ws_server.py` | Include the router |
| `docs/` | The two endpoints, and the new `audit_id` field |

The MCP tool `rollback_last_action` keeps its name, its parameter and its response shape.

---

## 8. Tests

Additions to `mcp-server/tests/test_rollback.py`, which already kills and restores a real dummy process, and a new `test_kills_api.py`. All use the isolated database from `conftest.py`. No test ever relaunches a real application: the dummy process is the Python interpreter running a short script, as in the existing rollback test.

| Test | Proves |
|---|---|
| Kill through the API, then read the row | `tier` is stored and matches what `confirm_termination` returned |
| The execute response | Contains an `audit_id` that matches the stored row |
| Two kills of the same program, restore the **older** by id | The older kill's arguments are used, and only that row is marked |
| Restore the same id twice | Second call is 409 `already_restored`, and exactly one process was started |
| Two restores of one id sent concurrently | Exactly one succeeds |
| Executable deleted after the kill | `can_restore` is false with `exe_missing`. The restore is 422, and the row is **not** marked |
| A kill with a NULL path | `can_restore` is false with `no_path` |
| `Popen` made to raise | Status `launch_failed`, and `rolled_back_at` is NULL again so a retry is possible |
| Unknown id | 404 |
| The id of a `BLOCKED` row | 404. Only kills can be restored |
| `rollback_last_action` called twice for one name with two kills | Restores the newer, then the older |
| `rollback_last_action` with nothing left | A clear error, and nothing is launched |
| Kills at 2 hours and at 30 hours old, `hours=24` | Only the first is listed |
| `hours=0`, `hours=1000` | 400 |
| A V2.0.1 database | `init_db()` adds both columns and keeps the old rows, with `tier` NULL |
| A foreign `Origin` on both routes | 403 |
| The existing rollback tests | Still pass unchanged |

---

## 9. Definition of Done (Success Criteria)

Phase 4 is complete when all of these hold:

1. **Kills can be listed.** `GET /api/kills` returns every kill in the window, newest first, with name, time, memory freed and tier.
2. **The tier is recorded.** A kill made after this phase stores the tier the user confirmed.
3. **Restore is exact.** `POST /api/rollback` restores the kill with the given id and no other, with its original arguments.
4. **Restore is once.** A second restore of the same kill is refused and starts nothing.
5. **Failures are honest.** A missing executable or a failed launch is reported with a specific code, and a failed launch can be retried.
6. **The server says what can be restored.** Every listed kill carries `can_restore` and, when false, the reason.
7. **Undo is possible.** The kill response carries the `audit_id`.
8. **Claude and the app agree.** A kill restored by one is seen as restored by the other, and Claude's tool never restores the same kill twice.
9. **Bounded.** The endpoint cannot be made to start anything Kavan did not itself stop, and it refuses foreign origins.
10. **Upgrade is clean.** A V2.0.1 database gains the columns and keeps its history.
11. **No regressions.** The existing tests pass, including the kill flow.

Once these pass, the desktop app has everything it needs to offer an undo, and we are ready for **Phase 5: Rollback Manager UI**.
