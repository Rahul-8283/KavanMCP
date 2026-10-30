# KavanMCP V2.2 Plan: Intelligence Layer

## 1. Objective & Overview

### 1.1 The Goal of V2.2
V2 shows what the machine is doing. V2.1 remembers it. V2.2 makes Kavan judge it: what counts as normal for each program, when a program has moved outside that normal, what should happen about it, and what the user has tended to do in the past.

It is the last planned version. After it, Kavan moves from features to hardening.

Five features ship in V2.2:

1. **Process Baselines and Anomaly Detection.** A learned "normal" profile per program, so Chrome at 1 GB is not an alert and Chrome at 1.2 GB is.
2. **Auto-Kill Policies.** User-written rules, evaluated every 2 seconds, that can notify or terminate. Tier 1 stays immune.
3. **Smart Suggestions.** `analyze_system` returns baseline-aware data, so Claude can explain what is abnormal and why, and rank the options.
4. **Behaviour Learning.** Kavan notices which kills the user confirms and which suggestions they ignore, and adjusts how early it proposes them.
5. **Scheduled Optimization.** Recurring cleanup windows, such as "every day at 15:00 if CPU is above 80%".

### 1.2 Where This Phase Sits
| | |
|---|---|
| Depends on | V2.1 complete: `metrics_history`, `alert_events`, the kill history and its tier, protected lists, retention |
| Builds on | `ProcessWatcher` (60-second scan), the Tier 4 rule, `analyze_system`, `execute_approved_termination()` |
| Layers | Backend (`mcp-server/`), MCP tools, desktop UI (Settings and Alerts) |
| Release | 2.2.0. Version fields updated together, as in V2.1 §7 |

### 1.3 What Does Not Change
- The four-tier classification and Tier 1 immunity. Nothing learned or ruled can make a Tier 1 process killable.
- Confirm-then-execute for Claude and for manual kills. The only exception is a rule the user wrote and enabled, covered in §3.
- The protected list (`never_kill`) and the muted list (`never_alert`) from V2.1. They bind rules and suggestions exactly as they bind the manual kill flow.
- `LocalOnlyMiddleware`. Every new endpoint is behind it.

---

## 2. Feature 1: Process Baselines and Anomaly Detection

### 2.1 What Is Stored
The table `system_baselines` already exists but is never written (`database/models.py`, `CREATE_SYSTEM_BASELINES_TABLE`). It has only a key, two averages and a timestamp. V2.2 needs more to be trustworthy, so it replaces the table through a migration:

```sql
CREATE TABLE IF NOT EXISTS process_baselines (
    process_name     TEXT NOT NULL,      -- lower-cased, the same key the rest of Kavan uses
    day              DATE NOT NULL,      -- UTC day of the observation
    samples          INTEGER NOT NULL,   -- how many scans contributed
    cpu_mean         REAL NOT NULL,      -- mean CPU % across the day's scans
    cpu_p95          REAL NOT NULL,      -- 95th percentile, which ignores brief spikes
    mem_mean_mb      REAL NOT NULL,
    mem_p95_mb       REAL NOT NULL,
    PRIMARY KEY (process_name, day)
);
```

One row per program per day keeps the table small: a machine with 300 distinct programs over 30 days is 9,000 rows. The baseline is computed from these rows, not stored separately, so it is always reproducible.

Per-day rows replace the single rolling average in the brief. A rolling average updated every 24 hours loses the information about spread, and spread is what decides whether 1.2 GB is unusual for Chrome.

### 2.2 How the Baseline Is Built
- **Observation.** Every process scan that already runs (the 60-second `ProcessWatcher` scan) also feeds a `BaselineCollector`. It adds each process's CPU and memory to the day's running figures. No extra scan is made.
- **Learning period.** A program has a baseline only after **3 distinct days** with at least **120 samples** (about two hours of observation) on each. Until then it is "learning", and Kavan uses the fixed thresholds from Settings, as today. This is the answer to "2-3 days": three days is the default, and it is configurable.
- **Daily close.** At local midnight, the day's figures are written. The rolling figure is the mean of the last 14 days of rows, weighted by `samples`.
- **Shared names.** Several processes often share a name (`msedge.exe` has a dozen instances). The baseline is for the **name**, summed across its instances, so the threshold compares like with like. The alert is raised against the same summed figure.

