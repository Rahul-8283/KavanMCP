# Phase 8: Complete Testing

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 8
Phase 8 stops feature work and proves that V2.1 does what it claims. Phases 1 to 7 each have their own tests, but each was tested alone, mostly for the path where everything goes right. This phase tests them **together**, under conditions a real machine produces: a laptop that sleeps, a backend that crashes, a database from the previous version, Claude and the desktop app working at once, and a day of continuous running.

By the end of Phase 8, V2.1 is either ready to release or has a written list of exactly what is not.

### 1.2 Where This Phase Sits
| | |
|---|---|
| Plan reference | `PLAN_V2_1.md` §7 (cross-cutting requirements) and every Definition of Done in Phases 1 to 7 |
| Depends on | Phases 1 to 7, all merged |
| Unblocks | The V2.1.0 release |
| Layer | Everything |

### 1.3 Testing Philosophy
Three principles, in order of importance.

1. **The numbers must be true.** V2.1's whole value is that the user can trust what Kavan says happened. A graph that is smooth but wrong is worse than no graph. Every history feature is checked against an independent record of what the machine actually did (§5).
2. **Nothing is silently lost or invented.** A gap must look like a gap. A truncated list must say so. A failed restore must say why.
3. **Safety did not get weaker.** V2.1 adds an endpoint that starts programs and a setting that changes what can be killed. The security engine is re-tested from the outside (§9), not assumed.

### 1.4 Entry Criteria
Testing starts only when:

- All seven feature phases are merged, and each one's Definition of Done was signed off.
- The automated suites of §3 pass on the merged code.
- The decisions in `PLAN_V2_1.md` §9 are final. If auto-start was dropped (§9.2), the tests marked **[auto-start]** below are skipped.

---

## 2. Test Environment & Safety

### 2.1 Rules for the Tester
These tests kill and restart real processes on a real machine.

| Rule | Reason |
|---|---|
| Kill and restore only the test aids of §2.3, or Notepad opened on a scratch file | A restore cannot bring back unsaved work |
| Never test a kill on a Tier 1 process "to see if it is blocked" with anything but the UI and the API | The block is what is being tested. The automated suite already proves it with a fake process |
| Run destructive tests with other work saved and closed | A mistake should cost nothing |
| Use a scratch data folder (§2.2) for everything except the final soak | Test alerts must not end up in the real history |

### 2.2 A Scratch Data Folder
Manual testing needs a database it can fill, age and wipe freely. The backend gains one small aid: when the environment variable `KAVAN_DATA_DIR` is set, the audit database and `settings.json` are read from that folder instead of `mcp-server/data/`.

```
set KAVAN_DATA_DIR=C:\Temp\kavan-test
python main.py
```

Unset, the backend behaves exactly as released. This is also what makes the upgrade tests of §6 possible: a V2.0.1 database is copied into the scratch folder and opened.

### 2.3 Test Aids
Small scripts, kept in `mcp-server/tests/aids/`. They are run by hand and are not collected by pytest.

| Script | Purpose |
|---|---|
| `cpu_burn.py --seconds 120 --cores 4` | Pushes CPU over the threshold for a known time. Writes its start and stop times to a log |
| `cpu_burn.py --windowless` | The same, started with no window, so it is classified Tier 4 |
| `mem_hold.py --mb 4000 --seconds 120` | Holds memory to push RAM over its threshold |
| `seed_history.py --days 7` | Fills the scratch database with seven days of synthetic minutes and alerts, with a known pattern, so the 7-day views can be tested without waiting a week |
| `age_rows.py --days 20` | Moves existing rows back in time, to test retention |
| `soak_schedule.py` | Runs a fixed 24-hour script of spikes for §5.2 and logs each one |

`seed_history.py` and `age_rows.py` refuse to run unless `KAVAN_DATA_DIR` is set. They must never touch a real database.

### 2.4 Configurations to Cover
| Dimension | Values |
|---|---|
| Backend privileges | Administrator, and a normal user |
| Theme | Dark and light |
| Window | Default 1280×720, a narrow window (about 860 wide), and maximised |
| Zoom | 100% and 125% (Ctrl +) |
| Starting state | A fresh install, and an upgrade from V2.0.1 |
| Who is connected | The desktop app only, Claude Desktop only, and both |

Not every test runs in every combination. Each section says which matter for it.

---

## 3. Automated Test Suites

