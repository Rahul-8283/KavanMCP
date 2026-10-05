# Phase 5: Rollback Manager UI

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 5
Phase 4 made it possible to list kills and restore one. Phase 5 puts that in front of the user. The objective is a **Recently Killed** page with a one-click **Restore** on every entry, and an **Undo** on the toast that appears right after a kill.

By the end of this phase a user who terminates the wrong process can get it back in one click, either immediately from the toast or later from the list, without involving Claude.

### 1.2 Where This Phase Sits
| | |
|---|---|
| Plan reference | `PLAN_V2_1.md` §5.3 to §5.5 (Step 4, UI half) |
| Depends on | Phase 4 (`/api/kills`, `/api/rollback`, `audit_id` on the kill response) |
| Unblocks | Nothing |
| Layer | Desktop UI only (`desktop/`) |

### 1.3 What Exists Today
- **The kill flow.** `terminateProcess()` in `hooks/useProcessManager.ts` calls `SystemAPI.confirmKill()` and then `SystemAPI.executeKill()`. On success it removes the row from the table and shows the toast "Successfully terminated Discord.exe. Freed 344MB." After that, the app has no record of the kill.
- **Toasts.** `ToastContext` offers `addToast(message, level)`. A toast shows text and a dismiss button, closes itself after 5 seconds, and at most three are on screen. A toast cannot carry an action.
- **Tier display.** `TierBadge` takes a tier number. `tierInfo()` in `components/dashboard/tiers.ts` treats any unknown number as Tier 4, "Unverified", which is the cautious choice for a live process.
- **Errors.** `ApiError` in `services/api.ts` carries the backend's `code` and `message`. `terminateProcess()` already branches on `err.code`.

### 1.4 Decisions This Phase Assumes
| Decision | Assumed answer |
|---|---|
| `PLAN_V2_1.md` §9.5 Navigation | Recently Killed is its own sidebar entry |
| `PLAN_V2_1.md` §5.3 | Restoring needs no confirmation dialog |

---

## 2. Data Layer

### 2.1 API Client
`desktop/src/services/api.ts` gains:

```ts
export type RestoreBlockedReason = 'no_path' | 'exe_missing' | 'already_restored';

export interface KillRecord {
  id: string;
  name: string;
  pid: number;
  tier: number | null;            // null for kills made before V2.1
  killed_at: string;
  memory_freed_mb: number;
  cpu_freed_pct: number;
  executable_path: string | null;
  reasoning: string | null;
  rolled_back_at: string | null;
  can_restore: boolean;
  restore_blocked_reason: RestoreBlockedReason | null;
}

fetchKills:   (hours: number) => apiClient.get('/api/kills', { params: { hours } })
rollbackKill: (id: string)    => apiClient.post('/api/rollback', { id }, { timeout: TERMINATION_TIMEOUT_MS })
```

`TerminationResult` gains `audit_id: string | null`.

### 2.2 `useKillHistory` Hook
**New** `desktop/src/hooks/useKillHistory.ts`. The list is used by one page only, so it is a hook and not a context.

| Member | Purpose |
|---|---|
| `kills`, `backendElevated` | From the last response |
| `isLoading`, `error` | Request state |
| `reload()` | Fetches the list |
| `restore(kill)` | Calls the API and updates that one row from the response |
| `restoringId` | The id of the kill being restored, for the row's spinner |

`restore()` never refetches the whole list. On success it sets `rolled_back_at` and `can_restore` on the one row, from the response.

### 2.3 Wording the Failures
One map turns the backend's codes into sentences, shared by the page and the toast:

| Code | Shown to the user |
|---|---|
| `no_path` | "Kavan could not record where this program lives, so it cannot be restarted." |
| `exe_missing` | "The program file is no longer at its original location." |
| `already_restored` | "This was already restored." |
| `launch_failed` | "Windows could not start this program." |
| `not_found` | "This kill is no longer in the history." |

---

## 3. The Recently Killed Page

### 3.1 Navigation
- `views.ts`: add `'killed'`, titled "Recently Killed", described as "Processes Kavan terminated, and a way to bring them back."
- `Sidebar.tsx`: add `{ view: 'killed', label: 'Recently Killed', icon: Undo2 }` after Trends and before Settings.
- `App.tsx`: add the page to the view lookup. If this phase lands before Phase 2, it introduces that lookup in place of the current two-way ternary.

