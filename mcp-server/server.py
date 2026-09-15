from fastmcp import FastMCP
from tools.analyze_system import analyze_system_logic
from tools.list_processes import list_processes_logic
from tools.audit_tools import view_audit_log_logic

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
