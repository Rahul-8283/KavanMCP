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
