# Phase 6: Toast Alerts & Notification System

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 6
Phase 6 transforms Kavan from a passive monitoring tool into a proactive alerting system. The objective is to build a robust notification system that grabs the user's attention exactly when system thresholds (configured in Phase 5) are breached, even if the application window is minimized or not in focus.

By the end of Phase 6, the application will render beautiful, transient UI popups (Toasts) inside the app, and simultaneously trigger native OS-level notifications via Tauri's Rust bindings when critical events occur.

### 1.2 Architectural Philosophy (Non-Blocking & Asynchronous)
Alerts can happen in bursts (e.g., launching an IDE might spike CPU, RAM, and Disk simultaneously). The Toast system must manage these bursts cleanly using a Queue. It must never freeze the UI, and it must auto-dismiss notifications to prevent screen clutter.

---

## 2. Backend Alert Generation

The UI only displays alerts; the Python FastMCP server must actively calculate them.

### 2.1 The Evaluation Loop
In the background `asyncio` task established in Phase 2, the Python server must evaluate the live `psutil` metrics against the user's `config.json` thresholds before broadcasting.
- If `current_cpu > config.cpu_threshold`, generate an Alert Payload.

### 2.2 Alert WebSocket Payload
Instead of a standard `metrics_update`, the server pushes a specific alert message over the existing WebSocket channel.
```json
{
  "type": "threshold_alert",
  "level": "warning", 
  "message": "CPU exceeded 85% threshold. Current: 88%.",
  "timestamp": 1718293041
}
```
*Levels should be categorized as `info`, `warning`, or `critical`.*

---

## 3. Frontend Component Architecture

### 3.1 The `<ToastProvider />` (React Context)
To allow any component (or the WebSocket hook) to trigger a toast, the state must live globally.
- **State Array:** `const [toasts, setToasts] = useState<Toast[]>([]);`
- **Actions Exported:** `addToast(message, level)` and `removeToast(id)`.
- The provider wraps the entire `<AppShell />` and renders a dedicated `<ToastContainer />` fixed to the `top-right` or `bottom-right` of the screen using absolute positioning (`fixed z-50 right-4 top-4`).

### 3.2 The `<Toast />` Component
The visual UI element representing a single alert.
- **Styling:** Styled heavily with Tailwind. Must include a drop-shadow, rounded corners, and a smooth slide-in animation.
- **Color Coding:** 
  - `info`: Blue border/icon.
  - `warning`: Amber/Orange border/icon.
  - `critical`: Red border/icon.
- **Controls:** Includes a small 'X' button to manually dismiss the toast before the timer expires.

---

## 4. Toast Logic & Queuing

### 4.1 Auto-Dismissal
When `addToast` is called, it must automatically schedule its own destruction.
- Use `setTimeout` within a `useEffect` inside the individual `<Toast />` component.
- **Duration:** 5000ms (5 seconds).
- When the timer completes, it calls `removeToast(id)` to slice itself out of the global array.

### 4.2 The Queue Limiter
To prevent the screen from filling entirely with popups during a massive spike:
- The `<ToastContainer />` should only ever render a maximum of **3** active toasts at once.
- If a 4th toast is triggered, it should either immediately displace the oldest toast, or be queued in state until one of the visible toasts dismisses. (Displacing the oldest is generally preferred for real-time monitoring).

---

## 5. Tauri Native OS Integration

While React Toasts are great when the app is focused, they are invisible if the user is working in another application. Phase 6 requires our first real integration with the Tauri Rust APIs.

### 5.1 `@tauri-apps/api/notification`
When the React WebSocket hook receives a payload with `level === 'critical'`, it must trigger an OS-level notification.
```typescript
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/api/notification';

async function triggerNativeAlert(title: string, body: string) {
  let permissionGranted = await isPermissionGranted();
  if (!permissionGranted) {
    const permission = await requestPermission();
    permissionGranted = permission === 'granted';
  }
  if (permissionGranted) {
    sendNotification({ title: title, body: body });
  }
}
```
### 5.2 Sound Alerts
If the user enabled "Sound Alerts" in Phase 5, the trigger logic should also play a subtle, non-intrusive `.wav` or `.mp3` file (e.g., a short beep) utilizing the native HTML5 `<audio>` API.

---

## 6. Definition of Done (Success Criteria)

Phase 6 is considered complete when the following criteria are met:

1. **Alert Generation:** Manually lowering the CPU threshold in settings to `10%` successfully triggers the backend to push a `threshold_alert` WebSocket message.
2. **UI Rendering:** Receiving the alert successfully renders a styled `<Toast />` in the corner of the application window.
3. **Auto-Dismissal:** The toast vanishes entirely on its own after exactly 5 seconds without user interaction.
4. **Queue Management:** Spamming the system to generate 10 simultaneous alerts only results in a maximum of 3 toasts rendering on screen, preventing UI overflow.
5. **Native OS Bridging:** A critical alert successfully triggers a native Windows Action Center notification, proving the Tauri Rust bindings are correctly configured.
6. **Sound Playback:** If enabled in settings, the alert is accompanied by an audible beep.

Once these checks pass, the application becomes a proactive, intelligent monitor, and we are ready for **Phase 7: System Tray Integration & Background Presence**.
