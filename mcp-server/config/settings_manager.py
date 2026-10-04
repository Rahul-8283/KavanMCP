import json
import os
import threading

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "settings.json")

DEFAULT_CONFIG = {
    "cpu_threshold": 90,
    "ram_threshold": 90,
    "disk_threshold": 95,
    "theme": "dark",
    "sound_alerts": True
}

THRESHOLD_KEYS = ("cpu_threshold", "ram_threshold", "disk_threshold")
THEMES = ("dark", "light")

_lock = threading.Lock()

def _valid_entries(data: dict) -> dict:
    """Returns only the known keys of data whose values are valid."""
    valid = {}
    if not isinstance(data, dict):
        return valid

    for key in THRESHOLD_KEYS:
        value = data.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value <= 100:
            valid[key] = value
    if data.get("theme") in THEMES:
        valid["theme"] = data["theme"]
    if isinstance(data.get("sound_alerts"), bool):
        valid["sound_alerts"] = data["sound_alerts"]
    return valid

def _sanitize(data: dict) -> dict:
    """
    Returns DEFAULT_CONFIG overlaid with the valid entries of data. The settings file is
    hand-editable, so a bad value falls back to its default instead of reaching the alert loop.
    """
    return {**DEFAULT_CONFIG, **_valid_entries(data)}

def load_config() -> dict:
    """Loads configuration from disk, creating it with defaults if it doesn't exist."""
    with _lock:
        if not os.path.exists(CONFIG_PATH):
            save_config_internal(DEFAULT_CONFIG)
            return DEFAULT_CONFIG.copy()
            
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                # Merge with defaults in case of missing or invalid keys
                return _sanitize(json.load(f))
        except Exception:
            return DEFAULT_CONFIG.copy()

def save_config_internal(config_data: dict):
    """Internal function, assumes caller holds the lock."""
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config_data, f, indent=4)

# currently unused
# just as backend in order to save the data in disk permanently
def save_config(config_data: dict):
    """Saves the given configuration to disk safely."""
    with _lock:
        save_config_internal(config_data)

# Global in-memory config cache initialized on module load
ACTIVE_CONFIG = load_config()

def update_config(partial_data: dict) -> dict:
    """Merges partial data into ACTIVE_CONFIG and saves to disk."""
    with _lock:
        # Unknown keys and invalid values are dropped, so bad input can never be persisted
        config = {**ACTIVE_CONFIG, **_valid_entries(partial_data)}
        save_config_internal(config)
        ACTIVE_CONFIG.clear()
        ACTIVE_CONFIG.update(config)
        return ACTIVE_CONFIG
