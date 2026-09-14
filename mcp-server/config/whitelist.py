import os
import json
from utils.logger import logger

def load_tier_1_whitelist() -> set:
    """
    Loads the Tier 1 process whitelist from resources/tier_1_processes.json.
    Returns a lowercase set() for O(1) lookup time.
    """
    whitelist = set()
    
    # Resolve the absolute path to the resources directory
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    json_path = os.path.join(base_dir, "resources", "tier_1_processes.json")
    
    if not os.path.exists(json_path):
        logger.critical(f"FATAL: Tier 1 Whitelist not found at {json_path}. Defaulting to empty set!")
        return whitelist

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            processes = json.load(f)
            
            # Ensure it's a list
            if not isinstance(processes, list):
                logger.error("Tier 1 Whitelist JSON is malformed (not a list).")
                return whitelist
                
            # Convert to lowercase and add to set
            for proc in processes:
                whitelist.add(str(proc).strip().lower())
                
        logger.info(f"Successfully loaded {len(whitelist)} Tier 1 processes into memory.")
        
    except Exception as e:
        logger.critical(f"FATAL: Failed to parse Tier 1 Whitelist: {e}")
        
    return whitelist

# Execute at startup to keep it in memory
TIER_1_WHITELIST = load_tier_1_whitelist()
