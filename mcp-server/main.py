import ctypes
import sys

from utils.logger import logger
from server import mcp

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
                   KavanMCP Server V1
          AI-Powered System Optimization Engine
    =================================================
    """
    import sys
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
