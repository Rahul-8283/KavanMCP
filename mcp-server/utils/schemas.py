from pydantic import BaseModel
from typing import List, Optional

class ProcessSchema(BaseModel):
    pid: int
    name: str
    cpu_percent: float
    memory_mb: float
    status: str
    tier: int = 3
    anomaly_flags: List[str] = []

class SystemReportSchema(BaseModel):
    total_cpu_percent: float
    total_memory_gb: float
    used_memory_gb: float
    top_cpu_hogs: List[ProcessSchema]
    top_memory_hogs: List[ProcessSchema]