### 3.1 Backend
Run from `mcp-server/` with `python -m pytest -q`.

| Suite | From | Covers |
|---|---|---|
| The 62 existing tests | V2.0.1 | Tiers, approvals, the kill flow, the API boundary, rollback, the audit database |
| `test_history_recorder.py` | Phase 1 | Minute aggregation, episodes, sleep gaps, recovery, pruning |
| `test_alerts_api.py` | Phase 2 | Alert filters, ordering, truncation, live messages |
| `test_metrics_api.py` | Phase 3 | Bucketing, weighting, gaps, range validation |
| `test_kills_api.py`, additions to `test_rollback.py` | Phase 4 | Listing kills, restore by id, restore once |
| `test_protection.py` | Phase 6 | The whitelist at every gate, muting, settings migration |
| Additions to the settings tests | Phases 6, 7 | Every new key's validation, immediate pruning |

**Required result:** every test passes, with none skipped except the one existing test that skips when no Tier 1 process is visible. Each row of each phase file's test table has a corresponding test. About 130 tests in total are expected.

Two properties of the suite itself are checked, because V2.0.1 found both broken:

- After a full run, the real `data/process.db` and the real settings file are byte-for-byte unchanged.
- The suite passes when run twice in a row, and when run in random order.

### 3.2 Frontend
The desktop app has no automated tests today. V2.1 adds enough pure logic that this is no longer acceptable. Phase 8 adds **Vitest** as a development dependency, with an `npm test` script, and covers the logic that has no dependency on the DOM:

| Unit | What is asserted |
|---|---|
| `fillGaps()` (`utils/series.ts`) | A null point for every missing bucket. Never a value where the server sent none |
| `formatDuration()`, `formatWhen()` (`utils/time.ts`) | Boundaries: 59 s, 60 s, 1 h, yesterday, a week ago |
| `applyEvent()` (alert history) | Inserts a matching new alert, ignores one outside the filters, always updates one already listed |
| The restore row update (`useKillHistory`) | One row changes and the others are the same objects |
| The failure wording map | Every backend code has a sentence |
| The volume curve and the sounded-id set (`alertSound.ts`) | 0, 50 and 100 map to 0, 0.1 and 0.4. One id sounds once |
| Preset filtering on the Alerts page | No preset longer than the retention is offered |

Component rendering is covered by the manual passes below. A browser-driven suite is out of scope for V2.1.

### 3.3 Static Gates
All four must be clean before manual testing begins:

| Command | In | Must report |
|---|---|---|
| `ruff check .` | `mcp-server/` | No new findings beyond the V2.0.1 baseline |
| `npx tsc --noEmit` | `desktop/` | No errors |
| `npm run build` | `desktop/` | Success |
| `npm run tauri build` | `desktop/` | An installer is produced |

---

## 4. Feature Validation

Each test names the phase whose Definition of Done it proves. Unless stated, run with the scratch data folder, both interfaces closed except the one named, and the backend as a normal user.

### 4.1 Metrics & Alert Storage (Phase 1)
- **Test 1 (Recording without a window).** Start the backend only. Wait 10 minutes.
  - *Expected:* about 10 rows in `metrics_history`, each with about 30 samples.
- **Test 2 (One alert, one row).** Run `cpu_burn.py --seconds 120`.
  - *Expected:* exactly one `cpu` row in `alert_events`. Its `started_at` is within 5 seconds of the burn's logged start, and its `ended_at` within 5 seconds of the logged stop.
- **Test 3 (Flapping).** Set the CPU threshold just below the machine's idle level plus a small burn, so the value crosses back and forth.
  - *Expected:* one episode, not dozens.
- **Test 4 (Top process).** After Test 2, read the row.
  - *Expected:* `top_process` is the burn script's Python process.
- **Test 5 (Suspicious process).** Run `cpu_burn.py --windowless --seconds 300`.
  - *Expected:* within about two minutes, one `process` row naming it. It ends within about two minutes of the script stopping.
- **Test 6 (No double writing).** With the backend running, start Claude Desktop so a second instance starts. Wait 5 minutes.
  - *Expected:* one row per minute, never two.

### 4.2 Alert History (Phase 2)
- **Test 1 (Live).** Open the Alerts page, then run a burn.
  - *Expected:* a row appears marked Ongoing with no refresh. About 30 seconds after the burn, it shows a duration.
