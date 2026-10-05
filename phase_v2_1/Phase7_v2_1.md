# Phase 7: Sound & Retention Settings

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 7
Phase 7 finishes the Settings page. It adds the two remaining groups from the brief:

1. **Sound.** A volume control and a choice of alert sounds, in place of one fixed beep.
2. **Alert retention.** How long the alert history is kept: 7, 14 or 30 days.

It also arranges the finished page, which by now holds six sections, and fixes two defects in the current sound code that the new controls would otherwise inherit.

This is the last feature phase. After it, V2.1 is functionally complete and moves to testing.

### 1.2 Where This Phase Sits
| | |
|---|---|
| Plan reference | `PLAN_V2_1.md` §6.3 and §6.4 (Step 5, second half) |
| Depends on | Phase 1 (pruning), Phase 2 (`episode_id` on alerts, the Alerts page presets), Phase 6 (settings storage and validation) |
| Unblocks | Phase 8 (Complete Testing) |
| Layer | A small backend change, mostly the desktop UI |

### 1.3 What Exists Today
**Sound**, in `desktop/src/hooks/useWebSocketConnection.ts`:

- `playBeep()` plays a sine tone at 880 Hz that fades over half a second, at a fixed gain of 0.1.
- It is called for **every** `threshold_alert` message when `sound_alerts` is on.
- It creates a new `AudioContext` on every call and never closes it.

Two defects follow from this:

| Defect | Effect |
|---|---|
| A sound on every message | While a metric stays over its limit, `threshold_alert` repeats every 3 seconds, so the beep repeats every 3 seconds for as long as the spike lasts |
| A new `AudioContext` per beep | Browsers allow only a few audio contexts at once. After enough alerts the engine refuses to create more, and sound stops until the app is restarted |

**Retention**

- Phase 1 prunes `alert_events` hourly, reading `ACTIVE_CONFIG.get("alert_retention_days", 30)`. The key does not exist yet, so the answer is always 30.
- `metrics_history` is kept for a fixed 7 days.

**The Settings page** (`desktop/src/pages/Settings.tsx`)

- `useThresholdSlider()` gives a slider a smooth local value and saves it 500 ms after the user stops moving it.
- The `.range` class in `styles/index.css` styles a slider with a crimson fill.
- `SettingsSection` and `Switch` are the building blocks.
- The page is two columns when wide enough and one column otherwise.

### 1.4 Decisions This Phase Assumes
| Decision | Assumed answer |
|---|---|
| `PLAN_V2_1.md` §9.4 History window | Alert retention is the user's choice of 7, 14 or 30 days. Metrics stay at a fixed 7 days |

---

## 2. Sound

### 2.1 The Settings
Two keys join `DEFAULT_CONFIG` in `mcp-server/config/settings_manager.py`. They are stored in the backend beside `sound_alerts`, so every sound preference lives in one place.

| Key | Type | Default | Validation |
|---|---|---|---|
| `sound_volume` | integer | 50 | 0 to 100. A boolean is not accepted as a number, as for thresholds |
| `sound_choice` | string | `"chime"` | One of `chime`, `pulse`, `bell`, `soft` |

`ConfigUpdate` in `ws_server.py` gains both as optional fields, with `Field(ge=0, le=100)` and a `Literal`.

The defaults reproduce today's sound exactly: `chime` at volume 50 is the current beep at its current loudness. A user who never opens Settings hears no difference.

### 2.2 A Sound Module
The sound code moves out of the WebSocket hook into **new** `desktop/src/services/alertSound.ts`:

```ts
export type SoundChoice = 'chime' | 'pulse' | 'bell' | 'soft';

export function playAlertSound(choice: SoundChoice, volume: number): void
```

**One audio context.** The module creates a single `AudioContext` the first time a sound is played and reuses it for every sound after. If the context is suspended, it is resumed before playing. This removes the second defect in §1.3.

**Sounds are data, not files.** Each sound is a short list of notes, played with oscillators as the current beep is. Nothing is bundled, downloaded or decoded.

| Choice | Character | Built from |
|---|---|---|
| `chime` | The V2 sound | One sine note at 880 Hz, fading over 0.5 s |
| `pulse` | Two short blips | Two triangle notes at 660 Hz, 0.12 s each, 0.08 s apart |
| `bell` | Bright, longer | Sine notes at 1319 Hz and 1976 Hz together, fading over 0.9 s |
| `soft` | Low and gentle | One sine note at 440 Hz with a slow attack, over 0.6 s |

**Volume.** Loudness is not linear to the ear, so the slider value is squared before it becomes a gain:

```
gain = (volume / 100)² × 0.4
```

Volume 50 gives a gain of 0.1, the value used today. Volume 0 plays nothing. Volume 100 gives 0.4, loud but not clipping.