### 2.3 What Counts as Anomalous
A program is anomalous when its current value exceeds **both**:

1. its baseline's `p95` multiplied by a factor (default 1.5), and
2. a floor (default 100 MB of memory, 10 points of CPU), so a program that normally uses 3 MB and reaches 6 MB is not flagged.

The factor and floor are per-metric settings, not hard-coded. This reproduces the brief: Chrome with a p95 of 800 MB and a factor of 1.5 alerts above 1.2 GB; VS Code with a p95 of 12% CPU alerts at 18%, and the brief's 40% limit is the same rule with a higher factor for CPU.

A program with no baseline falls back to the existing fixed rules (Tier 4 CPU, the 2 GB Tier 3 memory flag). Nothing becomes quieter than V2.1 until a baseline exists.

### 2.4 How Anomalies Reach the User
- A new alert type, `baseline`, joins `cpu`, `ram`, `disk` and `process` in `alert_events`. It has its own Alerts page filter.
- It follows the V2.1 alert rules: one episode per breach, one sound, muted if on `never_alert`.
- The message says what is normal: "Chrome is using 1.3 GB. Its usual range is 400–800 MB."

### 2.5 Edge Cases
- **Machine changes.** A new GPU driver or a new work project can move the normal level. The rolling 14-day window adapts within two weeks. The Settings page shows the window so the user knows why a figure moved.
- **Reset.** A "Relearn baselines" button clears `process_baselines` for one program or for all. Used after a major update.
- **Sleep.** Scans are skipped across a gap, as `ProcessWatcher` already does, so a sleeping laptop does not teach Kavan that a program was idle.

### 2.6 Definition of Done
1. A program observed on 3 days gets a baseline; one observed on 2 does not.
2. The alert for Chrome at 1.3 GB fires only once its baseline exists, and never for 700 MB.
3. Muted and protected lists still apply to baseline alerts.
4. The baseline survives a restart and is correct after a midnight close.

---

## 3. Feature 2: Auto-Kill Policies (Rule Engine)

### 3.1 The Rule
A rule is stored in the database, not in `settings.json`, so it can be linked to the audit trail and listed with its history:

```sql
CREATE TABLE IF NOT EXISTS policy_rules (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,              -- as the user wrote it
    process_match   TEXT NOT NULL,              -- a name, or '*' for any name not protected
    metric          TEXT NOT NULL,              -- 'cpu' or 'ram'
    operator        TEXT NOT NULL,              -- '>' only, in V2.2
    threshold       REAL NOT NULL,              -- percent, or MB for ram
    hold_seconds    INTEGER NOT NULL,           -- must hold this long before acting
    action          TEXT NOT NULL,              -- 'notify' or 'terminate'
    enabled         INTEGER NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL,
    last_fired_at   DATETIME
);
```

Examples from the brief, expressed as rules:
- "If Chrome uses more than 1.5 GB for more than 5 minutes, kill it": `process_match='chrome.exe'`, `metric='ram'`, `threshold=1536`, `hold_seconds=300`, `action='terminate'`.
- "If any unknown.exe hits 90% CPU for more than 30 seconds, terminate": `process_match='unknown.exe'`, `metric='cpu'`, `threshold=90`, `hold_seconds=30`, `action='terminate'`.
- "If Slack uses more than 800 MB, notify me but don't kill": `process_match='slack.exe'`, `metric='ram'`, `threshold=800`, `hold_seconds=0`, `action='notify'`.

### 3.2 Evaluation Every 2 Seconds
The brief says rules run every 2 seconds in the monitor loop. A full process scan takes about 1.5 seconds, so it cannot run every 2 seconds. Rules therefore use a **targeted sampler**:

- The set of process names referenced by enabled rules is small (typically under 20).
- Every 2 seconds, the monitor reads CPU and memory only for the PIDs with those names, using `psutil.Process(pid)` directly. That costs well under 50 ms.
- The PID list is refreshed by a full scan every 60 seconds (the existing `ProcessWatcher` cadence) and when a PID disappears.
- A `*` rule cannot use the targeted sampler, because it must see every program. It is evaluated on the 60-second scan only, and the UI says so. This is the main reason `*` is not in the first release (see §9.2).

