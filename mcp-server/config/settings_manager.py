import json
import os
import threading

_SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The file git used to track. Its values are copied once into CONFIG_PATH, then it is ignored.
LEGACY_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "settings.json")
CONFIG_PATH = os.environ.get("KAVAN_SETTINGS_PATH") or os.path.join(_SERVER_DIR, "data", "settings.json")

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

def _read_sanitized(path: str) -> dict | None:
    try:
        with open(path, "r", encoding="utf-8") as f:
            # Merge with defaults in case of missing or invalid keys
            return _sanitize(json.load(f))
    except Exception:
        return None

def load_config() -> dict:
    """
    Loads configuration from disk. The first start after the settings moved out of git copies
    the old file's valid values across; with no file at all, the defaults are written.
    """
    with _lock:
        if os.path.exists(CONFIG_PATH):
            return _read_sanitized(CONFIG_PATH) or DEFAULT_CONFIG.copy()

        migrated = _read_sanitized(LEGACY_CONFIG_PATH) if os.path.exists(LEGACY_CONFIG_PATH) else None
        config = migrated or DEFAULT_CONFIG.copy()
        save_config_internal(config)
        return config.copy()

def save_config_internal(config_data: dict):
    """Internal function, assumes caller holds the lock."""
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
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
