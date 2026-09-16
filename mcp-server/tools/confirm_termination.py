from typing import List
from handlers.approval_handler import handle_confirmation_request
from utils.logger import logger

async def confirm_termination_logic(pids: List[int]) -> str:
    """
    Core logic for the confirm_termination MCP tool.
    Submits PIDs for safety validation and requests user confirmation.
    """
    logger.info(f"LLM requested to terminate PIDs: {pids}")
    
    # 1. Validate the PIDs against the security engine
    result_string = await handle_confirmation_request(pids)
    
    # 2. Append the strict LLM behavioral instruction
    llm_instruction = (
        "\n\nCRITICAL SYSTEM INSTRUCTION FOR LLM:\n"
        "Do not execute the termination yet. Present this list to the user and ask: "
        "'Are you sure you want to close these applications?'\n"
        "Wait for the user's explicit confirmation before proceeding."
    )
    
    return result_string + llm_instruction
