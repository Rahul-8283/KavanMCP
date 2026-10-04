import json
import os

from utils.logger import logger

# Always protected, whatever the JSON file says. If the file is missing or corrupt the
# engine must fail closed: an empty whitelist would make every OS component killable.
BUILTIN_TIER_1 = frozenset({
    "system",
    "system idle process",
    "registry",
    "memory compression",
    "secure system",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "winlogon.exe",
    "services.exe",
    "lsass.exe",
    "lsaiso.exe",
    "svchost.exe",
    "dwm.exe",
    "fontdrvhost.exe",
    "explorer.exe",
})


def load_tier_1_whitelist() -> set:
    """
    Loads the Tier 1 process whitelist from resources/tier_1_processes.json and merges
    it with BUILTIN_TIER_1. Returns a lowercase set() for O(1) lookup time.
    """
    whitelist = set(BUILTIN_TIER_1)

    # Resolve the absolute path to the resources directory
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    json_path = os.path.join(base_dir, "resources", "tier_1_processes.json")

    if not os.path.exists(json_path):
        logger.critical(f"Tier 1 Whitelist not found at {json_path}. Using the built-in list only.")
        return whitelist

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            processes = json.load(f)

            # Ensure it's a list
            if not isinstance(processes, list):
                logger.error("Tier 1 Whitelist JSON is malformed (not a list). Using the built-in list only.")
                return whitelist

            # Convert to lowercase and add to set
            for proc in processes:
                whitelist.add(str(proc).strip().lower())

        logger.info(f"Successfully loaded {len(whitelist)} Tier 1 processes into memory.")

    except Exception as e:
        logger.critical(f"Failed to parse Tier 1 Whitelist: {e}. Using the built-in list only.")

    return whitelist

# Execute at startup to keep it in memory
TIER_1_WHITELIST = load_tier_1_whitelist()
