from fastmcp import FastMCP

# Instantiate the central FastMCP server object
mcp = FastMCP("KavanMCP", version="1.0.0")

# Note: In future phases (Phase 2+), we will import our logic from the tools/ directory
# and register them here using the @mcp.tool() decorator.
