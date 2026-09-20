# Phase 1: Foundation & Global Architecture (V2)

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 1
If Phase 0 was about configuring the Tauri container and dependencies, Phase 1 is about building the architectural skeleton of the React application itself. The objective is to establish the global layout (App Shell), global state management, the API communication layer, and error handling boundaries.

By the end of Phase 1, the application will boot into a fully styled, navigable shell (Header, Sidebar/Nav, Main Content Area) that is securely wired to talk to the FastMCP backend, even though the specific UI widgets (Gauges, Tables) won't be built until subsequent phases.

### 1.2 Target Audience for this Document
This blueprint dictates the architectural patterns that all subsequent phases must adhere to. Any coding agent or engineer working on Phase 1 must follow these exact state management and API design patterns to prevent UI blocking or prop-drilling later on.

---

## 2. Global Layout & App Shell (`App.tsx`)

The Application Shell is the persistent UI wrapper that surrounds all specific page content. It must be highly responsive and visually distinct from standard web apps to feel native.

### 2.1 The Shell Components
- **Top Header (`<Header />`):** Contains the application title, an active connection status indicator (Red/Green dot for WebSocket health), and a Settings cog icon.
- **Side Navigation (`<Sidebar />`):** A fixed left-hand rail for navigating between primary views (Dashboard, Alert History, Settings). To save space, it should be collapsible to a minimal icon-only view.
- **Main Content Wrapper (`<MainLayout />`):** The dynamically rendered area where the React Router or conditional rendering injects the current page component.

### 2.2 Styling Paradigm
- TailwindCSS will be used exclusively.
- Flexbox/CSS Grid will define the structural constraints of the shell.
- The `index.css` file must define CSS variables for `--bg-primary`, `--bg-secondary`, `--text-primary`, and `--accent` to support Phase 5's Light/Dark mode toggling seamlessly.

---

## 3. Global State Management (React Context)

To prevent prop-drilling (passing data through 5 layers of components) and to ensure ultra-fast re-renders when 2-second metric updates arrive, we will utilize the React Context API combined with focused reducers.

### 3.1 `MetricsContext`
- **Purpose:** Stores the exact, real-time CPU, RAM, and Disk percentages.
- **State Shape:** `{ cpu: number, ram: number, disk: number, lastUpdated: string }`
- **Why Separate?** This context updates every 2 seconds. By keeping it isolated from the rest of the application state, we ensure that only the components listening to metrics (like the Dashboard Gauges) will re-render, keeping the rest of the app highly performant.

### 3.2 `ProcessContext`
- **Purpose:** Stores the massive array of running processes and the user's active sorting/filtering preferences.
- **State Shape:** `{ processes: Process[], isLoading: boolean, error: string | null }`
- **Why Separate?** The process list only updates when the user manually refreshes or triggers a kill action. It should not re-render every 2 seconds when CPU metrics shift.

### 3.3 `ConfigContext`
- **Purpose:** Stores user preferences loaded from disk (Alert thresholds, Theme).
- **State Shape:** `{ theme: 'light' | 'dark', cpuThreshold: number, ramThreshold: number }`

---

## 4. The API Service Layer (`src/services/api.ts`)

Directly calling `fetch()` or `axios.get()` inside React components leads to messy code, duplicated base URLs, and inconsistent error handling. Phase 1 abstracts all HTTP logic into a dedicated service layer.

### 4.1 Axios Instance Configuration
An Axios instance will be created and exported globally:
- **Base URL:** Sourced from `import.meta.env.VITE_API_URL` (resolving to `http://localhost:8000`).
- **Timeout:** 5000ms. If the Python backend doesn't respond in 5 seconds, the UI must assume it is dead.
- **Headers:** `Content-Type: application/json`.

### 4.2 Interceptors & Global Error Handling
Axios Interceptors will intercept responses *before* they reach the React components:
- **Success Interceptor:** Simply returns `response.data` to strip away the Axios wrapper object.
- **Error Interceptor:**
  - If `error.code === 'ECONNREFUSED'`, it dispatches a global "Backend Offline" event.
  - If the server returns a 500 or 403 (e.g., Access Denied for Tier 1 kills), the interceptor standardizes the error message so the UI can safely display a Toast alert.

### 4.3 Service Definitions
Empty placeholder functions for future phases must be stubbed out here:
```typescript
export const SystemAPI = {
  fetchProcesses: () => apiClient.get('/api/list_processes'),
  confirmKill: (pid: number) => apiClient.post('/api/confirm_termination', { pid }),
  executeKill: (pid: number) => apiClient.post('/api/execute_termination', { pid })
};
```

---

## 5. Base Hooks Architecture (`src/hooks/`)

Custom React Hooks will bridge the gap between the raw API service layer and the UI components.

### 5.1 `useWebSocketConnection.ts`
- **Purpose:** Manages the lifecycle of the WebSocket pointing to `ws://localhost:8000/ws`.
- **Logic:** 
  - Initiates connection on `useEffect` mount.
  - Parses incoming JSON and dispatches updates to the `MetricsContext`.
  - Implements **Exponential Backoff Reconnection:** If the connection drops, it tries to reconnect in 1s, then 2s, then 4s, capping at 10s intervals to prevent spamming a dead backend.

### 5.2 `useProcessManager.ts`
- **Purpose:** Abstracts the fetching and local mutation of processes.
- **Logic:**
  - Exposes `processes` data, `loading` state, and a `refreshProcesses()` trigger.
  - Exposes `terminateProcess(pid)` which handles the dual API calls (`confirm` then `execute`) and handles the optimistic UI updates (removing the row immediately if successful).

---

## 6. Global Error Boundaries

If a React component throws a raw JavaScript error (e.g., trying to read a property of `undefined`), the entire React tree unmounts, leaving the user with a blank white screen.

### 6.1 `ErrorBoundary.tsx`
- A React Class Component must be implemented at the absolute root (wrapping `<AppShell />`).
- If a crash occurs, it catches the error and renders a highly styled "Crash Screen".
- The Crash Screen will display the exact stack trace and provide a "Reload Application" button, ensuring the user is never left in a frozen state.

---

## 7. Definition of Done (Success Criteria)

Phase 1 is considered complete when the following criteria are met:

1. **App Shell Rendering:** The Tauri window displays the Header, Sidebar, and a main content area styled cleanly with Tailwind CSS.
2. **Axios Integration:** The `api.ts` file is fully configured with Base URLs, timeouts, and interceptors.
3. **Context Providers:** The React tree is successfully wrapped in `MetricsProvider`, `ProcessProvider`, and `ConfigProvider` without React complaining about missing defaults.
4. **Error Boundary Test:** Deliberately throwing a `new Error("test")` inside a component successfully triggers the fallback UI Crash Screen rather than a blank window.
5. **Hook Stubs:** The custom hooks (`useWebSocketConnection`, `useProcessManager`) are stubbed out and export the correct TypeScript types, even if the internal logic is just `console.log` for now.

Once these checks pass, the application skeleton is rock-solid and ready for **Phase 2: Live Metrics Dashboard (WebSocket & Gauges)**.