### 3.2 Layout
```
Recently Killed                                                  [Backend Active]
Processes Kavan terminated, and a way to bring them back.

┌──────────────────────────────────────────────────────────────────────────────┐
│ Terminated  4                              [24 hours | 7 days]         [↻]   │
├──────────────────────────────────────────────────────────────────────────────┤
│ PROCESS          KILLED          MEMORY (MB)   SECURITY TIER                 │
│ Discord.exe      2 min ago            344.0    ● OPTIONAL      [ Restore ]   │
│ chrome.exe       1 hour ago         1,284.3    ● ESSENTIAL     Restored 09:43│
│ updater_svc.exe  3 hours ago           44.0    ● UNVERIFIED    File missing  │
│ notepad.exe      Yesterday 22:10        8.1    —               [ Restore ]   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Restoring starts the program again. It cannot bring back unsaved work.       │
└──────────────────────────────────────────────────────────────────────────────┘
```

New files: `pages/RecentlyKilled.tsx`, `components/rollback/KillTable.tsx`, `components/rollback/RestoreCell.tsx`.

### 3.3 The Table
A `.panel` with a header row and body, sharing a grid template through a new `.kill-grid` class in `styles/index.css`. The list is short, so it is not virtualized.

| Column | Content |
|---|---|
| Process | Name in medium weight. The executable path as a tooltip |
| Killed | Relative time ("2 min ago") from `formatWhen()`. The exact time as a tooltip |
| Memory (MB) | `formatMemoryMb()` from `components/dashboard/format.ts`, right-aligned in tabular figures |
| Security Tier | `TierBadge`, or a dash when the tier is `null` |
| Action | `RestoreCell` (§3.4) |

**The tier needs care.** `tierInfo()` maps an unknown tier to "Unverified". Passing `null` to `TierBadge` would label every kill from before V2.1 as suspicious. The page must branch on `null` itself and render a dash with the tooltip "Tier was not recorded for kills made before V2.1."

Selecting a row expands it to show the PID at the time, the CPU it was using, the full path and the reasoning recorded with the kill ("User confirmed termination via KavanMCP UI", or what Claude gave).

### 3.4 The Restore Cell
One component, five states:

| State | Appearance |
|---|---|
| Can restore | A **Restore** button in the `.btn` style, with the `Undo2` icon |
| Restoring | The same button, disabled, with a spinner |
| Restored | Muted text "Restored 09:43". No button |
| Cannot restore | Muted text, "File missing" or "No path recorded", with the full sentence of §2.3 as a tooltip |
| Just failed | The reason in crimson beneath the button. The button stays, so the user can retry |

While any restore is in progress, the other Restore buttons stay enabled. Restoring two different programs at once is safe. The exactly-once guard is per kill, in the backend.

### 3.5 Restoring
1. The user clicks **Restore**. The row shows the spinner.
2. `rollbackKill(id)` is called.
3. **Success:** the row becomes "Restored 09:43", and a success toast reads "Relaunched Discord.exe."
4. **`already_restored`:** not an error for the user. The row becomes "Restored", from a `reload()` of the list, and no toast is shown.
5. **`exe_missing` or `no_path`:** the row changes to the "cannot restore" state with the reason.
6. **`launch_failed`:** the reason appears beneath the button and the button stays for a retry.
7. **Network failure:** a critical toast, and the row returns to its previous state.

There is no confirmation dialog. Restoring starts a program the user was already running.

### 3.6 The Two Notes
Beneath the table, in the footer line the process table already uses:

- Always: **"Restoring starts the program again. It cannot bring back unsaved work."**
- Only when `backendElevated` is true, as a second line in the amber warning style: **"Kavan is running as Administrator, so a restored program will also run as Administrator."**

The second line is the limitation described in Phase 4 §6.2. The user is told before they click, not after.

### 3.7 States
| State | What the user sees |
|---|---|
| Loading | Spinner with "Loading recent kills..." |
| Request failed | `EmptyState` with the reason and a Retry button |
| Backend reconnects after a failed load | Reloads automatically |
| Nothing killed in the window | "Nothing was terminated in the last 24 hours." |

The range control offers 24 hours, the default, and 7 days. The page loads when it is opened and when the refresh button is pressed. It does not poll: a kill made from the Dashboard is seen the next time the page is opened, and pages are mounted fresh on every visit.

---

## 4. Undo From the Toast

The moment a user most wants an undo is the second after the kill, while they are still looking at the Dashboard. Sending them to another page for it would waste the feature.

### 4.1 Toasts That Carry an Action
`ToastContext` is extended, compatibly:

```ts
export interface ToastAction { label: string; onAction: () => void | Promise<void>; }

addToast: (message: string, level: ToastLevel, action?: ToastAction) => void
```

- Every existing call passes two arguments and keeps working.
- `Toast.tsx` renders the action as a small text button after the message, in `text-crimson-ink`.
- A toast with an action stays for **10 seconds** instead of 5, so there is time to react.
- Clicking the action runs it and closes the toast. It can be clicked once.

### 4.2 Using It
In `terminateProcess()` in `useProcessManager.ts`, the success branch becomes:

