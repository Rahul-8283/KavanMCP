import asyncio
import json
import os
import subprocess

import psutil

from config.whitelist import TIER_1_WHITELIST
from database.db import get_last_terminated_process, log_rollback, log_termination
from handlers.approval_handler import protected_pids, self_protection_error, take_approval
from handlers.classification_handler import classify_process
from utils.logger import logger

ACCESS_DENIED_MESSAGE = "Permission Denied. Please restart KavanMCP as Administrator."
MB = 1024 * 1024
FORCE_KILL_WAIT_SECONDS = 2


def _terminate_blocking(pid: int) -> dict:
    """
    Blocking psutil work (up to 3s of wait time). Must run in a worker thread.
    Returns a status dict; the audit log is written by the async caller.
    """
    try:
        proc = psutil.Process(pid)

        # TRD 6.1: the hard block sits at the lowest layer, directly in front of the OS call,
        # so no caller can reach terminate() for a critical process whatever checks it skipped.
        name = proc.name()
        if name.lower() in TIER_1_WHITELIST:
            return {
                "status": "tier1_blocked",
                "error": f"CRITICAL ERROR: {name} (PID: {pid}) is a Tier 1 process. Termination is STRICTLY PROHIBITED."
            }

        # Snapshot metrics before death
        mem_mb = proc.memory_info().rss / MB
        cpu_pct = proc.cpu_percent(interval=0.1)
        try:
            path = proc.exe()
        except psutil.AccessDenied:
            path = None # Termination can still succeed without the path; only rollback needs it
        try:
            cmdline = proc.cmdline()
        except psutil.AccessDenied:
            cmdline = []

        # Attempt graceful termination first
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except psutil.TimeoutExpired:
            try:
                proc.kill() # Force kill if it hangs
                proc.wait(timeout=FORCE_KILL_WAIT_SECONDS)
            except psutil.NoSuchProcess:
                pass # Exited between wait and kill: that is the outcome we wanted
            except psutil.TimeoutExpired:
                # Never report (or audit) a kill that did not happen
                return {"status": "error", "error": f"{name} (PID: {pid}) did not exit after a forced kill."}

        return {"status": "success", "name": name, "path": path, "freed_mb": mem_mb, "freed_cpu": cpu_pct,
                "cmdline": cmdline}

    except psutil.NoSuchProcess:
        return {"status": "not_found", "error": "Process already closed."}
    except psutil.AccessDenied:
        return {"status": "access_denied", "error": ACCESS_DENIED_MESSAGE}


async def terminate_process(pid: int, reasoning: str) -> dict:
    result = await asyncio.to_thread(_terminate_blocking, pid)

    if result["status"] == "success":
        # The argv is only needed by the audit record; callers get the same fields as before
        cmdline = result.pop("cmdline")
        # Record to Phase 4 Database
        await log_termination(result["name"], pid, result["path"], result["freed_mb"], result["freed_cpu"], reasoning,
                              command_line=json.dumps(cmdline) if cmdline else None)

    return result


async def execute_approved_termination(pid: int, reasoning: str) -> dict:
    """
    The only path that kills a process on behalf of a user or the LLM.
    Enforces, in order: single-use approval within its TTL, PID identity
    (the process must be the same one that was confirmed), and the Tier 1 hard block.

    Returned status: "success" | "not_approved" | "pid_reused" | "tier1_blocked"
                     | "self_protected" | "not_found" | "access_denied" | "error".
    """
    entry = take_approval(pid)
    if entry is None:
        return {
            "status": "not_approved",
            "error": f"Execution blocked for PID {pid}. PID was not found in the pending approvals list, or the approval timed out."
        }

    if pid in protected_pids():
        return self_protection_error(pid)

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

def _relaunch_argv(exe_path: str, stored_command_line: str | None) -> list[str]:
    """
    Rebuilds the argv a terminated process was started with. The executable always comes
    from the audited path; only the arguments are taken from the stored command line.
    Records written before arguments were captured relaunch with the executable alone.
    """
    try:
        argv = json.loads(stored_command_line) if stored_command_line else []
    except ValueError:
        argv = []
    if not isinstance(argv, list) or not all(isinstance(arg, str) for arg in argv):
        argv = []
    return [exe_path, *argv[1:]]

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
        relaunched = subprocess.Popen(_relaunch_argv(exe_path, row.get("command_line")), creationflags=0x00000008)

        # Log the resurrection
        await log_rollback(process_name, relaunched.pid, exe_path)
        logger.info(f"Successfully rolled back process: {process_name}")
        return {"status": "success", "message": f"Successfully rolled back (relaunched) {process_name}."}
        
    except Exception as e:
        logger.error(f"Failed to rollback {process_name}: {e}")
        return {"status": "error", "reason": f"Failed to relaunch: {e}"}
