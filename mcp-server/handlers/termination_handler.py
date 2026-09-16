import psutil
from database.db import log_termination

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
