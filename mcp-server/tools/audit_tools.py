import datetime
import json

from database.db import get_recent_logs
from utils.logger import logger


async def view_audit_log_logic(hours_back: int = 24) -> str:
    """
    Core logic for the view_audit_log MCP tool.
    Fetches the recent history from the SQLite database, filters it by the requested time window,
    and returns it as a serialized JSON string for the LLM.
    """
    # Fetch recent logs from the database
    logs = await get_recent_logs(limit=100)
    
    # Calculate the cutoff time (SQLite CURRENT_TIMESTAMP defaults to UTC)
    cutoff_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours_back)
    
    filtered_logs = []
    for row in logs:
        timestamp_str = row.get('timestamp')
        if timestamp_str:
            try:
                # Parse the SQLite UTC timestamp string
                dt = datetime.datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
                dt = dt.replace(tzinfo=datetime.timezone.utc)
                
                # Only include logs that happened after the cutoff time
                if dt >= cutoff_time:
                    filtered_logs.append(row)
            except ValueError:
                # If parsing fails for any reason, include it anyway
                filtered_logs.append(row)
        else:
            filtered_logs.append(row)
            
    logger.info(f"Audit log queried: found {len(filtered_logs)} records in the last {hours_back} hours.")
    
    # Serialize to JSON and return
    return json.dumps(filtered_logs, indent=2)
