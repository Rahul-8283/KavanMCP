from typing import List
import json
from handlers.approval_handler import is_approved, PENDING_APPROVALS
from handlers.termination_handler import terminate_process
from utils.logger import logger

async def execute_termination_logic(pids: List[int], reasoning: str = "User confirmed termination") -> str:
    """
    Core logic for the execute_termination MCP tool.
    Enforces Phase 5 safety gates before calling the OS kill switch.
    """
    logger.info(f"LLM executing termination for PIDs: {pids}")
    
    results = []
    for pid in pids:
        # CRITICAL GATE: Verify stateful approval
        if not is_approved(pid):
            error_msg = f"Execution blocked for PID {pid}. PID was not found in the pending approvals list, or the approval timed out."
            logger.warning(error_msg)
            results.append({"pid": pid, "status": "blocked", "error": error_msg})
            continue
            
        # Execute the termination
        try:
            termination_result = await terminate_process(pid, reasoning)
            
            # Remove from pending approvals to prevent double-kills
            if pid in PENDING_APPROVALS:
                del PENDING_APPROVALS[pid]
                
            results.append({"pid": pid, "result": termination_result})
            
        except Exception as e:
            logger.error(f"Failed to terminate PID {pid}: {e}")
            results.append({"pid": pid, "status": "error", "error": str(e)})
            
    return json.dumps(results, indent=2)
