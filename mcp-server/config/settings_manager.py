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

_lock = threading.Lock()

def load_config() -> dict:
    """Loads configuration from disk, creating it with defaults if it doesn't exist."""
    with _lock:
        if not os.path.exists(CONFIG_PATH):
            save_config_internal(DEFAULT_CONFIG)
            return DEFAULT_CONFIG.copy()
            
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                
                # Merge with defaults in case of missing keys
                config = DEFAULT_CONFIG.copy()
                config.update(data)
                return config
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
        config = ACTIVE_CONFIG.copy()
        # Only update keys that actually exist in DEFAULT_CONFIG to prevent bloat
        for k, v in partial_data.items():
            if k in DEFAULT_CONFIG:
                config[k] = v
                
        save_config_internal(config)
        ACTIVE_CONFIG.clear()
        ACTIVE_CONFIG.update(config)
        return ACTIVE_CONFIG