- **Test 2 (Away).** Close the desktop app. Run a burn. Reopen the app.
  - *Expected:* the alert is listed, with the right times.
- **Test 3 (Filters).** With seeded data, apply each filter alone, then all three together.
  - *Expected:* the count matches a direct query of the database for the same conditions.
- **Test 4 (Detail).** Expand a row.
  - *Expected:* the CPU, memory and disk readings, the exact times and the top process, as stored.
- **Test 5 (Truncation).** Seed more than 500 alerts in one range.
  - *Expected:* 500 rows and the notice that older ones are hidden.

### 4.3 Performance Graphs (Phase 3)
- **Test 1 (A day).** With `seed_history.py --days 7`, open Trends at each of the four ranges.
  - *Expected:* the seeded pattern is recognisable at every range.
- **Test 2 (Spike survives).** The seed includes one 10-second spike to 99%.
  - *Expected:* it is visible in the peak band at 24 hours and at 7 days.
- **Test 3 (Zoom).** Narrow the brush around it.
  - *Expected:* the charts switch to one-minute points.
- **Test 4 (Gap).** The seed includes a three-hour hole.
  - *Expected:* a break in every line. No line crosses the hole.
- **Test 5 (Markers both ways).** Click an alert region, then use **Show on graph** from that alert.
  - *Expected:* each lands on the other.

### 4.4 Rollback Manager (Phases 4 and 5)
Run once with the backend as a normal user and once as Administrator.

- **Test 1 (Undo).** Open Notepad on a scratch file. Kill it from the Dashboard. Click **Undo** on the toast.
  - *Expected:* Notepad reopens on the same file.
- **Test 2 (Restore from the list).** Kill it again. Open Recently Killed. Click **Restore**.
  - *Expected:* it reopens, and the row reads "Restored" with the time.
- **Test 3 (Exactly once).** Kill it again. Double-click **Restore** as fast as possible.
  - *Expected:* one Notepad window.
- **Test 4 (The right one).** Kill two Notepad instances opened on different files. Restore the older.
  - *Expected:* the older file opens.
- **Test 5 (Cannot restore).** Kill a copied test executable, delete the file, open the page.
  - *Expected:* "File missing", no button.
- **Test 6 (Administrator warning).** As Administrator only.
  - *Expected:* the amber line is shown, and a restored Notepad is elevated. As a normal user the line is absent.

### 4.5 Whitelist (Phase 6)
- **Test 1 (Blocked in the UI).** Protect Notepad. Try to terminate it.
  - *Expected:* Confirm is disabled, with the protected message.
- **Test 2 (Blocked at the API).** Send the confirm request for its PID directly with `curl`.
  - *Expected:* 403 with code `user_protected`, and a `BLOCKED` row in the audit log.
- **Test 3 (Protected after confirming).** Confirm a kill with `curl`, protect the app in Settings, then send execute.
  - *Expected:* refused. The process is alive.
- **Test 4 (Takes effect at once).** Remove the protection and terminate.
  - *Expected:* it works, with no restart of anything.
- **Test 5 (Muted alert).** Put the burn script's process name on never-alert. Run a burn.
  - *Expected:* no toast, no sound. The alert is in the history, tagged "Muted".
- **Test 6 (Not over-muted).** Run a burn from a differently named process.
  - *Expected:* the toast appears.

### 4.6 Start With Windows **[auto-start]** (Phase 6)
- **Test 1.** Set the backend location. Close everything. Start only the desktop app.
  - *Expected:* the dashboard is online within about 10 seconds.
- **Test 2.** Quit from the tray.
  - *Expected:* no Python process from Kavan remains.
- **Test 3.** Start the backend in a terminal, then the app, then Quit.
  - *Expected:* the terminal's backend is still running.
- **Test 4.** Enable the toggle. Sign out and in.
  - *Expected:* a tray icon and no window. Opening it shows live data.
- **Test 5.** Launch Kavan again from the Start menu.
  - *Expected:* the existing window comes forward. One tray icon.
- **Test 6.** Disable the toggle. Sign out and in.
  - *Expected:* Kavan is not running.

### 4.7 Sound & Retention (Phase 7)
- **Test 1.** On an upgraded install, press **Test** without changing anything.
  - *Expected:* the V2 beep at the V2 loudness.
- **Test 2.** Run a two-minute burn with sound on.
  - *Expected:* one sound. Toasts continue.
