import json
from integrations.monitor import get_global_metrics, get_all_processes
from utils.schemas import SystemReportSchema
from handlers.classification_handler import classify_process
from handlers.alert_handler import evaluate_anomalies

def analyze_system_logic() -> str:
    """
    Core logic for the analyze_system MCP tool.
    Fetches global metrics, identifies the top 5 CPU and Memory hogs,
    and returns a Pydantic-validated JSON string.
    """
    # 1. Fetch global health metrics
    metrics = get_global_metrics()
    
    # 2. Fetch all running processes
    all_processes = get_all_processes()
    
    # 2a. Classify every process and inject the Tier
    for proc in all_processes:
        proc['tier'] = classify_process(
            process_name=proc.get('name', ''), 
            cpu_percent=proc.get('cpu_percent', 0.0), 
            memory_mb=proc.get('memory_mb', 0.0), 
            is_headless=proc.get('is_headless', True)
        )
        
    # 2b. Evaluate for Anomalies
    all_processes = evaluate_anomalies(all_processes)
    
    # 3. Sort to find top 5 CPU hogs (descending)
    top_cpu_hogs = sorted(all_processes, key=lambda x: x.get('cpu_percent', 0.0), reverse=True)[:5]
    
    # 4. Sort to find top 5 Memory hogs (descending)
    top_memory_hogs = sorted(all_processes, key=lambda x: x.get('memory_mb', 0.0), reverse=True)[:5]
    
    # 5. Construct the payload dictionary
    report_data = {
        "total_cpu_percent": metrics.get("total_cpu_percent", 0.0),
        "total_memory_gb": metrics.get("total_memory_gb", 0.0),
        "used_memory_gb": metrics.get("used_memory_gb", 0.0),
        "top_cpu_hogs": top_cpu_hogs,
        "top_memory_hogs": top_memory_hogs
    }
    
    # 6. Validate through the Pydantic schema
    report = SystemReportSchema(**report_data)
    
    # 7. Return the strict JSON string for the LLM
    return report.model_dump_json(indent=2)
