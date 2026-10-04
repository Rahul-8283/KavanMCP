import json
import os
from datetime import datetime, timezone

import psutil

from handlers.approval_handler import protected_pids
from handlers.classification_handler import classify_process
from integrations.windows import get_deep_process_info, get_windowed_pids, is_headless
from utils.schemas import ProcessDeepDiveSchema, RelatedProcessSchema

MAX_MODULES_LISTED = 25
MB = 1024 * 1024


def _related(proc: psutil.Process) -> RelatedProcessSchema | None:
    try:
        return RelatedProcessSchema(pid=proc.pid, name=proc.name())
    except psutil.Error:
        return None


def _third_party_modules(proc: psutil.Process) -> tuple[int, list[str]]:
    """Counts the loaded modules and names the ones that do not ship with Windows."""
    try:
        paths = {m.path for m in proc.memory_maps() if m.path.lower().endswith((".dll", ".exe"))}
    except (psutil.Error, OSError):
        return 0, []

    windows_dir = os.environ.get("SystemRoot", r"C:\Windows").lower()
    third_party = sorted(p for p in paths if not p.lower().startswith(windows_dir))
    return len(paths), third_party[:MAX_MODULES_LISTED]


def explain_process_logic(pid: int) -> str:
    """
    Core logic for the explain_process MCP tool.
    Deep-inspects one PID so the LLM can judge whether it is safe to terminate.
    Blocking: run it in a worker thread.
    """
    try:
        proc = psutil.Process(pid)
        name = proc.name()
    except psutil.NoSuchProcess:
        return json.dumps({"status": "not_found", "message": f"PID {pid} does not exist or has already closed."}, indent=2)

    def read(getter, default=None):
        # Individual fields of a privileged process can be denied without the whole lookup failing
        try:
            return getter()
        except (psutil.Error, OSError):
            return default

    cpu_percent = read(lambda: proc.cpu_percent(interval=0.1), 0.0)
    memory_mb = read(lambda: proc.memory_info().rss / MB, 0.0)
    headless = is_headless(pid, get_windowed_pids())
    tier = classify_process(name, cpu_percent, memory_mb, headless)

    executable_path = read(proc.exe)
    command_line = read(lambda: " ".join(proc.cmdline()) or None)
    if not executable_path or not command_line:
        # psutil is refused for some services; the Windows API can still answer
        deep = get_deep_process_info(pid)
        executable_path = executable_path or deep["ExecutablePath"]
        command_line = command_line or deep["CommandLine"]

    parent = read(proc.parent)
    children = [c for c in (_related(child) for child in read(proc.children, [])) if c]
    created = read(proc.create_time)
    module_count, third_party = _third_party_modules(proc)

    notes = []
    if tier == 1:
        notes.append("Tier 1 critical OS component. Termination is prohibited.")
    if pid in protected_pids():
        notes.append("This is KavanMCP itself or the process that launched it. Termination is refused.")
    if children:
        notes.append(f"Has {len(children)} child process(es). Terminating it may break or orphan them.")
    if tier == 4:
        notes.append("Headless process with high CPU usage. Review the command line before terminating.")
    if not executable_path:
        notes.append("Executable path could not be read (access denied). Run KavanMCP as Administrator for full details.")

    report = ProcessDeepDiveSchema(
        pid=pid,
        name=name,
        tier=tier,
        is_headless=headless,
        status=read(proc.status, "unknown"),
        username=read(proc.username),
        executable_path=executable_path,
        command_line=command_line,
        started_at=datetime.fromtimestamp(created, tz=timezone.utc).isoformat() if created else None,
        cpu_percent=cpu_percent,
        memory_mb=round(memory_mb, 2),
        num_threads=read(proc.num_threads, 0),
        parent=_related(parent) if parent else None,
        children=children,
        loaded_module_count=module_count,
        third_party_modules=third_party,
        notes=notes,
    )
    return report.model_dump_json(indent=2)
