import asyncio

from fastmcp import FastMCP

from tools.analyze_system import analyze_system_logic
from tools.audit_tools import view_audit_log_logic
from tools.confirm_termination import confirm_termination_logic
from tools.execute_termination import execute_termination_logic
from tools.explain_process import explain_process_logic
from tools.list_processes import list_processes_logic
from tools.rollback_tool import rollback_last_action_logic
from utils.error_handlers import safe_mcp_tool

# Instantiate the central FastMCP server object
mcp = FastMCP("KavanMCP", version="2.1.0")

@mcp.tool()
@safe_mcp_tool
async def analyze_system() -> str:
    """Use this tool to diagnose system lag. It returns the current CPU/RAM totals and the top resource hogs categorized by Security Tiers (1-4)."""
    # The process scan blocks for seconds; keep it off the event loop that serves the MCP stream
    return await asyncio.to_thread(analyze_system_logic)

@mcp.tool()
@safe_mcp_tool
async def list_processes(filter_name: str | None = None, include_tier_1: bool = False) -> str:
    """Lists active processes, optionally filtered by name. Tier 1 critical OS processes can never be terminated, so they are left out unless you pass include_tier_1=true or search for one by name."""
    # Searching by name is an explicit request, so a Tier 1 match is still shown
    show_tier_1 = include_tier_1 or bool(filter_name)
    return await asyncio.to_thread(list_processes_logic, filter_name, show_tier_1)

@mcp.tool()
@safe_mcp_tool
async def explain_process(pid: int) -> str:
    """Use this tool to deeply inspect ONE process before proposing its termination. It returns the command line, executable path, parent and child processes, loaded third-party modules and safety notes, so you can tell a safe local script from a rogue background task."""
    return await asyncio.to_thread(explain_process_logic, pid)

@mcp.tool()
@safe_mcp_tool
async def view_audit_log(hours_back: int = 24) -> str:
    """Retrieves the recent history of processes that were terminated or blocked."""
    return await view_audit_log_logic(hours_back)

@mcp.tool()
@safe_mcp_tool
async def confirm_termination(pids: list[int]) -> str:
    """Use this tool to propose the termination of a process. You MUST NOT execute the termination yet. Present the returned warning to the user and ask for explicit confirmation. Only proceed if they type 'yes'."""
    return await confirm_termination_logic(pids)

@mcp.tool()
@safe_mcp_tool
async def execute_termination(pids: list[int], reasoning: str = "User confirmed termination") -> str:
    """Use this tool ONLY after the user has explicitly agreed to the confirmation prompt from confirm_termination. Pass the exact PID."""
    return await execute_termination_logic(pids, reasoning)

@mcp.tool()
@safe_mcp_tool
async def rollback_last_action(process_identifier: str) -> str:
    """Undoes the termination of a process and relaunches it. Provide the name (e.g., 'notepad.exe') or PID."""
    return await rollback_last_action_logic(process_identifier)