Per rule, per PID, the evaluator keeps the time since the condition first became true. The condition must hold continuously for `hold_seconds`. A single sample below the threshold resets the timer, so a spike that comes and goes never fires a rule. This is the same hysteresis idea as the V2.1 episode tracker.

### 3.3 What Happens When a Rule Fires
- **`notify`:** an alert of type `policy`, raised once per firing, with the rule's name in the message. Sound and toast follow the V2.1 rules.
- **`terminate`:** the monitor calls the **same gated path** as a manual kill. It does not call `psutil` directly. The steps are:
  1. The PID is re-read and its creation time is compared with the one recorded when the rule first matched. A recycled PID is never killed.
  2. `execute_approved_termination()` runs its existing checks: Tier 1, protected list, self-protection, and the audit write.
  3. The approval step is replaced by the rule itself, so the rule is the approval. This is the one place a kill happens without a confirmation dialog, and it is allowed only because the user wrote the rule and turned it on.
- Every firing writes an `audit_log` row with `action_type='TERMINATED'`, `llm_reasoning` set to the rule's name, and `user_approved=False`, so the history shows that no human confirmed it.

### 3.4 Safety Limits
These are fixed in code, not settings, because they protect against a bad rule:

| Limit | Value | Why |
|---|---|---|
| Tier 1 | Never matched and never killed | The tier engine's rule, unchanged |
| Tier 2 | Never killed by a rule. Notify only | Essential work apps need a human. This is a stricter rule than the brief, which said nothing about it |
| Protected list | Never killed | `never_kill` from V2.1 |
| Kills per rule | At most 3 per hour, then the rule pauses and notifies | A runaway rule cannot kill in a loop |
| Global switch | "Pause all auto-kill" in the header, and the kill switch in Settings | One click stops every rule |
| Self | KavanMCP and its launcher are never matched | `protected_pids()` |

A rule that terminates a Tier 3 program still goes through the same undo as any other kill: it appears in Recently Killed, and Restore works.