- **Test 3.** Trigger at least thirty separate alerts in one session.
  - *Expected:* the last one still sounds.
- **Test 4.** With seeded alerts up to 30 days old, change retention to 7 and confirm.
  - *Expected:* older alerts are gone at once, and the 30-day preset has gone from the Alerts page.
- **Test 5.** Cancel the same confirmation.
  - *Expected:* nothing is deleted and the setting is unchanged.

---

## 5. Truth Testing

This section exists because of principle 1 in §1.3. It compares what Kavan recorded with an independent record.

### 5.1 Against Task Manager
With the backend running for an hour of ordinary use, open Trends at "1 hour" beside Windows Task Manager's Performance tab.

- *Expected:* CPU and memory show the same shape and the same level, within a few percentage points. A sustained disagreement is a defect, not a rounding difference.

### 5.2 The 24-Hour Soak
The one test run against the **real** data folder, on the machine as it is normally used.

1. Start the backend and the desktop app. Note the backend's memory use and the size of `process.db`.
2. Start `soak_schedule.py`. Over 24 hours it produces, at times it logs:
   - a 2-minute CPU burn every 3 hours,
   - a 2-minute memory hold every 6 hours,
   - one 10-second CPU spike,
   - one 5-minute windowless burn.
3. Use the machine normally. Let it sleep at least once.
4. After 24 hours, compare.

| Check | Expected |
|---|---|
| Alerts listed, against the script's log | Every scheduled event has exactly one alert, within 10 seconds of the logged times. No scheduled event is missing |
| The 24-hour chart | Every burn is visible at its logged time |
| The 10-second spike | Visible in the peak band |
| The sleep period | A gap in the lines. No alert spans it |
| Rows in `metrics_history` | About one per minute the machine was awake |
| Unscheduled alerts | Each is explainable by what the user was doing. None is a phantom |

The resource figures from this run are judged in §10.

---

## 6. Upgrade & Migration

A release that works on a fresh install and breaks an existing one is not a release. Each test starts from a copy of real V2.0.1 data in the scratch folder.

- **Test 1 (Database).** Open a V2.0.1 `process.db` with the V2.1 backend.
  - *Expected:* it starts without error. Every existing audit row is intact. The new tables exist. `tier` and `rolled_back_at` exist and are NULL on old rows.
- **Test 2 (Twice).** Stop and start the backend again.
  - *Expected:* no error. Migration is harmless when repeated.
- **Test 3 (Old kills in the new UI).** Open Recently Killed.
  - *Expected:* old kills are listed, with a dash for the tier, and can be restored if their path was recorded.
- **Test 4 (Settings).** Start with a V2.0.1 `config/settings.json` holding custom thresholds, and no file in `data/`.
  - *Expected:* the thresholds are carried over. The new settings have their defaults. Volume is 50 and the sound is "Chime".
- **Test 5 (Git is clean).** Change a threshold in the app.
  - *Expected:* `git status` shows no modified file.
- **Test 6 (Going back).** Open the V2.1-migrated database with the V2.0.1 backend.
  - *Expected:* it starts and its features work. The extra tables and columns are ignored. A user can roll the app back without losing their audit history.

---

## 7. Three-Way Integration With Claude

V2's central promise, repeated for the V2.1 features: the desktop app and Claude share one backend and one database without disagreeing.

- **Test 1 (Boot order).** Start in each order: backend then app then Claude, and Claude first then app.
  - *Expected:* in both, the dashboard works, Claude's tools work, and exactly one instance records history.
- **Test 2 (Claude kills, the app restores).** Ask Claude to terminate Notepad. Open Recently Killed.
  - *Expected:* the kill is listed, with its tier and Claude's reasoning. **Restore** works.
- **Test 3 (The app kills, Claude restores).** Kill from the Dashboard. Ask Claude to roll it back.
  - *Expected:* it reopens. The row on Recently Killed reads "Restored".
- **Test 4 (No double restore across interfaces).** Restore a kill in the app, then ask Claude to roll back the same program.
  - *Expected:* Claude restores an earlier kill of it, or says none is left. Never the same kill twice.
- **Test 5 (Claude and the whitelist).** Protect Notepad. Ask Claude to kill it, then ask Claude to remove the protection.
  - *Expected:* the kill is refused with the reason. Claude has no means to change the list, and says so.