### 2.3 One Sound Per Alert
Phase 2 added `episode_id` to every `threshold_alert`. The hook now keeps the ids it has already played a sound for, and plays only when it sees a new one:

- **Before:** a five-minute CPU spike beeps a hundred times.
- **After:** it sounds once, when it starts.

The toast and the native notification are unchanged. Only the sound is limited. If the same metric recovers and breaches again later, that is a new episode and sounds again.

This is a deliberate change in behaviour and is listed in the release notes.

Episodes muted by the "never alert on" list from Phase 6 send no `threshold_alert` at all, so they make no sound without any extra code here.

### 2.4 The Controls
In the existing "System Integrations" section, beneath the "Enable Sound Notifications" switch:

```
Enable Sound Notifications                                           [switch]
Play an alert chime when a threshold is breached.

Volume            ───────────────●──────────              50%
Alert sound       [ Chime | Pulse | Bell | Soft ]                    [ Test ]
```

- **Volume** uses the `.range` slider. `useThresholdSlider()` is generalised into `useDebouncedSetting()`, so the volume saves the same way the thresholds do: smoothly while dragging, once when the user stops. The threshold sliders use the renamed hook unchanged.
- **Alert sound** uses the `SegmentedControl` extracted in Phase 2.
- **Test** plays the selected sound at the current slider position immediately, including values not yet saved. The user hears what they are choosing.
- When sound is switched off, the volume and sound rows are dimmed and disabled. **Test** stays enabled, so a user can audition sounds before turning them on.

---

## 3. Alert Retention

### 3.1 The Setting
| Key | Type | Default | Validation |
|---|---|---|---|
| `alert_retention_days` | integer | 30 | Exactly 7, 14 or 30 |

Added to `DEFAULT_CONFIG`, `_valid_entries()` and `ConfigUpdate`. Any other number is rejected, like every other invalid setting.

Because Phase 1 already reads this key with a default of 30, the pruning code needs no change. From the moment the key exists, the hourly prune honours it.

### 3.2 Applying a Change Immediately
A user who shortens retention expects the old alerts to go now, not within the hour. When `POST /api/update_thresholds` saves a new `alert_retention_days`, the endpoint schedules `prune_history()` straight away as a background task. The request does not wait for it.

### 3.3 Shortening Deletes Data
Going from 30 days to 7 deletes up to 23 days of alerts, and they cannot be recovered. That deserves one deliberate click:

- **Lengthening** retention (7 to 30) saves at once. Nothing is lost by it.
- **Shortening** opens a confirmation, in the style of the terminate dialog:

  > **Keep alerts for 7 days?**
  > Alerts older than 7 days will be deleted. This cannot be undone.
  > `[ Cancel ]  [ Delete older alerts ]`

  Cancel leaves the setting as it was.

Open episodes are never pruned, whatever the setting. That rule is from Phase 1 §7.

### 3.4 The Control
A new "History" section:

```
History
How long Kavan remembers.

Keep alert history for            [ 7 days | 14 days | 30 days ]
Performance graphs always cover the last 7 days.
```

The second line states the fixed metrics window, so a user does not expect the retention setting to lengthen the graphs.

### 3.5 Keeping the Alerts Page Consistent
The Alerts page from Phase 2 offers 24 hours, 7 days and 30 days. Offering a 30-day view over 7 days of data would suggest alerts are missing. The page reads `alert_retention_days` from `ConfigContext` and hides any preset longer than it. If the current selection becomes unavailable, it falls back to the longest remaining preset.

---

## 4. The Finished Settings Page

### 4.1 Arrangement
V2 had three sections. V2.1 has six. In the two-column layout they are grouped by what they govern:

| Left column: what Kavan watches and keeps | Right column: how Kavan behaves on this machine |
|---|---|
| Alert Thresholds | Appearance |
| Protected Apps (Phase 6) | System Integrations: sound (this phase) |
| History (this phase) | Startup (Phase 6) |

In a narrow window the columns stack, left column first.

### 4.2 One File Per Section
`Settings.tsx` would otherwise pass 400 lines. Each section becomes its own component in `desktop/src/components/settings/`:

`ThresholdsSection.tsx`, `ProtectedAppsSection.tsx`, `HistorySection.tsx`, `AppearanceSection.tsx`, `SoundSection.tsx`, `StartupSection.tsx`

`Settings.tsx` keeps only the layout. `SettingsSection` and `ThemePreview` move to the same folder. Nothing changes for the user from this.

### 4.3 When the Backend Is Offline
Each section depends on a different source, and each behaves accordingly:

| Section | Source | Offline behaviour |
|---|---|---|
| Thresholds, Protected Apps, History, Sound | Backend config | The existing "Could not load settings" state with Retry |
| Appearance | Local storage | Works |
| Startup | Windows, through the Tauri plugin | Works |

---

