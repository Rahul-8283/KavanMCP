import json

from handlers.termination_handler import rollback_process
from utils.logger import logger


async def rollback_last_action_logic(process_identifier: str) -> str:
    """
    Core logic for the rollback MCP tool.
    Passes the identifier to the termination handler to resurrect the process.
    """
    logger.info(f"LLM requested rollback for: {process_identifier}")
    
    try:
        result = await rollback_process(process_identifier)
        return json.dumps(result, indent=2)
    except Exception as e:  # noqa: BLE001 - the tool returns the failure to the caller instead of ending the stdio connection
        logger.error(f"Rollback tool failed: {e}")
        return json.dumps({"status": "error", "reason": str(e)})
