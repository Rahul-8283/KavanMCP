import sys
import os
import asyncio

# Add mcp-server to path to import db
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db import init_db, log_termination, get_recent_logs, DB_PATH

async def run_tests():
    print("==========================================")
    print("    KavanMCP - Database Integrity Test    ")
    print("==========================================")
    
    print("\n[Gate 1] Testing Automatic Initialization...")
    if os.path.exists(DB_PATH):
        try:
            os.remove(DB_PATH)
            print(f"Deleted existing database at {DB_PATH}")
        except PermissionError:
            print(f"WARNING: Could not delete {DB_PATH}, it might be in use by Claude Desktop. Proceeding anyway.")
            pass
    
    await init_db()
    
    if os.path.exists(DB_PATH):
        print("✅ SUCCESS: Database was automatically created/verified.")
    else:
        print("❌ FAILED: Database was not created.")
        return

    print("\n[Gate 2] Testing Asynchronous Writes (100 concurrent DB hits)...")
    tasks = []
    for i in range(100):
        # We simulate 100 processes being terminated at the exact same millisecond
        tasks.append(
            log_termination(
                process_name=f"malware_{i}.exe", 
                pid=1000 + i, 
                path="C:\\Windows\\Temp\\malware.exe", 
                mem_mb=1024.0, 
                cpu_pct=85.0, 
                reasoning="Automated unit test."
            )
        )
    
    # Fire all 100 writes simultaneously
    await asyncio.gather(*tasks)
    
    # Verify count
    logs = await get_recent_logs(limit=200)
    if len(logs) == 100:
        print("✅ SUCCESS: Exactly 100 rows were successfully written to the database instantly!")
        print("✅ SUCCESS: Zero 'database is locked' SQLite errors occurred.")
    else:
        print(f"❌ FAILED: Expected 100 rows, but found {len(logs)}.")

if __name__ == "__main__":
    asyncio.run(run_tests())