### 3.5 Rule Editing
Rules are created in Settings, in a new "Auto-kill rules" section:
- A list of rules, each with its name, a plain-language sentence ("Terminate chrome.exe when RAM is above 1,536 MB for 5 minutes"), a toggle, and the last time it fired.
- An add dialog with four fields: program (picked from running programs, as in V2.1's picker), metric, threshold, hold time, and action. Terminate is disabled for Tier 2 programs.
- Creating or enabling a `terminate` rule shows a confirmation that names the program and the threshold, once.

### 3.6 Definition of Done
1. A rule fires only after its condition holds for the full hold time, and not on a spike shorter than that.
2. A `terminate` rule kills a Tier 3 program and records it in the audit trail with no confirmation.
3. A rule never kills a Tier 1, Tier 2 or protected program, and never kills a recycled PID.
4. Three firings in an hour pause the rule and notify.
5. The global pause stops every rule within one evaluation cycle.

---

## 4. Feature 3: Smart Suggestions (Claude-Powered)

### 4.1 What Changes in `analyze_system`
The tool keeps its name and its existing fields. It gains a `baseline` object per listed process, and a new top-level `suggestions` list. Existing clients that ignore unknown fields keep working; `SystemReportSchema` gains the new fields with defaults.

```json
{
  "total_cpu_percent": 61.2,
  "top_memory_hogs": [
    {
      "name": "Discord.exe",
      "memory_mb": 1210.4,
      "baseline": { "state": "learned", "mem_p95_mb": 390.0, "ratio": 3.1, "days": 14 },
      "anomalous": true,
      "tier": 3
    }
  ],
  "suggestions": [
    {
      "rank": 1,
      "pid": 3589,
      "name": "Discord.exe",
      "frees_mb": 1210.4,
      "reason": "Using 3.1x its usual memory (p95 390 MB over 14 days). Likely a leak.",
      "action": "confirm_termination",
      "requires_confirmation": true
    }
  ]
}
```

- `state` is `learned` or `learning`. A `learning` program has no ratio and is never called anomalous, so Claude cannot confuse a new program with a leaking one.
- `ratio` is the current value divided by the baseline p95, as stated in §2.3.
- `frees_mb` is the ranking key. Suggestions are sorted by it, so the biggest win is first.

### 4.2 The Suggestion Rules
A suggestion is produced only when all of these hold:
- The program is anomalous (§2.3), or its rule of action `notify` has fired.
- It is not Tier 1, not protected, and not on the muted list.
- Killing it frees at least 100 MB, or at least 10 points of CPU.

Tier 2 programs can be suggested, but the suggestion says "essential, check before closing" and never includes an auto action.

### 4.3 Claude's Role
- Claude explains and recommends. It does not kill. A suggestion's `action` is `confirm_termination`, the same two-step flow as before, so the user still confirms in Claude or in the app.
- The reasoning is written by Kavan from the numbers, so it is consistent and checkable. Claude may rephrase it, but the figures come from the tool, not from Claude's estimate.
- The MCP tool description is updated so Claude knows the suggestions exist and that it must present them and ask before acting.

### 4.4 Definition of Done
1. `analyze_system` reports `learning` for a new program and does not call it anomalous.
2. A program at 3x its p95 appears as a suggestion, ranked by memory freed.
3. No suggestion is a Tier 1 or protected program.
4. Calling the tool never changes any state.

---

## 5. Feature 4: Behaviour Learning

### 5.1 What Kavan Observes
Two kinds of event are already recorded and need no new collection:
- A **confirmed kill** from the app or Claude: `audit_log` with `user_approved=True`. The memory and CPU at the moment of the kill are needed too, so the confirm step stores them with the approval.
- A **dismissed or ignored suggestion**: a suggestion that was shown and then not acted on for its whole lifetime. Stored when the suggestion expires.

A **restored** kill (Recently Killed) is a negative signal: the user did not want it gone.

### 5.2 What Is Stored
```sql
CREATE TABLE IF NOT EXISTS behaviour_weights (
    process_name     TEXT PRIMARY KEY,
    kills_confirmed  INTEGER NOT NULL DEFAULT 0,
    kills_restored   INTEGER NOT NULL DEFAULT 0,
    suggestions_ignored INTEGER NOT NULL DEFAULT 0,
    typical_kill_mb  REAL,                 -- median memory at the moment of a confirmed kill
    weight           REAL NOT NULL DEFAULT 1.0,
    updated_at       DATETIME NOT NULL
);
```

Frequency counts, not a model. No external service is used.

### 5.3 The Weight and What It Does
- `weight` starts at 1.0 and moves within `[0.5, 2.0]`:
  - each confirmed kill raises it by 0.1;
  - each restore lowers it by 0.3;
  - each ignored suggestion lowers it by 0.05.
- A high weight lowers the suggestion threshold for that program. If the user always kills Discord at 400 MB, `typical_kill_mb` is 400 and the suggestion fires at about 380 MB, as the brief asks.
- The nudge is capped at 10% below the baseline threshold. Kavan never proposes a program at a level that is nowhere near the user's own history.
- A low weight raises the threshold, up to 50% above the baseline. This is how "never kill Spotify" works: after enough ignored suggestions, Spotify is no longer suggested until the weight recovers.

### 5.4 Limits
- Learning never affects Tier 1, Tier 2 or protected programs, and never turns a rule on.
- The weight decays by 1% a day toward 1.0, so a single old habit does not last forever.
- The user can see and reset every weight in Settings. Behaviour learning can be turned off as a whole.

### 5.5 Definition of Done
1. A program killed at about 400 MB every time gets a suggestion at about 380 MB.
2. A program the user always restores is suggested less, and eventually not at all.
3. Turning learning off restores the V2.2 thresholds exactly.

---

## 6. Feature 5: Scheduled Optimization

### 6.1 Schedule Model
```sql
CREATE TABLE IF NOT EXISTS policy_schedules (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    days         TEXT NOT NULL,           -- 'daily', 'weekdays', 'sun', or a list
    at_time      TEXT NOT NULL,           -- 'HH:MM', local time
    scope        TEXT NOT NULL,           -- 'tier3', 'tier3_and_4', or a named list
    condition    TEXT NOT NULL,           -- e.g. 'cpu_total_above:80' or 'always'
    enabled      INTEGER NOT NULL DEFAULT 1,
    last_run_at  DATETIME
);
```

Examples from the brief:
- "Every day at 15:00, kill non-essential programs if CPU is above 80%": `days='daily'`, `at_time='15:00'`, `scope='tier3_and_4'`, `condition='cpu_total_above:80'`.
- "Every Sunday night, clean up Tier 3": `days='sun'`, `at_time='23:00'`, `scope='tier3'`, `condition='always'`.

### 6.2 Where It Runs
Two options, and the choice is an open decision (§9.4):

- **Internal scheduler (recommended).** An asyncio task checks the schedule each minute. It runs only while the backend runs. The desktop app already starts the backend at sign-in (V2.1 Phase 6), so for a user who turns on Start with Windows, the schedule runs whenever the machine is on. Claude Desktop's copy does not run schedules, which avoids two copies acting.
- **Windows Task Scheduler.** A task would start the backend at the scheduled time. It adds an installer step and a second source of truth, so it is not recommended.

### 6.3 What a Run Does
1. The condition is checked against a fresh full scan.
2. Candidate processes are those in `scope`, excluding Tier 1, Tier 2 and protected programs.
3. Candidates are killed in order of memory freed, through the gated path in §3.3.
4. Each kill is audited with the schedule's name as the reason.
5. A summary is written to Alert History as an alert of type `schedule` with the run's totals: programs ended, memory and CPU freed.

Scope is capped: at most 10 programs per run, so a schedule cannot end an entire session.

### 6.4 Definition of Done
1. A schedule runs once at its time on its days, and not twice if the backend restarts within that minute.
2. The condition is respected: no kill when CPU is below 80%.
3. Every kill appears in Recently Killed and can be restored.
4. The run summary appears in Alert History.

---

## 7. MCP Surface
- `analyze_system`: extended as in §4.1. No new required parameters.
- `view_policy_activity(hours_back)`: lists rule firings, schedule runs and auto-kills in the window. Read-only.
- No MCP tool creates, edits or enables a rule or a schedule. This matches V2.1's rule that Claude cannot change the protected list. A rule is written by the user in the app.

---

## 8. Cross-Cutting Requirements
- **Security.** Auto-kill is the only path that kills without confirmation. It is gated by the rules in §3.4, and it must have tests that prove each of them.
- **Performance.** The 2-second evaluation costs under 50 ms per cycle with 20 rules. The process scan stays at 60 seconds. Baseline writes happen once a day.
- **Blocking work.** Database reads and writes and process reads run off the event loop, as the V2.0.1 fixes established.
- **Tests.** Each feature adds tests under `mcp-server/tests/`, using the isolated database and settings file. No test may kill a real program other than a dummy Python process.
- **Docs.** The API document in `docs/` gains the new endpoints and the `analyze_system` shape. The README gains a section on auto-kill, with its safety limits stated plainly.
- **Version.** 2.2.0, updated in `desktop/package.json`, `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml` and `mcp-server/server.py`.

---

## 9. Build Order

| Order | Feature | Depends on | Why |
|---|---|---|---|
| 1 | Baselines (§2) | V2.1 | Everything else reads baselines. It needs the most days of data, so it starts collecting first. |
| 2 | Suggestions (§4) | 1 | Only needs baselines and the existing kill path. Gives the most visible value early. |
| 3 | Auto-kill rules (§3) | 1 and the gated kill path | The riskiest feature. Built after the suggestion logic is trusted. |
| 4 | Scheduled optimization (§6) | 3 | Reuses the rule engine's gated kill path. |
| 5 | Behaviour learning (§5) | 2 and 3 | Needs real confirmations and suggestions to learn from. Last, and easiest to turn off. |

Each feature is merged after its Definition of Done is met.

---

## 10. Open Decisions

Each needs an answer before the feature that depends on it. The recommended answer is given.

### 10.1 Auto-Kill Default (before Feature 2)
Should auto-kill be on or off after install?
**Recommended:** off. A new rule starts disabled, and the first `terminate` rule needs one explicit confirmation.

### 10.2 Wildcard Rules (before Feature 2)
Should a rule be able to match every program (`*`)?
**Recommended:** not in 2.2.0. A wildcard needs the full scan every 2 seconds, which is too slow (§3.2). Revisit after measuring.

### 10.3 Baseline Factor (before Feature 1)
Is the 1.5x factor over p95 right for everyone?
**Recommended:** 1.5x by default, adjustable per program in Settings, so a user can tighten Chrome without changing VS Code.

### 10.4 Where Schedules Run (before Feature 5)
Internal scheduler or Windows Task Scheduler?
**Recommended:** internal scheduler (§6.2). It runs whenever the backend runs and keeps one source of truth.

### 10.5 Behaviour Learning Scope (before Feature 5)
Should learning change suggestions only, or also the thresholds of rules?
**Recommended:** suggestions only. A rule is something the user wrote, and it should not move without them.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| A bad rule ends a program the user needs | Tier 2 is never killed by a rule; the hold time and the three-per-hour cap limit damage; undo exists for every kill |
| Baselines learn an unusual week as normal | 14-day window; a Relearn button; the window is shown in Settings |
| Two copies of Kavan act on the same schedule | Only the instance that owns port 8000 runs schedules and rules, as the history recorder already does |
| Claude is told to kill without asking | Suggestions carry `requires_confirmation: true`; the tool description says to ask; the confirm step is unchanged |
| The 2-second loop slows the dashboard | The targeted sampler reads a few PIDs; it is measured in the test plan before release |

---

## 12. Testing Plan

### 12.1 Automated (backend)
- Baselines: a program on 2 days gets none; on 3 days gets one; the midnight close writes the day; the summed baseline matches the summed instances.
- Anomaly: a value under the floor is not flagged even at 3x; a value over both limits is.
- Rules: the hold timer resets on a single sample below threshold; a `terminate` rule kills a dummy process through the gated path; Tier 1, Tier 2 and protected names are never killed; a recycled PID is not killed; the third firing in an hour pauses the rule; the global pause stops the rule.
- Suggestions: ranking by memory freed; no Tier 1 or protected suggestion; `analyze_system` does not change state.
- Learning: the weight stays within its bounds; a restore lowers it; the decay moves it toward 1.0; learning off gives the base thresholds.
- Schedules: runs once at the set minute; respects its condition; caps at 10 programs.

### 12.2 Measured
- The 2-second evaluation cycle, timed with 20 rules and 200 running processes. Target under 50 ms.
- A 60-second scan with baseline collection, compared with the V2.1 scan. Target no more than 5% slower.

### 12.3 Manual (desktop)
1. Let a program run for three days, then check that its baseline appears in Settings.
2. Create a `notify` rule for a program and push it over the threshold. Expect one alert and one sound.
3. Create a `terminate` rule for a throwaway program (for example a Notepad window with no unsaved work). Expect the confirmation once, then the program ends and appears in Recently Killed.
4. Turn on "Pause all auto-kill" and repeat step 3. Expect nothing to end.
5. Ask Claude to optimise the system. Expect a ranked list with reasons, and no kill until the user confirms.
6. Restore a program that was killed by a rule. Expect its weight to fall in Settings.
7. Schedule a run a few minutes ahead, with a condition that is not met. Expect no kill and a summary of zero.

---

## 13. Definition of Done (Success Criteria)

V2.2 is complete when all of these hold:

1. **Normal is learned.** Each program with three days of data has a baseline, and alerts use it.
2. **Anomalies are specific.** Chrome at 700 MB does not alert; Chrome at 1.3 GB does, once its baseline exists.
3. **Rules are exact.** A rule fires only after its hold time, and only for its program.
4. **Auto-kill is safe.** No rule kills a Tier 1, Tier 2 or protected program, a recycled PID, or more than three programs an hour.
5. **Every kill is undoable.** An auto-kill appears in Recently Killed with Restore.
6. **Claude explains, the user decides.** Suggestions are ranked by impact, carry reasons, and never kill on their own.
7. **Learning is visible and reversible.** Weights are shown and resettable, and turning learning off restores the base behaviour.
8. **Schedules run once.** A scheduled cleanup runs at its time, respects its condition, and is summarised in Alert History.
9. **No regressions.** The existing tests pass, the manual kill flow is unchanged, and Claude Desktop still connects.

Once these pass, V2.2 is the last planned version. The remaining work is testing, release and documentation.
