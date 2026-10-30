
from pydantic import BaseModel


class ProcessSchema(BaseModel):
    pid: int
    name: str
    cpu_percent: float
    memory_mb: float
    tier: int = 3
    is_headless: bool = False
    anomaly_flags: list[str] = []
    protected: bool = False

class SystemReportSchema(BaseModel):
    total_cpu_percent: float
    total_memory_gb: float
    used_memory_gb: float
    top_cpu_hogs: list[ProcessSchema]
    top_memory_hogs: list[ProcessSchema]

class RelatedProcessSchema(BaseModel):
    pid: int
    name: str

class ProcessDeepDiveSchema(BaseModel):
    pid: int
    name: str
    tier: int
    is_headless: bool
    status: str
    username: str | None = None
    executable_path: str | None = None
    command_line: str | None = None
    started_at: str | None = None
    cpu_percent: float
    memory_mb: float
    num_threads: int
    parent: RelatedProcessSchema | None = None
    children: list[RelatedProcessSchema] = []
    loaded_module_count: int = 0
    third_party_modules: list[str] = []
    notes: list[str] = []
