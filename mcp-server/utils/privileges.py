import ctypes


def is_admin() -> bool:
    """
    Checks if the current Python process has Administrator privileges via Windows API.
    """
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except AttributeError:
        # Fallback if somehow run on non-Windows
        return False
