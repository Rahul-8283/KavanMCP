# Phase 7: System Tray Integration & Background Presence

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 7
Phase 7 fundamentally changes how the user interacts with the application. The objective is to decouple the application's utility from its main window by establishing a persistent, informative presence in the Windows System Tray (Taskbar).

By the end of Phase 7, the application will run silently in the background. The user will be able to glance at a small `.ico` in their taskbar that dynamically changes color based on their system's health, hover over it for exact metrics, and single-click it to instantly summon the main dashboard.

### 1.2 Architectural Philosophy (Rust IPC)
Unlike standard web apps, Tauri allows React to communicate directly with the host OS. The React frontend will monitor the WebSocket metrics, calculate the threshold color (Green/Yellow/Red), and then dispatch an Inter-Process Communication (IPC) command to the Rust backend to physically swap the `.ico` file rendered in the Windows taskbar.

---

## 2. Tauri Configuration & Asset Management

### 2.1 Enabling the System Tray
The `tauri.conf.json` (or `src-tauri/Cargo.toml` depending on Tauri V2 structure) must be updated to explicitly enable the tray plugin.
- The default icon must be mapped to `icons/tray-green.ico`.
- The application must be configured to *not* terminate when the main window is closed, but rather to hide itself.

### 2.2 Icon Variants
Three distinct `.ico` files must be generated and placed in the `src-tauri/icons/` directory.
1. `tray-green.ico` (Normal operation)
2. `tray-yellow.ico` (Warning threshold breached)
3. `tray-red.ico` (Critical threshold breached)

---

## 3. React to Rust IPC (Inter-Process Communication)

The logic for determining system health already exists in the React `MetricsContext`. We will implement a `useEffect` hook that listens to changes in this context and pushes updates to the OS.

### 3.1 Dynamic Icon Swapping
```typescript
import { tray } from '@tauri-apps/api';

// Inside a custom hook or global provider:
useEffect(() => {
  let newIcon = 'icons/tray-green.ico';
  if (cpu > criticalThreshold) newIcon = 'icons/tray-red.ico';
  else if (cpu > warningThreshold) newIcon = 'icons/tray-yellow.ico';

  if (currentTrayIcon !== newIcon) {
    tray.setIcon(newIcon);
    setCurrentTrayIcon(newIcon);
  }
}, [cpu]);
```

### 3.2 Dynamic Tooltips
When the user hovers their mouse over the system tray icon, a small text box appears. This text must also be dynamically updated via IPC.
- **Update Logic:** `tray.setTooltip(\`CPU: ${cpu}% | RAM: ${ram}%\`)`
- This ensures the user gains immediate value without ever opening the app.

---

## 4. Window Lifecycle Management

The default behavior of clicking the "X" in a desktop window is to kill the process. This must be overridden.

### 4.1 Hide, Don't Kill
- intercept the `tauri://close-requested` window event.
- Instead of allowing the app to terminate, invoke `appWindow.hide()`.
- The React application (and its WebSocket listener) will continue running silently in the background, updating the tray icon and firing native Toast alerts if necessary.

### 4.2 Restoration (Click to Show)
- Bind an event listener to the System Tray icon itself.
- On `left-click`, invoke `appWindow.show()` and `appWindow.setFocus()`.

---

## 5. The Tray Context Menu

Right-clicking the System Tray icon must reveal a native OS context menu.

### 5.1 Menu Options
1. **Open KavanMCP:** (Bolded, default action) Unhides and focuses the main window.
2. **Separator:** A visual line break.
3. **Quit:** The actual termination command that gracefully closes the WebSocket connection, shuts down the React app, and kills the Tauri process completely.

---

## 6. Definition of Done (Success Criteria)

Phase 7 is considered complete when the following criteria are met:

1. **Persistent Presence:** Launching the app successfully renders the default green icon in the Windows System Tray.
2. **Background Operation:** Clicking the 'X' on the main window hides the window but leaves the tray icon visible and the background processes running.
3. **IPC Validation:** Triggering a CPU spike successfully forces React to command Rust to swap the tray icon from Green to Red in real-time.
4. **Tooltip Updates:** Hovering over the tray icon reveals a tooltip that accurately displays the latest CPU and RAM percentages.
5. **Window Restoration:** Left-clicking the tray icon successfully unhides and focuses the main Dashboard window.
6. **Graceful Exit:** Right-clicking the tray icon and selecting "Quit" completely and safely terminates the application.

Once these checks pass, the application achieves true utility-grade persistence, and we are ready for the most critical security implementation: **Phase 8: Process Control - Kill Flow & Confirmation**.
