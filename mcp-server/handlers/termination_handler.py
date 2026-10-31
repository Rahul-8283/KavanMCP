import asyncio
import json
import os
import sqlite3
import subprocess

import psutil

from config.whitelist import TIER_1_WHITELIST
from database.db import (
    claim_rollback,
    get_last_terminated_process,
    get_termination_by_id,
    log_rollback,
    log_termination,
    release_rollback,
)
from handlers.approval_handler import (
    protected_pids,
    self_protection_error,
    take_approval,
)
from handlers.classification_handler import classify_process
from handlers.protection import is_user_protected, protected_message
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
        # Phase 6 §3.2: the lowest gate, so a protection added after the confirmation still holds
        if is_user_protected(name):
            return {"status": "user_protected", "error": protected_message(name)}

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


async def terminate_process(pid: int, reasoning: str, tier: int | None = None) -> dict:
    result = await asyncio.to_thread(_terminate_blocking, pid)

    if result["status"] == "success":
        # The argv is only needed by the audit record; callers get the same fields as before
        cmdline = result.pop("cmdline")
        # Record to Phase 4 Database. audit_id lets a caller refer to this exact kill, to undo it.
        result["audit_id"] = await log_termination(
            result["name"], pid, result["path"], result["freed_mb"], result["freed_cpu"], reasoning,
            command_line=json.dumps(cmdline) if cmdline else None, tier=tier)

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

    # The tier stored is the one the user saw and confirmed, not a fresh classification
    return await terminate_process(pid, reasoning, tier=entry["tier"])

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

async def _restore(row: dict) -> dict:
    """
    Relaunches one recorded kill, at most once. The order is what makes it safe: the kill is
    claimed before the launch, so two simultaneous requests cannot both start the program,
    and the claim is released again if the launch fails so the user can retry.

    Returned status: "success" | "no_path" | "exe_missing" | "already_restored"
                     | "launch_failed" | "error".
    """
    audit_id = row["id"]
    name = row["process_name"]
    exe_path = row.get("executable_path")

    if not exe_path:
        return {"status": "no_path", "message": f"{name} was killed without a recorded location, so it cannot be restored."}
    if not os.path.exists(exe_path):
        return {"status": "exe_missing", "message": f"{name} can no longer be found at its original location."}

    try:
        if not await claim_rollback(audit_id):
            return {"status": "already_restored", "message": f"{name} has already been restored."}
    except (sqlite3.Error, OSError) as e:
        logger.error(f"Could not claim rollback {audit_id}: {e}")
        return {"status": "error", "message": "The audit database could not be updated."}

    try:
        # Launch as a completely independent background process
        # DETACHED_PROCESS = 0x00000008
        # Popen returns at once: the child is detached and is never waited on, so the loop is not blocked
        relaunched = subprocess.Popen(_relaunch_argv(exe_path, row.get("command_line")), creationflags=0x00000008)  # noqa: ASYNC220 - detached, not waited on
    except (OSError, ValueError, subprocess.SubprocessError) as e:
        logger.error(f"Failed to rollback {name}: {e}")
        try:
            await release_rollback(audit_id)
        except (sqlite3.Error, OSError) as release_error:
            logger.error(f"Could not release rollback {audit_id}: {release_error}")
        return {"status": "launch_failed", "message": f"Failed to relaunch {name}: {e}"}

    # Log the resurrection
    await log_rollback(name, relaunched.pid, exe_path)
    logger.info(f"Successfully rolled back process: {name}")
    restored = await get_termination_by_id(audit_id)
    return {
        "status": "success", "id": audit_id, "name": name, "new_pid": relaunched.pid,
        "rolled_back_at": restored["rolled_back_at"] if restored else None,
        "message": f"Successfully rolled back (relaunched) {name}.",
    }


async def rollback_by_id(audit_id: str) -> dict:
    """Restores the exact kill with this audit id. Statuses are those of _restore, plus "not_found"."""
    try:
        row = await get_termination_by_id(audit_id)
    except Exception as e:  # noqa: BLE001 - a failed restore is logged and reported as a status, not raised
        logger.error(f"Could not read kill {audit_id}: {e}")
        return {"status": "error", "message": "The audit database could not be read."}
    if row is None:
        return {"status": "not_found", "message": "No terminated process has that id."}
    return await _restore(row)


async def rollback_process(pid_or_name: str) -> dict:
    """
    The Undo Button for the MCP tool. Restores the most recent kill matching a name or PID
    that has not been restored yet.
    """
    row = await get_last_terminated_process(pid_or_name)

    if not row:
        return {"status": "error", "reason": f"Could not find a recent termination record for '{pid_or_name}' that has not already been restored."}

    result = await _restore(row)
    if result["status"] == "success":
        return {"status": "success", "message": result["message"]}
    return {"status": "error", "reason": result["message"]}
