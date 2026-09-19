# Phase 0: Tauri Project Setup & Dependencies (V2)

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 0
Phase 0 is the foundational layer for KavanMCP Version 2. The objective is to initialize, configure, and secure the Tauri desktop application scaffolding before any actual product UI or business logic is written. 

By the end of Phase 0, the project will have a robust, compiler-checked React + TypeScript frontend running inside a native Rust (Tauri) container. The environment will be fully configured to support rapid development of the subsequent phases (WebSockets, Data Visualization, System Tray integration).

### 1.2 Target Audience for this Document
This document is designed for both human engineers and AI coding agents. It serves as a strict blueprint defining exactly *how* the environment should be configured, *what* dependencies are permitted, and *why* specific architectural decisions were made.

---

## 2. Initial Tauri Scaffolding

### 2.1 The Scaffolding Command
The project relies on Tauri 2.0. The initial generation of the codebase has been completed using `create-tauri-app`.
- **Framework:** React
- **Language:** TypeScript
- **Package Manager:** npm
- **Bundler:** Vite

### 2.2 The Rust Backend (`src-tauri`)
While V2 explicitly avoids writing business logic in Rust (deferring to the Python FastMCP server), the `src-tauri` directory is strictly required for the Tauri compiler.
- The `Cargo.toml` file will manage Rust dependencies needed for OS-level integrations (System Tray, Notifications).
- The `src/main.rs` file will remain minimal, containing only the initialization logic required to spawn the application window and register native event listeners.

---

## 3. Tauri Configuration (`tauri.conf.json`)

The `tauri.conf.json` file is the brain of the native application wrapper. During Phase 0, it must be meticulously configured to enforce security and UX constraints.

### 3.1 Window Settings
The main application window must feel like a lightweight, modern utility.
- **Title:** "KavanMCP"
- **Width:** 1024px
- **Height:** 768px
- **Resizable:** True
- **Fullscreen:** False (This is a utility dashboard, not a full-screen app).
- **Decorations:** True (Native OS window controls).
- **Visible on Start:** True (Until Phase 7, when background boot is implemented).

### 3.2 Security & Permissions (Capabilities)
Tauri 2.0 requires explicit permission grants for Rust APIs. To prevent arbitrary code execution, only the exact APIs needed by the React frontend will be whitelisted:
- `notification:all` (Required for Phase 6 Toasts).
- `tray:all` (Required for Phase 7 System Tray).
- *Strictly Blocked:* File System (fs), Command Execution (shell), and HTTP (http) APIs are disabled in Tauri. All backend communication will happen via standard browser `fetch`/WebSockets directly to the Python server.

### 3.3 Build Configuration
- `devPath`: Must point to the Vite dev server (`http://localhost:1420`).
- `distDir`: Must point to the compiled React assets (`../dist`).

---

## 4. Frontend Dependency Management

The `package.json` must be strictly managed to prevent UI bloat and ensure the application remains highly performant and under the 35MB RAM budget.

### 4.1 Core React Dependencies
- `react` & `react-dom` (v18+)

### 4.2 Styling & Icons
- `tailwindcss`: Utility-first CSS framework for rapid UI iteration without bloated stylesheets.
- `postcss` & `autoprefixer`: Required for Tailwind compilation.
- `lucide-react`: Lightweight SVG icon library for UI elements (Gauges, Settings, Trash/Kill icons).

### 4.3 Data Visualization & Fetching
- `recharts`: A highly performant, composable charting library built on React components. Will be used exclusively for the CPU, RAM, and Disk circular gauges in Phase 2.
- `axios`: A robust HTTP client for REST API communication. Preferred over native `fetch` for its built-in request/response interceptors (crucial for Phase 1 error handling).

### 4.4 Tauri Integration
- `@tauri-apps/api`: The official JavaScript bindings allowing the React frontend to trigger native OS notifications and manipulate the system tray.

---

## 5. Directory Structure Scaffold

Before writing components, the `src/` directory must be logically partitioned to enforce separation of concerns. The following folders will be created:

### `src/components/`
Reusable UI fragments that do not fetch their own data.
- `/common`: Buttons, Modals, Badges.
- `/dashboard`: Gauge wrappers.
- `/processes`: Table rows, Context Menus.

### `src/pages/`
Top-level route components that orchestrate data fetching and pass props down to components.
- `Dashboard.tsx` (Phases 2-4)
- `Settings.tsx` (Phase 5)

### `src/services/`
The API layer. All network requests to the FastMCP Python server must be abstracted here.
- `api.ts`: Axios instance configuration (BaseURL, Interceptors).
- `websocket.ts`: WebSocket connection manager.

### `src/hooks/`
Custom React hooks to abstract complex state and lifecycle logic.
- `useMetrics.ts`
- `useProcesses.ts`

### `src/styles/`
- `index.css`: Tailwind imports and global CSS variables for Theme toggling (Light/Dark mode).

---

## 6. TypeScript & Vite Configuration

### 6.1 `tsconfig.json`
- Must enforce strict mode (`"strict": true`).
- Path aliases should be configured (e.g., `@/*` maps to `src/*`) to prevent "dot-hell" imports (`../../../../components`).

### 6.2 `vite.config.ts`
- Must clear the screen on server restart to keep the terminal clean.
- Must configure the server port to strictly match Tauri's expectation (`1420`).
- Ensure React SWC plugins are enabled for ultra-fast Hot Module Replacement (HMR).

---

## 7. Environment Variables

While Kavan V2 does not require API keys, environment variables are necessary to smoothly transition between Development and Production environments.

### 7.1 `.env.development`
- `VITE_API_URL=http://localhost:8000` (Points to the local Uvicorn/FastAPI instance).
- `VITE_WS_URL=ws://localhost:8000/ws` (Points to the live metrics stream).

### 7.2 `.env.production`
- Will mirror development initially, as the Python sidecar will always run locally on port 8000 on the host machine.

---

## 8. Definition of Done (Success Criteria)

Phase 0 is considered complete when the following criteria are met:

1. **Compilation Success:** Running `npm run tauri dev` successfully compiles the Rust binary and launches a native OS window.
2. **Hot Reloading:** Modifying `src/App.tsx` instantly reflects in the Tauri window without requiring a hard refresh or Rust recompilation.
3. **Tailwind Verification:** Applying a basic utility class (e.g., `bg-red-500`) to a `<div>` successfully renders in the UI.
4. **Dependency Integrity:** The `package.json` contains `recharts`, `axios`, `lucide-react`, and `@tauri-apps/api` without version conflicts.
5. **Folder Structure:** The `src/` directory contains empty placeholder folders for `components`, `pages`, `hooks`, and `services`.

Once these checks pass, the environment is fully hardened and ready for **Phase 1: Foundation & Global Architecture**.
