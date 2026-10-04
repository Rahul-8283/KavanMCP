import pywintypes
import win32api
import win32com.client
import win32con
import win32gui
import win32process


def get_windowed_pids() -> set[int] | None:
    """
    Returns the PIDs that own at least one visible, titled top-level window,
    i.e. the processes a user can actually see on the desktop.
    Returns None if the desktop cannot be enumerated (e.g. no interactive session).
    """
    pids: set[int] = set()

    def _collect(hwnd, _):
        if win32gui.IsWindowVisible(hwnd) and win32gui.GetWindowText(hwnd):
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            pids.add(pid)
        return True

    try:
        win32gui.EnumWindows(_collect, None)
    except pywintypes.error:
        return None
    return pids


def is_headless(pid: int, windowed_pids: set[int] | None) -> bool:
    """
    A process is headless when it shows no window. If the desktop could not be
    inspected we cannot tell, and report False so nothing is flagged as suspicious on a guess.
    """
    if windowed_pids is None:
        return False
    return pid not in windowed_pids


def get_deep_process_info(pid: int) -> dict:
    """
    Uses the Windows API to deeply inspect a process, bypassing standard psutil limitations.
    Returns a dictionary containing the ExecutablePath and CommandLine.
    """
    info = {
        "ExecutablePath": None,
        "CommandLine": None
    }
    
    # 1. Use win32process and win32api to open a handle (OpenProcess)
    try:
        # We need PROCESS_QUERY_INFORMATION and PROCESS_VM_READ to inspect the process
        access_flags = win32con.PROCESS_QUERY_INFORMATION | win32con.PROCESS_VM_READ
        handle = win32api.OpenProcess(access_flags, False, pid)
        
        if handle:
            try:
                # Extract the exact ExecutablePath from the process handle
                info["ExecutablePath"] = win32process.GetModuleFileNameEx(handle, 0)
            finally:
                # Always safely close the handle to prevent memory leaks
                win32api.CloseHandle(handle)
                
    except pywintypes.error:
        # Typically throws Access Denied (if not running as Admin) or if the process died
        pass

    # 2. Extract CommandLine via WMI
    # Note: Reading the CommandLine purely through OpenProcess requires parsing the 
    # Process Environment Block (PEB) manually in memory, which is highly unstable.
    # WMI (Windows Management Instrumentation) provides a safe, native Windows API for this.
    try:
        wmi = win32com.client.GetObject('winmgmts:')
        processes = wmi.ExecQuery(f"Select CommandLine From Win32_Process Where ProcessId = {pid}")
        for process in processes:
            info["CommandLine"] = process.CommandLine
    except Exception:
        pass
        
    return info
