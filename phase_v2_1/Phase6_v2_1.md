# Phase 6: Whitelist & Auto-start Settings

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 6
V2 lets the user tune three thresholds, a theme and a sound toggle. Phase 6 adds the two settings that change what Kavan is allowed to do and when it runs:

1. **Protected apps (the whitelist).** Apps the user never wants alerted on, and apps the user never wants killed, by anyone, including Claude.
2. **Start with Windows.** A toggle that starts Kavan at sign-in.

This is the only phase of V2.1 that changes the security engine. "Never kill" is a new rule about what may be terminated, so it is enforced in the backend, at the same layer as the Tier 1 block, and not in the UI.

### 1.2 Where This Phase Sits
| | |
|---|---|
| Plan reference | `PLAN_V2_1.md` §6.1 and §6.2 (Step 5, first half) |
| Depends on | Phase 1 (the `muted` column and the episode tracker), Phase 4 (the kill path is settled) |
| Unblocks | Phase 7 (which adds the remaining settings to the same storage) |
| Layer | Backend, the Tauri (Rust) shell and the desktop UI |

### 1.3 What Exists Today
**Settings storage**
- `mcp-server/config/settings_manager.py` holds `DEFAULT_CONFIG`, validates input in `_valid_entries()`, and keeps the live values in `ACTIVE_CONFIG`.
- Values are saved to `mcp-server/config/settings.json`. **That file is tracked in git.** Moving a slider in the app already modifies a tracked file.
- The tests in `tests/test_phase9_backend.py` write to that real file and restore it afterwards.
- `POST /api/update_thresholds` accepts a `ConfigUpdate` model with five optional fields. Despite its name it is already the general settings endpoint: it saves the theme and the sound toggle too.

**The kill path** has three gates, in order:
- `stage_termination()` in `handlers/approval_handler.py` refuses KavanMCP's own processes and Tier 1.
- `execute_approved_termination()` in `handlers/termination_handler.py` checks the approval, the PID identity and Tier 1 again.
- `_terminate_blocking()` checks Tier 1 once more, directly in front of the OS call.

Refusals carry a `status` (`tier1_blocked`, `self_protected` and so on). `KILL_HTTP_STATUS` in `ws_server.py` maps each to an HTTP code, and `execute_termination_logic()` reports safety refusals to Claude as `blocked`.

**The Tauri shell**
- `desktop/src-tauri/src/lib.rs` registers two plugins, notification and opener, and two commands, `greet` and `quit_app`.
- The window is created visible (`"visible": true` in `tauri.conf.json`).
- Nothing prevents a second copy of the app from starting.

**Starting the backend**
- The backend is started by hand with `python main.py`, or by Claude Desktop.
- `main.py` runs the dashboard server in a background thread and then the MCP server on standard input and output in the main thread. It takes no command-line options.

### 1.4 Decisions This Phase Assumes
| Decision | Assumed answer | If the answer changes |
|---|---|---|
| `PLAN_V2_1.md` §9.1 Whitelist and safety | "Never kill" binds the desktop app **and** Claude, and can never weaken Tier 1 | §3 changes |
| `PLAN_V2_1.md` §9.2 Start with Windows | **Yes**, the desktop app starts the backend itself when none is running | If no, drop §5 and §6 entirely and do not ship the toggle. Starting only the window would open Kavan "Offline" at every sign-in |

---

## 2. Settings Storage Moves First

### 2.1 The Problem
The whitelist is a list of the apps on one person's machine. It must not live in a file that git tracks. `settings.json` is tracked today, so the first job of this phase is to move it.

### 2.2 The Change
- `CONFIG_PATH` in `settings_manager.py` becomes `mcp-server/data/settings.json`. The `data/` folder is already ignored by git and already holds the audit database.
- **One-time migration.** On load, if the new file is missing and the old one exists, its valid values are copied across. No user loses their thresholds.
- `mcp-server/config/settings.json` is removed from git and added to `.gitignore`. Defaults come from `DEFAULT_CONFIG` in code, where they already are.
- `tests/conftest.py` gains a session fixture that points `CONFIG_PATH` at a temporary file, exactly as `isolated_audit_db` does for the database. After this, no test touches a real settings file.

