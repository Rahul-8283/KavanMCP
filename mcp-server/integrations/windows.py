import win32api
import win32process
import win32con
import win32com.client
import pywintypes

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
