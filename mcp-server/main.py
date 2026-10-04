import asyncio
import ctypes
import sys

from database.db import init_db
from server import mcp
from utils.logger import logger


def is_admin() -> bool:
    """
    Checks if the current Python process has Administrator privileges via Windows API.
    """
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except AttributeError:
        # Fallback if somehow run on non-Windows
        return False

def print_banner():
    """Prints the KavanMCP startup banner."""
    banner = """
    =================================================
                     KavanMCP Server
          AI-Powered System Optimization Engine
    =================================================
    """
    # stdout is the MCP transport; printing there corrupts the protocol stream
    print(banner, file=sys.stderr)

def main():
    # 1 & 3. Initialize logger and display banner
    print_banner()
    logger.info("Initializing KavanMCP Server...")

    # 2. Check for Administrator Privileges
    if is_admin():
        logger.info("SUCCESS: Server is running with Administrator privileges.")
    else:
        logger.warning("WARNING: Server is NOT running as Administrator.")
        logger.warning("KavanMCP is operating in degraded mode. You may encounter 'Access Denied' errors when inspecting or terminating background services.")
        logger.warning("To fix this, restart your terminal or command prompt as Administrator.")

    # Initialize SQLite database before starting server
    logger.info("Initializing SQLite database...")
    asyncio.run(init_db())

    # Start the TTL sweeper background task safely outside the FastMCP event loop
    import threading

    from handlers.approval_handler import ttl_sweeper
    threading.Thread(target=lambda: asyncio.run(ttl_sweeper()), daemon=True).start()
    logger.info("Started background TTL garbage collector.")

    # Start the WebSocket server in a separate daemon thread
    from ws_server import run_ws_server
    threading.Thread(target=run_ws_server, daemon=True).start()

    # 4. Launch the FastMCP server using stdio
    logger.info("Starting FastMCP stdio transport... Ready for LLM connection.")
    try:
        mcp.run()
    except KeyboardInterrupt:
        logger.info("Server shutdown requested by user. Exiting gracefully.")
        sys.exit(0)
    except Exception as e:
        logger.critical(f"Server encountered a fatal error: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
