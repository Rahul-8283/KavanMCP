import os
import subprocess

import psutil

from database.db import get_last_terminated_process, log_rollback, log_termination
from utils.logger import logger


async def terminate_process(pid: int, reasoning: str) -> dict:
    try:
        proc = psutil.Process(pid)
        
        # Snapshot metrics before death
        mem_mb = proc.memory_info().rss / (1024 * 1024)
        cpu_pct = proc.cpu_percent(interval=0.1)
        name = proc.name()
        path = proc.exe()
        
        # Attempt graceful termination first
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except psutil.TimeoutExpired:
            proc.kill() # Force kill if it hangs
            
        # Record to Phase 4 Database
        await log_termination(name, pid, path, mem_mb, cpu_pct, reasoning)
        
        return {"status": "success", "freed_mb": mem_mb, "freed_cpu": cpu_pct}
        
    except psutil.NoSuchProcess:
        return {"status": "ignored", "reason": "Process already closed."}
    except psutil.AccessDenied:
        return {"status": "error", "reason": "Access Denied. Restart FastMCP as Administrator."}

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