```ts
const result = await SystemAPI.executeKill(proc.pid);
removeProcess(proc.pid);
addToast(
  `Successfully terminated ${proc.name}. Freed ${Math.round(result.freed_mb)}MB.`,
  'success',
  result.audit_id ? { label: 'Undo', onAction: () => undoKill(result.audit_id, proc.name) } : undefined,
);
```

- `undoKill()` calls `rollbackKill()`. On success it shows "Relaunched Discord.exe." On failure it shows the sentence from §2.3 as a warning toast.
- If `audit_id` is `null`, the toast has no Undo. That happens when the audit write failed, and a kill that was not recorded cannot be restored.
- The restored process gets a new PID and does not reappear in the table by itself. The process table is a snapshot, as it is today, and the Refresh button brings it in.

---

## 5. Files Touched

| File | Change |
|---|---|
| `desktop/src/services/api.ts` | `KillRecord`, `RestoreBlockedReason`, `fetchKills`, `rollbackKill`. `audit_id` on `TerminationResult` |
| `desktop/src/hooks/useKillHistory.ts` | **New** |
| `desktop/src/hooks/useProcessManager.ts` | Pass an Undo action to the success toast |
| `desktop/src/context/ToastContext.tsx` | Optional `action` on a toast |
| `desktop/src/components/common/Toast.tsx` | Render the action. 10-second lifetime when present |
| `desktop/src/components/rollback/*` | **New.** Table, restore cell, failure wording |
| `desktop/src/pages/RecentlyKilled.tsx` | **New** |
| `desktop/src/components/layout/views.ts`, `Sidebar.tsx`, `desktop/src/App.tsx` | New view and navigation entry |
| `desktop/src/styles/index.css` | `.kill-grid` |

No backend file changes in this phase.

---

## 6. Tests

### 6.1 Automated
The desktop app has no test runner today. That gap is addressed in Phase 8, which adds one for pure logic. Two pieces of this phase are written to be testable then:

- The code-to-sentence map of §2.3.
- The row update in `useKillHistory.restore()`, as a pure function from (list, response) to list.

### 6.2 Manual
Use a harmless program for every step, for example Notepad opened on a file path. **Never test on a program holding unsaved work.**

| # | Step | Expected |
|---|---|---|
| 1 | Kill Notepad from the Dashboard | Toast "Successfully terminated notepad.exe..." with an **Undo** button, staying about 10 seconds |
| 2 | Click **Undo** | Notepad reopens on the same file. Toast "Relaunched notepad.exe." |
| 3 | Kill it again, ignore the toast, open Recently Killed | Two rows for notepad.exe: the newer with a Restore button, the older showing "Restored" |
| 4 | Click **Restore** | Spinner, then "Restored hh:mm". Notepad reopens with its original file |
| 5 | Double-click **Restore** on a fresh kill as fast as possible | Exactly one Notepad window opens |
| 6 | Kill a program, restore it through Claude with `rollback_last_action`, then open the page | The row already shows "Restored" |
| 7 | Kill a copy of a small program, delete its `.exe`, open the page | "File missing", no button, tooltip gives the reason |
| 8 | Kill a program with two instances an hour apart, restore the **older** | The older instance's arguments are used |
| 9 | Open the page with kills made before V2.1 in the database | Their tier shows a dash, not "Unverified" |
| 10 | Run the backend as Administrator and open the page | The amber line about Administrator is shown. Run it without, and the line is absent |
| 11 | Stop the backend and open the page | The error state. Restart the backend and the list loads by itself |
| 12 | Trigger four toasts including one with Undo | At most three show, and the Undo toast is not cut short by the others' timers |
| 13 | Both themes, a narrow window, and zoom at 125% | Nothing is clipped. The Restore button never wraps |

---

## 7. Definition of Done (Success Criteria)

Phase 5 is complete when all of these hold:

1. **The page exists.** "Recently Killed" is in the sidebar and lists every kill from the last 24 hours.
2. **Each row answers the brief.** Name, when it was killed, the memory it was using and its tier.
3. **One click restores.** Restore relaunches the program with its original arguments, and the row updates in place.
4. **Undo is immediate.** The toast after a kill offers Undo, and it works without leaving the Dashboard.
5. **No double launch.** However fast the user clicks, one restore starts one program.
6. **What cannot be restored says why.** No button is ever offered that is bound to fail.
7. **Old kills are not mislabelled.** A kill with no recorded tier shows a dash.
8. **The limits are stated.** The page says a restore cannot recover unsaved work, and warns when a restored program will run as Administrator.
9. **Claude and the app agree.** A kill restored through Claude shows as restored on the page.
10. **No regressions.** Killing a process from the Dashboard works exactly as before for a user who ignores the Undo, and every existing toast still behaves the same.

Once these pass, a mistaken kill is no longer permanent, and we are ready for **Phase 6: Whitelist & Auto-start Settings**.
