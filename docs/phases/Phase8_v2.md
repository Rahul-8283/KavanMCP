# Phase 8: Process Control - Kill Flow & Confirmation

## 1. Phase Objective & Overview

### 1.1 The Goal of Phase 8
Phase 8 bridges the gap between passive monitoring and active execution. The objective is to empower the user to terminate resource-heavy applications directly from the Tauri GUI, bypassing the need to prompt the Claude LLM.

However, because executing OS-level termination is dangerous, Phase 8 must strictly mirror the ironclad safety protocols established in V1. By the end of this phase, users will be able to right-click a process, view a detailed safety modal, and confidently terminate it with the exact same Dual-Confirmation guarantees enforced on the AI.

---

## 2. The Right-Click Context Menu

To execute a kill without cluttering the UI with hundreds of red buttons, we will utilize a native-feeling context menu.

### 2.1 Interaction Flow
- Inside the `<ProcessTable />` built in Phase 3, every `<tr>` (table row) must bind a React `onContextMenu` event listener.
- Right-clicking a row suppresses the default browser menu (`e.preventDefault()`) and spawns a custom, Tailwind-styled floating menu at the exact `(x, y)` coordinates of the cursor.

### 2.2 Menu Options
- **Terminate Process:** Triggers the Kill Flow. Colored Red.
- **View Details:** (Optional V2.1 feature) - Copies PID or path to clipboard.

---

## 3. The Dual Confirmation Modal

The core of Phase 8 is the safety gate. If the user clicks "Terminate Process" in the context menu, the application must **freeze** and demand explicit confirmation via a Modal.

### 3.1 Modal State Management
- `const [isKillModalOpen, setIsKillModalOpen] = useState(false);`
- `const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);`

### 3.2 Modal UI Requirements
The Modal must explicitly communicate *why* the user should or shouldn't proceed. It must display:
- **Target:** The exact Process Name and PID.
- **Projected Savings:** "Terminating this will free **{RAM} MB** and drop CPU usage by **{CPU}%**."
- **Security Tier Warning (Crucial):**
  - **Tier 1:** The "Confirm" button must be physically disabled (`disabled={true}`). The text must read: "CRITICAL SYSTEM PROCESS. Termination blocked."
  - **Tier 2:** Text reads: "WARNING: Essential process. Termination may cause system instability."
  - **Tier 3:** Text reads: "Safe to terminate."
  - **Tier 4:** Text reads: "Unverified process. Termination recommended."

---

## 4. Execution API Pipeline

When the user clicks the (enabled) "Confirm" button in the Modal, a strictly sequenced two-part API cascade fires.

### 4.1 Step 1: Staging the Kill (`confirm_termination`)
Just like Claude, the UI must stage the PID in the backend's TTL cache.
- **Action:** POST to `/api/confirm_termination` with `{ pid: selectedProcess.pid }`.
- **Validation:** If the backend rejects the confirmation (e.g., it is a Tier 1 process disguised by a UI bug), the Modal displays the error and aborts.

### 4.2 Step 2: Executing the Kill (`execute_termination`)
Immediately upon a successful 200 OK from Step 1, the UI proceeds to the execution phase.
- **Action:** POST to `/api/execute_termination` with `{ pid: selectedProcess.pid }`.
- **Backend Logging:** The Python backend executes `psutil.kill()` and automatically writes the action to the SQLite `audit_log`, completely independently of the React UI.

---

## 5. Optimistic UI Updates & Error Handling

### 5.1 Optimistic Deletion
If Step 2 returns success:
1. Fire a Success Toast (Phase 6): "Successfully terminated Discord.exe. Freed 450MB."
2. **Do not re-fetch the entire 500+ process list.** Instead, optimistically remove the dead process from the local React `ProcessContext` state using `.filter(p => p.pid !== killedPid)`. This guarantees a 0ms UI reaction time.

### 5.2 Graceful Error Handling
If Step 2 fails, the UI must catch the Axios error and render a Toast.
- **`AccessDenied`:** The Python server was not booted as an Administrator, or the target process is highly privileged (e.g., Antivirus software). Toast: "Permission Denied. Please restart KavanMCP as Administrator."
- **`NoSuchProcess`:** The process died naturally between the time the user right-clicked and clicked confirm. Toast: "Process already closed."

---

## 6. Definition of Done (Success Criteria)

Phase 8 is considered complete when the following criteria are met:

1. **Context Menu:** Right-clicking any row in the Process Manager successfully suppresses the default OS menu and renders the custom "Terminate" menu at the cursor.
2. **Modal Rendering:** Clicking "Terminate" successfully opens the Modal, accurately projecting the RAM and CPU savings based on the row's data.
3. **Tier 1 Blocking:** Attempting to kill a Tier 1 process (e.g., `explorer.exe`) renders the Confirm button unclickable.
4. **The Execution Cascade:** Confirming a Tier 3 kill successfully fires the POST cascade (`confirm` -> `execute`), resulting in the physical termination of the target process on the host OS.
5. **Optimistic Updates:** Upon a successful kill, the row vanishes from the table instantly without a full page refresh or loading spinner.
6. **Error Toasting:** Attempting to kill a privileged process without Admin rights successfully catches the 403/500 error and displays the appropriate Toast notification.

Once these checks pass, the application achieves feature-parity with the Claude Desktop integration, and we are ready for **Phase 9: Comprehensive Feature Testing**.
