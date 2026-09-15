def evaluate_anomalies(process_list: list) -> list:
    """
    Scans a list of process dictionaries and appends anomaly flags.
    Provides the LLM with context on *why* something might be bad.
    Modifies the list in-place and returns it.
    """
    for proc in process_list:
        flags = []
        cpu = proc.get('cpu_percent', 0.0)
        memory_mb = proc.get('memory_mb', 0.0)
        
        # We assume the tier has already been injected by the classification_handler
        tier = proc.get('tier', 3) 

        # 1. High CPU Warning: If a single process uses > 40% CPU
        if cpu > 40.0:
            flags.append("HIGH_CPU_WARNING")

        # 2. Memory Leak Warning: If a non-essential process uses > 2GB RAM
        # Non-essential means Tier 3 (Background) or Tier 4 (Anomaly).
        # We don't flag Tier 1 (OS) or Tier 2 (Essential like Chrome) for this.
        if memory_mb > 2048.0 and tier > 2:
            flags.append("MEMORY_LEAK_WARNING")

        proc['anomaly_flags'] = flags
        
    return process_list