- **Test 6 (Cross-fire).** While a burn is producing an alert and the recorder is writing, ask Claude for the audit log and kill a process from the Dashboard, all within the same few seconds.
  - *Expected:* no "database is locked" in `server.log`. Every write is present afterwards.
- **Test 7 (Existing tools).** Run each of the seven MCP tools once.
  - *Expected:* the same names, parameters and response shapes as V2.0.1.

---

## 8. Resilience

- **Test 1 (Crash during an alert).** Start a burn. Kill the backend from Task Manager while the alert is ongoing. Restart it.
  - *Expected:* the alert is closed, at about the time of the crash. No row is left ongoing forever. The desktop app reconnects by itself.
- **Test 2 (Crash during a restore).** Not reproducible by hand. The automated test for a failed launch covers it: the claim is released and a retry works.
- **Test 3 (Sleep).** Start a burn, put the laptop to sleep for 10 minutes while it runs, wake it.
  - *Expected:* the alert ended when the machine slept. The chart has a 10-minute gap. No 10-minute alert.
- **Test 4 (Time zone).** With history recorded, change the Windows time zone and reopen the app.
  - *Expected:* every time shifts by the difference. Nothing is reordered, duplicated or lost. Stored times are UTC.
- **Test 5 (Backend offline).** Stop the backend and visit every page.
  - *Expected:* each shows its offline state. Nothing crashes. Appearance and Startup still work. Restart, and every page recovers without a manual refresh.
- **Test 6 (Port taken).** Start two backends by hand.
  - *Expected:* the second serves MCP only and records nothing. With `--dashboard-only` it exits cleanly.
- **Test 7 (Damaged settings).** Hand-edit `settings.json` with an invalid volume, an unknown sound and a whitelist that is not a list.
  - *Expected:* each bad value falls back to its default. The good values are kept. The backend starts.
- **Test 8 (Recording failure).** Make the database read-only while the backend runs.
  - *Expected:* errors in `server.log`, and the gauges keep updating. Recording resumes when the file is writable again.

---

## 9. Security Validation

V2.1 adds five endpoints, one of which starts programs, and one setting that changes the kill rules. Each claim is tested from outside the app, with `curl` or a browser console.

### 9.1 The API Boundary
For **every** new route (`/api/alerts`, `/api/metrics/history`, `/api/kills`, `/api/rollback`) and the extended settings route:

| Request | Expected |
|---|---|
| With `Origin: https://evil.example` | 403 `forbidden_origin` |
| With `Host: evil.example:8000` | 403 |
| From a page open in a normal browser, with `fetch()` | Refused. The page learns nothing |
| With no `Origin`, from `curl` on the same machine | Allowed, as for the existing routes |

### 9.2 The Rollback Endpoint
| Attempt | Expected |
|---|---|
| A body with a `path` or `command` field beside `id` | The extra fields are ignored. Only the audited record is used |
| The `id` of a `BLOCKED` or `ROLLBACK` row | 404 |
| An invented `id` | 404 |
| An `id` that is SQL, for example `' OR 1=1 --` | 404. Nothing is restored |
| A record whose stored command line names a different executable | The audited executable is launched, never the one in the command line |

### 9.3 The Whitelist
| Attempt | Expected |
|---|---|
| Kill a protected process through each of: the UI, the REST API, the MCP tool | Refused by all three |
| Protect a process between confirm and execute | Refused at execute |
| Add `lsass.exe` to the whitelist, then remove it | Tier 1 throughout |
| Save a whitelist containing a path, 300 names, or a non-string | The invalid parts are not saved |
| Look for any MCP tool that writes settings | There is none |

### 9.4 Inputs
- Every filter parameter is sent with a wrong type, an out-of-range value and SQL text.
  - *Expected:* a 400, or an empty result. Never a 500, and never a changed database.
- Every new setting is sent with a wrong type and an out-of-range value.
  - *Expected:* not saved.

### 9.5 What Was Already True
The V2.0.1 guarantees are re-run, because V2.1 touched the files that hold them:

- A Tier 1 process cannot be staged or killed, at any layer.
- KavanMCP cannot be made to kill itself or its launcher.
- An approval is single-use, expires after 5 minutes, and does not transfer to a recycled PID.

---

## 10. Performance & Soak Budgets

Measured during the 24-hour soak of §5.2, and compared with a V2.0.1 baseline taken the same way.

