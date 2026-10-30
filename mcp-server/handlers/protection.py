from config.settings_manager import ACTIVE_CONFIG


def is_user_protected(process_name: str) -> bool:
    """True when the user has put this process on the never-kill list."""
    return process_name.strip().lower() in ACTIVE_CONFIG.get("never_kill", [])


def protected_message(process_name: str) -> str:
    return (f"{process_name} is on your protected list. "
            "Remove it in Kavan's Settings to allow termination.")