---

## 3. The Whitelist: Never Kill

### 3.1 The Setting
```python
DEFAULT_CONFIG = { ..., "never_kill": [], "never_alert": [] }
```

Validation in `_valid_entries()`, for both lists:

| Rule | Reason |
|---|---|
| Must be a list of strings | Anything else is dropped |
| Each name is trimmed and lower-cased | Matching is case-insensitive, like Tier 1 |
| 1 to 260 characters, no `\`, `/` or `:` | A process **name**, not a path |
| Duplicates removed, at most 200 entries | Keeps the file and the lookup small |

A list replaces the stored list as a whole. `ConfigUpdate` gains `never_kill: list[str] | None` and `never_alert: list[str] | None`.

### 3.2 Enforcement
A **new** module, `mcp-server/handlers/protection.py`:

```python
def is_user_protected(process_name: str) -> bool:
    """True when the user has put this process on the never-kill list."""
```

It reads `ACTIVE_CONFIG["never_kill"]`, so a change in Settings takes effect on the very next request, with no restart.

The check is added at two of the three gates:

| Gate | Behaviour |
|---|---|
| `stage_termination()` | After the Tier 1 check. Refuses with status `user_protected`, and records the attempt with `log_blocked_action()`, as it does for Tier 1 |
| `_terminate_blocking()` | Directly after the Tier 1 check, in front of the OS call. Refuses with `user_protected` |

- The lowest gate is the one that guarantees the rule. A process added to the list **between** confirm and execute is still refused, and so is any future caller that skips the upper gates.
- The middle gate, `execute_approved_termination()`, needs no change. It calls into the lowest gate.

The new status is wired through the two places every refusal goes:

- `KILL_HTTP_STATUS["user_protected"] = 403`.
- `execute_termination_logic()` adds it to the statuses reported to Claude as `blocked`.

The message is the same for both callers: `"notepad.exe is on your protected list. Remove it in Kavan's Settings to allow termination."`

### 3.3 Rules That Must Hold
1. **The whitelist only adds protection.** Tier 1 is checked first and separately. Nothing in the whitelist can make a Tier 1 process killable, and adding a Tier 1 name to it changes nothing.
2. **Claude cannot edit the whitelist.** No MCP tool writes settings, and this phase adds none. The only way to change the list is the desktop app, behind `LocalOnlyMiddleware`. A protection that the AI could switch off would not be a protection.
3. **The tier does not change.** A protected process keeps its real tier. Protection is a separate fact about it.
4. **Restoring is unaffected.** A protected app that was killed before it was protected can still be restored.

### 3.4 Showing It
`ProcessSchema` in `utils/schemas.py` gains `protected: bool = False`, set by `list_processes_logic()`. The desktop `Process` type gains the same field.

- **Process table:** a small shield icon beside the name of a protected process.
- **Terminate dialog:** for a protected process the Confirm button is disabled, as for Tier 1, with the text "Protected by you. Remove it from the protected list in Settings to terminate it."
- The dialog is a courtesy. If it were bypassed, the backend would still refuse.

---

## 4. The Whitelist: Never Alert

### 4.1 What It Means
`PLAN_V2_1.md` §6.1: an alert whose top process is on this list is **still recorded** but raises no toast and no sound. The user is not interrupted by an app they expect to be busy, and the history stays complete.

### 4.2 The Timing Problem
A CPU or memory alert fires the instant the threshold is crossed. The top process is only known about 1.5 seconds later, when the scan from Phase 1 §4.4 returns. So the toast cannot simply be "checked against the list" at the moment it is raised.

The first toast of an episode therefore **waits for the scan**:

1. The episode starts. The row is written immediately, as before.
2. The scan runs. No toast is sent yet.
3. The scan returns the top process.
   - On the never-alert list: the row is updated with `muted = 1`. No toast, no native notification and no sound are sent for this episode, including its repeats.
   - Not on the list: the toast is sent, about 2 seconds later than it is today.
4. If the scan fails, the toast is sent. A failure to identify the process must never silence an alert.

The episode tracker from Phase 1 gains a `muted` flag per open episode, which `build_alerts()` consults before sending a repeat.

- **Disk alerts** have no top process and are never muted.
- **Suspicious-process alerts** are about one named process. If that name is on the list, the episode is recorded muted from the start.

### 4.3 The Risk, Stated
Muting by top process can hide a real problem: the listed app may be the largest consumer while something else is also wrong. This is why the alert is still stored. The Alerts page from Phase 2 shows a "Muted" tag on such rows, and the graphs from Phase 3 still mark them.

---

## 5. Starting the Backend From the Desktop App

*This section and §6 apply only if `PLAN_V2_1.md` §9.2 is answered yes.*

### 5.1 Why It Is Needed
Start with Windows is only useful if Kavan works when it starts. Today, starting the window alone gives an "Offline" dashboard until the user opens a terminal.

### 5.2 A Dashboard-Only Mode for the Backend
`main.py` always runs the MCP server on standard input. Started in the background with no console, standard input is closed, the MCP server ends at once, and the process exits, taking the dashboard server with it.

`main.py` gains one option:

```
python main.py --dashboard-only
```

- Initialises the database and the approval sweeper as today.
- Runs `run_ws_server()` in the **main** thread and never starts the MCP transport.
- If port 8000 is already in use, it logs that and exits with code 0. Another instance is already serving the dashboard.

Without the option, `main.py` behaves exactly as today. Claude Desktop's configuration is not affected.

### 5.3 Telling the App Where the Backend Is
The installer does not bundle Python, and V2.1 does not change that. The app needs to be told once where the backend lives.

- A file `backend.json` in the app's own config folder (`%APPDATA%\com.rahul-ls.kavan\`):
  ```json
  { "python": "C:\\...\\mcp-server\\venv\\Scripts\\python.exe",
    "script": "C:\\...\\mcp-server\\main.py" }
  ```
- Settings gains a **Backend location** row. The user picks the `mcp-server` folder. The app derives the two paths, checks that both files exist, and saves them.
- The file is read and written by Rust commands. It holds paths only. The app runs the program directly with an argument list and never through a shell.

### 5.4 Launching
A new Rust command, `ensure_backend`, called once when the app starts:

1. Try to connect to `127.0.0.1:8000`. If something answers, do nothing.
2. If `backend.json` is missing or its files do not exist, do nothing. The app shows "Offline", as today.
3. Otherwise start `python main.py --dashboard-only` with no console window, with the script's folder as the working directory.
4. Keep the child process handle in the app's state.

The frontend needs no new logic. `useWebSocketConnection.ts` already retries with backoff, so it connects as soon as the backend is up.

### 5.5 Stopping
- **Quit** from the tray stops the backend **only if this app started it**. `quit_app` in `lib.rs` ends the stored child before exiting.
- A backend started by the user in a terminal, or by Claude Desktop, is never touched.
- Closing the window only hides it, as today. The backend keeps running and keeps recording history, which is the point of Phase 1.

### 5.6 Privileges (Known Limitation)
A backend started this way runs with the user's normal rights. Windows does not start elevated programs at sign-in without a prompt. Kavan therefore runs in the "degraded mode" `main.py` already describes: monitoring, history and most kills work, and killing a privileged process returns "Permission Denied. Please restart KavanMCP as Administrator."

The Startup section of Settings says this in one line. Users who need full rights start the backend as Administrator themselves, and the app detects it and starts nothing.

---

## 6. Start With Windows

### 6.1 The Toggle
The official Tauri plugin `tauri-plugin-autostart` registers the app under the current user's sign-in programs. No administrator rights are needed.

| Part | Change |
|---|---|
| `desktop/src-tauri/Cargo.toml` | Add `tauri-plugin-autostart` |
| `desktop/package.json` | Add `@tauri-apps/plugin-autostart` |
| `desktop/src-tauri/src/lib.rs` | Register the plugin, passing the launch argument `--minimized` |
| `desktop/src-tauri/capabilities/default.json` | Allow enable, disable and is-enabled |
| Settings page | A switch that calls the plugin's `enable()` and `disable()`, and reads `isEnabled()` on load |

The exact plugin and permission names are to be confirmed against the plugin's documentation for the Tauri 2 version in use when this is built.

This setting is **not** stored in the backend's `settings.json`. It is a fact about the Windows sign-in list, so it is read from there every time. It therefore works, and shows the truth, even when the backend is offline.

### 6.2 Starting Quietly
An app that opens a window at every sign-in is an annoyance. When started with `--minimized`, Kavan goes straight to the tray.

- `tauri.conf.json`: the window is created with `"visible": false`.
- In the app's `setup`, the window is shown unless `--minimized` was passed.
- Started by hand, the app opens exactly as today.

### 6.3 One Instance Only
With auto-start, the user will sooner or later launch Kavan while it is already in the tray. Today that would create a second app and a second tray icon. The official `tauri-plugin-single-instance` is added: a second launch brings the existing window forward and exits.

---

## 7. The Settings UI

### 7.1 Protected Apps
A new section on the Settings page, built from the existing `SettingsSection` component:

```
Protected apps
Apps Kavan should leave alone.

