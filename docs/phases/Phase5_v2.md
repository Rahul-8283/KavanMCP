# Phase 5: Alert Thresholds & Settings Panel

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 5
Phase 5 introduces user customization. The objective is to build a dedicated Settings Panel where users can tweak the sensitivity of the Kavan alerts and manage application preferences (like Light/Dark mode). 

By the end of Phase 5, the user will be able to adjust interactive sliders for CPU, RAM, and Disk thresholds (e.g., changing the CPU alert threshold from 90% down to 75%). These changes will instantly sync with the Python backend and persist across application reboots.

### 1.2 Architectural Philosophy (Single Source of Truth)
Threshold configurations are heavily utilized by the Python backend to determine when to push WebSocket alerts (Phase 6). Therefore, the ultimate source of truth for these settings is a `config.json` file managed by the FastMCP server. The React UI simply loads this config on boot, manipulates it via the UI, and POSTs the updates back to the server.

---

## 2. API Integration for Configuration

Phase 5 requires two new REST endpoints on the FastMCP server.

### 2.1 The `GET /api/get_config` Endpoint
Called exclusively when the React App boots (inside the `<ConfigProvider />` initialization).
- **Expected JSON Response:**
```json
{
  "cpu_threshold": 90,
  "ram_threshold": 90,
  "disk_threshold": 95,
  "theme": "dark",
  "sound_alerts": true
}
```

### 2.2 The `POST /api/update_thresholds` Endpoint
Called when the user finishes dragging a slider or toggling a preference.
- **Expected Payload:** Partial or complete config JSON.
- **Backend Action:** Overwrites the local `config.json` file on disk and updates the active runtime variables so the background monitoring loop immediately respects the new thresholds.

---

## 3. Frontend Component Architecture

### 3.1 The `<Settings />` Page
A new top-level page component accessible via the Sidebar navigation.
- Organized into clear structural cards/sections: "Alert Thresholds", "Appearance", and "System Integrations".

### 3.2 The Threshold Sliders
The core interaction of this phase.
- Use native HTML `<input type="range" min="0" max="100" />` elements, styled beautifully with Tailwind.
- As the user drags the slider, the UI must update instantly (e.g., the label changes rapidly from "85%" -> "86%" -> "87%"). This requires binding the `onChange` event to local React state.

---

## 4. Debouncing & Network Optimization

If we bind the `POST /api/update_thresholds` call directly to the slider's `onChange` event, moving the slider from 50% to 90% would fire 40 simultaneous HTTP requests, overwhelming the backend.

### 4.1 The `useDebounce` Strategy
- **Local State:** Updates instantly on drag (`setLocalValue`).
- **Debounced Push:** A `useEffect` hook waits for the user to stop dragging for `500ms`. Once the timeout completes without further dragging, the final value is sent via the Axios API client.
- **Fallback (`onMouseUp`):** Alternatively, bind the API call to the `onMouseUp` or `onTouchEnd` events, guaranteeing only one network request fires when the user releases the mouse.

---

## 5. Additional Preferences & LocalStorage

While threshold data must sync with the backend, purely aesthetic settings should be handled strictly client-side.

### 5.1 Theme Toggling (Light / Dark)
- Implement a toggle switch in the Appearance section.
- Clicking the toggle updates the `ConfigContext` and injects a `dark` class into the root `<html>` node.
- The preference must be saved via `localStorage.setItem('theme', 'dark')` so the app doesn't flash white on the next boot.

### 5.2 Sound Alerts
- Implement a toggle for "Enable Sound Notifications".
- Saved via the backend config (or local storage), this boolean will be consumed in Phase 6 to determine if a `.wav` file should play when a critical alert fires.

---

## 6. Edge Cases & Safety Precautions

### 6.1 Validation
- The backend API must enforce server-side validation (via Pydantic). If a malicious request attempts to set the CPU threshold to `150` or `-10`, it must return a `400 Bad Request`.
- The UI must enforce min/max constraints natively on the slider elements.

### 6.2 Visual Reset
- Provide a clear "Reset to Defaults" button. Clicking this should send `{ cpu: 90, ram: 90, disk: 95 }` to the backend and instantly revert the sliders in the UI.

---

## 7. Definition of Done (Success Criteria)

Phase 5 is considered complete when the following criteria are met:

1. **Boot Initialization:** On app startup, the Settings panel successfully loads the initial values from the Python backend rather than hardcoded React defaults.
2. **Slider UX:** The sliders move smoothly, and the numeric labels update instantly in real-time as the user drags.
3. **Network Efficiency:** Dragging a slider from 0 to 100 only results in exactly **one** `POST` request to the backend once the drag is completed (verifiable in the Network Tab).
4. **Backend Persistence:** Changing a threshold, completely closing the Tauri app, and reopening it results in the new custom threshold being loaded successfully.
5. **Theme Persistence:** Toggling to Dark Mode, closing the app, and reopening it correctly boots the app in Dark Mode immediately.
6. **Reset Validation:** The "Reset to Defaults" button successfully overwrites all custom tweaks and restores the factory safe parameters.

Once these checks pass, the application configuration layer is robust, and we are ready for **Phase 6: Toast Alerts & Notification System**.