## 5. Files Touched

| File | Change |
|---|---|
| `mcp-server/config/settings_manager.py` | `sound_volume`, `sound_choice`, `alert_retention_days` and their validation |
| `mcp-server/ws_server.py` | `ConfigUpdate` fields. Prune at once when retention changes |
| `desktop/src/services/alertSound.ts` | **New.** One audio context, four sounds, volume curve |
| `desktop/src/hooks/useWebSocketConnection.ts` | Use `playAlertSound()`. One sound per `episode_id`. `playBeep()` removed |
| `desktop/src/context/ConfigContext.tsx` | New fields on `Config`. New keys on `BackendSetting` |
| `desktop/src/components/settings/*` | **New.** The six sections, moved and added |
| `desktop/src/pages/Settings.tsx` | Layout only |
| `desktop/src/pages/Alerts.tsx` | Presets limited by retention |

---

## 6. Tests

### 6.1 Automated (backend)
Additions to the settings tests, using the isolated settings file from Phase 6.

| Test | Proves |
|---|---|
| `sound_volume` of -1, 101, `true` and `"loud"` | None is saved |
| `sound_volume` of 0 and 100 | Both are saved |
| `sound_choice` of `"siren"` | Not saved |
| `alert_retention_days` of 10, 0 and `"7"` | None is saved |
| A settings file from V2.0.1, with none of the new keys | Loads with the three defaults and keeps its thresholds |
| Alerts aged 5, 10 and 20 days, retention set to 7 | Only the 5-day alert remains, without waiting for the hourly prune |
| The same, with one open episode 20 days old | The open episode is kept |
| Retention raised from 7 to 30 | Nothing is deleted |
| The retention request | Returns without waiting for the prune |

### 6.2 Automated (frontend)
`alertSound.ts` is written so its logic can be tested without audio hardware, in the test runner Phase 8 introduces:

- The volume curve: 0 gives 0, 50 gives 0.1, 100 gives 0.4.
- Each sound's note list has the durations stated in §2.2.
- The "already sounded" set: the same `episode_id` twice plays once, and two ids play twice.

### 6.3 Manual (desktop)
| # | Step | Expected |
|---|---|---|
| 1 | Open Settings on an install upgraded from V2.0.1 | Volume at 50, sound "Chime" |
| 2 | Press **Test** | The familiar V2 beep, at its familiar loudness |
| 3 | Select each sound and press **Test** | Four clearly different sounds |
| 4 | Drag volume to 0, press **Test** | Silence. At 100, loud without distortion |
| 5 | Drag the volume slider back and forth for five seconds | One save request when the slider is released |
| 6 | Hold CPU over its limit for two minutes | The sound plays **once**. Toasts continue as before |
| 7 | Let CPU recover for a minute, then breach again | The sound plays again |
| 8 | Trigger thirty separate alerts over a session | Sound still works at the end |
| 9 | Switch sound off and trigger an alert | Toast, no sound. Volume and sound rows are dimmed. **Test** still plays |
| 10 | Choose "Bell", restart the app and the backend | Still "Bell" |
| 11 | Change retention from 30 to 7 | A confirmation appears. Cancel leaves it at 30 |
| 12 | Confirm it | Older alerts are gone from the Alerts page at once, and the 30-day preset has disappeared |
| 13 | Change retention from 7 to 30 | No confirmation. The 30-day preset returns |
| 14 | Stop the backend, open Settings | Appearance and Startup work. The other sections show the "could not load" state |
| 15 | Both themes, a narrow window, zoom at 125% | Six sections, nothing clipped, columns stack when narrow |

---

## 7. Definition of Done (Success Criteria)

Phase 7 is complete when all of these hold:

1. **Volume works.** The slider changes how loud alerts are, from silent to loud, and the level is kept across restarts.
2. **Sounds can be chosen.** Four distinct built-in sounds, with a Test button that plays the current choice at the current volume.
3. **Nothing changed for existing users.** Until a setting is touched, the sound and its loudness are the same as in V2.
4. **One sound per alert.** A sustained breach sounds once, not every three seconds.
5. **Sound keeps working.** A long session with many alerts does not go silent.
6. **Retention can be chosen.** 7, 14 or 30 days, applied at once.
7. **Deleting is deliberate.** Shortening retention asks first, and cancelling changes nothing.
8. **The page is consistent.** The Alerts page never offers a range longer than what is kept.
9. **Invalid values are rejected.** No out-of-range volume, unknown sound or unsupported retention is ever saved.
10. **The Settings page is complete.** All six sections are present, grouped as in §4.1, and each behaves correctly when the backend is offline.
11. **No regressions.** Thresholds, theme and the sound toggle work as before, and the existing tests pass.

Once these pass, every feature of V2.1 is built, and we are ready for **Phase 8: Complete Testing**.
