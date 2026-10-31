# KavanMCP 2.1.5 Release Notes

Kavan 2.1.5 follows 2.1.0. It contains the Phase 8 quality cleanup, a set of small backend fixes, the new project website, and the version change to 2.1.5 across the app.

## What is new

- **Project website.** A one-page site describes Kavan, its safety tiers, its screenshots of the real app, the requirements and the download. It is built from `web/` as a static site and includes a light and a dark theme that match the app.
- **Download card.** The site shows the Windows installer's file name, size and SHA-256 checksum, so you can check the file you download.

## Behaviour changes

- None for the app's behaviour in this release. The changes below are fixes and quality work.

## Fixed and improved

- **Exception handling.** Every remaining broad `except` in the backend now states why it is there. Failures that were silently ignored are now logged at debug level, so they can be found when something goes wrong.
- **Approval sweep.** Expired pending approvals are removed more simply, and only the entry that was checked is removed, so an approval staged again in the meantime is never dropped by mistake.
- **Detached process start.** The rollback relaunch is marked as intentionally not waited on, so nothing reads it as a forgotten process.
- **Live CPU check.** The test aid that checks alerts against a real CPU burn now allows up to 240 seconds for a process alert to close. The earlier check gave up too early, while the app was behaving correctly.
- **Tests.** Two test files were tidied, with nested blocks combined. This changes no behaviour.
- **Repository.** A duplicate, out-of-date API reference was removed.

## Version

- The version is 2.1.5 in the desktop app (`package.json`, `tauri.conf.json`, `Cargo.toml`) and in the MCP server.

## Testing

- Backend: 641 tests (`mcp-server`, run with `venv\Scripts\python.exe -m pytest -q`).
- Desktop: 81 tests (`desktop`, run with `npm test`). All 81 pass.

## Installing

- Download `kavan_2.1.5_x64-setup.exe` from the release page and run it. The installer is not code-signed yet, so Windows may show an "unknown publisher" warning. Choose "More info" and then "Run anyway" if you trust the source.
- The background service needs Python 3.11 or newer and its own virtual environment in `mcp-server`. The installer does not include Python. See the setup steps on the website or in the README.

## Known issues

- The installer is not code-signed, so Windows shows an unknown-publisher warning.
- The 24-hour soak test, testing with Claude Desktop connected, sign-out and sign-in for start-with-Windows, and a real sleep and wake have not been run, because they need a person at the machine. They are described in `phase_v2_1/Phase8_v2_1.md`.
- A restored program runs with the rights of the backend. If Kavan runs as Administrator, a restored program does too.
- A backend started at sign-in runs without Administrator rights, so ending a privileged process returns "Permission Denied".

For the full list of 2.1.0 behaviour changes and the upgrade notes, see `docs/RELEASE_NOTES_V2_1.md`.