| Measure | Budget | Why this number |
|---|---|---|
| Backend CPU, averaged over an idle hour | Under 3% of one core | The process watch costs about 1.5 s of one core a minute, about 2.5% |
| Backend memory growth over 24 hours | Under 20 MB | The recorder holds one minute of samples and a few open episodes. It must not accumulate |
| Desktop app memory growth over 24 hours, window open on the Dashboard | Under 50 MB | Live alert rows are bounded by the list's filters |
| `process.db` after 7 days of seeded history | Under 5 MB | About 10,000 metric rows at roughly 100 bytes each, plus alerts |
| Gauge update interval | Still 2 seconds | Recording must not slow the stream |
| Dashboard process scan | No slower than V2.0.1 (about 1.5 s) | The watch shares the scanner |
| Trends page, first open, 7 days of data | Under 1 second after the page code has loaded | About 84 points per chart |
| Alerts page, 500 rows | Scrolls without dropped frames | Virtualized |
| Dashboard start-up script size | Within 10% of V2.0.1 (about 370 kB, 116 kB compressed) | `recharts` is loaded only by the Trends page |
| Sound after 100 alerts in one session | Still plays | One shared audio context |

A budget that is missed is a defect of at least **Major** severity (§12).

---

## 11. Interface Quality

Every new page and every changed dialog is walked through in each configuration of §2.4.

| Check | Expected |
|---|---|
| Dark and light theme | Every element follows the theme, including charts, tooltips, the brush and the new dialogs. No hard-coded colour shows |
| Narrow window | No table clips. Columns close up or the table scrolls sideways, as the process table does |
| Zoom at 125% | Nothing overlaps or is cut off |
| Keyboard only | Every control is reachable with Tab, has a visible focus ring and works with Enter or Space. Escape closes every menu, dialog and expanded row |
| Sidebar collapsed | Five icons, each with a tooltip. The ongoing-alert dot is still visible |
| Empty, loading and failed states | Each new page shows all three as its phase file describes |
| Wording | Labels and messages match the phase files, and one thing is called by one name everywhere |

### 11.1 Regression of V2
V2.1 edited files that V2 features live in. Each is walked through once more:

- The gauges, their red zones and the over-limit state.
- The process table: search, tier filter, sorting, the right-click menu, the terminate dialog for each tier.
- The kill flow, end to end, for a user who ignores Undo.
- Threshold sliders, the theme picker and the sound toggle.
- Toasts: the queue of three, auto-dismiss, the native notification for critical alerts.
- The tray: its icon colour and tooltip, left click, the menu, Quit.
- Closing the window hides it and does not exit.

---

## 12. Defect Triage & Exit Criteria

### 12.1 Severity
| Severity | Definition | Examples |
|---|---|---|
| **Blocker** | Data is wrong or lost, safety is weaker, or the app cannot be used | A protected or Tier 1 process can be killed. A restore starts the wrong program. History shows values that did not happen. An upgrade loses audit rows |
| **Major** | A feature in the brief does not work, or a budget of §10 is missed | A filter returns wrong rows. Zoom shows no extra detail. Sound stops after many alerts |
| **Minor** | Works, but is wrong in a way a user would notice | A mislabelled column. A state that needs a manual refresh |
| **Cosmetic** | Appearance only | Alignment, a colour in one theme |

### 12.2 Exit Criteria
V2.1 leaves testing when:

1. No Blocker and no Major defect is open.
2. Every Minor defect is either fixed or listed in the release notes as a known issue, by decision and not by default.
3. Every automated suite of §3 passes on the exact commit to be released.
4. The 24-hour soak of §5.2 was run on that commit, or on one that differs only by fixes re-tested since.
5. Every Definition of Done in Phases 1 to 7 has been re-confirmed on the merged build.

A fix made during testing re-runs the automated suites and the sections of this file that cover the code it touched.

---

## 13. Traceability to the Brief

Each thing the V2.1 brief asked for, and where it is proven.

