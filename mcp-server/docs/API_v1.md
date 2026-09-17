# KavanMCP V1 - API Documentation

This document outlines the JSON schemas and payloads for the core FastMCP tools exposed by the KavanMCP server. These APIs are designed to be consumed by Large Language Models (LLMs) and the future Phase V2 Tauri GUI Dashboard.

All endpoints are wrapped in a global exception handler (`@safe_mcp_tool`) that guarantees a structured JSON error response if the OS denies access or a crash occurs.

---

## 1. `analyze_system`
Diagnoses system lag by returning global CPU/RAM totals and the top resource hogs categorized by Security Tiers (1-4).

**Request Payload:**
```json
{}
```

**Example Response Payload (Success):**
```json
{
  "global_cpu_percent": 15.2,
  "global_memory_percent": 45.1,
  "top_processes": [
    {
      "pid": 1204,
      "name": "chrome.exe",
      "cpu_percent": 5.1,
      "memory_mb": 450.2,
      "tier": 3
    }
  ]
}
```

---

## 2. `list_processes`
Lists active processes running on the machine, with an optional filter by name.

**Request Payload:**
```json
{
  "filter_name": "chrome"
}
```
*(Note: `filter_name` is optional. Omitting it returns all processes.)*

**Example Response Payload:**
```json
[
  {
    "pid": 1204,
    "name": "chrome.exe",
    "cpu_percent": 1.2,
    "memory_mb": 450.2,
    "tier": 3,
    "tier_reason": "Standard background process."
  }
]
```

---

## 3. `view_audit_log`
Retrieves the recent history of processes that were terminated, rolled back, or blocked by the server's Dual-Confirmation gate.

**Request Payload:**
```json
{
  "hours_back": 24
}
```

**Example Response Payload:**
```json
[
  {
    "id": 1,
    "process_name": "notepad.exe",
    "pid": 9999,
    "action_type": "TERMINATED",
    "freed_memory_mb": 15.4,
    "freed_cpu_percent": 0.0,
    "reasoning": "User requested termination due to high memory usage.",
    "timestamp": "2026-09-17 10:15:00"
  }
]
```

---

## 4. `confirm_termination`
**CRITICAL GATE:** Proposes termination of processes for user confirmation. This MUST be called to add the PIDs to the stateful `PENDING_APPROVALS` cache before execution is allowed.

**Request Payload:**
```json
{
  "pids": [9999]
}
```

**Example Response Payload (String):**
```text
The following processes have been staged for termination:
- PID 9999 (Tier 3)

CRITICAL SYSTEM INSTRUCTION FOR LLM:
Do not execute the termination yet. Present this list to the user and ask: 'Are you sure you want to close these applications?'
Wait for the user's explicit confirmation before proceeding.
```

---

## 5. `execute_termination`
Executes the physical termination of processes. Will violently reject any PID that was not previously staged by `confirm_termination` within the last 5 minutes.

**Request Payload:**
```json
{
  "pids": [9999],
  "reasoning": "User confirmed termination."
}
```

**Example Response Payload:**
```json
[
  {
    "pid": 9999,
    "result": {
      "status": "success",
      "freed_mb": 15.4,
      "freed_cpu": 0.0
    }
  }
]
```

---

## 6. `rollback_last_action`
The "Undo Button". Queries the database for a recently killed process and relaunches it as a detached background process.

**Request Payload:**
```json
{
  "process_identifier": "notepad.exe"
}
```

**Example Response Payload:**
```json
{
  "status": "success",
  "message": "Successfully rolled back (relaunched) notepad.exe."
}
```

---

## Global Exception Handler Response
If any of the above tools encounter a raw Python exception or OS-level `AccessDenied` error, they will intercept the crash and return this standardized schema:

```json
{
  "status": "error",
  "error_type": "OS_Access_Denied",
  "message": "The system blocked this action due to insufficient permissions.",
  "llm_instruction": "Tell the user they need to restart KavanMCP as an Administrator."
}
```
