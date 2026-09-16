import time
import psutil
import asyncio
from typing import Dict, List
from handlers.classification_handler import classify_process
from database.db import log_blocked_action

# Global state dictionary
# Format: { pid: {"name": str, "tier": int, "timestamp": float} }
PENDING_APPROVALS: Dict[int, Dict] = {}

APPROVAL_TIMEOUT_SECONDS = 300 # 5 minutes

def request_approval(pid: int, name: str, tier: int) -> str:
    """
    Places a process into the pending approval state.
    Returns the strict warning string that the LLM must present to the user.
    """
    PENDING_APPROVALS[pid] = {
        "name": name,
        "tier": tier,
        "timestamp": time.time()
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

async def handle_confirmation_request(pids: List[int]) -> str:
    """
    Validates requested PIDs against the Classification Engine.
    Instantly blocks Tier 1. Requests approval for Tiers 2-4.
    """
    results = []
    
    for pid in pids:
        try:
            if not psutil.pid_exists(pid):
                results.append(f"PID {pid} does not exist or has already closed.")
                continue
                
            proc = psutil.Process(pid)
            name = proc.name()
            
            # Fetch minimal stats for classification
            try:
                cpu_pct = proc.cpu_percent(interval=0.1)
                mem_mb = proc.memory_info().rss / (1024 * 1024)
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                cpu_pct = 0.0
                mem_mb = 0.0
                
            # Classify the process
            tier = classify_process(
                process_name=name, 
                cpu_percent=cpu_pct, 
                memory_mb=mem_mb, 
                is_headless=False # Assuming false for safety checks
            )
            
            if tier == 1:
                reasoning = "LLM attempted to terminate a Tier 1 Critical OS Component."
                await log_blocked_action(name, pid, reasoning)
                results.append(f"CRITICAL ERROR: {name} (PID: {pid}) is a Tier 1 process. Termination is STRICTLY PROHIBITED and this attempt has been logged.")
            else:
                msg = request_approval(pid, name, tier)
                results.append(msg)
                
        except Exception as e:
            results.append(f"Could not access PID {pid}: {e}")
            
    return "\n".join(results)

async def ttl_sweeper():
    """
    Background asyncio task that periodically cleans up expired approvals.
    Prevents the PENDING_APPROVALS dictionary from growing infinitely.
    """
    while True:
        await asyncio.sleep(60)
        current_time = time.time()
        # Cast to list to avoid 'dictionary changed size during iteration' error
        for pid in list(PENDING_APPROVALS.keys()):
            if pid in PENDING_APPROVALS:
                if current_time - PENDING_APPROVALS[pid]["timestamp"] > APPROVAL_TIMEOUT_SECONDS:
                    del PENDING_APPROVALS[pid]
