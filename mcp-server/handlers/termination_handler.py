import asyncio
import os
import subprocess

import psutil

from database.db import get_last_terminated_process, log_rollback, log_termination
from handlers.approval_handler import take_approval
from handlers.classification_handler import classify_process
from utils.logger import logger

ACCESS_DENIED_MESSAGE = "Permission Denied. Please restart KavanMCP as Administrator."
MB = 1024 * 1024


def _terminate_blocking(pid: int) -> dict:
    """
    Blocking psutil work (up to 3s of wait time). Must run in a worker thread.
    Returns a status dict; the audit log is written by the async caller.
    """
    try:
        proc = psutil.Process(pid)

        # Snapshot metrics before death
        name = proc.name()
        mem_mb = proc.memory_info().rss / MB
        cpu_pct = proc.cpu_percent(interval=0.1)
        try:
            path = proc.exe()
        except psutil.AccessDenied:
            path = None # Termination can still succeed without the path; only rollback needs it

        # Attempt graceful termination first
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except psutil.TimeoutExpired:
            try:
                proc.kill() # Force kill if it hangs
            except psutil.NoSuchProcess:
                pass # Exited between wait and kill: that is the outcome we wanted

        return {"status": "success", "name": name, "path": path, "freed_mb": mem_mb, "freed_cpu": cpu_pct}

    except psutil.NoSuchProcess:
        return {"status": "not_found", "error": "Process already closed."}
    except psutil.AccessDenied:
        return {"status": "access_denied", "error": ACCESS_DENIED_MESSAGE}


async def terminate_process(pid: int, reasoning: str) -> dict:
    result = await asyncio.to_thread(_terminate_blocking, pid)

    if result["status"] == "success":
        # Record to Phase 4 Database
        await log_termination(result["name"], pid, result["path"], result["freed_mb"], result["freed_cpu"], reasoning)

    return result


async def execute_approved_termination(pid: int, reasoning: str) -> dict:
    """
    The only path that kills a process on behalf of a user or the LLM.
    Enforces, in order: single-use approval within its TTL, PID identity
    (the process must be the same one that was confirmed), and the Tier 1 hard block.

    Returned status: "success" | "not_approved" | "pid_reused" | "tier1_blocked"
                     | "not_found" | "access_denied" | "error".
    """
    entry = take_approval(pid)
    if entry is None:
        return {
            "status": "not_approved",
            "error": f"Execution blocked for PID {pid}. PID was not found in the pending approvals list, or the approval timed out."
        }

    try:
        proc = psutil.Process(pid)
        name = proc.name()
        create_time = proc.create_time()
    except psutil.NoSuchProcess:
        return {"status": "not_found", "error": "Process already closed."}
    except psutil.AccessDenied:
        return {"status": "access_denied", "error": ACCESS_DENIED_MESSAGE}

    if entry.get("create_time") is None or create_time != entry["create_time"]:
        return {
            "status": "pid_reused",
            "error": f"PID {pid} now belongs to a different process than the one confirmed. Request confirmation again."
        }

    # Defence in depth: confirm_termination never approves Tier 1, but re-check at the kill switch
    if classify_process(process_name=name, cpu_percent=0.0, memory_mb=0.0, is_headless=False) == 1:
        return {
            "status": "tier1_blocked",
            "error": f"CRITICAL ERROR: {name} (PID: {pid}) is a Tier 1 process. Termination is STRICTLY PROHIBITED."
        }

    return await terminate_process(pid, reasoning)

async def rollback_process(pid_or_name: str) -> dict:
    """
    The Undo Button. Queries the database for a recently killed process and relaunches it.
    """
    row = await get_last_terminated_process(pid_or_name)
    
    if not row:
        return {"status": "error", "reason": f"Could not find a recent termination record for '{pid_or_name}'."}
        
    exe_path = row.get("executable_path")
    process_name = row.get("process_name")
    
    if not exe_path or not os.path.exists(exe_path):
        return {"status": "error", "reason": f"Executable path is invalid or missing: {exe_path}"}
        
    try:
        # Launch as a completely independent background process
        # DETACHED_PROCESS = 0x00000008
        subprocess.Popen([exe_path], creationflags=0x00000008)
        
        # Log the resurrection
        await log_rollback(process_name, exe_path)
        logger.info(f"Successfully rolled back process: {process_name}")
        return {"status": "success", "message": f"Successfully rolled back (relaunched) {process_name}."}
        
    except Exception as e:
        logger.error(f"Failed to rollback {process_name}: {e}")
        return {"status": "error", "reason": f"Failed to relaunch: {e}"}
