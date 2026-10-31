# KavanMCP 2.1.0 Release Notes

## What is new
- **Alert History.** Every alert is stored, with its start and end, peak, the CPU, memory and disk at that moment, and the largest consumer when it began. Filter by date, type and severity. It updates live and keeps recording while the window is closed.
- **Performance Trends.** CPU, memory and disk over 1 hour to 7 days, with peak bands, threshold lines and alert regions. Drag the overview strip to pan and zoom, and zooming loads finer detail. A period with no data is drawn as a gap.
- **Recently Killed.** A list of what Kavan terminated, with a one-click Restore, and an Undo on the toast after a kill. A kill is restored once, from the app or from Claude.
- **Protected apps.** A never-terminate list that binds the app and Claude, and a never-alert list that records alerts quietly.
- **Start with Windows.** The app can start its own backend, in the tray, and opens one window only.
- **Sound and retention.** Four alert sounds with a volume control, and alert history kept for 7, 14 or 30 days.

## Behaviour changes
- The alert sound plays once per alert, not every three seconds.
- The first toast of a CPU or memory alert appears about two seconds later than before, because it waits to learn which program caused it.
- Claude's `rollback_last_action` never restores the same kill twice. A second request restores the kill before it, or says none is left.
- Settings are stored in `mcp-server/data/settings.json`. The old tracked settings file is no longer used, and existing values are copied across on first start.
- The backend scans processes once a minute in the background.

## Fixed during testing
- A CPU alert could name the wrong program. The scan behind it reported each program's average since the previous scan, which can be a minute old, so a program that had just started read zero. It now measures only the last second.

## Upgrading
- A V2.0.1 database and settings file carry over with nothing lost. The new tables and columns are added, the old rows keep NULL for the new columns, and the migrated database still opens in V2.0.1.

## Known issues
- The Windows installer step (`npm run tauri build`) could not be completed in the test environment, where the download of the installer tools timed out. The application itself builds in release mode.
- The 24-hour soak test, testing with Claude Desktop connected, sign-out and sign-in for start-with-Windows, and a real sleep and wake have not been run, because they need a person at the machine. They remain to be run by hand, as described in `phase_v2_1/Phase8_v2_1.md` (sections 4.6, 5.2 and 7).
- A restored program runs with the rights of the backend. If Kavan runs as Administrator, a restored program does too. The Recently Killed page says so.
- A backend started at sign-in runs without Administrator rights, so killing a privileged process returns "Permission Denied".