Never terminate                                             [ + Add app ]
  Code.exe  ✕     obs64.exe  ✕     steam.exe  ✕

Never alert on                                              [ + Add app ]
  MsMpEng.exe  ✕
```

- **Add app** opens a picker listing the names of running processes, taken from `ProcessContext` (scanned first if empty), with a search field. Choosing from running processes means the name always matches exactly. A name can also be typed, for an app that is not running now.
- Tier 1 processes appear in the "never terminate" picker as already protected and cannot be added. They are protected whatever the list says.
- Entries are removed with the ✕.
- Changes save through `updateSetting()` in `ConfigContext.tsx`, which already applies a change at once and rolls it back if the server rejects it. Its value type widens to accept a list of strings.

### 7.2 A Shortcut Where the User Already Is
The process table's right-click menu (`ProcessContextMenu.tsx`) gains two entries beneath "Terminate Process":

- **Protect from termination** (or "Remove protection")
- **Stop alerting on this app** (or "Alert on this app again")

The user protects an app at the moment they notice it, without a trip to Settings.

### 7.3 Startup
```
Startup
Start Kavan when you sign in to Windows                              [switch]
Kavan starts in the tray, without opening a window.

Backend location    C:\Projects\KavanMCP\mcp-server                  [Change]
Started at sign-in, Kavan runs without Administrator rights.
```

The switch is disabled, with an explanation, until a valid backend location is set.

---

## 8. Files Touched

| File | Change |
|---|---|
| `mcp-server/config/settings_manager.py` | New path and migration. `never_kill`, `never_alert` and their validation |
| `mcp-server/config/settings.json` | Removed from git |
| `.gitignore` | Ignore the old settings path |
| `mcp-server/handlers/protection.py` | **New.** `is_user_protected()` |
| `mcp-server/handlers/approval_handler.py` | `user_protected` refusal in `stage_termination()` |
| `mcp-server/handlers/termination_handler.py` | `user_protected` refusal in `_terminate_blocking()` |
| `mcp-server/handlers/history_recorder.py`, `ws_server.py` | Hold the first toast for the scan. Mute listed episodes |
| `mcp-server/tools/execute_termination.py`, `tools/list_processes.py`, `utils/schemas.py` | Report `user_protected` as blocked. `protected` on each process |
| `mcp-server/ws_server.py` | `ConfigUpdate` fields. `KILL_HTTP_STATUS` entry |
| `mcp-server/main.py` | `--dashboard-only` |
| `mcp-server/tests/conftest.py` | Isolated settings file |
| `desktop/src-tauri/Cargo.toml`, `src/lib.rs`, `capabilities/default.json`, `tauri.conf.json` | Two plugins, `ensure_backend`, backend location commands, hidden start, quit stops the child |
| `desktop/src/context/ConfigContext.tsx`, `ProcessContext.tsx`, `services/api.ts` | New fields and types |
| `desktop/src/pages/Settings.tsx`, `components/settings/*` | Protected apps and Startup sections |
| `desktop/src/components/dashboard/ProcessTable.tsx`, `ProcessContextMenu.tsx`, `KillConfirmModal.tsx` | Shield, menu entries, locked Confirm |

---

## 9. Tests

### 9.1 Automated (backend)
New file `mcp-server/tests/test_protection.py`, plus additions to the settings tests. Kills are tested on the dummy Python process the existing tests use.

| Test | Proves |
|---|---|
| Old settings file present, new one absent | Values are migrated on first load |
| Any test run | The real settings file is unchanged afterwards |
| A list with a path, a number, a blank, mixed case and a duplicate | Only the valid names are saved, lower-cased, once |
| 300 names | Refused or cut to 200. Never saved as sent |
| Confirm a kill of a protected process | 403 `user_protected`, nothing is staged, and a `BLOCKED` audit row is written |
| Confirm, **then** protect, then execute | Refused at the lowest gate. The process is still alive |
| `_terminate_blocking()` called directly on a protected process | Refused before any OS call, as the Tier 1 test proves for Tier 1 |
| The MCP tool on a protected process | Status `blocked`, with the protected-list message |
| A Tier 1 name added to the whitelist, then removed | Tier 1 is blocked before, during and after |
| Remove a name, kill again | The kill succeeds on the next request, with no restart |
| The list of MCP tools | None of them can write a setting |
| `list_processes` with a protected app running | That process has `protected: true` and its normal tier |
| CPU episode whose top process is on never-alert | Row stored with `muted = 1`. No `threshold_alert` is sent, at the start or on repeats |
| Same, with the scan made to fail | The toast **is** sent |
| A disk episode with every app on never-alert | Not muted |
| `main.py --dashboard-only` with port 8000 free | The dashboard answers and the process stays up with standard input closed |
| `main.py --dashboard-only` with port 8000 taken | Exits with code 0 |
| All existing kill and settings tests | Still pass |

### 9.2 Manual (desktop)
1. Protect Notepad from the right-click menu. *Expected:* a shield beside it, and it appears in Settings.
2. Try to terminate it. *Expected:* Confirm is disabled, with the protected message.
3. Ask Claude to kill Notepad. *Expected:* Claude reports it is blocked and why. Claude offers no way to unprotect it.
4. Remove the protection and terminate. *Expected:* it works at once.
5. Put a busy app on never-alert and push CPU over the limit with it. *Expected:* no toast and no sound, and the Alerts page shows the alert tagged "Muted".
6. Push CPU over the limit with a different app. *Expected:* the toast appears, about two seconds after the gauge turns crimson.
7. Set the backend location, close everything, start only the desktop app. *Expected:* the dashboard comes online by itself within a few seconds.
8. Quit from the tray. *Expected:* the backend the app started is gone. Repeat with a backend started in a terminal. *Expected:* that one keeps running.
9. Turn on Start with Windows, sign out and in. *Expected:* a tray icon, no window, and a working dashboard when opened.
10. Launch Kavan again while it is in the tray. *Expected:* the existing window comes forward. Still one tray icon.
11. Turn the toggle off, sign out and in. *Expected:* Kavan does not start.

---

## 10. Definition of Done (Success Criteria)

Phase 6 is complete when all of these hold:

1. **Personal settings are out of git.** Changing a setting no longer modifies a tracked file, and existing users keep their values.
2. **Never kill is absolute.** A protected app cannot be terminated from the desktop app or by Claude, including when it was protected after the kill was confirmed.
3. **Tier 1 is untouched.** No whitelist content makes a system process killable.
4. **Claude cannot unprotect.** No MCP tool can change the list.
5. **Never alert is quiet and honest.** A listed app raises no toast or sound, the alert is still in the history marked as muted, and a failed scan never silences an alert.
6. **Protection is visible.** The table and the terminate dialog both show it.
7. **The app can start its own backend.** With a backend location set, opening only the desktop app gives a working dashboard.
8. **It cleans up only its own.** Quit stops a backend the app started and no other.
9. **Start with Windows works.** Kavan starts in the tray at sign-in, working, and the toggle reflects the real state.
10. **One instance.** A second launch focuses the first.
11. **No regressions.** The existing tests pass, the manual kill flow is unchanged for unprotected apps, and Claude Desktop still connects.

Once these pass, Kavan respects the user's exceptions and is there when the machine starts, and we are ready for **Phase 7: Sound & Retention Settings**.
