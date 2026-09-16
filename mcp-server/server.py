from fastmcp import FastMCP
from tools.analyze_system import analyze_system_logic
from tools.list_processes import list_processes_logic
from tools.audit_tools import view_audit_log_logic
from tools.confirm_termination import confirm_termination_logic
from tools.execute_termination import execute_termination_logic
from tools.rollback_tool import rollback_last_action_logic

# Instantiate the central FastMCP server object
mcp = FastMCP("KavanMCP", version="1.0.0")

@mcp.tool()
async def analyze_system() -> str:
    """Returns a high-level diagnostic of global CPU/RAM and top resource hogs."""
    return analyze_system_logic()

@mcp.tool()
async def list_processes(filter_name: str = None) -> str:
    """Lists active processes, optionally filtered by name."""
    return list_processes_logic(filter_name)

@mcp.tool()
async def view_audit_log(hours_back: int = 24) -> str:
    """Retrieves the recent history of processes that were terminated or blocked."""
    return await view_audit_log_logic(hours_back)

@mcp.tool()
async def confirm_termination(pids: list[int]) -> str:
    """Proposes termination of processes for user confirmation. MUST be used before executing termination."""
    return await confirm_termination_logic(pids)

@mcp.tool()
async def execute_termination(pids: list[int], reasoning: str = "User confirmed termination") -> str:
    """Executes the termination of processes. MUST ONLY be called after confirm_termination and getting user approval."""
    return await execute_termination_logic(pids, reasoning)

@mcp.tool()
async def rollback_last_action(process_identifier: str) -> str:
    """Undoes the termination of a process and relaunches it. Provide the name (e.g., 'notepad.exe') or PID."""
    return await rollback_last_action_logic(process_identifier)