| The brief asked for | Built in | Proven by |
|---|---|---|
| A persistent log of every alert | Phases 1, 2 | §4.1 Test 2, §4.2 Test 2 |
| What fired, and exactly when | Phases 1, 2 | §4.2 Test 4, §5.2 |
| The CPU and RAM at that moment | Phases 1, 2 | §4.2 Test 4 |
| Which process caused it | Phase 1 | §4.1 Test 4 (recorded as the top process at the time) |
| Filter by date, alert type and severity | Phase 2 | §4.2 Test 3 |
| CPU, RAM and disk trends over 24 hours | Phases 1, 3 | §4.3 Test 1, §5.1, §5.2 |
| Metrics logged continuously, not only on alert | Phase 1 | §4.1 Test 1 |
| Zoom and pan into a spike | Phase 3 | §4.3 Tests 2 and 3 |
| A list of processes killed in the last 24 hours | Phases 4, 5 | §4.4 Test 2 |
| One-click restart for each | Phases 4, 5 | §4.4 Tests 1 to 4 |
| Name, when killed, RAM used, tier | Phases 4, 5 | §4.4 Test 2, §6 Test 3 |
| App whitelist: never alerted on, never killed | Phase 6 | §4.5, §9.3 |
| Auto-start on Windows boot | Phase 6 | §4.6 |
| Alert persistence of 7, 14 or 30 days | Phases 1, 7 | §4.7 Tests 4 and 5 |
| Sound volume and a choice of sounds | Phase 7 | §4.7 Tests 1 to 3 |

Two items are delivered differently from the brief's wording, by the decisions recorded in `PLAN_V2_1.md` §9:

- "Memory leak" is not an alert type in V2.1. Detecting growth over time is deferred.
- "Which process caused it" is the largest consumer when the alert started, labelled as such.

---

## 14. Release Readiness

Done only after §12.2 is met.

### 14.1 Version
The version fields have never matched a release: they still read `0.1.0` and `1.0.0` after V2.0.1. V2.1.0 sets all of them together.

| File | Field |
|---|---|
| `desktop/package.json` and `package-lock.json` | `version` → `2.1.0` |
| `desktop/src-tauri/tauri.conf.json` | `version` → `2.1.0` |
| `desktop/src-tauri/Cargo.toml` | `version` → `2.1.0` |
| `mcp-server/server.py` | `FastMCP("KavanMCP", version="2.1.0")` |

### 14.2 Documentation
| Document | Update |
|---|---|
| `docs/` API reference | The five new endpoints, the `alert_event` message, the new fields on `threshold_alert` and on the kill response |
| `README.md` | The four features, the new pages, `--dashboard-only`, the test count |
| `CLAUDE.md` | The new modules, tables, routes and settings. The known-issues list |
| Release notes | Features, then behaviour changes, then known issues |

### 14.3 Behaviour Changes to Announce
These are intended, and a user will notice them:

- The alert sound plays once per alert, not every three seconds.
- The first toast of a CPU or memory alert appears about two seconds later than before.
- Claude's rollback never restores the same kill twice.
- Settings are stored in `mcp-server/data/`, and the old settings file is no longer tracked.
- The backend scans processes once a minute in the background.

### 14.4 Release Steps
1. Bump the version (§14.1) and merge.
2. Run §3 one last time on that commit.
3. Build the installer with `npm run tauri build`.
4. Tag `v2.1.0` on `main` and publish the release with the notes and the installer.

---

## 15. Definition of Done (Success Criteria)

Phase 8, and with it V2.1, is complete when all of these hold:

1. **Automated.** Every backend and frontend test passes, the static gates are clean, and the test run leaves real data untouched.
2. **Features.** Every test in §4 passes in the configurations it names.
3. **Truth.** The 24-hour soak matches its script: every scheduled event recorded once, at the right time, with no phantom alerts and an honest gap for sleep.
4. **Upgrade.** A V2.0.1 database and settings file carry over with nothing lost, and the database still opens in V2.0.1.
5. **Claude.** The desktop app and Claude agree on every kill and every restore, and Claude cannot weaken the whitelist.
6. **Resilience.** A crash, a sleep, a time zone change and an offline backend each leave the data consistent and the app usable.
7. **Security.** Every new route refuses foreign origins, the rollback endpoint can start only what Kavan stopped, and every V2.0.1 guarantee still holds.
8. **Performance.** Every budget in §10 is met.
9. **Quality.** Both themes, a narrow window, zoom and keyboard use all work on every new page, and no V2 feature regressed.
10. **Exit.** No Blocker or Major defect is open, and every remaining Minor is a recorded decision.
11. **Ready.** The version is 2.1.0 everywhere, the documents are current, and the behaviour changes are written down.

When these pass, KavanMCP V2.1 is ready to be tagged and released.
