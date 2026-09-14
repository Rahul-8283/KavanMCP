import json
from typing import Optional
from integrations.monitor import get_all_processes
from utils.schemas import ProcessSchema

def list_processes_logic(filter_name: Optional[str] = None) -> str:
    """
    Core logic for the list_processes MCP tool.
    Returns a JSON string of active processes, optionally filtered by name.
    """
    # Fetch all running processes using our safe wrapper
    all_processes = get_all_processes()
    
    filtered_processes = []
    
    for proc in all_processes:
        # If a filter is provided, skip processes that don't match (case-insensitive)
        if filter_name and filter_name.lower() not in proc['name'].lower():
            continue
            
        # Validate through the Pydantic schema
        schema = ProcessSchema(**proc)
        
        # Extract the validated dictionary
        filtered_processes.append(schema.model_dump())
        
    # Serialize the list of dictionaries to a JSON string for the LLM
    return json.dumps(filtered_processes, indent=2)
