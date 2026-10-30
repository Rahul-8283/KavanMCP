import asyncio
import os
import time

import psutil

from database.db import log_blocked_action
from handlers.classification_handler import classify_process
from handlers.protection import is_user_protected, protected_message
from integrations.windows import get_windowed_pids, is_headless

# Global state dictionary
# Format: { pid: {"name": str, "tier": int, "timestamp": float, "create_time": float | None} }
# create_time pins the approval to one specific process, so a recycled PID cannot inherit it.
PENDING_APPROVALS: dict[int, dict] = {}

APPROVAL_TIMEOUT_SECONDS = 300 # 5 minutes

def request_approval(pid: int, name: str, tier: int, create_time: float | None = None) -> str:
    """
    Places a process into the pending approval state.
    Returns the strict warning string that the LLM must present to the user.
    """
    PENDING_APPROVALS[pid] = {
        "name": name,
        "tier": tier,
        "timestamp": time.time(),
        "create_time": create_time
    }
    return f"Process {name} (PID: {pid}) [Tier {tier}] is now pending approval. You MUST ask the user for confirmation before calling execute_termination."

def is_approved(pid: int) -> bool:
    """
    Checks if a PID is in the pending approval state and hasn't expired.
    """
    if pid not in PENDING_APPROVALS:
        return False

    if time.time() - PENDING_APPROVALS[pid]["timestamp"] > APPROVAL_TIMEOUT_SECONDS:
        del PENDING_APPROVALS[pid] # Expired
        return False

    return True

def take_approval(pid: int) -> dict | None:
    """
    Removes and returns the approval for a PID, or None if there is none or it expired.
    Approvals are single-use: every execution attempt consumes them, so a stale
    confirmation can never be replayed and a double-click cannot kill twice.
    """
    entry = PENDING_APPROVALS.pop(pid, None)
    if entry is None:
        return None
    if time.time() - entry["timestamp"] > APPROVAL_TIMEOUT_SECONDS:
        return None
    return entry

def protected_pids() -> set[int]:
    """
    The server's own process and the chain of processes that launched it.
    Killing any of them shuts KavanMCP down mid-request, before the audit entry is written.
    """
    me = psutil.Process(os.getpid())
    try:
        return {me.pid, *(parent.pid for parent in me.parents())}
    except psutil.Error:
        return {me.pid}

def self_protection_error(pid: int) -> dict:
    return {
        "status": "self_protected",
        "error": f"PID {pid} is KavanMCP itself or the process that launched it. Terminating it would shut KavanMCP down."
    }

def _inspect_process(pid: int) -> dict:
    """Blocking psutil reads. Must run in a worker thread, never on the event loop."""
    proc = psutil.Process(pid)
    name = proc.name()

    # Fetch minimal stats for classification
    try:
        cpu_pct = proc.cpu_percent(interval=0.1)
        mem_mb = proc.memory_info().rss / (1024 * 1024)
    except (psutil.AccessDenied, psutil.NoSuchProcess):
        cpu_pct = 0.0
        mem_mb = 0.0

    return {
        "name": name,
        "cpu_percent": cpu_pct,
        "memory_mb": mem_mb,
        "create_time": proc.create_time(),
        "is_headless": is_headless(pid, get_windowed_pids()),
    }

async def stage_termination(pid: int, source: str = "LLM") -> dict:
    """
    Classifies a PID and, unless it is Tier 1, places it in the pending approval state.
    Shared by the MCP confirm_termination tool and the REST /api/confirm_termination route.

    Returned status: "pending" | "tier1_blocked" | "self_protected" | "not_found" | "error".
    """
    if pid in protected_pids():
        return self_protection_error(pid)

    try:
        info = await asyncio.to_thread(_inspect_process, pid)
    except psutil.NoSuchProcess:
        return {"status": "not_found", "error": f"PID {pid} does not exist or has already closed."}
    except Exception as e:
        return {"status": "error", "error": f"Could not access PID {pid}: {e}"}

    name = info["name"]
    tier = classify_process(
        process_name=name,
        cpu_percent=info["cpu_percent"],
        memory_mb=info["memory_mb"],
        is_headless=info["is_headless"]
    )

    if tier == 1:
        reasoning = f"{source} attempted to terminate a Tier 1 Critical OS Component."
        await log_blocked_action(name, pid, reasoning)
        return {
            "status": "tier1_blocked",
            "tier": 1,
            "name": name,
            "error": f"CRITICAL ERROR: {name} (PID: {pid}) is a Tier 1 process. Termination is STRICTLY PROHIBITED and this attempt has been logged."
        }

    if is_user_protected(name):
        await log_blocked_action(name, pid, f"{source} attempted to terminate a process on the user's protected list.")
        return {"status": "user_protected", "tier": tier, "name": name, "error": protected_message(name)}

    message = request_approval(pid, name, tier, info["create_time"])
    return {
        "status": "pending",
        "pid": pid,
        "name": name,
        "tier": tier,
        "cpu_percent": info["cpu_percent"],
        "memory_mb": info["memory_mb"],
        "message": message
    }

async def handle_confirmation_request(pids: list[int]) -> str:
    """
    Validates requested PIDs against the Classification Engine.
    Instantly blocks Tier 1. Requests approval for Tiers 2-4.
    """
    results = []

    for pid in pids:
        result = await stage_termination(pid, source="LLM")
        if result["status"] == "pending":
            results.append(result["message"])
        else:
            results.append(result["error"])

    return "\n".join(results)

def sweep_expired(now: float | None = None) -> int:
    """
    Drops approvals older than the timeout and returns how many were removed.
    Runs on the sweeper thread while request handlers use the same dict, so it never
    assumes an entry it saw a moment ago is still there.
    """
    now = time.time() if now is None else now
    removed = 0
    for pid, entry in list(PENDING_APPROVALS.items()):
        if now - entry["timestamp"] > APPROVAL_TIMEOUT_SECONDS:
            # Only drop the entry we inspected; the PID may have been re-staged since
            if PENDING_APPROVALS.get(pid) is entry and PENDING_APPROVALS.pop(pid, None) is not None:
                removed += 1
    return removed

async def ttl_sweeper():
    """
    Background asyncio task that periodically cleans up expired approvals.
    Prevents the PENDING_APPROVALS dictionary from growing infinitely.
    """
    while True:
        await asyncio.sleep(60)
        sweep_expired()
