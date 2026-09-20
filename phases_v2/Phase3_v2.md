# Phase 3: Process Manager - Data Fetching & Display

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 3
Phase 3 shifts the focus from high-level system metrics (the gauges) to detailed, itemized diagnostics. The objective is to build the Process Manager—a comprehensive data table that displays every active process currently running on the host OS.

By the end of Phase 3, the user will be able to navigate to the Process Manager view and see a structured list detailing Process Names, PIDs, raw CPU/RAM usage, and crucially, their assigned Kavan Security Tier.

### 1.2 Architectural Philosophy (REST over WebSocket)
Unlike the global metrics in Phase 2, we will *not* push the massive array of 500+ running processes over WebSockets every 2 seconds. Doing so would overwhelm the React render cycle and spike network overhead. 
Instead, the Process Manager relies on the HTTP REST Channel (`GET /api/list_processes`). Data is fetched once upon component mount, and subsequently only when the user explicitly clicks a "Refresh" button or triggers a kill command.

---

## 2. API Integration & Data Mapping

### 2.1 The `GET /api/list_processes` Endpoint
The Python backend already possesses the `list_processes` logic via the existing FastMCP tool. For Phase 3, this logic must be exposed as a standard FastAPI `GET` route.

**Expected JSON Response Array:**
```json
[
  {
    "pid": 12432,
    "name": "Discord.exe",
    "cpu_percent": 14.2,
    "memory_mb": 450.5,
    "tier": 3,
    "create_time": 1718293041
  },
  {
    "pid": 4,
    "name": "System",
    "cpu_percent": 0.1,
    "memory_mb": 0.2,
    "tier": 1,
    "create_time": 1718280000
  }
]
```

### 2.2 Data Fetching via `useProcessManager`
The `useProcessManager` custom hook (stubbed in Phase 1) must be implemented.
- **`fetchProcesses()`:** Utilizes the configured Axios instance to request data.
- **State Updates:** Dispatches the resulting array to the global `ProcessContext`.
- **Loading State:** Must expose a boolean `isLoading` variable so the UI can render a spinner while `psutil` performs the deep inspection on the backend.

---

## 3. Frontend Component Architecture

### 3.1 The `<ProcessManager />` Page
This is the primary container for the layout. It orchestrates the loading states, the manual refresh button, and renders the underlying table.

### 3.2 The `<ProcessTable />` Component
A dedicated component responsible for iterating over the process array.
- Must utilize semantic HTML `<table>`, `<thead>`, `<tbody>`, and `<tr>` elements.
- **Columns Required:**
  1. Process Name
  2. PID
  3. CPU Usage (%)
  4. RAM Usage (MB)
  5. Security Tier
- **Empty State:** If the backend returns an empty array, render a friendly "No processes found" graphic.
- **Loading State:** If `isLoading` is true, render a skeleton loader mirroring the shape of the table rows to prevent layout shift.

---

## 4. Visual Badging & UX (The Security Tiers)

The defining feature of Kavan is its strict security tiering. The Desktop App must visually communicate this danger immediately.

### 4.1 Tier Rendering Logic
Instead of rendering a raw integer (`1`, `2`, `3`), the `<ProcessTable />` must pass the tier value to a dedicated `<TierBadge tier={3} />` component.

- **Tier 1 (Critical OS):** 
  - UI: Solid Red background, White text.
  - Text: `CRITICAL` or `SYSTEM`.
- **Tier 2 (Essential Apps):** 
  - UI: Solid Orange/Amber background.
  - Text: `ESSENTIAL`.
- **Tier 3 (User Background):** 
  - UI: Solid Yellow background, Dark text.
  - Text: `OPTIONAL`.
- **Tier 4 (Unknown/Suspicious):** 
  - UI: Hollow Red Outline (border-red-500, text-red-500).
  - Text: `UNVERIFIED`.

### 4.2 Tooltips for Context
Hovering over a `<TierBadge />` should reveal a native tooltip explaining the classification (e.g., "Hover: This is a critical Windows System process. Terminating it may cause a blue screen.")

---

## 5. Performance Considerations (DOM Virtualization)

A modern Windows machine often runs between 300 and 800 discrete processes simultaneously.

### 5.1 The DOM Bloat Problem
Rendering 800 raw `<tr>` elements in React will cause significant scroll lag and layout calculation spikes, severely diminishing the "native app" feel of the Tauri wrapper.

### 5.2 Virtualization Strategy
If the total process count is expected to regularly exceed 200, the `<ProcessTable />` must implement row virtualization (e.g., using `react-window` or `@tanstack/react-virtual`).
- Virtualization ensures that only the ~20 rows currently visible on the user's screen are actually painted to the DOM.
- As the user scrolls, rows leaving the viewport are destroyed and recycled for new rows entering the viewport.
- This guarantees a locked 60FPS scrolling experience regardless of whether there are 100 or 10,000 active processes.

---

## 6. Definition of Done (Success Criteria)

Phase 3 is considered complete when the following criteria are met:

1. **API Exposure:** The FastMCP backend successfully serves the `GET /api/list_processes` endpoint without crashing.
2. **Data Integration:** Navigating to the Process Manager page in the Tauri App successfully triggers the Axios fetch and populates the `ProcessContext`.
3. **Table Rendering:** The `<ProcessTable />` renders all returned processes in a clean, aligned tabular format.
4. **Visual Badging:** The `<TierBadge />` logic correctly colors Tier 1, 2, 3, and 4 processes exactly according to the design spec.
5. **Loading States:** Clicking a "Refresh" button triggers the `isLoading` state, displaying a skeleton or spinner until the new data arrives.
6. **Performance Check:** Scrolling rapidly from the top to the bottom of the list exhibits zero stuttering or screen tearing.

Once these checks pass, the raw data is successfully exposed, and we are ready for **Phase 4: Process Manager - Sorting & Filtering**.
