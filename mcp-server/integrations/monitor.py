import psutil


def get_global_metrics() -> dict:
    """
    Fetches the global CPU and RAM utilization of the system.
    Returns a dictionary formatted for the SystemReportSchema.
    """
    # We use a 0.1s interval to get an accurate, non-instantaneous CPU reading
    # without causing unacceptable latency to the LLM response.
    cpu_percent = psutil.cpu_percent(interval=0.1)
    
    # Fetch virtual memory and convert from bytes to Gigabytes
    mem = psutil.virtual_memory()
    total_memory_gb = mem.total / (1024 ** 3)
    used_memory_gb = mem.used / (1024 ** 3)
    
    return {
        "total_cpu_percent": round(cpu_percent, 2),
        "total_memory_gb": round(total_memory_gb, 2),
        "used_memory_gb": round(used_memory_gb, 2)
    }

def get_all_processes() -> list:
    """
    Safely iterates over all running system processes.
    Returns a list of dictionaries matching ProcessSchema.
    """
    processes = []
    # Explicitly request the fields we need to avoid multiple system calls per process
    for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_info', 'status']):
        try:
            # Safely access the pre-fetched .info dictionary
            memory_mb = proc.info['memory_info'].rss / (1024 * 1024)
            processes.append({
                "pid": proc.info['pid'],
                "name": proc.info['name'] or "unknown",
                "cpu_percent": proc.info['cpu_percent'] or 0.0,
                "memory_mb": round(memory_mb, 2),
                "status": proc.info['status'] or "running"
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            # Pass silently: Operating systems are volatile. If a process dies
            # while we are looping, or if Windows denies access, we simply skip it.
            pass
            
    return processes
