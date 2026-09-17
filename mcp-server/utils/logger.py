import logging
import os
from logging.handlers import RotatingFileHandler


def setup_logger(name: str = "KavanMCP") -> logging.Logger:
    """
    Sets up the global logger for the FastMCP server.
    Outputs to both the console and a rotating file in the logs/ directory.
    """
    logger = logging.getLogger(name)
    
    # If the logger already has handlers, don't add them again (prevents duplicate logs)
    if logger.hasHandlers():
        return logger

    # Capture all levels, let handlers filter them
    logger.setLevel(logging.DEBUG)

    # Ensure the logs directory exists relative to this file's parent (mcp-server/logs)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    log_dir = os.path.join(base_dir, "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, "server.log")

    # Define the exact log format requested in Phase 1
    formatter = logging.Formatter(
        fmt="[%(asctime)s] [%(levelname)s] [%(module)s] - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    # 1. Console Handler (Standard Output)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)  # Keep the console relatively clean
    console_handler.setFormatter(formatter)

    # 2. Rotating File Handler (Max 5MB per file, keep 3 backups)
    file_handler = RotatingFileHandler(
        filename=log_file,
        maxBytes=5 * 1024 * 1024,  # 5 MB
        backupCount=3,
        encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)  # Log absolutely everything to the file for auditing
    file_handler.setFormatter(formatter)

    # Add both handlers to the logger
    logger.addHandler(console_handler)
    logger.addHandler(file_handler)

    return logger

# Initialize the global logger instance
logger = setup_logger()
