import functools
import json
import traceback
from utils.logger import logger

def safe_mcp_tool(func):
    """
    A decorator to wrap MCP tools. Catches all raw Python exceptions,
    logs the stack trace, and returns a structured JSON error to the LLM.
    """
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            # Log the raw stack trace for the developer
            logger.error(f"Error in MCP tool '{func.__name__}': {str(e)}")
            logger.error(traceback.format_exc())
            
            # Determine specific error types
            error_type = type(e).__name__
            message = str(e)
            llm_instruction = "An internal server error occurred. Please inform the user politely."
            
            if "AccessDenied" in error_type:
                error_type = "OS_Access_Denied"
                message = "The system blocked this action due to insufficient permissions."
                llm_instruction = "Tell the user they need to restart KavanMCP as an Administrator."
                
            # Return structured error to Claude
            error_response = {
                "status": "error",
                "error_type": error_type,
                "message": message,
                "llm_instruction": llm_instruction
            }
            return json.dumps(error_response, indent=2)
            
    return wrapper
