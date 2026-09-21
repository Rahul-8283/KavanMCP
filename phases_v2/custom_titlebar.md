# Custom Titlebar (Borderless Window)

This plan outlines the steps to strip away the native Windows OS title bar and replace it with a sleek, dark-mode custom title bar built entirely in React.

## Proposed Changes

We will modify the Tauri config to remove the OS-level borders, and then build a draggable React component that controls the window lifecycle using Tauri's core API.

### `desktop/src-tauri/`

#### [MODIFY] `tauri.conf.json`
- Change `"decorations": true` to `"decorations": false`. This removes the default Windows title bar, making our app a raw, borderless canvas.

### `desktop/src/components/layout/`

#### [NEW] `Titlebar.tsx`
- A new React component that spans the very top of the application.
- Will feature a custom `data-tauri-drag-region` property, allowing the user to click and drag the app window by grabbing the custom titlebar.
- Will implement custom Minimize (`_`), Maximize (`[ ]`), and Close (`X`) buttons using SVG icons.
- These buttons will interact directly with Tauri's Core API (`getCurrentWindow().minimize()`, etc.).

#### [MODIFY] `MainLayout.tsx` (or `App.tsx`)
- Inject the `<Titlebar />` component at the very top of the layout hierarchy, ensuring it sits above the Sidebar and Main content.

## User Review Required

> [!NOTE]
> Good news! I double-checked the Tauri V2 documentation, and it turns out we actually **do not** need to install any external plugins. The window controls (`getCurrentWindow`) are built directly into the core `@tauri-apps/api` package that we already have installed!

Please review this plan. If you approve, I will strip away the Windows title bar and build our custom one!
