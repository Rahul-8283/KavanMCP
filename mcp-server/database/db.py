import os
import aiosqlite
from database.models import CREATE_AUDIT_LOG_TABLE, CREATE_SYSTEM_BASELINES_TABLE
from utils.logger import logger

# Resolve the absolute path to the data directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "process.db")

async def init_db():
    """
    Asynchronously initializes the SQLite database and creates necessary tables.
    """
    try:
        # Ensure the data directory exists
        os.makedirs(DATA_DIR, exist_ok=True)
        
        # Connect to the SQLite database (creates it if it doesn't exist)
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(CREATE_AUDIT_LOG_TABLE)
            await db.execute(CREATE_SYSTEM_BASELINES_TABLE)
            await db.commit()
            
        logger.info(f"Database successfully initialized at {DB_PATH}")
    except Exception as e:
        logger.critical(f"FATAL: Failed to initialize SQLite database: {e}")
        raise
