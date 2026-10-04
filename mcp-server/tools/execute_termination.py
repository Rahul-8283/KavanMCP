import json

from handlers.termination_handler import execute_approved_termination
from utils.logger import logger


async def execute_termination_logic(pids: list[int], reasoning: str = "User confirmed termination") -> str:
    """
    Core logic for the execute_termination MCP tool.
    Every PID goes through the shared safety gates in execute_approved_termination.
    """
    logger.info(f"LLM executing termination for PIDs: {pids}")

    results = []
    for pid in pids:
        result = await execute_approved_termination(pid, reasoning)
        if result["status"] != "success":
            logger.warning(result["error"])
        # The LLM contract from V1 reports every safety-gate refusal as "blocked"
        if result["status"] in ("not_approved", "pid_reused", "tier1_blocked"):
            result = {**result, "status": "blocked"}
        results.append({"pid": pid, **result})

    return json.dumps(results, indent=2)
