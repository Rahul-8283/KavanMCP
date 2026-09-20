# Phase 9: Comprehensive Feature Testing

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 9
Phase 9 pauses active feature development to focus entirely on quality assurance and regression testing. The objective is to systematically validate every individual feature built across Phases 1 through 8 in isolation, ensuring the desktop app behaves predictably under stress, offline scenarios, and edge cases.

By the end of Phase 9, all major UI bugs, memory leaks, and edge-case crashes will be squashed, ensuring the application is rock-solid before we attempt the three-way integration with Claude in Phase 10.

### 1.2 Testing Philosophy (Manual & Automated)
While unit tests (`vitest`/`jest`) are valuable, a desktop utility monitoring native OS metrics requires intense manual and edge-case testing. The focus here is on **Resiliency** (what happens when the backend dies?) and **Performance** (does the UI freeze when sorting 800 items?).

---

## 2. Core Subsystem Validations

### 2.1 WebSocket & Connection Resiliency (Phase 2)
The WebSocket is the heartbeat of the application. It must never permanently sever.
- **Test 1:** Start both the Tauri app and FastMCP server. Verify gauges animate smoothly.
- **Test 2 (The Kill Switch):** Manually terminate the Python server via task manager. 
  - *Expected:* The UI instantly displays a "Disconnected" banner. Gauges grey out. The app does *not* crash.
- **Test 3 (Auto-Recovery):** Restart the Python server.
  - *Expected:* Within 10 seconds, the UI automatically drops the disconnected banner and resumes animating the gauges via exponential backoff reconnects.

### 2.2 Data Organization & Virtualization (Phases 3 & 4)
The Process Manager must handle massive arrays without dropping frames.
- **Test 1:** Open 100+ instances of a dummy script (or Chrome tabs) to bloat the process list to >800 entries.
- **Test 2 (Virtualization):** Grab the scrollbar and aggressively drag it to the bottom.
  - *Expected:* Locked 60FPS. No stuttering or white flashes.
- **Test 3 (Sort/Filter Integrity):** Filter by Tier 4, then sort by CPU descending.
  - *Expected:* The list resolves instantly (under 10ms). No network requests are fired. The top row is strictly the highest CPU-consuming Tier 4 process.

---

## 3. UI State & Persistence Testing

### 3.1 Settings & Thresholds (Phase 5)
User configurations must survive total application closures.
- **Test 1 (Debounce Verification):** Open the network tab. Drag the CPU threshold slider rapidly back and forth for 5 seconds.
  - *Expected:* Only **one** `POST /api/update_thresholds` request fires upon releasing the mouse.
- **Test 2 (Persistence):** Toggle Dark Mode ON. Set CPU Threshold to 12%. Completely exit the Tauri app. Reopen it.
  - *Expected:* The app boots instantly in Dark Mode (no white flash) and the CPU slider remains at 12%.

### 3.2 Toast Queue Management (Phase 6)
The notification system must protect the user from screen clutter.
- **Test 1 (The Flood):** Lower all thresholds to 1% to force the backend to spam alerts.
- **Test 2 (The Limit):** 
  - *Expected:* Only 3 Toasts appear on screen. The 4th alert is either discarded or queued until a slot opens.
- **Test 3 (Auto-Dismissal):** Take your hands off the mouse.
  - *Expected:* After exactly 5 seconds, all toasts slide off the screen and destroy themselves.

---

## 4. OS-Level Integration Testing

### 4.1 Background Lifecycle (Phase 7)
The app must feel like a native Windows utility.
- **Test 1:** Click the standard 'X' window control button.
  - *Expected:* The window vanishes, but the app process remains alive in the Task Manager. The tray icon remains visible.
- **Test 2:** Trigger a CPU spike while the window is hidden.
  - *Expected:* The tray icon flashes red. A native Windows Action Center notification appears (Tauri Notification API).
- **Test 3:** Left-click the Tray Icon.
  - *Expected:* The window restores instantly to its previous state.

### 4.2 The Kill Flow (Phase 8)
This is the most critical safety check.
- **Test 1 (The Hard Block):** Right-click `explorer.exe` (or another hardcoded Tier 1 process). Click Terminate.
  - *Expected:* The modal opens, but the Confirm button is greyed out. It is impossible to execute.
- **Test 2 (Optimistic Deletion):** Right-click a safe, dummy process (e.g., `calc.exe`). Click Terminate. Confirm the modal.
  - *Expected:* `calc.exe` is killed on the host OS. The row vanishes from the UI table instantly. A green success Toast appears.
- **Test 3 (Permission Denied):** Boot the FastMCP server *without* Admin rights. Attempt to kill a privileged system process.
  - *Expected:* The UI handles the 403 error gracefully and displays a red Toast instructing the user to restart as Administrator.

---

## 5. Definition of Done (Success Criteria)

Phase 9 is considered complete when the following criteria are met:

1. **Crash-Free Operation:** The application can survive a total backend outage and recover automatically.
2. **Performance Constraints:** Sorting 800+ processes executes instantly without dropping UI frames.
3. **UX Validation:** Toasts auto-dismiss, limit themselves to 3 on screen, and slider dragging does not spam the REST API.
4. **Native Bindings:** The Tray icon successfully hides/restores the window and updates its icon graphic dynamically.
5. **Safety Constraints:** Tier 1 processes are impossible to kill via the UI, mirroring the V1 AI constraints perfectly.

Once these rigorous manual tests are passed, the standalone UI is mathematically verified, and we are ready for the grand finale: **Phase 10: End-to-End Integration & Claude Sync Testing**.
