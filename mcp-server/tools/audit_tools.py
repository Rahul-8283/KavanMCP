import json

from database.db import get_recent_logs
from utils.logger import logger

MAX_AUDIT_ROWS = 500


async def view_audit_log_logic(hours_back: int = 24) -> str:
    """
    Core logic for the view_audit_log MCP tool.
    Returns the audit records from the last `hours_back` hours as a JSON string for the LLM.
    """
    if hours_back <= 0:
        return json.dumps({"status": "error", "message": "hours_back must be a positive number of hours."})

    logs = await get_recent_logs(limit=MAX_AUDIT_ROWS, hours_back=hours_back)

    logger.info(f"Audit log queried: found {len(logs)} records in the last {hours_back} hours.")

    return json.dumps(logs, indent=2)
